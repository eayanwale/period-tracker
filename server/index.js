// Plain HTTP server replacing the old Lambda+API Gateway+DynamoDB stack --
// same three routes, same shared-passcode auth, same request/response
// shapes the frontend already expects (see ../frontend/js/api.js), just
// backed by a local SQLite file instead of DynamoDB, and serving the
// frontend's static files itself instead of S3+CloudFront. One container,
// one process, no AWS dependency left.
//
// Routes (same contract as the old backend/lambda/index.mjs):
//   GET    /logs        -> { dates: [...] }
//   POST   /logs         { date: 'YYYY-MM-DD' } -> { ok: true, date }
//   DELETE /logs/{date}  -> { ok: true, date }
//
// Auth: the same 'x-passcode' header, checked against the PASSCODE env var.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 3000);
const PASSCODE = process.env.PASSCODE;
const DB_PATH = process.env.DB_PATH || '/data/period-tracker.db';
const SEED_PATH = process.env.SEED_PATH || '/data/seed.json';
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, 'public');

if (!PASSCODE) {
  console.error('PASSCODE env var is required -- refusing to start with no auth at all.');
  process.exit(1);
}

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS logs (
    date TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  )
`);

// One-time import from a DynamoDB export (see ../scripts/export-dynamodb-data.mjs)
// -- only runs when the table is still empty, so it's a no-op on every
// restart after the first, and never overwrites dates logged since.
function maybeImportSeed() {
  const existingCount = db.prepare('SELECT COUNT(*) AS n FROM logs').get().n;
  if (existingCount > 0) return;
  if (!fs.existsSync(SEED_PATH)) return;
  let entries;
  try {
    entries = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  } catch (err) {
    console.error(`seed file at ${SEED_PATH} is not valid JSON, skipping import:`, err.message);
    return;
  }
  const insert = db.prepare('INSERT OR IGNORE INTO logs (date, created_at) VALUES (?, ?)');
  const importAll = db.transaction((rows) => {
    for (const row of rows) insert.run(row.date, row.createdAt || new Date().toISOString());
  });
  importAll(entries);
  console.log(`imported ${entries.length} date(s) from ${SEED_PATH}`);
}
maybeImportSeed();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

function sendJson(res, statusCode, body) {
  const data = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function handleApi(req, res, url) {
  const passcode = req.headers['x-passcode'];
  if (!passcode || passcode !== PASSCODE) {
    sendJson(res, 401, { error: 'Invalid or missing passcode' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/logs') {
    const rows = db.prepare('SELECT date FROM logs ORDER BY date').all();
    sendJson(res, 200, { dates: rows.map((r) => r.date) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/logs') {
    let body;
    try {
      body = JSON.parse((await readBody(req)) || '{}');
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body' });
      return;
    }
    const { date } = body;
    if (!date || !DATE_RE.test(date)) {
      sendJson(res, 400, { error: "Expected body { date: 'YYYY-MM-DD' }" });
      return;
    }
    db.prepare('INSERT OR REPLACE INTO logs (date, created_at) VALUES (?, ?)').run(date, new Date().toISOString());
    sendJson(res, 201, { ok: true, date });
    return;
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/logs/')) {
    const date = decodeURIComponent(url.pathname.slice('/logs/'.length));
    if (!DATE_RE.test(date)) {
      sendJson(res, 400, { error: 'Invalid date in path' });
      return;
    }
    db.prepare('DELETE FROM logs WHERE date = ?').run(date);
    sendJson(res, 200, { ok: true, date });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, url) {
  let filePath = path.join(STATIC_DIR, decodeURIComponent(url.pathname));
  if (url.pathname === '/' || url.pathname === '') {
    filePath = path.join(STATIC_DIR, 'index.html');
  }
  // Never serve anything outside STATIC_DIR, regardless of what the
  // request path looks like.
  if (!filePath.startsWith(STATIC_DIR)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/logs' || url.pathname.startsWith('/logs/')) {
    handleApi(req, res, url).catch((err) => {
      console.error(err);
      sendJson(res, 500, { error: 'Internal error' });
    });
    return;
  }
  if (url.pathname === '/healthz') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }
  serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`period-tracker server listening on :${PORT}, db at ${DB_PATH}`);
});
