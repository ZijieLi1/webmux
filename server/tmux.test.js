const test = require('node:test');
const assert = require('node:assert');
const t = require('./tmux');

test('shQuote neutralises quotes', () => {
  assert.strictEqual(t.shQuote("a'b"), `'a'\\''b'`);
});

test('session names and pane ids are validated', () => {
  assert.throws(() => t.assertSessionName('x; reboot'));
  assert.strictEqual(t.assertSessionName('dev-1'), 'dev-1');
  assert.throws(() => t.assertPaneId('%1; ls'));
  assert.strictEqual(t.assertPaneId('%12'), '%12');
});

test('prefixToChar', () => {
  assert.strictEqual(t.prefixToChar('C-b'), '\x02');
  assert.strictEqual(t.prefixToChar('C-a'), '\x01');
  assert.strictEqual(t.prefixToChar('M-x'), '\x02');
});

test('parsePanes', () => {
  const r = t.parsePanes('%0|0|0|0|40|24|1|80|24|0|bash\n%1|1|41|0|39|24|0|80|24|0|vim\n');
  assert.strictEqual(r.panes.length, 2);
  assert.strictEqual(r.windowWidth, 80);
  assert.strictEqual(r.panes[0].active, true);
  assert.strictEqual(r.synced, false);
});
