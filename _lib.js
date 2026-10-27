// Shared server code for the AI endpoints. The Gemini key lives only in the
// GEMINI_API_KEY environment variable (Vercel > Settings > Environment Variables).
const fs = require('fs');
const path = require('path');

const DATA = path.join(process.cwd(), 'data');
let cache = null;
function data() {
  if (!cache) {
    cache = {
      posts: JSON.parse(fs.readFileSync(path.join(DATA, 'posts.json'), 'utf8')),
      stats: fs.readFileSync(path.join(DATA, 'stats_brief.txt'), 'utf8'),
      codebook: JSON.parse(fs.readFileSync(path.join(DATA, 'codebook.json'), 'utf8')),
    };
  }
  return cache;
}

// Best-effort per-visitor limit so one person can't use up the shared free quota.
const hits = new Map();
const PER_MINUTE = Number(process.env.PER_VISITOR_PER_MINUTE || 6);
function allowed(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'anon').split(',')[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= PER_MINUTE) { hits.set(ip, recent); return false; }
  recent.push(now); hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}

const MODELS = [process.env.GEMINI_MODEL, 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'].filter(Boolean);

async function gemini(prompt, { json = false } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw { status: 503, code: 'no_key' };
  for (const model of [...new Set(MODELS)]) {
    const config = { temperature: 0.2, maxOutputTokens: 4096 };
    if (json) config.responseMimeType = 'application/json';
    if (model.startsWith('gemini-2.5')) config.thinkingConfig = { thinkingBudget: 0 };
    let r = await call(model, prompt, config, key);
    if (r.status === 400 && config.thinkingConfig) { delete config.thinkingConfig; r = await call(model, prompt, config, key); }
    if (r.status === 404) continue; // model name not available: try the next one
    if (r.status === 429) throw { status: 429, code: 'busy' };
    if (r.status === 400 || r.status === 403) {
      const t = await r.text();
      if (/API key/i.test(t)) throw { status: 503, code: 'no_key' };
      throw { status: 502, code: 'upstream_error' };
    }
    if (!r.ok) throw { status: 502, code: 'upstream_error' };
    const d = await r.json();
    const cand = (d.candidates || [])[0] || {};
    const text = ((cand.content || {}).parts || []).map((p) => p.text || '').join('');
    if (!text) throw { status: 502, code: (d.promptFeedback || {}).blockReason ? 'refused' : 'empty_completion' };
    return { text, model, truncated: cand.finishReason === 'MAX_TOKENS' };
  }
  throw { status: 502, code: 'upstream_error' };
}
function call(model, prompt, config, key) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: config }),
  });
}

async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return await new Promise((resolve) => {
    let s = ''; req.on('data', (c) => { s += c; if (s.length > 100000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (e) { resolve({}); } });
  });
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(obj));
}

function handler(fn) {
  return async (req, res) => {
    if (req.method !== 'POST') return send(res, 405, { code: 'method' });
    if (!allowed(req)) return send(res, 429, { code: 'busy' });
    try { send(res, 200, await fn(await body(req))); }
    catch (e) { send(res, (e && e.status) || 500, { code: (e && e.code) || 'upstream_error' }); }
  };
}

module.exports = { data, gemini, handler, send };
