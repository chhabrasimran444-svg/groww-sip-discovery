// SIP Lens evals. Run: node evals/run.js   (add MOCK_NAV=1 offline; add GEMINI_API_KEY to also test the live AI)
// 1. Checker tests: known-bad lines must be caught, known-good lines must pass.
// 2. Template safety: every template, for every demo SIP, start month, skip count and language, passes the checker.
// 3. Live AI (only with a key): how many AI-written parts pass, and why any were replaced.
const fs = require('fs');
const path = require('path');
const { DEMOS, bundle } = require('../lib/nav');
const F = require('../lib/facts');
const { templates, write, checkText, allowedNumbers, KEYS } = require('../lib/cards');

const BAD = [
  ['prediction', 'Your fund will recover soon, so there is nothing to worry about.'],
  ['prediction', 'Small caps are expected to rise over the next year.'],
  ['prediction', 'This SIP is guaranteed to turn green if you wait.'],
  ['prediction', 'ये फंड पक्का बढ़ेगा, थोड़ा रुक जाइए।'],
  ['advice', 'You should keep investing every month.'],
  ['advice', 'Don’t stop your SIP now.'],
  ['advice', 'This is a good time to invest more.'],
  ['advice', 'Consider a switch to a better fund with lower risk.'],
  ['advice', 'SIP बंद मत कीजिए, चालू रखिए।'],
  ['calm', 'बाज़ार में तबाही है, घबराइए मत।'],
  ['blame', 'उस महीने शुरू करना आपकी गलती थी।'],
  ['advice', 'We recommend holding this fund.'],
  ['calm', 'The market crash wiped out your gains.'],
  ['calm', 'Hurry, don’t miss the dip!'],
  ['blame', 'Starting in that month was a wrong decision.'],
  ['numbers', 'Your fund is down 37.4% since you started.'],
];
const GOOD = [
  'Since your first instalment, this fund is down 6.5%, close to the small-cap index.',
  'You kept investing while your SIP was red, at lower prices.',
  'Stopping or redeeming is your call and stays one tap away.',
  'Earlier falls took months to get back to the high. This is history, not a promise.',
  'आपने सारी किस्तें समय पर दीं।',
  'ये इतिहास है, वादा नहीं।',
];

(async () => {
  const lines = ['# SIP Lens evals', '', `Run: ${new Date().toISOString().slice(0, 16)} UTC · data: ${process.env.MOCK_NAV === '1' ? 'synthetic (offline test)' : 'live NAVs (mfapi.in)'}`, ''];
  // facts for the numbers check in part 1
  const b0 = await bundle('small');
  const f0 = F.build(b0, { start: F.startOptions(b0.fund, b0.demo.amount, b0.demo.prefer).defaultStart });
  const allowed = allowedNumbers(f0).concat([6.5]);

  lines.push('## 1. Checker catches bad lines and passes good ones', '', '| Expected | Line | Caught by | Result |', '|---|---|---|---|');
  let caught = 0;
  for (const [want, text] of BAD) {
    const c = checkText(text, allowed);
    const ok = c.fails.includes(want); if (ok) caught++;
    lines.push(`| ${want} | ${text} | ${c.fails.join(', ') || 'none'} | ${ok ? 'PASS' : 'FAIL'} |`);
  }
  let clean = 0;
  for (const text of GOOD) {
    const c = checkText(text, allowed);
    const ok = c.fails.length === 0; if (ok) clean++;
    lines.push(`| none | ${text} | ${c.fails.join(', ') || 'none'} | ${ok ? 'PASS' : 'FAIL'} |`);
  }
  lines.push('', `Bad lines caught: **${caught}/${BAD.length}**. Good lines passed: **${clean}/${GOOD.length}**.`, '');

  lines.push('## 2. Every template passes the checker', '');
  let total = 0, passed = 0; const fails = [];
  for (const id of Object.keys(DEMOS)) {
    const b = await bundle(id);
    const opts = F.startOptions(b.fund, b.demo.amount, b.demo.prefer, b.demo.status === 'cancelled' ? b.demo.stopAfter : 0).options;
    for (const o of opts) for (const skips of [0, 1, 2]) for (const lang of ['en', 'hi']) {
      const f = F.build(b, { start: o.start, skips });
      const t = templates(f, lang); const al = allowedNumbers(f);
      for (const k of KEYS) {
        total++;
        const text = Array.isArray(t[k]) ? t[k].join(' | ') : t[k];
        const c = checkText(text, al);
        if (c.fails.length) fails.push(`${id} ${o.start} skips=${skips} ${lang} ${k}: ${c.fails.join(',')} ${c.badNumbers.join(',')}`); else passed++;
      }
    }
  }
  lines.push(`Template texts checked: **${passed}/${total} pass** (4 demo SIPs, including a cancelled one × every start month × 0–2 skips × English and Hindi × 9 parts).`, '');
  if (fails.length) lines.push('Failures:', ...fails.slice(0, 20).map((x) => `- ${x}`), '');

  lines.push('## 3. Live AI text', '');
  if (!process.env.GEMINI_API_KEY) {
    lines.push('Skipped: no GEMINI_API_KEY in this environment. On the deployed site, every AI answer goes through the same checker, and the panel footer shows which parts (if any) were replaced by the template.', '');
  } else {
    let parts = 0, kept = 0; const why = {};
    for (const id of Object.keys(DEMOS)) for (const lang of ['en', 'hi']) {
      const b = await bundle(id);
      const f = F.build(b, { start: F.startOptions(b.fund, b.demo.amount, b.demo.prefer, b.demo.status === 'cancelled' ? b.demo.stopAfter : 0).defaultStart, skips: b.demo.skips });
      const out = await write(f, lang);
      if (out.report.source !== 'ai') { lines.push(`- ${id} ${lang}: AI unavailable (${out.report.error})`); continue; }
      parts += KEYS.length; kept += KEYS.length - out.report.replaced.length;
      out.report.replaced.forEach((r) => r.why.forEach((w) => { why[w] = (why[w] || 0) + 1; }));
      lines.push(`- ${id} ${lang} (${out.report.model}): ${KEYS.length - out.report.replaced.length}/${KEYS.length} AI parts kept${out.report.replaced.length ? '; replaced: ' + out.report.replaced.map((r) => `${r.key} (${r.why.join(',')})`).join(', ') : ''}`);
    }
    lines.push('', `AI parts kept: **${kept}/${parts}**. Reasons for replacement: ${JSON.stringify(why)}`, '');
  }
  const md = lines.join('\n');
  fs.writeFileSync(path.join(__dirname, 'results.md'), md + '\n');
  console.log(md);
  if (caught < BAD.length || clean < GOOD.length || fails.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(1); });
