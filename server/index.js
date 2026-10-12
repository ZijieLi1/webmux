const http = require('http');
const path = require('path');
const express = require('express');
const next = require('next');
const { Server } = require('socket.io');
const store = require('./store');
const scanner = require('./scanner');
const sessions = require('./sessions');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT) || 3000;

// Reject cross-origin browser requests (CSRF / cross-site WebSocket hijacking).
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

const wrap = (fn) => async (req, res) => {
  try {
    res.json(await fn(req, res));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};

function crud(router, base, coll) {
  router.get(base, wrap(() => coll.list()));
  router.post(base, wrap((req, res) => (res.status(201), coll.create(req.body))));
  router.put(`${base}/:id`, wrap((req) => coll.update(req.params.id, req.body) || Promise.reject(Object.assign(new Error('Not found'), { status: 404 }))));
  router.delete(`${base}/:id`, wrap((req) => ({ ok: coll.remove(req.params.id) })));
}

function apiRouter() {
  const r = express.Router();
  r.use((req, res, next) => (sameOrigin(req) ? next() : res.status(403).json({ error: 'Cross-origin request rejected' })));

  // Upload/download stream straight through SFTP, so they take the raw body.
  const sessionFor = (req) => {
    const s = sessions.get(req.params.sid);
    if (!s) throw Object.assign(new Error('Unknown session'), { status: 404 });
    return s;
  };
  r.put('/sessions/:sid/upload', async (req, res) => {
    try {
      const s = sessionFor(req);
      const name = String(req.query.name || '');
      if (!name || name.includes('/') || name === '..' || name === '.') throw Object.assign(new Error('Invalid file name'), { status: 400 });
      const dest = path.posix.join(String(req.query.dir || '.'), name);
      const sftp = await s.getSftp();
      const ws = sftp.createWriteStream(dest);
      ws.on('error', (e) => res.status(500).json({ error: e.message }));
      ws.on('close', () => !res.headersSent && res.json({ ok: true, path: dest }));
      req.pipe(ws);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });
  r.get('/sessions/:sid/download', async (req, res) => {
    try {
      const s = sessionFor(req);
      const file = String(req.query.path || '');
      const sftp = await s.getSftp();
      const st = await new Promise((ok, no) => sftp.stat(file, (e, v) => (e ? no(e) : ok(v))));
      if (st.isDirectory()) throw Object.assign(new Error('Cannot download a directory'), { status: 400 });
      res.setHeader('Content-Length', st.size);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(path.posix.basename(file))}`);
      const rs = sftp.createReadStream(file);
      rs.on('error', () => res.destroy());
      res.on('close', () => rs.destroy());
      rs.pipe(res);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  r.use(express.json({ limit: '1mb' }));
  crud(r, '/presets', store.presets);
  crud(r, '/snippets', store.snippets);
  r.get('/history', wrap(() => store.history.list()));
  r.delete('/history/:id', wrap((req) => (store.history.remove(req.params.id), { ok: true })));
  r.get('/scan/default', wrap(() => ({ subnet: scanner.defaultSubnet() })));
  r.post('/scan', wrap(async (req) => ({ hosts: await scanner.scan(req.body?.subnet || scanner.defaultSubnet()) })));
  return r;
}

function attachSockets(httpServer) {
  const io = new Server(httpServer, {
    allowRequest: (req, cb) => cb(null, sameOrigin(req)),
  });

  io.on('connection', (socket) => {
    const owned = new Set();
    const emit = (event, payload) => socket.emit(event, payload);

    // Register a handler that resolves the session by sid and acks {ok,data|error}.
    const handle = (event, fn) =>
      socket.on(event, async (payload = {}, ack) => {
        try {
          const s = sessions.get(payload.sid);
          if (!s || !owned.has(s.id)) throw new Error('Unknown session');
          const data = await fn(s, payload);
          ack?.({ ok: true, data });
        } catch (e) {
          ack?.({ ok: false, error: e.message });
        }
      });

    socket.on('ssh:connect', async (p = {}, ack) => {
      let session;
      try {
        const clean = store.cleanPreset(p);
        if (!clean.host || !clean.username) throw new Error('Host and username are required');
        const str = (v) => (typeof v === 'string' ? v : '');
        session = sessions.create(clean, emit);
        owned.add(session.id);
        await session.connect({ authMethod: clean.authMethod, keyPath: clean.keyPath, password: str(p.password), passphrase: str(p.passphrase) });
        await session.openShell({
          cols: Math.max(2, Number(p.cols) || 80),
          rows: Math.max(2, Number(p.rows) || 24),
          tmuxSession: p.autoTmux === false ? null : str(p.tmuxSession) || 'webmux',
        });
        store.history.record(clean);
        ack?.({ ok: true, sid: session.id });
      } catch (e) {
        if (session) {
          owned.delete(session.id);
          session.close(e.message);
        }
        const authFailed = /authentication methods failed/i.test(e.message);
        ack?.({ ok: false, error: authFailed ? 'Authentication failed' : e.message, authFailed, needs: e.needs });
      }
    });

    handle('ssh:disconnect', (s) => (owned.delete(s.id), s.close('Disconnected')));
    handle('term:open', (s, p) => s.openShell({ cols: p.cols, rows: p.rows, tmuxSession: p.tmuxSession || 'webmux' }));
    handle('tmux:action', (s, p) => s.tmuxAction(p.action, p.arg));
    handle('tmux:sessions', (s) => s.listTmuxSessions());
    handle('tmux:panes', (s) => s.listPanes());
    handle('tmux:select-pane', (s, p) => s.selectPane(p.paneId));
    handle('tmux:sync', (s, p) => s.setSync(!!p.on));
    handle('sftp:list', (s, p) => s.listDir(p.path));
    handle('fwd:list', (s) => s.listForwards());
    handle('fwd:start', (s, p) => s.startForward(p));
    handle('fwd:stop', (s, p) => (s.stopForward(p.id), s.listForwards()));

    // High-frequency terminal traffic: no ack, no promise machinery.
    socket.on('term:input', (p) => {
      const s = p && owned.has(p.sid) && sessions.get(p.sid);
      if (s && typeof p.data === 'string') s.write(p.data);
    });
    socket.on('term:resize', (p) => {
      const s = p && owned.has(p.sid) && sessions.get(p.sid);
      if (s && p.cols > 0 && p.rows > 0) s.resize(p.cols | 0, p.rows | 0);
    });

    socket.on('disconnect', () => {
      owned.forEach((id) => sessions.get(id)?.close('Browser disconnected'));
      owned.clear();
    });
  });
}

async function main() {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const ex = express();
  ex.disable('x-powered-by');
  ex.use('/api', apiRouter());
  ex.use((req, res) => handle(req, res));

  const server = http.createServer(ex);
  attachSockets(server);
  server.listen(port, hostname, () => console.log(`WebMux listening on http://${hostname}:${port}${dev ? ' (dev)' : ''}`));
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
