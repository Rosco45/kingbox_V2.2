import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { Bonjour } from 'bonjour-service';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(ROOT, 'data');
mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(resolve(DATA_DIR, 'kingbox.sqlite'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT '👤',
    is_kids INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    media_id TEXT NOT NULL,
    media_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(profile_id, media_id)
  );
  CREATE TABLE IF NOT EXISTS watch_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    media_id TEXT NOT NULL,
    media_json TEXT NOT NULL,
    position REAL NOT NULL DEFAULT 0,
    duration REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(profile_id, media_id)
  );
  CREATE TABLE IF NOT EXISTS media_sources (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    media_id TEXT,
    title TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('movie','episode','adult','other')),
    format TEXT NOT NULL CHECK(format IN ('mp4','hls','iframe')),
    url TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'und',
    quality TEXT NOT NULL DEFAULT 'Auto',
    is_adult INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
if (!db.prepare('SELECT id FROM profiles LIMIT 1').get()) {
  db.prepare('INSERT INTO profiles (id,name,avatar) VALUES (?,?,?)').run('default', 'Principal', '👑');
}

const PORT = Number(process.env.KINGBOX_API_PORT || 3000);
const HOST = process.env.KINGBOX_API_HOST || '0.0.0.0';
const MAX_BODY = 1024 * 1024;

