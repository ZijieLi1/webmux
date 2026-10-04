'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { getSocket } from '../lib/socket';

// xterm.js bound to a socket.io session. `sid` may be null until the SSH
// connection exists; `active` triggers a refit when the tab becomes visible.
const Terminal = forwardRef(function Terminal({ sid, active, onReady }, ref) {
  const host = useRef(null);
  const term = useRef(null);
  const fit = useRef(null);
  const sidRef = useRef(sid);
  sidRef.current = sid;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useImperativeHandle(ref, () => ({
    size: () => ({ cols: term.current?.cols || 80, rows: term.current?.rows || 24 }),
    paste: (text) => term.current?.paste(text),
    focus: () => term.current?.focus(),
    refit: () => doFit(),
  }));

  function doFit() {
    const el = host.current;
    if (!el || !el.offsetWidth || !el.offsetHeight || !fit.current) return;
    fit.current.fit();
    if (sidRef.current) getSocket().emit('term:resize', { sid: sidRef.current, cols: term.current.cols, rows: term.current.rows });
  }

  useEffect(() => {
    let disposed = false;
    let ro;
    const socket = getSocket();
    const onData = (p) => p.sid === sidRef.current && term.current?.write(p.data);
    socket.on('term:data', onData);

    (async () => {
      const [{ Terminal: XTerm }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);
      if (disposed) return;
      const t = new XTerm({
        cursorBlink: true,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 14,
        scrollback: 5000,
        theme: { background: '#0d1117', foreground: '#e6edf3' },
      });
      const f = new FitAddon();
      t.loadAddon(f);
      t.open(host.current);
      term.current = t;
      fit.current = f;
      t.onData((data) => sidRef.current && socket.emit('term:input', { sid: sidRef.current, data }));
      ro = new ResizeObserver(() => doFit());
      ro.observe(host.current);
      doFit();
      onReadyRef.current?.();
    })();

    return () => {
      disposed = true;
      socket.off('term:data', onData);
      ro?.disconnect();
      term.current?.dispose();
      term.current = null;
    };
  }, []);

  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => {
        doFit();
        term.current?.focus();
      });
    }
  }, [active]);

  return <div className="terminal-host" ref={host} />;
});

export default Terminal;
