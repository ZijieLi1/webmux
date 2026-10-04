'use client';
import { useCallback, useEffect, useState } from 'react';
import { call } from '../lib/socket';

const fmtSize = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const join = (dir, name) => (dir.endsWith('/') ? dir : `${dir}/`) + name;

export default function FilePanel({ sid, active }) {
  const [dir, setDir] = useState(null);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(null); // {x,y,entry}
  const [uploads, setUploads] = useState([]);
  const [dragging, setDragging] = useState(false);

  const load = useCallback(
    async (path) => {
      try {
        const r = await call('sftp:list', { sid, path });
        setDir(r.path);
        setEntries(r.entries);
        setError('');
      } catch (e) {
        setError(e.message);
      }
    },
    [sid]
  );

  useEffect(() => {
    if (sid && active && dir === null) load('.');
  }, [sid, active, dir, load]);

  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const parent = dir && dir !== '/' ? dir.replace(/\/[^/]*$/, '') || '/' : null;

  const download = (entry) => {
    const a = document.createElement('a');
    a.href = `/api/sessions/${sid}/download?path=${encodeURIComponent(join(dir, entry.name))}`;
    a.download = entry.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const upload = async (files) => {
    for (const file of files) {
      const id = `${Date.now()}-${file.name}`;
      setUploads((u) => [...u, { id, name: file.name, state: 'uploading' }]);
      const set = (state) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, state } : x)));
      try {
        const res = await fetch(`/api/sessions/${sid}/upload?dir=${encodeURIComponent(dir)}&name=${encodeURIComponent(file.name)}`, { method: 'PUT', body: file });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.status);
        set('done');
      } catch (e) {
        set(`failed: ${e.message}`);
      }
    }
    load(dir);
  };

  return (
    <div
      className={`panel-body files ${dragging ? 'drop' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const files = [...e.dataTransfer.files];
        if (files.length && dir) upload(files);
      }}
    >
      <div className="path-bar">
        <button disabled={!parent} onClick={() => load(parent)} title="Up">↑</button>
        <code title={dir || ''}>{dir || '…'}</code>
        <button onClick={() => load(dir || '.')} title="Refresh">⟳</button>
      </div>
      {error && <div className="error">{error}</div>}
      <ul className="file-list">
        {entries.map((e) => (
          <li
            key={e.name}
            onDoubleClick={() => e.dir && load(join(dir, e.name))}
            onContextMenu={(ev) => {
              ev.preventDefault();
              setMenu({ x: ev.clientX, y: ev.clientY, entry: e });
            }}
          >
            <span>{e.dir ? '📁' : '📄'} {e.name}</span>
            <span className="muted">{e.dir ? '' : fmtSize(e.size)}</span>
          </li>
        ))}
        {!error && dir && entries.length === 0 && <li className="muted">Empty directory</li>}
      </ul>
      <div className="hint muted">Drop files here to upload · right-click to download · double-click to open</div>
      {uploads.length > 0 && (
        <ul className="uploads">
          {uploads.slice(-5).map((u) => (
            <li key={u.id}>{u.name} — {u.state}</li>
          ))}
        </ul>
      )}
      {menu && (
        <div className="ctx" style={{ left: menu.x, top: menu.y }}>
          {menu.entry.dir ? (
            <button onClick={() => load(join(dir, menu.entry.name))}>Open</button>
          ) : (
            <button onClick={() => download(menu.entry)}>Download</button>
          )}
        </div>
      )}
    </div>
  );
}
