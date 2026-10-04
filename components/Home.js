'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import ConnectForm from './ConnectForm';

const target = (p) => `${p.username}@${p.host}${p.port && p.port !== 22 ? `:${p.port}` : ''}`;

export default function Home({ onConnect }) {
  const [history, setHistory] = useState([]);
  const [presets, setPresets] = useState([]);
  const [form, setForm] = useState(null); // {mode: 'preset'|'connect', initial}
  const [subnet, setSubnet] = useState('');
  const [scan, setScan] = useState({ state: 'idle', hosts: [], error: '' });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [h, p] = await Promise.all([api.get('/api/history'), api.get('/api/presets')]);
      setHistory(h);
      setPresets(p);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    api.get('/api/scan/default').then((r) => setSubnet(r.subnet)).catch(() => {});
  }, [load]);

  const savePreset = async (p) => {
    try {
      if (p.id) await api.put(`/api/presets/${p.id}`, p);
      else await api.post('/api/presets', p);
      setForm(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const runScan = async () => {
    setScan({ state: 'scanning', hosts: [], error: '' });
    try {
      const r = await api.post('/api/scan', { subnet });
      setScan({ state: 'done', hosts: r.hosts, error: '' });
    } catch (e) {
      setScan({ state: 'error', hosts: [], error: e.message });
    }
  };

  return (
    <div className="home">
      {error && <div className="error">{error}</div>}

      <section>
        <div className="section-head">
          <h2>Recent</h2>
          <button className="primary" onClick={() => setForm({ mode: 'connect', title: 'Quick connect', initial: {} })}>＋ Quick connect</button>
        </div>
        <div className="grid">
          {history.map((h) => (
            <div className="card" key={h.id}>
              <b>{h.name}</b>
              <span className="muted">{target(h)}</span>
              <span className="muted small">{new Date(h.lastUsed).toLocaleString()} · {h.count}×</span>
              <div className="row">
                <button className="primary" onClick={() => onConnect(h)}>Reconnect</button>
                <button title="Remove from history" onClick={() => api.del(`/api/history/${encodeURIComponent(h.id)}`).then(load)}>✕</button>
              </div>
            </div>
          ))}
          {history.length === 0 && <p className="muted">No connections yet. Use Quick connect, a preset, or scan the network.</p>}
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>Presets</h2>
          <button onClick={() => setForm({ mode: 'preset', title: 'New preset', initial: {} })}>＋ New preset</button>
        </div>
        <div className="grid">
          {presets.map((p) => (
            <div className="card" key={p.id}>
              <b>{p.name}</b>
              <span className="muted">{target(p)}</span>
              <span className="muted small">{p.keyPath || 'default key / agent'}</span>
              <div className="row">
                <button className="primary" onClick={() => onConnect(p)}>Connect</button>
                <button onClick={() => setForm({ mode: 'preset', title: 'Edit preset', initial: p })}>Edit</button>
                <button title="Delete" onClick={() => api.del(`/api/presets/${p.id}`).then(load)}>🗑</button>
              </div>
            </div>
          ))}
          {presets.length === 0 && <p className="muted">No presets saved.</p>}
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>Network scanner</h2>
          <div className="row">
            <input value={subnet} onChange={(e) => setSubnet(e.target.value)} placeholder="192.168.1.0/24" />
            <button onClick={runScan} disabled={scan.state === 'scanning'}>{scan.state === 'scanning' ? 'Scanning…' : 'Scan Subnet'}</button>
          </div>
        </div>
        {scan.state === 'error' && <div className="error">{scan.error}</div>}
        {scan.state === 'done' && scan.hosts.length === 0 && <p className="muted">No live hosts found.</p>}
        {scan.hosts.length > 0 && (
          <table>
            <tbody>
              {scan.hosts.map((h) => (
                <tr key={h.ip}>
                  <td><code>{h.ip}</code></td>
                  <td className="muted">{h.hostname}</td>
                  <td className="actions">
                    <button onClick={() => setForm({ mode: 'preset', title: 'Save as preset', initial: { name: h.hostname || h.ip, host: h.ip } })}>Save preset</button>
                    <button className="primary" onClick={() => setForm({ mode: 'connect', title: `Connect to ${h.ip}`, initial: { host: h.ip } })}>SSH</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {form && (
        <ConnectForm
          title={form.title}
          initial={form.initial}
          onCancel={() => setForm(null)}
          onSave={savePreset}
          onConnect={
            form.mode === 'connect'
              ? (p) => {
                  setForm(null);
                  onConnect(p);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
