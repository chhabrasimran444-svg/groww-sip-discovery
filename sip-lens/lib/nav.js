// Real NAV history for the demo SIPs, fetched at runtime from mfapi.in (a free mirror of AMFI's
// daily NAV data) and cached while the function stays warm. Funds are shown by category only,
// so the demo never reads as a recommendation of a named scheme.
const MARKET_CODE = 120716; // a Nifty 50 index fund, used as the "whole market" yardstick

const DEMOS = {
  small: {
    code: 118778, label: 'Small Cap Fund', plan: 'Direct Growth', risk: 'Very High Risk', type: 'Equity', sub: 'Small Cap',
    category: 'smallcap', amount: 1000, prefer: 'red', skips: 0,
    bench: { q: 'Nifty Smallcap 250 Index Fund', must: /small\s*cap\s*250/i, name: 'small-cap index', hi: 'स्मॉल-कैप इंडेक्स' },
  },
  index: {
    code: 120716, label: 'Nifty 50 Index Fund', plan: 'Direct Growth', risk: 'Very High Risk', type: 'Equity', sub: 'Index · Large Cap',
    category: 'index', amount: 500, prefer: 'green', skips: 0, bench: null,
  },
  tech: {
    code: 120594, label: 'Technology Fund', plan: 'Direct Growth', risk: 'Very High Risk', type: 'Equity', sub: 'Sectoral · Technology',
    category: 'sectoral', amount: 2000, prefer: 'red', skips: 2,
    bench: { q: 'Nifty IT Index Fund', must: /nifty\s*it\b/i, name: 'IT index', hi: 'IT इंडेक्स' },
  },
  flexi: {
    search: { q: 'Parag Parikh Flexi Cap Fund', must: /flexi\s*cap/i }, label: 'Flexi Cap Fund', plan: 'Direct Growth', risk: 'Very High Risk', type: 'Equity', sub: 'Flexi Cap',
    category: 'flexicap', amount: 1500, prefer: 'any', skips: 0, status: 'cancelled', stopAfter: 4,
    bench: { q: 'Nifty 500 Index Fund', must: /nifty\s*500\s*index/i, not: /momentum|value|quality|equal|multicap|low vol|alpha/i, name: 'Nifty 500 index', hi: 'Nifty 500 इंडेक्स' },
  },
};
for (const k of Object.keys(DEMOS)) DEMOS[k].id = k;

const TTL = 6 * 3600 * 1000;
const navCache = new Map();   // code -> {at, navs}
const benchCache = new Map(); // demo id -> code | null

async function getJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!r.ok) throw { status: 502, code: 'nav_source', detail: `${url} -> ${r.status}` };
    return await r.json();
  } catch (e) {
    if (e && e.code) throw e;
    throw { status: 502, code: 'nav_source', detail: String(e && e.message || e) };
  } finally { clearTimeout(t); }
}

function parse(data) {
  return (data || [])
    .map((d) => { const [dd, mm, yy] = String(d.date).split('-'); return { date: `${yy}-${mm}-${dd}`, nav: Number(d.nav) }; })
    .filter((d) => d.nav > 0 && /^\d{4}-\d{2}-\d{2}$/.test(d.date))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function navs(code) {
  if (process.env.MOCK_NAV === '1') return mock(code);
  const hit = navCache.get(code);
  if (hit && Date.now() - hit.at < TTL) return hit.navs;
  const d = await getJson(`https://api.mfapi.in/mf/${code}`);
  const out = parse(d.data);
  if (out.length < 300) throw { status: 502, code: 'nav_source', detail: `too little history for ${code}` };
  navCache.set(code, { at: Date.now(), navs: out });
  return out;
}

function pickScheme(list, must, not) {
  const ok = (list || []).filter((x) => /direct/i.test(x.schemeName) && /growth/i.test(x.schemeName)
    && !/idcw|dividend|etf|fund of fund|fof|payout/i.test(x.schemeName) && must.test(x.schemeName) && !(not && not.test(x.schemeName)));
  return ok.length ? ok[0].schemeCode : null;
}
async function search(q) { return getJson(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`); }

async function fundCode(id) {
  const demo = DEMOS[id];
  if (demo.code) return demo.code;
  if (process.env.MOCK_NAV === '1') return 700000 + Object.keys(DEMOS).indexOf(id);
  if (demo.resolved) return demo.resolved;
  const code = pickScheme(await search(demo.search.q), demo.search.must);
  if (!code) throw { status: 502, code: 'nav_source', detail: 'scheme not found: ' + demo.search.q };
  demo.resolved = code;
  return code;
}

async function benchCode(id) {
  const demo = DEMOS[id];
  if (!demo.bench) return null;
  if (process.env.MOCK_NAV === '1') return 900000 + Object.keys(DEMOS).indexOf(id);
  if (benchCache.has(id)) return benchCache.get(id);
  let code = null;
  try { code = pickScheme(await search(demo.bench.q), demo.bench.must, demo.bench.not); } catch (e) { code = null; }
  benchCache.set(id, code);
  return code;
}

// Everything one demo SIP needs: its own NAVs, the market yardstick and, when found, its segment index.
async function bundle(id) {
  const demo = DEMOS[id];
  if (!demo) throw { status: 400, code: 'unknown_sip' };
  const [fcode, bcode] = await Promise.all([fundCode(id), benchCode(id)]);
  const [fund, market, bench] = await Promise.all([
    navs(fcode), navs(MARKET_CODE), bcode ? navs(bcode).catch(() => null) : Promise.resolve(null),
  ]);
  return { demo, fund, market, bench };
}

// ---- local testing only: a deterministic synthetic series (never used on Vercel) ----
function mock(code) {
  let seed = Number(code) % 2147483647 || 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out = []; let nav = 10 + (code % 50);
  const start = new Date(Date.UTC(2016, 0, 1)); const end = new Date(Date.UTC(2026, 10, 6));
  const vol = code === 120716 ? 0.009 : 0.014; const drift = 0.0005;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay(); if (wd === 0 || wd === 6) continue;
    const iso = d.toISOString().slice(0, 10);
    let shock = (rnd() - 0.5) * 2 * vol + drift;
    if (iso >= '2020-02-20' && iso <= '2020-03-23') shock -= 0.012;
    if (iso >= '2024-10-01' && iso <= '2025-03-01') shock -= code === 120716 ? 0.0012 : 0.0025;
    if (iso >= '2026-06-01' && iso <= '2026-10-15') shock -= code === 120716 ? 0.0006 : 0.0019;
    nav = Math.max(1, nav * (1 + shock));
    out.push({ date: iso, nav: Math.round(nav * 10000) / 10000 });
  }
  return out;
}

module.exports = { DEMOS, MARKET_CODE, bundle, navs };
