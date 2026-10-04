'use client';
import { useState } from 'react';
import Home from './Home';
import SessionView from './SessionView';

let counter = 0;

export default function App() {
  const [tabs, setTabs] = useState([]); // {key, params}
  const [current, setCurrent] = useState('home');

  const open = (params) => {
    const key = `s${++counter}`;
    setTabs((t) => [...t, { key, params }]);
    setCurrent(key);
  };
  const close = (key) => {
    setTabs((t) => t.filter((x) => x.key !== key));
    setCurrent((c) => (c === key ? 'home' : c));
  };

  return (
    <div className="app">
      <nav className="topbar">
        <b className="logo">WebMux</b>
        <button className={current === 'home' ? 'on' : ''} onClick={() => setCurrent('home')}>Dashboard</button>
        {tabs.map((t) => (
          <span key={t.key} className={`tab ${current === t.key ? 'on' : ''}`}>
            <button onClick={() => setCurrent(t.key)}>{t.params.name || `${t.params.username}@${t.params.host}`}</button>
            <button className="x" title="Disconnect" onClick={() => close(t.key)}>✕</button>
          </span>
        ))}
      </nav>
      <main>
        <div style={{ display: current === 'home' ? 'block' : 'none' }}>
          <Home onConnect={open} />
        </div>
        {tabs.map((t) => (
          <SessionView key={t.key} params={t.params} active={current === t.key} onEnded={() => close(t.key)} />
        ))}
      </main>
    </div>
  );
}
