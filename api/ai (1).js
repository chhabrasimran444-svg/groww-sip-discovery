// Groww SIP Discovery Engine: the one server function.
//   GET  /api/ai?op=health   -> {ai: true|false}
//   POST /api/ai?op=ask      {question, refs[], history[]} -> {text, truncated}
//   POST /api/ai?op=analyze  {posts[], source}            -> {labels[]}
// The Gemini key lives only in the GEMINI_API_KEY environment variable on Vercel.
// Prompts are built here from fixed text and the stored data, so the endpoint
// can only answer about this dataset.
const fs = require('fs');
const path = require('path');

let cache = null;
function data() {
  if (!cache) {
    const read = (f) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');
    cache = { posts: JSON.parse(read('posts.json')), stats: read('stats_brief.txt'), codebook: JSON.parse(read('codebook.json')) };
  }
  return cache;
}

const hits = new Map();
const PER_MINUTE = Number(process.env.PER_VISITOR_PER_MINUTE || 6);
function allowed(req) {
  const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'anon').split(',')[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= PER_MINUTE) { hits.set(ip, recent); return false; }
  recent.push(now); hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}

const MODELS = [process.env.GEMINI_MODEL, 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'].filter(Boolean);
function call(model, prompt, config, key) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: config }),
  });
}
async function gemini(prompt, json) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw { status: 503, code: 'no_key' };
  for (const model of [...new Set(MODELS)]) {
    const config = { temperature: 0.2, maxOutputTokens: 4096 };
    if (json) config.responseMimeType = 'application/json';
    if (model.startsWith('gemini-2.5')) config.thinkingConfig = { thinkingBudget: 0 };
    let r = await call(model, prompt, config, key);
    if (r.status === 400 && config.thinkingConfig) { delete config.thinkingConfig; r = await call(model, prompt, config, key); }
    if (r.status === 404) continue;
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

async function ask(b) {
  const question = String(b.question || '').trim();
  if (!question) throw { status: 400, code: 'invalid_request' };
  if (question.length > 600) throw { status: 400, code: 'too_long' };
  const { posts, stats } = data();
  const refs = (Array.isArray(b.refs) ? b.refs : []).map(String).filter((r) => posts[r]).slice(0, 30);
  const history = (Array.isArray(b.history) ? b.history : []).slice(-2)
    .map((t) => `Q: ${String(t.q || '').slice(0, 300)}\nA: ${String(t.a || '').slice(0, 700)}`).join('\n\n');
  const postLines = refs.map((ref) => {
    const r = posts[ref];
    return `[${ref}] ${r.source} | theme: ${r.theme} | did: ${r.action} | stage: ${r.stage} | first-timer: ${r.first_timer} | quote: "${r.quote}" | text: ${r.text}`;
  }).join('\n');
  const prompt = `You are the analyst behind a discovery engine about why first-time mutual fund investors in India stop, pause or keep their SIPs. It supports a product case study for Groww's growth team. The metric: the share of first-time investors with an active SIP (at least one successful instalment in the last 30 days) 12 months after their first SIP.

Rules:
- Answer ONLY from STATS and POSTS below. If they don't support an answer, say "The collected posts don't show this" and name the data that would (for example interviews or Groww's own data).
- Cite posts as [k123] right after the claim they support. Use only refs listed in POSTS. Cite at least two when you make a claim about patterns.
- Use numbers from STATS as given. Counts from POSTS are only the posts retrieved for this question, not the whole dataset: don't present them as totals.
- Never recommend funds, stocks, or whether to buy, sell, start or stop. No fear, FOMO or urgency. If asked for investment advice, say in one sentence that the engine doesn't give it, then answer what the posts show about the need behind the question.
- Say when the evidence is thin (fewer than 5 relevant posts) or mostly not about Groww.
- Format: one plain sentence that answers, then 3 to 6 short "- " bullets, then a last line "Confidence: high / medium / low, because ...". Under 230 words. No headings, no bold, no markdown other than the bullets.

STATS (whole dataset):
${stats}

POSTS (retrieved for this question, ${refs.length}):
${postLines || '(none matched)'}
${history ? '\nEARLIER IN THIS CONVERSATION:\n' + history + '\n' : ''}
QUESTION: ${question}`;
  const { text, truncated, model } = await gemini(prompt, false);
  return { text, truncated, model };
}

const SOURCES = ['Play Store review', 'App Store review', 'Reddit', 'YouTube comment', 'Forum post', 'Social media', 'Other'];
async function analyze(b) {
  const posts = (Array.isArray(b.posts) ? b.posts : []).map((p) => String(p || '').trim()).filter(Boolean).slice(0, 8);
  if (!posts.length) throw { status: 400, code: 'invalid_request' };
  if (posts.some((p) => p.length > 3000)) throw { status: 400, code: 'too_long' };
  const source = SOURCES.includes(b.source) ? b.source : 'Other';
  const cb = data().codebook;
  const themes = cb.themes.map((t) => `${t.id}: ${t.name}. ${t.definition} [leak: ${t.metric_leak}]`).join('\n');
  const fields = Object.entries(cb.fields).map(([k, v]) => `${k}: ${v.join(' | ')}`).join('\n');
  const prompt = `Label each post below with the SIP-retention codebook. The study is about first-time mutual fund investors in India and whether their SIP stays active 12 months after they start.

THEMES (use the id):
${themes}

ALLOWED VALUES:
${fields}
first_time_investor: yes | likely | no | unclear
severity: 0 (none) to 3 (stopped or about to)

RULES:
- ${cb.rules.join('\n- ')}

Relevant = the post describes the writer's (or a named person's) own SIP situation, decision, question or experience. Generic advice to others, news and polls are not relevant.

Reply with only a JSON array, one object per post, in the same order:
[{"relevant": true, "primary_theme": "<theme id>", "secondary_themes": ["<id>"], "journey_stage": "...", "sip_action": "...", "drop_mechanism": "...", "trigger": "...", "first_time_investor": "...", "severity": 0, "emotion": "...", "app_area": "...", "evidence_quote": "<exact words copied from the post, 4-15 words, any language as written>", "unmet_need": "<what they need, short, or empty>", "why": "<one sentence on the label>"}]
For a post that is not relevant, return {"relevant": false, "why": "..."}.

Source of every post: ${source}
${posts.map((p, i) => `POST ${i + 1}:\n"""\n${p}\n"""`).join('\n\n')}`;
  const { text, model } = await gemini(prompt, true);
  let labels = null;
  try { labels = JSON.parse(text); } catch (e) {
    const m = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    try { labels = m ? JSON.parse(m[0]) : null; } catch (e2) { labels = null; }
  }
  if (!labels) throw { status: 502, code: 'invalid_json' };
  return { labels: Array.isArray(labels) ? labels : [labels], model };
}

async function readBody(req) {
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

module.exports = async (req, res) => {
  const op = String((req.query && req.query.op) || new URL(req.url, 'http://x').searchParams.get('op') || '');
  if (op === 'health') return send(res, 200, { ai: Boolean(process.env.GEMINI_API_KEY) });
  if (req.method !== 'POST') return send(res, 405, { code: 'method' });
  if (op !== 'ask' && op !== 'analyze') return send(res, 404, { code: 'unknown_op' });
  if (!allowed(req)) return send(res, 429, { code: 'busy' });
  try { send(res, 200, op === 'ask' ? await ask(await readBody(req)) : await analyze(await readBody(req))); }
  catch (e) { send(res, (e && e.status) || 500, { code: (e && e.code) || 'upstream_error' }); }
};
