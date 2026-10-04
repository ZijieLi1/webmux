// SSH session manager: one entry per connected remote device. Owns the ssh2
// client, the interactive shell channel, SFTP, tmux queries and port forwards.
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('ssh2');
const store = require('./store');
const tmux = require('./tmux');

const sessions = new Map();
const FORWARD_BIND = process.env.WEBMUX_FORWARD_BIND || '127.0.0.1';
const DEFAULT_KEYS = ['id_ed25519', 'id_ecdsa', 'id_rsa'].map((k) => path.join(os.homedir(), '.ssh', k));

const expandHome = (p) => (p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);

function readKey(keyPath) {
  const p = expandHome(keyPath);
  try {
    return fs.readFileSync(p);
  } catch (e) {
    throw new Error(`Cannot read SSH key ${keyPath}: ${e.code || e.message}`);
  }
}

function authConfig({ authMethod, keyPath, password, passphrase }) {
  if (authMethod === 'password') {
    if (!password) throw new Error('Password required');
    return { password, tryKeyboard: true };
  }
  if (keyPath) return { privateKey: readKey(keyPath), passphrase: passphrase || undefined };
  const cfg = {};
  if (password) cfg.password = password;
  else {
    const key = DEFAULT_KEYS.find((p) => fs.existsSync(p));
    if (key) cfg.privateKey = fs.readFileSync(key);
    if (process.env.SSH_AUTH_SOCK) cfg.agent = process.env.SSH_AUTH_SOCK;
  }
  return cfg;
}

class Session {
  constructor(id, meta, emit) {
    this.id = id;
    this.meta = meta;
    this.emit = emit; // (event, payload) => void, bound to the owning socket
    this.conn = new Client();
    this.shell = null;
    this.size = { cols: 80, rows: 24 };
    this.sftp = null;
    this.forwards = new Map();
    this.prefix = null;
    this.closed = false;
  }

