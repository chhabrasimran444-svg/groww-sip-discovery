// Local dev server: serves index.html and routes /api/lens to the Vercel function.
// MOCK_NAV=1 node dev/server.js  (synthetic NAVs, for layout testing only)
const http = require('http');
const fs = require('fs');
const path = require('path');
const handler = require('../api/lens');
const root = path.join(__dirname, '..');
const port = Number(process.env.PORT || 3000);
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/api/lens') { req.query = Object.fromEntries(u.searchParams); return handler(req, res); }
  const file = path.join(root, u.pathname === '/' ? 'index.html' : u.pathname);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('not found'); }
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/plain';
  res.setHeader('content-type', type + '; charset=utf-8');
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log('http://localhost:' + port));
