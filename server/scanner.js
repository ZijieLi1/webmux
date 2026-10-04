// Subnet discovery via `nmap -sn` (ping sweep).
const os = require('os');
const { spawn } = require('child_process');

const CIDR_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d|[12]\d|3[0-2])$/;

function validCidr(s) {
  const m = CIDR_RE.exec(s || '');
  return !!m && m.slice(1, 5).every((o) => Number(o) <= 255);
}

function maskToPrefix(mask) {
  return mask.split('.').reduce((n, o) => n + Number(o).toString(2).replace(/0/g, '').length, 0);
}

// First non-internal IPv4 interface, as a network CIDR (e.g. 192.168.1.0/24).
function defaultSubnet() {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const prefix = maskToPrefix(a.netmask);
      const ip = a.address.split('.').map(Number);
      const mask = a.netmask.split('.').map(Number);
      return `${ip.map((o, i) => o & mask[i]).join('.')}/${prefix}`;
    }
  }
  return '192.168.1.0/24';
}

// Parses `nmap -oG -` output.
function parseGreppable(out) {
  const hosts = [];
  for (const line of out.split('\n')) {
    const m = /^Host: (\S+) \(([^)]*)\)\s+Status: Up/.exec(line);
    if (m) hosts.push({ ip: m[1], hostname: m[2] });
  }
  return hosts;
}

function scan(subnet) {
  return new Promise((resolve, reject) => {
    if (!validCidr(subnet)) return reject(Object.assign(new Error('Invalid subnet (expected e.g. 192.168.1.0/24)'), { status: 400 }));
    const prefix = Number(subnet.split('/')[1]);
    if (prefix < 16) return reject(Object.assign(new Error('Subnet too large (minimum prefix is /16)'), { status: 400 }));
    const p = spawn('nmap', ['-sn', '-oG', '-', subnet], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => p.kill(), 120000);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) =>
      reject(Object.assign(new Error(e.code === 'ENOENT' ? 'nmap is not installed on the WebMux server' : e.message), { status: e.code === 'ENOENT' ? 501 : 500 }))
    );
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(err.trim() || `nmap exited with code ${code}`));
      resolve(parseGreppable(out));
    });
  });
}

module.exports = { scan, defaultSubnet, parseGreppable, validCidr };
