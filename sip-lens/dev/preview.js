// Builds a static, single-file preview of the prototype (test data, templates only) for sharing
// before deployment. Usage: MOCK_NAV=1 node dev/preview.js <out.html>
const fs = require('fs');
const path = require('path');
const { DEMOS, bundle } = require('../lib/nav');
const F = require('../lib/facts');
const { templates } = require('../lib/cards');

(async () => {
  const sips = {}, series = {}, all = [];
  for (const id of Object.keys(DEMOS)) {
    const b = await bundle(id);
    const o = F.startOptions(b.fund, b.demo.amount, b.demo.prefer, b.demo.status === 'cancelled' ? b.demo.stopAfter : 0);
    series[id] = F.series(b.fund);
    const n = b.fund.length; const day1 = Math.round((b.fund[n - 1].nav / b.fund[n - 2].nav - 1) * 10000) / 100;
    for (const opt of o.options) for (const skips of (b.demo.status === 'cancelled' ? [0] : [0, 1, 2])) {
      const facts = F.build(b, { start: opt.start, skips });
      sips[`${id}|${opt.start}|${skips}`] = {
        meta: { id, sub: b.demo.sub, risk: b.demo.risk, type: b.demo.type, plan: b.demo.plan, startOptions: o.options, start: opt.start, skips,
          source: 'Preview build with test data. The live site uses real daily NAVs of one fund in this category (AMFI data via mfapi.in).' },
        facts, day1, cards: { en: templates(facts, 'en'), hi: templates(facts, 'hi') },
      };
    }
    const f = F.build(b, { start: o.defaultStart, skips: b.demo.skips });
    all.push({ id, label: f.label, sub: b.demo.sub, risk: b.demo.risk, type: b.demo.type, amount: f.amount, start: o.defaultStart, startName: f.startName,
      status: f.status, skips: b.demo.status === 'cancelled' ? 0 : b.demo.skips, stoppedName: f.stopped ? f.stopped.stoppedName : null,
      invested: f.sip.invested, value: f.sip.value, gain: f.sip.gain, gainPct: f.sip.gainPct, xirr: f.sip.xirr, red: f.sip.red, day1, asOf: f.asOf });
  }
  const shim = `<script>
const PV = ${JSON.stringify({ sips, series, all })};
const PVdef = Object.fromEntries(PV.all.map((x) => [x.id, x.start]));
window.PREVIEW = async (q) => {
  if (q.op === 'health') return { ai: false };
  if (q.op === 'all') return { sips: PV.all };
  const id = q.id || 'small', start = q.start || PVdef[id], skips = Number(q.skips) || 0;
  const d = PV.sips[id + '|' + start + '|' + skips] || PV.sips[id + '|' + start + '|0'] || PV.sips[id + '|' + PVdef[id] + '|0'];
  if (q.op === 'sip') return Object.assign({ series: PV.series[id] }, d);
  return { meta: d.meta, facts: d.facts, cards: d.cards[q.lang === 'hi' ? 'hi' : 'en'], report: { source: 'template', error: 'preview: the live site adds the AI rewrite', replaced: [] } };
};
</script>`;
  let html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  html = html.replace(/<!doctype html>\s*<html[^>]*>\s*<head>\s*<meta charset="utf-8">\s*<meta name="viewport"[^>]*>\s*/i, '')
    .replace('<title>SIP Lens prototype</title>', '<title>SIP Lens Prototype</title>\n<meta name="claude:viewport-fit-sides" content="cover">')
    .replace(/<\/head>\s*<body>/i, '')
    .replace(/<\/body>\s*<\/html>\s*$/i, '')
    .replace(':root{', ':root{color-scheme:dark;')
    .replace('.page{min-height:100%;display:flex;gap:40px;align-items:flex-start;justify-content:center;padding:28px 24px}',
      '.page{min-height:100%;display:flex;gap:40px;align-items:flex-start;justify-content:center;padding-block:28px;padding-left:max(24px,env(safe-area-inset-left,0px));padding-right:max(24px,env(safe-area-inset-right,0px))}')
    .replace('.page{flex-direction:column;gap:0;padding:0}', '.page{flex-direction:column;gap:12px;padding-block:0 16px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}')
    .replace('.about{position:static;width:100%;padding:12px 16px;', '.about{position:static;width:100%;padding:12px 0;')
    .replace('.phone{width:100%;height:calc(100dvh - 0px);border:0;border-radius:0;box-shadow:none}', '.phone{width:100%;max-width:420px;height:min(860px, calc(100dvh - 24px));border-width:6px;border-radius:28px}')
    .replace('Concept prototype · not the Groww app</div>', 'Preview with test data · concept, not the Groww app</div>')
    .replace('<script>\nconst $ =', shim + '\n<script>\nconst $ =');
  fs.writeFileSync(process.argv[2], html);
  console.log('wrote', process.argv[2], Math.round(html.length / 1024) + ' KB');
})();
