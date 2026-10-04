// Helpers for talking to a remote tmux. Everything interpolated into a remote
// command line is either quoted with shQuote() or validated first.
const shQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

const SESSION_NAME_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const PANE_ID_RE = /^%\d+$/;

function assertSessionName(name) {
  if (!SESSION_NAME_RE.test(name || '')) throw new Error('Session names may only contain letters, digits, "_", "." and "-"');
  return name;
}

function assertPaneId(id) {
  if (!PANE_ID_RE.test(id || '')) throw new Error('Invalid pane id');
  return id;
}

// "C-b" -> "\x02", "C-a" -> "\x01"; anything else falls back to C-b.
function prefixToChar(prefix) {
  const m = /^C-([a-zA-Z])$/.exec((prefix || '').trim());
  return m ? String.fromCharCode(m[1].toLowerCase().charCodeAt(0) - 96) : '\x02';
}

const SESSION_FMT = '#{session_name}|#{session_windows}|#{session_attached}|#{session_created}';
const PANE_FMT =
  '#{pane_id}|#{pane_index}|#{pane_left}|#{pane_top}|#{pane_width}|#{pane_height}|#{pane_active}|#{window_width}|#{window_height}|#{pane_synchronized}|#{pane_current_command}';

function parseSessions(out) {
  return out
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [name, windows, attached, created] = l.split('|');
      return { name, windows: Number(windows), attached: Number(attached), created: Number(created) * 1000 };
    });
}

function parsePanes(out) {
  const panes = out
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [id, index, left, top, width, height, active, ww, wh, sync, command] = l.split('|');
      return {
        id,
        index: Number(index),
        left: Number(left),
        top: Number(top),
        width: Number(width),
        height: Number(height),
        active: active === '1',
        windowWidth: Number(ww),
        windowHeight: Number(wh),
        synced: sync === '1',
        command,
      };
    });
  return {
    panes,
    windowWidth: panes[0]?.windowWidth || 0,
    windowHeight: panes[0]?.windowHeight || 0,
    synced: panes.length > 0 && panes.every((p) => p.synced),
  };
}

// Keys sent through the pty for each toolbar action (prefix is prepended).
// Functions return a command run via tmux's ":" prompt, which avoids the
// interactive y/n confirmation of the default close-pane binding.
const ACTION_KEYS = {
  'split-vertical': '%',
  'split-horizontal': '"',
  'close-pane': () => 'kill-pane',
  'next-window': 'n',
  'previous-window': 'p',
  detach: 'd',
};

module.exports = {
  shQuote,
  assertSessionName,
  assertPaneId,
  prefixToChar,
  parseSessions,
  parsePanes,
  SESSION_FMT,
  PANE_FMT,
  ACTION_KEYS,
};
