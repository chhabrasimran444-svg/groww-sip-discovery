// Pure number work for SIP Lens. Every figure the AI is allowed to mention is computed here
// from the NAV record, so the words can be checked against these numbers afterwards.
const DAY = 86400000;
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const iso = (d) => d.toISOString().slice(0, 10);
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const dateName = (d) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

function firstOnOrAfter(navs, date) {
  let lo = 0, hi = navs.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (navs[m].date >= date) { ans = m; hi = m - 1; } else lo = m + 1; }
  return ans;
}
function lastOnOrBefore(navs, date) {
  let lo = 0, hi = navs.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (navs[m].date <= date) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}
function addMonths(ym, n) {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1 + n;
  const d = new Date(Date.UTC(y, m, 1));
  return iso(d).slice(0, 7);
}
function change(navs, fromDate, toDate) {
  if (!navs) return null;
  const a = firstOnOrAfter(navs, fromDate), b = lastOnOrBefore(navs, toDate);
  if (a < 0 || b < 0 || b <= a) return null;
  return r1((navs[b].nav / navs[a].nav - 1) * 100);
}

function xirr(flows) { // flows: [{date, amt}] negative = paid in
  if (flows.length < 2) return null;
  const t0 = Date.parse(flows[0].date);
  const f = (r) => flows.reduce((s, c) => s + c.amt / Math.pow(1 + r, (Date.parse(c.date) - t0) / (365 * DAY)), 0);
  const df = (r) => flows.reduce((s, c) => { const t = (Date.parse(c.date) - t0) / (365 * DAY); return s - t * c.amt / Math.pow(1 + r, t + 1); }, 0);
  let r = 0.1;
  for (let i = 0; i < 60; i++) {
    const v = f(r), d = df(r);
    if (!isFinite(v) || !isFinite(d) || d === 0) break;
    const nr = r - v / d;
    if (!isFinite(nr) || nr <= -0.99) { r = -0.9; break; }
    if (Math.abs(nr - r) < 1e-7) { r = nr; break; }
    r = nr;
  }
  return isFinite(r) ? r1(r * 100) : null;
}

// Simulate a monthly SIP on day `day` from month `start`, up to `until` (default: last NAV).
function simulate(navs, { amount, day = 5, start, skips = 0, until, stopAfter = 0 }) {
  const last = until ? lastOnOrBefore(navs, until) : navs.length - 1;
  const lastDate = navs[last].date;
  const rows = [];
  for (let ym = start; ; ym = addMonths(ym, 1)) {
    const due = `${ym}-${String(day).padStart(2, '0')}`;
    if (due > lastDate) break;
    const i = firstOnOrAfter(navs, due);
    if (i < 0 || i > last) break;
    rows.push({ month: ym, date: navs[i].date, nav: navs[i].nav, amount });
    if (stopAfter && rows.length >= stopAfter) break; // cancelled SIP: no instalments after this
  }
  // the most recent `skips` instalments are marked as skipped (demo of a pause that drifts)
  rows.forEach((r, k) => { r.skipped = k >= rows.length - skips; });
  let units = 0, invested = 0, redPaid = 0, extra = 0;
  const nav0 = rows.length ? rows[0].nav : 0;
  for (const r of rows) {
    const wasRed = invested > 0 && units * r.nav < invested;
    if (r.skipped) { r.units = 0; r.redBefore = wasRed; continue; }
    r.units = r3(amount / r.nav);
    r.redBefore = wasRed;
    if (wasRed) redPaid++;
    if (r.nav < nav0) extra += amount / r.nav - amount / nav0;
    units += amount / r.nav; invested += amount;
  }
  const nav = navs[last].nav;
  const value = units * nav;
  const flows = rows.filter((r) => !r.skipped).map((r) => ({ date: r.date, amt: -amount }));
  flows.push({ date: lastDate, amt: value });
  return {
    rows, asOf: lastDate, nav, units: r3(units), invested, value: Math.round(value), gain: Math.round(value - invested),
    gainPct: invested ? r2((value / invested - 1) * 100) : 0, avgNav: units ? r2(invested / units) : 0,
    extraUnits: r2(extra), redPaid, paid: rows.filter((r) => !r.skipped).length, due: rows.length,
    xirr: invested ? xirr(flows) : null,
  };
}