function send(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(payload));
}
function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_BODY) reject(new Error('Corps de requête trop volumineux'));
    });
    req.on('end', () => {
      if (!body) return resolveBody({});
      try { resolveBody(JSON.parse(body)); } catch { reject(new Error('JSON invalide')); }
    });
    req.on('error', reject);
  });
}
function cleanText(value, max = 180) {
  return String(value ?? '').trim().slice(0, max);
}
function validSourceUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}
function getProfiles() {
  return db.prepare('SELECT id,name,avatar,is_kids AS isKids,created_at AS createdAt FROM profiles ORDER BY created_at').all();
}
function getSources(profileId) {
  return db.prepare(`SELECT id,profile_id AS profileId,media_id AS mediaId,title,kind,format,url,language,quality,is_adult AS isAdult,notes,created_at AS createdAt FROM media_sources WHERE profile_id=? ORDER BY created_at DESC`).all(profileId);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname.replace(/\/$/, '') || '/';
  try {
    if (req.method === 'GET' && path === '/api/health') {
      return send(res, 200, { ok: true, app: 'Kingbox Local API', version: '2.2.0', database: 'SQLite', time: new Date().toISOString() });
    }
    if (req.method === 'GET' && path === '/api/profiles') return send(res, 200, { profiles: getProfiles() });
    if (req.method === 'POST' && path === '/api/profiles') {
      const body = await readBody(req);
      const name = cleanText(body.name, 32);
      if (!name) return send(res, 400, { error: 'Le nom du profil est obligatoire.' });
      const id = `p_${randomUUID()}`;
      db.prepare('INSERT INTO profiles(id,name,avatar,is_kids) VALUES(?,?,?,?)').run(id, name, cleanText(body.avatar || '👤', 8), body.isKids ? 1 : 0);
      return send(res, 201, { profile: getProfiles().find(p => p.id === id) });
    }
    const profileMatch = path.match(/^\/api\/profiles\/([^/]+)$/);
    if (profileMatch && req.method === 'PATCH') {
      const body = await readBody(req);
      const id = decodeURIComponent(profileMatch[1]);
      if (!db.prepare('SELECT id FROM profiles WHERE id=?').get(id)) return send(res, 404, { error: 'Profil introuvable.' });
      if (body.name !== undefined) {
        const name = cleanText(body.name, 32);
        if (!name) return send(res, 400, { error: 'Nom invalide.' });
        db.prepare('UPDATE profiles SET name=? WHERE id=?').run(name, id);
      }
      if (body.avatar !== undefined) db.prepare('UPDATE profiles SET avatar=? WHERE id=?').run(cleanText(body.avatar, 8), id);
      if (body.isKids !== undefined) db.prepare('UPDATE profiles SET is_kids=? WHERE id=?').run(body.isKids ? 1 : 0, id);
      return send(res, 200, { profile: getProfiles().find(p => p.id === id) });
    }
    if (profileMatch && req.method === 'DELETE') {
      const id = decodeURIComponent(profileMatch[1]);
      if (getProfiles().length <= 1) return send(res, 409, { error: 'Le dernier profil ne peut pas être supprimé.' });
      const result = db.prepare('DELETE FROM profiles WHERE id=?').run(id);
      return send(res, result.changes ? 200 : 404, { deleted: Boolean(result.changes) });
    }
    const favMatch = path.match(/^\/api\/profiles\/([^/]+)\/favorites$/);
    if (favMatch && req.method === 'GET') {
      const profileId = decodeURIComponent(favMatch[1]);
      const rows = db.prepare('SELECT media_json AS media FROM favorites WHERE profile_id=? ORDER BY created_at DESC').all(profileId);
      return send(res, 200, { favorites: rows.map(r => JSON.parse(r.media)) });
    }
    if (favMatch && req.method === 'POST') {
      const profileId = decodeURIComponent(favMatch[1]); const body = await readBody(req);
      if (!body.media?.id) return send(res, 400, { error: 'Média invalide.' });
      db.prepare('INSERT INTO favorites(profile_id,media_id,media_json) VALUES(?,?,?) ON CONFLICT(profile_id,media_id) DO NOTHING').run(profileId, String(body.media.id), JSON.stringify(body.media));
      return send(res, 201, { ok: true });
    }
    if (favMatch && req.method === 'DELETE') {
      const profileId = decodeURIComponent(favMatch[1]); const mediaId = url.searchParams.get('mediaId');
      db.prepare('DELETE FROM favorites WHERE profile_id=? AND media_id=?').run(profileId, mediaId || '');
      return send(res, 200, { ok: true });
    }
    const sourcesMatch = path.match(/^\/api\/profiles\/([^/]+)\/sources$/);
    if (sourcesMatch && req.method === 'GET') {
      const profileId = decodeURIComponent(sourcesMatch[1]);
      const mediaId = url.searchParams.get('mediaId');
      const list = getSources(profileId);
      return send(res, 200, { sources: mediaId ? list.filter(source => source.mediaId === mediaId) : list });
    }
    if (sourcesMatch && req.method === 'POST') {
      const profileId = decodeURIComponent(sourcesMatch[1]); const body = await readBody(req);
      if (!db.prepare('SELECT id FROM profiles WHERE id=?').get(profileId)) return send(res, 404, { error: 'Profil introuvable.' });
      const title = cleanText(body.title, 160); const sourceUrl = cleanText(body.url, 2048);
      if (!title || !validSourceUrl(sourceUrl)) return send(res, 400, { error: 'Titre ou URL HTTP(S) invalide.' });
      const kind = ['movie','episode','adult','other'].includes(body.kind) ? body.kind : 'other';
      const format = ['mp4','hls','iframe'].includes(body.format) ? body.format : 'mp4';
      const id = `s_${randomUUID()}`;
      db.prepare(`INSERT INTO media_sources(id,profile_id,media_id,title,kind,format,url,language,quality,is_adult,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id, profileId, cleanText(body.mediaId, 120), title, kind, format, sourceUrl, cleanText(body.language || 'und', 12), cleanText(body.quality || 'Auto', 24), body.isAdult ? 1 : 0, cleanText(body.notes, 500));
      return send(res, 201, { source: getSources(profileId).find(s => s.id === id) });
    }
    const sourceMatch = path.match(/^\/api\/sources\/([^/]+)$/);
    if (sourceMatch && req.method === 'DELETE') {
      const result = db.prepare('DELETE FROM media_sources WHERE id=?').run(decodeURIComponent(sourceMatch[1]));
      return send(res, result.changes ? 200 : 404, { deleted: Boolean(result.changes) });
    }
    const progressMatch = path.match(/^\/api\/profiles\/([^/]+)\/progress$/);
    if (progressMatch && req.method === 'GET') {
      const rows = db.prepare(`SELECT media_id AS progressKey,media_json AS media,position,duration,updated_at AS updatedAt FROM watch_progress WHERE profile_id=? ORDER BY updated_at DESC LIMIT 100`).all(decodeURIComponent(progressMatch[1]));
      return send(res, 200, { progress: rows.map(r => ({ ...JSON.parse(r.media), progressKey: r.progressKey, position: r.position, duration: r.duration, updatedAt: r.updatedAt })) });
    }
    if (progressMatch && req.method === 'POST') {
      const profileId = decodeURIComponent(progressMatch[1]); const body = await readBody(req);
      if (!body.media?.id) return send(res, 400, { error: 'Média invalide.' });
      const progressKey = cleanText(body.progressKey || body.media.id, 180);
      db.prepare(`INSERT INTO watch_progress(profile_id,media_id,media_json,position,duration) VALUES(?,?,?,?,?) ON CONFLICT(profile_id,media_id) DO UPDATE SET media_json=excluded.media_json,position=excluded.position,duration=excluded.duration,updated_at=CURRENT_TIMESTAMP`).run(profileId, progressKey, JSON.stringify(body.media), Math.max(0, Number(body.position) || 0), Math.max(0, Number(body.duration) || 0));
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'Route API inconnue.' });
  } catch (error) {
    console.error('[Kingbox API]', error);
    return send(res, 500, { error: 'Erreur interne du serveur.' });
  }
});

server.listen(PORT, HOST, () => {
  const addresses = Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);
  console.log(`\n👑 Kingbox Local API démarrée`);
  console.log(`   PC : http://localhost:${PORT}/api/health`);
  addresses.forEach(ip => console.log(`   Réseau : http://${ip}:${PORT}/api/health`));
  console.log(`   Base SQLite : ${resolve(DATA_DIR, 'kingbox.sqlite')}\n`);

  // Découverte réseau locale (mDNS / Zeroconf / Bonjour)
  try {
    const bonjour = new Bonjour();
    bonjour.publish({
      name: `Kingbox Server (${os.hostname()})`,
      type: 'kingbox',
      port: PORT,
      txt: { version: '2.2.0', app: 'kingbox' }
    });
    console.log(`   📡 Annonce mDNS active : service "_kingbox._tcp.local" sur le port ${PORT}`);
  } catch (err) {
    console.warn(`   ⚠️ Annonce mDNS non disponible :`, err?.message || err);
  }
});
