// Gemini call with model fallback (same approach as the discovery engine). Key: GEMINI_API_KEY on Vercel.
const FIXED = [process.env.GEMINI_MODEL, 'gemini-flash-latest', 'gemini-flash-lite-latest'].filter(Boolean);
let picked = null;      // the model that last worked, reused while the function stays warm
let discovered = null;  // models found through the list endpoint
const GONE = /not found|not supported|no longer|deprecated|retired|unavailable|is not available|unknown model|does not exist/i;

function call(model, prompt, config, key) {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), Number(process.env.AI_CALL_TIMEOUT_MS || 22000));
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    signal: ctrl.signal,
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: config }),
  });
}
async function listFlashModels(key) {
  if (discovered) return discovered;
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
    if (!r.ok) return [];
    const d = await r.json();
    const ver = (n) => (n.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1] * 1;
    discovered = (d.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => String(m.name || '').replace(/^models\//, ''))
      .filter((n) => /flash/.test(n) && !/image|tts|audio|live|embed|omni|vision|robotics|computer|native|thinking-exp/.test(n))
      .sort((a, b) => (/preview|exp/.test(a) - /preview|exp/.test(b)) || (/lite/.test(a) - /lite/.test(b)) || ver(b) - ver(a));
    return discovered;
  } catch (e) { return []; }
}
async function tryModel(model, prompt, json, key) {
  const config = { temperature: 0.2, maxOutputTokens: 4096 };
  if (json) config.responseMimeType = 'application/json';
  if (/^gemini-2\.5/.test(model)) config.thinkingConfig = { thinkingBudget: 0 };
  let r = await call(model, prompt, config, key);
  if (r.status === 400 && config.thinkingConfig) { delete config.thinkingConfig; r = await call(model, prompt, config, key); }
  if (r.ok) {
    const d = await r.json();
    const cand = (d.candidates || [])[0] || {};
    const text = ((cand.content || {}).parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
    if (!text) throw { status: 502, code: (d.promptFeedback || {}).blockReason ? 'refused' : 'empty_completion' };
    return { text, model, truncated: cand.finishReason === 'MAX_TOKENS' };
  }
  const t = await r.text();
  let msg = ''; try { msg = (JSON.parse(t).error || {}).message || ''; } catch (e) { msg = t; }
  msg = String(msg).slice(0, 300);
  if (r.status === 404 || ((r.status === 400 || r.status === 403) && GONE.test(msg))) return { skip: true, detail: msg };
  if (r.status >= 500) return { skip: true, busy: true, detail: msg }; // overloaded: try the next model
  if (r.status === 429) throw { status: 429, code: 'busy', detail: msg };
  if ((r.status === 400 || r.status === 403) && /API key|permission|PERMISSION_DENIED/i.test(msg)) throw { status: 503, code: 'no_key', detail: msg };
  throw { status: 502, code: 'upstream_error', detail: `${model} ${r.status}: ${msg}` };
}
async function gemini(prompt, json) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw { status: 503, code: 'no_key' };
  const tried = new Set(); let last = ''; let sawBusy = false;
  const attempt = async (list) => {
    for (const model of list) {
      if (tried.has(model)) continue; tried.add(model);
      const out = await tryModel(model, prompt, json, key);
      if (!out.skip) { picked = model; return out; }
      last = `${model}: ${out.detail}`;
      if (out.busy) sawBusy = true;
      if (picked === model) picked = null;
    }
    return null;
  };
  const first = await attempt([picked, ...FIXED].filter(Boolean));
  if (first) return first;
  const found = await attempt((await listFlashModels(key)).slice(0, 6));
  if (found) return found;
  if (sawBusy) throw { status: 503, code: 'busy', detail: 'Gemini is overloaded right now. ' + last };
  throw { status: 502, code: 'upstream_error', detail: 'No Gemini model answered. ' + last };
}

module.exports = { gemini };
