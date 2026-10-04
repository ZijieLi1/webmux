'use client';

// Minimap of the current tmux window; clicking a pane focuses it.
export default function PaneMap({ layout, onSelect, error }) {
  if (error) return <div className="panel-body"><div className="error">{error}</div></div>;
  if (!layout) return <div className="panel-body muted">Loading layout…</div>;
  const { panes, windowWidth: W, windowHeight: H } = layout;
  return (
    <div className="panel-body">
      <div className="muted small">Session <b>{layout.session}</b> · {panes.length} pane{panes.length === 1 ? '' : 's'}</div>
      <div className="minimap" style={{ aspectRatio: `${W} / ${H}` }}>
        {panes.map((p) => (
          <button
            key={p.id}
            className={`pane ${p.active ? 'active' : ''}`}
            style={{
              left: `${(p.left / W) * 100}%`,
              top: `${(p.top / H) * 100}%`,
              width: `${(p.width / W) * 100}%`,
              height: `${(p.height / H) * 100}%`,
            }}
            onClick={() => onSelect(p.id)}
            title={`Focus pane ${p.index} (${p.command})`}
          >
            <b>{p.index}</b>
            <span>{p.command}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
