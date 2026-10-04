const test = require('node:test');
const assert = require('node:assert');
const { parseGreppable, validCidr, defaultSubnet } = require('./scanner');

test('parseGreppable keeps only hosts that are up', () => {
  const out = [
    '# Nmap 7.94 scan initiated',
    'Host: 192.168.1.1 (router.lan)\tStatus: Up',
    'Host: 192.168.1.9 ()\tStatus: Up',
    'Host: 192.168.1.10 ()\tStatus: Down',
    '# Nmap done',
  ].join('\n');
  assert.deepStrictEqual(parseGreppable(out), [
    { ip: '192.168.1.1', hostname: 'router.lan' },
    { ip: '192.168.1.9', hostname: '' },
  ]);
});

test('validCidr rejects injection and bad octets', () => {
  assert.ok(validCidr('10.0.0.0/24'));
  assert.ok(!validCidr('10.0.0.0/24; rm -rf /'));
  assert.ok(!validCidr('300.0.0.0/24'));
  assert.ok(!validCidr('10.0.0.0'));
  assert.ok(validCidr(defaultSubnet()));
});
