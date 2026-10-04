'use client';
import { useState } from 'react';

// Sticky toolbar mapping tmux actions to buttons. `run(action, arg)` performs them.
export default function TmuxToolbar({ run, sessions, refreshSessions, synced, onSync, disabled }) {
  const [open, setOpen] = useState(null); // 'new' | 'list' | null
  const [name, setName] = useState('');

  const btn = (label, title, onClick, extra = '') => (
    <button className={`tb ${extra}`} title={title} onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );

  return (
    <div className="toolbar">
      <div className="tb-group">
        <div className="pop-wrap">
          {btn('＋ New', 'Create new tmux session', () => setOpen(open === 'new' ? null : 'new'))}
          {open === 'new' && (
            <form
              className="popover"
              onSubmit={(e) => {
                e.preventDefault();
                run('new-session', name.trim() || undefined);
                setName('');
                setOpen(null);
              }}
            >
              <input autoFocus placeholder="session name (optional)" value={name} onChange={(e) => setName(e.target.value)} pattern="[A-Za-z0-9_.\-]*" />
              <button className="primary">Create</button>
            </form>
          )}
        </div>
        <div className="pop-wrap">
          {btn('☰ Sessions', 'List live sessions / attach', () => {
            if (open !== 'list') refreshSessions();
            setOpen(open === 'list' ? null : 'list');
          })}
          {open === 'list' && (
            <div className="popover list">
              {sessions.length === 0 && <div className="muted">No live sessions</div>}
              {sessions.map((s) => (
                <div className="row" key={s.name}>
                  <span>
                    <b>{s.name}</b> <span className="muted">{s.windows}w{s.attached ? ' · attached' : ''}</span>
                  </span>
                  <button
                    onClick={() => {
                      run('attach-session', s.name);
                      setOpen(null);
                    }}
                  >
                    Attach
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        {btn('⏏ Detach', 'Detach (session keeps running)', () => run('detach'))}
      </div>
      <div className="tb-group">
        {btn('▌▐ Split |', 'Split vertically (%)', () => run('split-vertical'))}
        {btn('▀▄ Split —', 'Split horizontally (")', () => run('split-horizontal'))}
        {btn('✕ Pane', 'Close pane', () => run('close-pane'), 'danger')}
        {btn('◀ Prev', 'Previous window (p)', () => run('previous-window'))}
        {btn('Next ▶', 'Next window (n)', () => run('next-window'))}
      </div>
      <label className="switch" title="Broadcast keystrokes to every pane in the window (synchronize-panes)">
        <input type="checkbox" checked={synced} onChange={(e) => onSync(e.target.checked)} disabled={disabled} />
        <span>Sync input</span>
      </label>
    </div>
  );
}
