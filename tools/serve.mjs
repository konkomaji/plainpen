// Tiny static server for local development: node tools/serve.mjs [port]
// Sends the SAME security headers as production (_headers), so what you test is what ships.
// Binds to 127.0.0.1 only. Refuses path traversal. No dependencies.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, normalize, extname, sep } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.argv[2]) || 8080;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.woff2': 'font/woff2' };

// parse the global (/*) block of _headers
const hdrText = await readFile(join(root, '_headers'), 'utf8');
const SECURITY = {};
for (const line of hdrText.split('\n').slice(1)) { if (!line.startsWith('  ')) break; const i = line.indexOf(':'); SECURITY[line.slice(2, i).trim()] = line.slice(i + 1).trim(); }

// Dev only (node tools/serve.mjs 8081 --dev-frames): /__phone shows the app inside a 390px
// iframe so phone layouts can be checked on a desktop. Off by default; never part of a deployment.
const DEV_FRAMES = process.argv.includes('--dev-frames');
if (DEV_FRAMES) { SECURITY['X-Frame-Options'] = 'SAMEORIGIN'; SECURITY['Content-Security-Policy'] = SECURITY['Content-Security-Policy'].replace("frame-ancestors 'none'", "frame-ancestors 'self'"); }
const PHONE = '<!doctype html><meta charset="utf-8"><title>phone</title><body style="margin:0;background:#888;display:flex;gap:24px;justify-content:center;padding:12px"><iframe src="/" style="width:390px;height:760px;border:0;border-radius:18px;background:#fff"></iframe><iframe src="/" style="width:768px;height:760px;border:0;border-radius:12px;background:#fff"></iframe></body>';

createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    if (DEV_FRAMES && req.url.startsWith('/__phone')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(PHONE); return; }
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root) || file.split(sep).some((p) => p.startsWith('.') && p.length > 1) || /(^|[\\/])(tests|tools|node_modules)[\\/]/.test(file.slice(root.length))) { res.writeHead(404).end('Not found'); return; }
    const st = await stat(file);
    if (!st.isFile()) throw new Error('not a file');
    const body = await readFile(file);
    res.writeHead(200, { ...SECURITY, 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Plainpen: http://localhost:${port}/`));
