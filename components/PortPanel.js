'use client';
import { useCallback, useEffect, useState } from 'react';
import { call } from '../lib/socket';

export default function PortPanel({ sid, active }) {
  const [forwards, setForwards] = useState([]);
  const [remotePort, setRemotePort] = useState('');
  const [localPort, setLocalPort] = useState('');
  const [remoteHost, setRemoteHost] = useState('127.0.0.1');
  const [error, setError] = useState('');

  const refresh = useCallback(() => call('fwd:list', { sid }).then(setForwards).catch((e) => setError(e.message)), [sid]);
  useEffect(() => {
    if (sid && active) refresh();
  }, [sid, active, refresh]);

  const start = async (e) => {
    e.preventDefault();
    try {
      await call('fwd:start', { sid, remoteHost, remotePort, localPort: localPort || remotePort });
      setError('');
      setRemotePort('');
      setLocalPort('');
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };
  const stop = (id) => call('fwd:stop', { sid, id }).then(setForwards).catch((e) => setError(e.message));

  return (
    <div className="panel-body">
      <form className="stack" onSubmit={start}>
        <label>Remote host<input value={remoteHost} onChange={(e) => setRemoteHost(e.target.value)} /></label>
        <div className="two">
          <label>Remote port<input type="number" min="1" max="65535" required value={remotePort} onChange={(e) => setRemotePort(e.target.value)} /></label>
          <label>Local port<input type="number" min="0" max="65535" placeholder={remotePort || 'same'} value={localPort} onChange={(e) => setLocalPort(e.target.value)} /></label>
        </div>
        <button className="primary">Start Forwarding</button>
      </form>
      {error && <div className="error">{error}</div>}
      <ul className="fwd-list">
        {forwards.map((f) => (
          <li key={f.id}>
            <span>
              <a href={`http://${f.bind === '0.0.0.0' ? location.hostname : f.bind}:${f.localPort}`} target="_blank" rel="noreferrer">:{f.localPort}</a> → {f.remoteHost}:{f.remotePort}
            </span>
            <button onClick={() => stop(f.id)}>Stop</button>
          </li>
        ))}
        {forwards.length === 0 && <li className="muted">No active forwards</li>}
      </ul>
      <div className="hint muted">Listens on the WebMux server's loopback interface. Links work when the browser runs on the same machine.</div>
    </div>
  );
}
