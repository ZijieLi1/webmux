'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function SnippetPanel({ onPaste }) {
  const [snippets, setSnippets] = useState([]);
  const [form, setForm] = useState(null); // {id?, name, command}
  const [error, setError] = useState('');

  const load = useCallback(() => api.get('/api/snippets').then(setSnippets).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);

  const save = async (e) => {
    e.preventDefault();
    try {
      if (form.id) await api.put(`/api/snippets/${form.id}`, form);
      else await api.post('/api/snippets', form);
      setForm(null);
      setError('');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="panel-body">
      {form ? (
        <form className="stack" onSubmit={save}>
          <label>Name<input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Command<textarea required rows={5} value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} /></label>
          <div className="row">
            <button className="primary">Save</button>
            <button type="button" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setForm({ name: '', command: '' })}>＋ New snippet</button>
      )}
      {error && <div className="error">{error}</div>}
      <ul className="snippets">
        {snippets.map((s) => (
          <li key={s.id}>
            <button className="snippet" title={s.command} onClick={() => onPaste(s.command)}>
              <b>{s.name}</b>
              <code>{s.command.split('\n')[0]}</code>
            </button>
            <button title="Edit" onClick={() => setForm(s)}>✎</button>
            <button title="Delete" onClick={() => api.del(`/api/snippets/${s.id}`).then(load)}>🗑</button>
          </li>
        ))}
        {snippets.length === 0 && !form && <li className="muted">No snippets yet</li>}
      </ul>
      <div className="hint muted">Clicking a snippet pastes it at the prompt without pressing Enter.</div>
    </div>
  );
}