// Past falls of at least `min`% from a high, with how long the fund took to get back to that high
// and how a SIP started at the high looked 12 months later. History only.
function pastDips(navs, amount, min = 10) {
  const eps = []; let peak = navs[0], trough = navs[0], inDip = false;
  for (const p of navs) {
    if (p.nav >= peak.nav) {
      if (inDip) { eps.push({ peak, trough, back: p }); inDip = false; }
      peak = p; trough = p; continue;
    }
    if (p.nav < trough.nav) trough = p;
    if (!inDip && (1 - p.nav / peak.nav) * 100 >= min) inDip = true;
  }
  const current = inDip ? { peak, trough } : null;
  const done = eps.slice(-3).reverse().map((e) => {
    const ym = e.peak.date.slice(0, 7);
    const after12 = addMonths(ym, 12) + '-28';
    let sip12 = null;
    if (after12 <= navs[navs.length - 1].date) {
      const s = simulate(navs, { amount, start: addMonths(ym, 1), until: after12 });
      sip12 = s.gainPct;
    }
    return {
      from: monthName(ym), fell: r1((1 - e.trough.nav / e.peak.nav) * 100),
      monthsToHigh: Math.max(1, Math.round(days(e.peak.date, e.back.date) / 30.4)),
      sipAfter12: sip12,
    };
  });
  return {
    min, episodes: done,
    current: current ? { from: monthName(current.peak.date.slice(0, 7)), fellSoFar: r1((1 - navs[navs.length - 1].nav / current.peak.nav) * 100) } : null,
  };
}

const PURPOSE = {
  smallcap: {
    rule: 'keeps at least 65% in small companies (ranked 251st and below by size, as SEBI defines)',
    swing: 'Smaller companies can grow faster than large ones, and their prices swing more on the way.',
  },
  sectoral: {
    rule: 'keeps at least 80% in one sector, here technology (SEBI rule for sectoral funds)',
    swing: 'Its value follows that one sector, so it can move quite differently from the overall market.',
  },
  flexicap: {
    rule: 'keeps at least 65% in shares and can pick companies of any size, large, mid or small (SEBI rule for flexi cap funds)',
    swing: 'The fund manager can change that mix as markets change.',
  },
  index: {
    rule: 'copies the Nifty 50, India’s 50 largest listed companies',
    swing: 'It moves with the overall market rather than a fund manager’s picks.',
  },
};

function attribution(f, m, b) {
  if (f == null || m == null) return 'market';
  const near = (x, y) => Math.abs(x - y) <= Math.max(2, 0.25 * Math.abs(y));
  const same = (x, y) => (x < 0) === (y < 0);
  if (b != null && same(f, b) && Math.abs(b) >= 0.7 * Math.abs(f) && !near(f, m)) return 'segment';
  if (near(f, m)) return 'market';
  if (b != null && same(f, b) && Math.abs(b) >= 0.3 * Math.abs(f)) return 'mixed';
  if (b == null && same(f, m) && Math.abs(m) >= 0.5 * Math.abs(f)) return 'mixed';
  return 'fund';
}

function startOptions(navs, amount, prefer = 'red', stopAfter = 0) {
  const lastYm = navs[navs.length - 1].date.slice(0, 7);
  const opts = [];
  for (let k = 12; k >= (stopAfter ? stopAfter + 2 : 2); k--) {
    const ym = addMonths(lastYm, -k);
    const s = simulate(navs, { amount, start: ym, stopAfter });
    if (s.paid >= 2) opts.push({ start: ym, label: monthName(ym), gainPct: s.gainPct, paid: s.paid });
  }
  // demo default: the most recent start that is red (or green) with 6+ (then 4+) instalments
  const rev = opts.slice().reverse();
  const want = prefer === 'green' ? (o) => o.gainPct > 0 : (o) => o.gainPct < 0;
  let pick = prefer === 'any' ? opts.find((o) => o.start === addMonths(lastYm, -10)) : null;
  if (!pick) pick = rev.find((o) => want(o) && o.paid >= 6) || rev.find((o) => want(o) && o.paid >= 4) || rev.find(want);
  if (!pick) pick = opts.reduce((a, b) => ((prefer === 'green' ? b.gainPct > a.gainPct : b.gainPct < a.gainPct) ? b : a), opts[0]);
  return { options: opts, defaultStart: pick.start };
}

