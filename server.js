const http = require('http');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const PORT = Number(process.env.PORT || 3000);
const root = path.join(__dirname, 'public');
const fallbackSettings = new Map();
const fallbackArrowSettings = new Map();
let pool = null;

async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL is not available; using process memory for local preview.');
    return;
  }
  pool = mysql.createPool(process.env.DATABASE_URL);
  await pool.query(`CREATE TABLE IF NOT EXISTS roulette_arrow_settings (
    option_count INT PRIMARY KEY,
    settings_json TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS roulette_settings (
    option_count INT PRIMARY KEY,
    result_index INT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
}

async function readSettings() {
  if (!pool) return Object.fromEntries(fallbackSettings);
  const [rows] = await pool.query('SELECT option_count, result_index FROM roulette_settings ORDER BY option_count');
  return Object.fromEntries(rows.map((row) => [String(row.option_count), row.result_index]));
}

async function writeSettings(settings) {
  const entries = Object.entries(settings || {});
  for (const [key, value] of entries) {
    const count = Number(key);
    const result = Number(value);
    if (!Number.isInteger(count) || count < 2 || count > 8 || !Number.isInteger(result) || result < 0 || result >= count) {
      throw new Error('invalid settings');
    }
  }
  if (!pool) {
    fallbackSettings.clear();
    entries.forEach(([key, value]) => fallbackSettings.set(key, Number(value)));
    return;
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM roulette_settings');
    for (const [key, value] of entries) {
      await connection.query('INSERT INTO roulette_settings (option_count, result_index) VALUES (?, ?)', [Number(key), Number(value)]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}


async function readArrowSettings() {
  if (!pool) return Object.fromEntries(fallbackArrowSettings);
  const [rows] = await pool.query('SELECT option_count, settings_json FROM roulette_arrow_settings ORDER BY option_count');
  return Object.fromEntries(rows.map((row) => [String(row.option_count), JSON.parse(row.settings_json)]));
}

async function writeArrowSettings(settings) {
  const entries = Object.entries(settings || {});
  for (const [key, value] of entries) {
    const count = Number(key);
    if (!Number.isInteger(count) || count < 2 || count > 8 || !value || !value.left || !value.right) throw new Error('invalid arrow settings');
    for (const side of ['left', 'right']) {
      if (!Number.isFinite(Number(value[side].x)) || !Number.isFinite(Number(value[side].y))) throw new Error('invalid arrow settings');
    }
  }
  if (!pool) {
    fallbackArrowSettings.clear();
    entries.forEach(([key, value]) => fallbackArrowSettings.set(key, value));
    return;
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM roulette_arrow_settings');
    for (const [key, value] of entries) await connection.query('INSERT INTO roulette_arrow_settings (option_count, settings_json) VALUES (?, ?)', [Number(key), JSON.stringify(value)]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; if (data.length > 100000) reject(new Error('payload too large')); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function servePage(res, file) {
  fs.readFile(path.join(root, file), (error, data) => {
    if (error) return res.writeHead(404).end('Not found');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/api/settings' && req.method === 'GET') return json(res, 200, await readSettings());
    if (url.pathname === '/api/arrow-settings' && req.method === 'GET') return json(res, 200, await readArrowSettings());
    if (url.pathname === '/api/arrow-settings' && req.method === 'PUT') {
      const body = JSON.parse(await readBody(req) || '{}');
      await writeArrowSettings(body);
      return json(res, 200, { ok: true, settings: await readArrowSettings() });
    }
    if (url.pathname === '/api/arrow-settings' && req.method === 'DELETE') {
      await writeArrowSettings({});
      return json(res, 200, { ok: true, settings: {} });
    }
    if (url.pathname === '/api/settings' && req.method === 'PUT') {
      const body = JSON.parse(await readBody(req) || '{}');
      await writeSettings(body);
      return json(res, 200, { ok: true, settings: await readSettings() });
    }
    if (url.pathname === '/api/settings' && req.method === 'DELETE') {
      await writeSettings({});
      return json(res, 200, { ok: true, settings: {} });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
    if (url.pathname === '/' || url.pathname === '/index.html') return servePage(res, 'index.html');
    if (url.pathname === '/admin' || url.pathname === '/admin.html') return servePage(res, 'admin.html');
    const safePath = path.normalize(url.pathname).replace(/^[/\\]+/, '');
    if (safePath.includes('..')) return res.writeHead(400).end();
    const file = path.join(root, safePath);
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) return res.writeHead(404).end('Not found');
      fs.createReadStream(file).pipe(res);
    });
  } catch (error) {
    console.error(error);
    json(res, 400, { error: '요청을 처리하지 못했습니다.' });
  }
});

initDatabase().then(() => server.listen(PORT, '0.0.0.0', () => console.log(`roulettehub listening on ${PORT}`))).catch((error) => {
  console.error('database initialization failed', error);
  process.exit(1);
});
