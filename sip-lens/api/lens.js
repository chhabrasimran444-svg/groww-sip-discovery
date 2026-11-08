// SIP Lens: the one server function.
//   GET /api/lens?op=health                         -> {ai}
//   GET /api/lens?op=diag                           -> one tiny AI call: {ok, model} | {ok:false, code}
//   GET /api/lens?op=all                            -> the three demo SIPs for the dashboard
//   GET /api/lens?op=sip&id=small&start=YYYY-MM&skips=0       -> facts + chart series (no AI)
//   GET /api/lens?op=lens&id=small&start=YYYY-MM&skips=0&lang=en -> facts + AI-written cards + checks
// NAVs come from mfapi.in at request time; the Gemini key lives only in GEMINI_API_KEY.
const { DEMOS, bundle } = require('../lib/nav');
const F = require('../lib/facts');
const { write, templates } = require('../lib/cards');
const { gemini } = require('../lib/gemini');

const hits = new Map();
function allowed(req, perMin) {
  const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'anon').split(',')[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= perMin) { hits.set(ip, recent); return false; }
  recent.push(now); hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}

const aiCache = new Map();

function args(q, b) {
  const id = String(q.id || 'small');
  if (!DEMOS[id]) throw { status: 400, code: 'unknown_sip' };
  const opts = F.startOptions(b.fund, b.demo.amount, b.demo.prefer, b.demo.status === 'cancelled' ? b.demo.stopAfter : 0);
  let start = String(q.start || '');
  if (!opts.options.some((o) => o.start === start)) start = opts.defaultStart;
  const raw = q.skips === undefined || q.skips === '' ? b.demo.skips : Number(q.skips);
  const skips = b.demo.status === 'cancelled' ? 0 : Math.max(0, Math.min(2, raw || 0));
  const lang = q.lang === 'hi' ? 'hi' : 'en';
  return { id, start, skips, lang, opts };
}

async function handler(req, res) {
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const op = String(q.op || 'health');
  res.setHeader('content-type', 'application/json; charset=utf-8');
  try {
    if (op === 'health') return send(res, 200, { ai: !!process.env.GEMINI_API_KEY });
    if (op === 'diag') {
      try { const out = await gemini('Reply with the single word: ok', false); return send(res, 200, { ok: true, model: out.model }); }
      catch (e) { return send(res, 200, { ok: false, code: e.code || 'error', detail: e.detail }); }
    }
    if (op === 'all') {
      const list = [];
      for (const id of Object.keys(DEMOS)) {
        const b = await bundle(id);
        const { start, skips } = args({ id }, b);
        const f = F.build(b, { start, skips });
        list.push({ id, label: f.label, sub: b.demo.sub, risk: b.demo.risk, type: b.demo.type, amount: f.amount, start, startName: f.startName,
          status: f.status, skips, stoppedName: f.stopped ? f.stopped.stoppedName : null,
          invested: f.sip.invested, value: f.sip.value, gain: f.sip.gain, gainPct: f.sip.gainPct, xirr: f.sip.xirr, red: f.sip.red,
          day1: oneDay(b.fund), asOf: f.asOf });
      }
      res.setHeader('cache-control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      return send(res, 200, { sips: list });
    }
    if (op === 'sip' || op === 'lens') {
      const id = String(q.id || 'small');
      if (!DEMOS[id]) throw { status: 400, code: 'unknown_sip' };
      const b = await bundle(id);
      const a = args(q, b);
      const facts = F.build(b, { start: a.start, skips: a.skips });
      const meta = { id, sub: b.demo.sub, risk: b.demo.risk, type: b.demo.type, plan: b.demo.plan, startOptions: a.opts.options, start: a.start, skips: a.skips,
        source: 'Real daily NAVs of one fund in this category (AMFI data via mfapi.in). Fund name hidden so the demo never reads as a recommendation.' };
      if (op === 'sip') {
        res.setHeader('cache-control', 'public, s-maxage=3600, stale-while-revalidate=86400');
        return send(res, 200, { meta, facts, series: F.series(b.fund), day1: oneDay(b.fund), cards: { en: templates(facts, 'en'), hi: templates(facts, 'hi') } });
      }
      const key = `${id}|${a.start}|${a.skips}|${a.lang}|${facts.asOf}`;
      if (aiCache.has(key)) return send(res, 200, { meta, facts, ...aiCache.get(key), cached: true });
      if (!allowed(req, Number(process.env.PER_VISITOR_PER_MINUTE || 8))) {
        return send(res, 200, { meta, facts, cards: templates(facts, a.lang), report: { source: 'template', error: 'rate_limited', replaced: [] } });
      }
      const out = await write(facts, a.lang);
      if (out.report.source === 'ai') aiCache.set(key, out);
      if (aiCache.size > 500) aiCache.clear();
      return send(res, 200, { meta, facts, ...out });
    }
    throw { status: 400, code: 'unknown_op' };
  } catch (e) {
    const status = (e && e.status) || 500;
    return send(res, status, { error: (e && e.code) || 'server_error', detail: e && (e.detail || e.message) });
  }
}

function oneDay(navs) {
  const n = navs.length; const a = navs[n - 2].nav, b = navs[n - 1].nav;
  return Math.round((b / a - 1) * 10000) / 100;
}
function send(res, status, body) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

module.exports = handler;
