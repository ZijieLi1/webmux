# WebMux

A web front-end for managing, monitoring and interacting with `tmux` sessions on
remote devices over SSH.

- **Frontend:** Next.js (React) + `xterm.js` (`@xterm/addon-fit`)
- **Backend:** Node.js + Express + `socket.io` (one process serves both)
- **SSH:** [`ssh2`](https://github.com/mscdex/ssh2) — shell, exec, SFTP, `forwardOut`
- **Discovery:** `nmap -sn` ping sweep

## Run

```sh
npm install
npm run dev                 # http://127.0.0.1:3000
# or
npm run build && npm start
```

Requirements: Node 20+, `nmap` on the server (only for the scanner), `tmux` on the remote devices.

| Env var | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Interface WebMux listens on |
| `PORT` | `3000` | HTTP port |
| `WEBMUX_DATA_DIR` | `~/.webmux` | Presets, history, snippets, pinned host keys (`data.json`, mode 0600) |
| `WEBMUX_FORWARD_BIND` | `127.0.0.1` | Interface local forwarded ports bind to |

## Features

- **Dashboard** — recent devices with one-click *Reconnect*; persistent presets (host, port, user, key path); several devices open at once as tabs.
- **Network scanner** — *Scan Subnet* (defaults to the server's own subnet), then save a host as a preset or SSH straight in.
- **tmux toolbar** — new session, list/attach, detach, split `|`/`—`, close pane, next/previous window.
- **Files** — SFTP browser, drag-and-drop upload into the current directory, right-click → download (streamed).
- **Mouse** — toggles tmux mouse mode for the current session: the wheel scrolls tmux's history and clicks focus panes. Hold Shift while dragging to select text for copying.
- **Sync input** — toggles tmux `synchronize-panes` for the current window.
- **Layout** — minimap built from `tmux list-panes`; click a pane to focus it.
- **Ports** — forward a remote port to a local one through the SSH connection; start/stop per forward.
- **Snippets** — saved commands; click to paste at the active prompt (not executed).

On connect, WebMux runs `exec tmux new-session -A -s webmux` in the shell (disable with `autoTmux: false`).
Detaching ends the shell channel but keeps the SSH connection, so *Re-attach* is instant.

## Authentication & security

WebMux gives whoever can reach it a shell on every device its server can reach. **There is no login.**
It therefore binds to loopback by default; if you set `HOST` to anything else, put it behind an authenticating
reverse proxy or VPN.

- Auth is chosen per connection/preset: **SSH key** (key file path read server-side; blank uses default `~/.ssh` keys / `SSH_AUTH_SOCK`) or **Password** (also works with servers that only offer keyboard-interactive). Presets remember the method but never the password: it is asked for on each connect and held in memory only. Encrypted keys are supported too: WebMux asks for the passphrase (also never stored) and offers "Use password instead". Credentials typed in a tab are kept in memory for that tab, so Reconnect doesn't ask twice.
- Host keys are pinned on first use; a changed key aborts the connection.
- Cross-origin HTTP and WebSocket requests are rejected.
- Port forwards listen on the *server's* loopback, not the browser machine's.

## Layout

```
server/   index.js (HTTP + socket.io) · sessions.js (ssh2, tmux, sftp, forwards) · tmux.js · scanner.js · store.js
app/      Next.js app router (single page)
components/  App, Home, ConnectForm, SessionView, Terminal, TmuxToolbar, FilePanel, PaneMap, PortPanel, SnippetPanel
```

`npm test` runs unit tests for the scanner and tmux helpers.