  connect(opts) {
    const { host, port, username } = this.meta;
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (fn, v) => {
        if (!settled) {
          settled = true;
          fn(v);
        }
      };
      let hostKeyMismatch = false;
      this.conn
        .on('ready', () => done(resolve))
        .on('error', (e) => {
          if (hostKeyMismatch) e = new Error(`Host key for ${host}:${port} has changed (possible man-in-the-middle). Remove the stored key to trust it again.`);
          done(reject, e);
          this.close(e.message);
        })
        .on('close', () => this.close('Connection closed'))
        // Many servers only offer "keyboard-interactive" for password logins.
        .on('keyboard-interactive', (name, instructions, lang, prompts, finish) => finish(prompts.map(() => opts.password || '')))
        .connect({
          host,
          port,
          username,
          ...authConfig(opts),
          readyTimeout: 15000,
          keepaliveInterval: 15000,
          hostHash: 'sha256',
          hostVerifier: (hash) => {
            const ok = store.hostKeys.check(host, port, hash);
            if (!ok) hostKeyMismatch = true;
            return ok;
          },
        });
    });
  }

  openShell({ cols, rows, tmuxSession }) {
    if (cols && rows) this.size = { cols, rows };
    if (this.shell) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.conn.shell({ term: 'xterm-256color', cols: this.size.cols, rows: this.size.rows }, (err, stream) => {
        if (err) return reject(err);
        this.shell = stream;
        stream.setEncoding('utf8');
        stream.on('data', (d) => this.emit('term:data', { sid: this.id, data: d }));
        stream.stderr.setEncoding('utf8');
        stream.stderr.on('data', (d) => this.emit('term:data', { sid: this.id, data: d }));
        stream.on('close', () => {
          if (this.shell === stream) this.shell = null;
          if (!this.closed) this.emit('term:closed', { sid: this.id });
        });
        if (tmuxSession) {
          tmux.assertSessionName(tmuxSession);
          stream.write(`exec tmux new-session -A -s ${tmux.shQuote(tmuxSession)}\r`);
        }
        resolve();
      });
    });
  }

  write(data) {
    this.shell?.write(data);
  }

  resize(cols, rows) {
    this.size = { cols, rows };
    this.shell?.setWindow(rows, cols, 0, 0);
  }

  exec(cmd) {
    return new Promise((resolve, reject) => {
      this.conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        let out = '';
        let errOut = '';
        stream.on('data', (d) => (out += d));
        stream.stderr.on('data', (d) => (errOut += d));
        stream.on('close', (code) => resolve({ code, out, err: errOut }));
      });
    });
  }

  async tmuxPrefix() {
    if (!this.prefix) {
      const r = await this.exec('tmux show-options -gv prefix 2>/dev/null');
      this.prefix = tmux.prefixToChar(r.out);
    }
    return this.prefix;
  }

  // The tmux session the (most recently active) client is attached to.
  async currentTmuxSession() {
    const r = await this.exec(`tmux list-clients -F ${tmux.shQuote('#{client_activity} #{client_session}')} 2>/dev/null`);
    const rows = r.out
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const i = l.indexOf(' ');
        return { activity: Number(l.slice(0, i)), name: l.slice(i + 1) };
      })
      .sort((a, b) => b.activity - a.activity);
    if (!rows.length) throw new Error('No tmux client is attached');
    return rows[0].name;
  }

  // Runs a tmux command through its ":" prompt. tmux drops keys that arrive in
  // the same read as the one opening the prompt, so the command text is sent after a pause.
  async tmuxCommand(cmd) {
    this.write((await this.tmuxPrefix()) + ':');
    await new Promise((r) => setTimeout(r, 80));
    this.write(`${cmd}\r`);
  }

  async tmuxAction(action, arg) {
    if (action === 'new-session') {
      const name = arg ? tmux.assertSessionName(arg) : null;
      return this.shell ? this.tmuxCommand(`new-session${name ? ` -s ${name}` : ''}`) : this.openShell({ tmuxSession: name || 'webmux' });
    }
    if (action === 'attach-session') {
      const name = tmux.assertSessionName(arg);
      return this.shell ? this.tmuxCommand(`switch-client -t ${name}`) : this.openShell({ tmuxSession: name });
    }
    const keys = tmux.ACTION_KEYS[action];
    if (!keys) throw new Error(`Unknown action: ${action}`);
    if (!this.shell) throw new Error('Terminal is not attached');
    if (typeof keys === 'function') return this.tmuxCommand(keys());
    this.write((await this.tmuxPrefix()) + keys);
  }

  async listTmuxSessions() {
    const r = await this.exec(`tmux list-sessions -F ${tmux.shQuote(tmux.SESSION_FMT)} 2>/dev/null`);
    return r.code === 0 ? tmux.parseSessions(r.out) : [];
  }

  async listPanes() {
    const name = await this.currentTmuxSession();
    const r = await this.exec(`tmux list-panes -t ${tmux.shQuote(`${name}:`)} -F ${tmux.shQuote(tmux.PANE_FMT)}`);
    if (r.code !== 0) throw new Error(r.err.trim() || 'tmux list-panes failed');
    return { session: name, ...tmux.parsePanes(r.out) };
  }

  async selectPane(paneId) {
    tmux.assertPaneId(paneId);
    const r = await this.exec(`tmux select-pane -t ${paneId}`);
    if (r.code !== 0) throw new Error(r.err.trim() || 'select-pane failed');
  }

  async setSync(on) {
    const name = await this.currentTmuxSession();
    const r = await this.exec(`tmux set-window-option -t ${tmux.shQuote(`${name}:`)} synchronize-panes ${on ? 'on' : 'off'}`);
    if (r.code !== 0) throw new Error(r.err.trim() || 'set-window-option failed');
  }

  getSftp() {
    if (this.sftp) return Promise.resolve(this.sftp);
    return new Promise((resolve, reject) => {
      this.conn.sftp((err, sftp) => {
        if (err) return reject(err);
        this.sftp = sftp;
        sftp.on('close', () => (this.sftp = null));
        resolve(sftp);
      });
    });
  }

  async listDir(dir) {
    const sftp = await this.getSftp();
    const call = (fn, ...a) => new Promise((res, rej) => sftp[fn](...a, (e, r) => (e ? rej(e) : res(r))));
    const resolved = await call('realpath', dir || '.');
    const list = await call('readdir', resolved);
    const entries = list
      .map((f) => ({
        name: f.filename,
        dir: f.attrs.isDirectory(),
        size: f.attrs.size,
        mtime: f.attrs.mtime * 1000,
      }))
      .filter((f) => f.name !== '.' && f.name !== '..')
      .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
    return { path: resolved, entries };
  }

  startForward({ remoteHost = '127.0.0.1', remotePort, localPort = 0 }) {
    remotePort = Number(remotePort);
    localPort = Number(localPort);
    if (!(remotePort > 0 && remotePort < 65536) || !(localPort >= 0 && localPort < 65536)) throw new Error('Invalid port');
    if (!/^[A-Za-z0-9_.:-]{1,255}$/.test(remoteHost)) throw new Error('Invalid remote host');
    return new Promise((resolve, reject) => {
      const sockets = new Set();
      const server = net.createServer((sock) => {
        sockets.add(sock);
        sock.on('close', () => sockets.delete(sock));
        sock.on('error', () => sock.destroy());
        this.conn.forwardOut(sock.remoteAddress || '127.0.0.1', sock.remotePort || 0, remoteHost, remotePort, (err, stream) => {
          if (err) return sock.destroy();
          stream.on('error', () => sock.destroy());
          sock.pipe(stream).pipe(sock);
        });
      });
      server.once('error', reject);
      server.listen(localPort, FORWARD_BIND, () => {
        const id = crypto.randomUUID();
        const fwd = { id, remoteHost, remotePort, localPort: server.address().port, bind: FORWARD_BIND };
        this.forwards.set(id, { ...fwd, server, sockets });
        resolve(fwd);
      });
    });
  }

  stopForward(id) {
    const f = this.forwards.get(id);
    if (!f) return;
    f.server.close();
    f.sockets.forEach((s) => s.destroy());
    this.forwards.delete(id);
  }

  listForwards() {
    return [...this.forwards.values()].map(({ id, remoteHost, remotePort, localPort, bind }) => ({ id, remoteHost, remotePort, localPort, bind }));
  }

  close(reason) {
    if (this.closed) return;
    this.closed = true;
    [...this.forwards.keys()].forEach((id) => this.stopForward(id));
    try {
      this.conn.end();
    } catch {}
    sessions.delete(this.id);
    this.emit('ssh:closed', { sid: this.id, reason });
  }
}

function create(meta, emit) {
  const s = new Session(crypto.randomUUID(), meta, emit);
  sessions.set(s.id, s);
  return s;
}

const get = (id) => sessions.get(id);

module.exports = { create, get };
