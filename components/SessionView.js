'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { call, getSocket } from '../lib/socket';
import Terminal from './Terminal';
import TmuxToolbar from './TmuxToolbar';
import FilePanel from './FilePanel';
import PaneMap from './PaneMap';
import PortPanel from './PortPanel';
import SnippetPanel from './SnippetPanel';

const TABS = [
  ['files', 'Files'],
  ['layout', 'Layout'],
  ['ports', 'Ports'],
  ['snippets', 'Snippets'],
];

export default function SessionView({ params, active, onEnded }) {
  const termRef = useRef(null);
  const sidRef = useRef(null);
  const [sid, setSid] = useState(null);
  const [status, setStatus] = useState('connecting'); // connecting | ready | detached | auth | closed
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState('files');
  const [sessions, setSessions] = useState([]);
  const [layout, setLayout] = useState(null);
  const [layoutError, setLayoutError] = useState('');
  const [notice, setNotice] = useState('');

  const connect = useCallback(
    async (extra = {}) => {
      setStatus('connecting');
      setMessage('');
      const { cols, rows } = termRef.current.size();
      getSocket().emit('ssh:connect', { ...params, ...extra, cols, rows }, (res) => {
        if (res.ok) {
          sidRef.current = res.sid;
          setSid(res.sid);
          setStatus('ready');
          termRef.current.focus();
        } else if (res.authFailed) {
          setStatus('auth');
          setMessage(res.error);
        } else {
          setStatus('closed');
          setMessage(res.error);
        }
      });
    },
    [params]
  );

  useEffect(() => {
    const socket = getSocket();
    const onClosed = (p) => {
      if (p.sid !== sidRef.current) return;
      sidRef.current = null;
      setSid(null);
      setStatus('closed');
      setMessage(p.reason || 'Connection closed');
    };
    const onTermClosed = (p) => p.sid === sidRef.current && setStatus('detached');
    socket.on('ssh:closed', onClosed);
    socket.on('term:closed', onTermClosed);
    return () => {
      socket.off('ssh:closed', onClosed);
      socket.off('term:closed', onTermClosed);
      if (sidRef.current) socket.emit('ssh:disconnect', { sid: sidRef.current });
    };
  }, []);

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const run = (action, arg) => call('tmux:action', { sid, action, arg }).catch((e) => flash(e.message));
  const refreshSessions = () => call('tmux:sessions', { sid }).then(setSessions).catch((e) => flash(e.message));
  const refreshLayout = useCallback(async () => {
    if (!sidRef.current) return;
    try {
      setLayout(await call('tmux:panes', { sid: sidRef.current }));
      setLayoutError('');
    } catch (e) {
      setLayoutError(e.message);
    }
  }, []);

  useEffect(() => {
    if (!active || status !== 'ready') return;
    refreshLayout();
    const t = setInterval(refreshLayout, 2000);
    return () => clearInterval(t);
  }, [active, status, refreshLayout]);

  const reattach = () => {
    const { cols, rows } = termRef.current.size();
    setStatus('ready');
    call('term:open', { sid, cols, rows }).then(() => termRef.current.focus()).catch((e) => {
      setStatus('detached');
      flash(e.message);
    });
  };

  const setSync = async (on) => {
    try {
      await call('tmux:sync', { sid, on });
      refreshLayout();
    } catch (e) {
      flash(e.message);
    }
  };

  const selectPane = async (paneId) => {
    try {
      await call('tmux:select-pane', { sid, paneId });
      refreshLayout();
      termRef.current.focus();
    } catch (e) {
      flash(e.message);
    }
  };

  const paste = (text) => {
    termRef.current.paste(text);
    termRef.current.focus();
  };

  const ready = status === 'ready';

  return (
    <div className="session" style={{ display: active ? 'flex' : 'none' }}>
      <TmuxToolbar
        run={run}
        sessions={sessions}
        refreshSessions={refreshSessions}
        synced={!!layout?.synced}
        onSync={setSync}
        disabled={!ready}
      />
      {notice && <div className="notice">{notice}</div>}
      <div className="session-main">
        <div className="term-wrap">
          <Terminal ref={termRef} sid={sid} active={active} onReady={() => connect()} />
          {status !== 'ready' && (
            <div className="overlay">
              {status === 'connecting' && <p>Connecting to {params.username}@{params.host}…</p>}
              {status === 'auth' && (
                <form
                  className="stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    connect({ password });
                    setPassword('');
                  }}
                >
                  <p>{message}. Enter a password for {params.username}@{params.host}:</p>
                  <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
                  <div className="row">
                    <button className="primary">Connect</button>
                    <button type="button" onClick={onEnded}>Cancel</button>
                  </div>
                </form>
              )}
              {status === 'detached' && (
                <div className="stack">
                  <p>Detached from tmux. The session keeps running on the remote host.</p>
                  <div className="row">
                    <button className="primary" onClick={reattach}>Re-attach</button>
                    <button onClick={onEnded}>Disconnect</button>
                  </div>
                </div>
              )}
              {status === 'closed' && (
                <div className="stack">
                  <p>{message || 'Disconnected'}</p>
                  <div className="row">
                    <button className="primary" onClick={() => connect()}>Reconnect</button>
                    <button onClick={onEnded}>Close tab</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <aside className="side">
          <div className="tabs">
            {TABS.map(([k, label]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>
          {tab === 'files' && <FilePanel sid={sid} active={active && tab === 'files'} />}
          {tab === 'layout' && <PaneMap layout={layout} error={layoutError} onSelect={selectPane} />}
          {tab === 'ports' && <PortPanel sid={sid} active={active && tab === 'ports'} />}
          {tab === 'snippets' && <SnippetPanel onPaste={paste} />}
        </aside>
      </div>
    </div>
  );
}