function build({ demo, fund, market, bench }, { start, skips = 0 }) {
  const amount = demo.amount;
  const cancelled = demo.status === 'cancelled';
  if (cancelled) skips = 0;
  const stopAfter = cancelled ? demo.stopAfter : 0;
  const sip = simulate(fund, { amount, start, skips, stopAfter });
  const first = sip.rows[0];
  const asOf = sip.asOf;
  const minus = (d, n) => iso(new Date(Date.parse(d) - n * DAY));
  const win = (from) => {
    const f = change(fund, from, asOf), m = change(market, from, asOf), b = bench ? change(bench, from, asOf) : null;
    return { fund: f, market: demo.category === 'index' ? null : m, bench: b, driver: demo.category === 'index' ? 'market' : attribution(f, m, b) };
  };
  const since = win(first.date);
  const m1 = win(minus(asOf, 30));
  const hi = fund.slice(lastOnOrBefore(fund, minus(asOf, 365)) + 1);
  const peak = hi.reduce((a, b) => (b.nav > a.nav ? b : a), hi[0]);
  const fromHigh = r1((1 - fund[fund.length - 1].nav / peak.nav) * 100);
  const dips = pastDips(fund, amount);
  const months = Math.max(1, Math.round(days(first.date, asOf) / 30.4));
  // consecutive skips at the end (Groww cancels a SIP after three in a row)
  let skipRun = 0; for (let k = sip.rows.length - 1; k >= 0 && sip.rows[k].skipped; k--) skipRun++;
  let stopped = null;
  if (cancelled) {
    const lastPaid = sip.rows[sip.rows.length - 1];
    const stoppedYm = addMonths(lastPaid.month, 1);
    stopped = {
      after: sip.paid, stoppedName: monthName(stoppedYm), monthsSince: Math.max(1, Math.round(days(lastPaid.date, asOf) / 30.4)),
      sinceStopPct: change(fund, lastPaid.date, asOf), valueAtStop: Math.round(sip.units * lastPaid.nav),
    };
  }
  const habit = {
    paid: sip.paid, due: sip.due, redPaid: sip.redPaid, skipRun,
    // a cancelled SIP counts every month since it started as due, so the score reflects the stop without any blame words
    score: Math.round(60 * Math.min(1, sip.paid / (cancelled ? Math.max(sip.due, months + 1) : (sip.due || 1))) + 25 * (sip.redPaid > 0 ? 1 : 0.6) + 15 * Math.min(1, months / 6)),
  };
  return {
    id: demo.id, label: demo.label, category: demo.category, amount, asOf, asOfName: dateName(asOf), status: cancelled ? 'cancelled' : skips ? 'skipped' : 'active', stopped,
    start, startName: monthName(start), months,
    sip: {
      invested: sip.invested, value: sip.value, gain: sip.gain, gainPct: sip.gainPct, xirr: sip.xirr,
      units: sip.units, avgNav: sip.avgNav, nav: r2(sip.nav), extraUnits: sip.extraUnits, red: sip.value < sip.invested,
    },
    instalments: sip.rows.map((r) => ({ month: r.month, date: r.date, nav: r2(r.nav), units: r.units, skipped: r.skipped, redBefore: r.redBefore })),
    why: { since, month: m1, fromHigh, highDate: dateName(peak.date), benchName: demo.bench ? demo.bench.name : null, benchFound: !!bench },
    dips, habit,
    purpose: PURPOSE[demo.category],
    exit: {
      units: sip.units, value: sip.value, invested: sip.invested, gain: sip.gain,
      holdingMonths: months, lessThanYear: months < 12, skipRun, skipsLeft: Math.max(0, 3 - skipRun), cancelled,
    },
  };
}

// Chart series for the fund page: daily for the last year, weekly before that.
function series(fund) {
  const cut = iso(new Date(Date.parse(fund[fund.length - 1].date) - 400 * DAY));
  const out = [];
  fund.forEach((p, i) => { if (p.date >= cut || i % 5 === 0) out.push([p.date, r3(p.nav)]); });
  return out;
}

module.exports = { build, simulate, startOptions, series, pastDips, attribution, monthName, dateName, addMonths };
