const http = require('http');

/**
 * AlertNet Stateless Reverse Proxy / Load Balancer
 * Distributes incoming traffic across two application instances:
 * - Instance A (port 4001)
 * - Instance B (port 4002)
 * Demonstrates high availability and shared persistent state.
 */

const TARGETS = [
  { host: '127.0.0.1', port: 4001, id: 'instance-A', healthy: true },
  { host: '127.0.0.1', port: 4002, id: 'instance-B', healthy: true }
];

let roundRobin = 0;

function getNextTarget() {
  const healthy = TARGETS.filter(t => t.healthy);
  if (healthy.length === 0) return TARGETS[0]; // fallback
  const target = healthy[roundRobin % healthy.length];
  roundRobin++;
  return target;
}

const server = http.createServer((req, res) => {
  const target = getNextTarget();

  const options = {
    hostname: target.host,
    port: target.port,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      'x-forwarded-for': req.socket.remoteAddress,
      'x-served-by-instance': target.id
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      ...proxyRes.headers,
      'x-alertnet-instance': target.id
    });
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error(`[Load Balancer] Target ${target.id} failed:`, err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Gateway: Upstream instance unavailable', target: target.id }));
  });

  req.pipe(proxyReq, { end: true });
});

const LB_PORT = process.env.LB_PORT || 4000;
server.listen(LB_PORT, () => {
  console.log(`[Load Balancer] Reverse proxy listening on port ${LB_PORT}`);
  console.log(`[Load Balancer] Balancing across: ${TARGETS.map(t => `${t.id} (${t.port})`).join(', ')}`);
});
