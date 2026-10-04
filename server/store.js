// Tiny JSON-file persistence for presets, connection history, snippets and known host keys.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const dir = process.env.WEBMUX_DATA_DIR || path.join(os.homedir(), '.webmux');
const file = path.join(dir, 'data.json');
const HISTORY_LIMIT = 24;

const empty = () => ({ presets: [], history: [], snippets: [], hostKeys: {} });

function load() {
  try {
    return { ...empty(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return empty();
  }
}

let data = load();

function save() {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

const str = (v, max = 4096) => (typeof v === 'string' ? v.slice(0, max) : '');

function cleanPreset(p = {}) {
  const port = parseInt(p.port, 10);
  return {
    name: str(p.name, 100).trim(),
    host: str(p.host, 255).trim(),
    port: port > 0 && port < 65536 ? port : 22,
    username: str(p.username, 100).trim(),
    keyPath: str(p.keyPath, 1024).trim(),
    authMethod: p.authMethod === 'password' ? 'password' : 'key',
  };
}

function cleanSnippet(s = {}) {
  return { name: str(s.name, 100).trim(), command: str(s.command, 20000) };
}

function collection(key, clean, required) {
  return {
    list: () => data[key],
    create(input) {
      const item = { id: crypto.randomUUID(), ...clean(input) };
      if (!required(item)) throw new Error('Missing required fields');
      data[key].push(item);
      save();
      return item;
    },
    update(id, input) {
      const i = data[key].findIndex((x) => x.id === id);
      if (i < 0) return null;
      const item = { ...data[key][i], ...clean({ ...data[key][i], ...input }) };
      if (!required(item)) throw new Error('Missing required fields');
      data[key][i] = item;
      save();
      return item;
    },
    remove(id) {
      const before = data[key].length;
      data[key] = data[key].filter((x) => x.id !== id);
      if (data[key].length !== before) save();
      return data[key].length !== before;
    },
  };
}

const presets = collection('presets', cleanPreset, (p) => p.name && p.host && p.username);
const snippets = collection('snippets', cleanSnippet, (s) => s.name && s.command);

const historyKey = (c) => `${c.username}@${c.host}:${c.port}`;

const history = {
  list: () => [...data.history].sort((a, b) => b.lastUsed - a.lastUsed),
  record(conn) {
    const entry = cleanPreset(conn);
    const id = historyKey(entry);
    const prev = data.history.find((h) => h.id === id);
    const next = { ...entry, id, name: entry.name || id, lastUsed: Date.now(), count: (prev?.count || 0) + 1 };
    data.history = [next, ...data.history.filter((h) => h.id !== id)]
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .slice(0, HISTORY_LIMIT);
    save();
  },
  remove(id) {
    data.history = data.history.filter((h) => h.id !== id);
    save();
  },
};

// Trust-on-first-use host key pinning.
const hostKeys = {
  check(host, port, hash) {
    const k = `${host}:${port}`;
    const known = data.hostKeys[k];
    if (!known) {
      data.hostKeys[k] = hash;
      save();
      return true;
    }
    return known === hash;
  },
  forget(host, port) {
    delete data.hostKeys[`${host}:${port}`];
    save();
  },
};

module.exports = { presets, snippets, history, hostKeys, cleanPreset };
