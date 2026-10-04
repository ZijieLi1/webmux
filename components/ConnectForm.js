'use client';
import { useState } from 'react';

// Modal used to create/edit a preset or to start an ad-hoc connection.
export default function ConnectForm({ initial, title, onSave, onConnect, onCancel }) {
  const [f, setF] = useState({ name: '', host: '', port: 22, username: '', keyPath: '', password: '', ...initial });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const preset = () => ({ id: f.id, name: f.name || `${f.username}@${f.host}`, host: f.host, port: Number(f.port) || 22, username: f.username, keyPath: f.keyPath });

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        className="modal stack"
        onSubmit={(e) => {
          e.preventDefault();
          (onConnect || onSave)(onConnect ? { ...preset(), password: f.password } : preset());
        }}
      >
        <h3>{title}</h3>
        <label>Name<input value={f.name} onChange={set('name')} placeholder="my-dev-box" /></label>
        <div className="two">
          <label>Host / IP<input required value={f.host} onChange={set('host')} /></label>
          <label>Port<input type="number" value={f.port} onChange={set('port')} /></label>
        </div>
        <label>Username<input required value={f.username} onChange={set('username')} /></label>
        <label>SSH key path<input value={f.keyPath} onChange={set('keyPath')} placeholder="~/.ssh/id_ed25519 (blank: default keys / agent)" /></label>
        {onConnect && <label>Password (not stored)<input type="password" value={f.password} onChange={set('password')} /></label>}
        <div className="row">
          <button className="primary">{onConnect ? 'Connect' : 'Save'}</button>
          {onConnect && onSave && (
            <button type="button" onClick={() => onSave(preset())}>Save as preset</button>
          )}
          <button type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
