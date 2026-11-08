// SIP Lens text: safe templates written from the facts (short points, English and Hindi), an AI
// rewrite in plain words, and the checks every AI point must pass (no advice, no prediction,
// calm words, no blame, numbers that match the SIP record).
const { gemini } = require('./gemini');

const abs = (x) => Math.abs(Number(x));
const inr = (x) => '₹' + Math.round(abs(x)).toLocaleString('en-IN');

const BENCH_HI = { 'small-cap index': 'स्मॉल-कैप इंडेक्स', 'IT index': 'IT इंडेक्स', 'Nifty 500 index': 'Nifty 500 इंडेक्स' };
const PURPOSE_HI = {
  smallcap: ['ये फंड कम से कम 65% छोटी कंपनियों में लगाता है (आकार में 251वीं और उसके बाद, SEBI की परिभाषा)।', 'छोटी कंपनियाँ तेज़ी से बढ़ सकती हैं, और उनकी कीमतें ज़्यादा ऊपर-नीचे होती हैं।'],
  sectoral: ['ये फंड कम से कम 80% एक ही सेक्टर में लगाता है, यहाँ टेक्नोलॉजी (SEBI नियम)।', 'इसकी वैल्यू उस सेक्टर के साथ चलती है, इसलिए ये पूरे बाज़ार से अलग चल सकता है।'],
  index: ['ये फंड Nifty 50 को कॉपी करता है, यानी भारत की 50 सबसे बड़ी listed कंपनियाँ।', 'ये fund manager के चुनाव की जगह पूरे बाज़ार के साथ चलता है।'],
  flexicap: ['ये फंड कम से कम 65% शेयरों में लगाता है और बड़ी, मध्यम या छोटी किसी भी आकार की कंपनी चुन सकता है (SEBI नियम)।', 'Fund manager बाज़ार के हिसाब से ये मिश्रण बदल सकता है।'],
};

// ---------------- templates: every value is a list of short points (headline is one line) ----------------
const T = {
  en: {
    mv: (x) => (x < 0 ? `down ${abs(x)}%` : `up ${abs(x)}%`),
    headline(f) {
      if (f.status === 'cancelled') return `You stopped this SIP in ${f.stopped.stoppedName}. Your ${f.sip.units} units are still invested, now ${this.mv(f.sip.gainPct)} on what you put in.`;
      return f.sip.red ? `Your SIP is ${abs(f.sip.gainPct)}% below what you’ve put in. Here’s why, and what you’ve built.`
        : `Your SIP is ${abs(f.sip.gainPct)}% above what you’ve put in. Here’s what moved it, and how it compares.`;
    },
    why(f) {
      const s = f.why.since, out = [`Your fund: ${this.mv(s.fund)} since your first instalment (${f.startName}).`];
      if (s.bench != null) out.push(`The ${f.why.benchName}: ${this.mv(s.bench)} over the same months.`);
      if (s.market != null) out.push(`Nifty 50, the whole market: ${this.mv(s.market)}.`);
      out.push(f.category === 'index' ? 'It copies the Nifty 50, so it moves with the whole market.' : {
        segment: 'Most of the move came from its part of the market.',
        market: 'Your fund moved with the whole market.',
        mixed: 'Part came from its part of the market, part from the fund’s own holdings (listed in its monthly factsheet).',
        fund: 'The gap comes from the fund’s own holdings, listed in its monthly factsheet.',
      }[s.driver]);
      if (!f.sip.red && s.market != null && s.fund > 0 && s.fund < s.market - 2) out.push('It is up, but by less than the Nifty 50 over the same months.');
      return out;
    },
    built(f) {
      const out = [`Put in: ${inr(f.sip.invested)} over ${f.habit.paid} instalments.`, `You own ${f.sip.units} units at an average price of ₹${f.sip.avgNav}.`];
      out.push(f.sip.extraUnits > 0 ? `Lower prices gave you ${f.sip.extraUnits} extra units.` : 'No extra units from lower prices yet: prices stayed at or above your first month.');
      if (f.status === 'cancelled') out.push(`Since you stopped, no new units are added; these ${f.sip.units} units keep moving with the fund.`);
      return out;
    },
    well(f) {
      const h = f.habit, out = [h.paid === h.due ? `All ${h.paid} instalments paid on time.` : `${h.paid} of ${h.due} instalments paid.`];
      if (h.redPaid > 0) out.push(`You invested ${h.redPaid} ${h.redPaid === 1 ? 'time' : 'times'} while your SIP was red, at lower prices.`);
      out.push(f.status === 'cancelled' ? `You built ${f.sip.units} units before stopping.` : `You’ve stayed with it for ${f.months} ${f.months === 1 ? 'month' : 'months'}.`);
      return out;
    },
    better(f) {
      const out = [];
      if (f.habit.skipRun > 0) out.push(`${f.habit.skipRun} skipped in a row. For a break, a pause with a restart date is clearer: 3 skips in a row cancel a SIP.`);
      out.push('Check your SIP once a month rather than daily; one day’s move says little about a monthly plan.');
      out.push(f.status === 'cancelled' ? 'Linking any SIP to a goal and a date helps you judge it by the goal, not one red month.' : 'Link this SIP to a goal and a date, so you judge it by the goal, not one red month.');
      return out;
    },
    dips(f) {
      const d = f.dips, e = d.episodes[0], out = [];
      if (d.current) out.push(`Now ${d.current.fellSoFar}% below its high from ${d.current.from}.`);
      if (!e) { out.push(`No earlier fall of ${d.min}% or more in its record.`); return out; }
      out.push(`Earlier falls of ${d.min}% or more in its record: ${d.episodes.length}.`);
      out.push(`Latest, from ${e.from}: fell ${e.fell}%, back to its high in ${e.monthsToHigh} months.`);
      if (e.sipAfter12 != null) out.push(`A SIP started at that high was ${e.sipAfter12 < 0 ? 'down' : 'up'} ${abs(e.sipAfter12)}% 12 months later.`);
      out.push('History, not a promise.');
      return out;
    },
    purpose: (f) => [`This fund ${f.purpose.rule}.`, f.purpose.swing, 'Its product label says it is for investors seeking long-term capital growth.'],
    habit(f) {
      const h = f.habit, out = [`Score ${h.score}/100: it rates your habits, never the fund.`, `${h.paid} of ${f.status === 'cancelled' ? f.months + 1 : h.due} monthly instalments paid.`];
      if (h.redPaid) out.push(`${h.redPaid} paid while the SIP was red.`);
      return out;
    },
    stop(f) {
      if (f.status === 'cancelled') return [`Stopped after ${f.stopped.after} instalments; since then the fund is ${this.mv(f.stopped.sinceStopPct)}.`, `Your ${f.sip.units} units remain in the fund unless you redeem them.`, 'Restarting is a new SIP from the fund page. Your call either way.'];
      return ['Stopping or redeeming is your call and stays one tap away.', `Below: what each option changes for your ${f.sip.units} units.`];
    },
  },
  hi: {
    mv: (x) => (x < 0 ? `${abs(x)}% नीचे` : `${abs(x)}% ऊपर`),
    headline(f) {
      if (f.status === 'cancelled') return `आपने ये SIP ${f.stopped.stoppedName} में रोका। आपके ${f.sip.units} units अभी भी निवेशित हैं, लगाए पैसे से ${this.mv(f.sip.gainPct)}।`;
      return f.sip.red ? `आपका SIP आपके लगाए पैसे से ${abs(f.sip.gainPct)}% नीचे है। देखिए क्यों, और आपने अब तक क्या बनाया।`
        : `आपका SIP आपके लगाए पैसे से ${abs(f.sip.gainPct)}% ऊपर है। देखिए किस वजह से, और ये बाज़ार के मुकाबले कैसा है।`;
    },
    why(f) {
      const s = f.why.since, out = [`आपका फंड: पहली किस्त (${f.startName}) से ${this.mv(s.fund)}।`];
      if (s.bench != null) out.push(`${BENCH_HI[f.why.benchName] || f.why.benchName}: इन्हीं महीनों में ${this.mv(s.bench)}।`);
      if (s.market != null) out.push(`Nifty 50, यानी पूरा बाज़ार: ${this.mv(s.market)}।`);
      out.push(f.category === 'index' ? 'ये Nifty 50 को कॉपी करता है, इसलिए पूरे बाज़ार के साथ चलता है।' : {
        segment: 'ज़्यादा असर बाज़ार के इस हिस्से का है।',
        market: 'आपका फंड पूरे बाज़ार के साथ चला।',
        mixed: 'कुछ असर बाज़ार के इस हिस्से का, कुछ फंड की अपनी होल्डिंग्स का (मासिक factsheet में)।',
        fund: 'ये फ़र्क फंड की अपनी होल्डिंग्स से है, जो उसकी मासिक factsheet में हैं।',
      }[s.driver]);
      if (!f.sip.red && s.market != null && s.fund > 0 && s.fund < s.market - 2) out.push('ऊपर है, पर इन्हीं महीनों में Nifty 50 से कम।');
      return out;
    },
    built(f) {
      const out = [`लगाया: ${f.habit.paid} किस्तों में ${inr(f.sip.invested)}।`, `आपके पास ${f.sip.units} units हैं, औसत कीमत ₹${f.sip.avgNav}।`];
      out.push(f.sip.extraUnits > 0 ? `कम कीमत पर ${f.sip.extraUnits} units ज़्यादा मिले।` : 'अभी तक कम कीमत से ज़्यादा units नहीं मिले: कीमत पहले महीने से नीचे नहीं गई।');
      if (f.status === 'cancelled') out.push(`रोकने के बाद नए units नहीं जुड़ते; ये ${f.sip.units} units फंड के साथ चलते रहते हैं।`);
      return out;
    },
    well(f) {
      const h = f.habit, out = [h.paid === h.due ? `सारी ${h.paid} किस्तें समय पर दीं।` : `${h.due} में से ${h.paid} किस्तें दीं।`];
      if (h.redPaid > 0) out.push(`SIP लाल होने पर भी ${h.redPaid} बार निवेश किया, कम कीमत पर।`);
      out.push(f.status === 'cancelled' ? `रोकने से पहले ${f.sip.units} units बनाए।` : `आप ${f.months} महीने से इसके साथ हैं।`);
      return out;
    },
    better(f) {
      const out = [];
      if (f.habit.skipRun > 0) out.push(`लगातार ${f.habit.skipRun} किस्तें छूटीं। ब्रेक के लिए restart तारीख वाला pause साफ़ रहता है: लगातार 3 skip से SIP रद्द हो जाता है।`);
      out.push('SIP को रोज़ की जगह महीने में एक बार देखिए; एक दिन की हलचल मासिक योजना के बारे में कम बताती है।');
      out.push(f.status === 'cancelled' ? 'किसी भी SIP को लक्ष्य और तारीख से जोड़ने से आप उसे लक्ष्य से परखते हैं, एक लाल महीने से नहीं।' : 'इस SIP को किसी लक्ष्य और तारीख से जोड़िए, ताकि आप इसे लक्ष्य से परखें, एक लाल महीने से नहीं।');
      return out;
    },
    dips(f) {
      const d = f.dips, e = d.episodes[0], out = [];
      if (d.current) out.push(`अभी ${d.current.from} के high से ${d.current.fellSoFar}% नीचे।`);
      if (!e) { out.push(`इसके रिकॉर्ड में ${d.min}% या उससे ज़्यादा की कोई पिछली गिरावट नहीं।`); return out; }
      out.push(`इसके रिकॉर्ड में ${d.min}% या ज़्यादा की पिछली गिरावटें: ${d.episodes.length}।`);
      out.push(`सबसे हाल की, ${e.from} से: ${e.fell}% गिरा, ${e.monthsToHigh} महीने में high पर लौटा।`);
      if (e.sipAfter12 != null) out.push(`उस high पर शुरू हुआ SIP 12 महीने बाद ${abs(e.sipAfter12)}% ${e.sipAfter12 < 0 ? 'नीचे' : 'ऊपर'} था।`);
      out.push('ये इतिहास है, वादा नहीं।');
      return out;
    },
    purpose: (f) => [...PURPOSE_HI[f.category], 'इसके product label के अनुसार ये लंबी अवधि की पूंजी वृद्धि चाहने वाले निवेशकों के लिए है।'],
    habit(f) {
      const h = f.habit, out = [`स्कोर ${h.score}/100: ये आपकी आदतों का है, फंड का कभी नहीं।`, `${f.status === 'cancelled' ? f.months + 1 : h.due} मासिक किस्तों में से ${h.paid} दीं।`];
      if (h.redPaid) out.push(`${h.redPaid} किस्तें SIP लाल होने पर भी दीं।`);
      return out;
    },
    stop(f) {
      if (f.status === 'cancelled') return [`${f.stopped.after} किस्तों के बाद रोका; तब से फंड ${this.mv(f.stopped.sinceStopPct)}।`, `आपके ${f.sip.units} units निवेशित रहते हैं, जब तक आप redeem न करें।`, 'दोबारा शुरू करना fund पेज से नया SIP है। फ़ैसला आपका।'];
      return ['रोकना या redeem करना आपका फ़ैसला है, और एक टैप पर ही रहेगा।', `नीचे: हर विकल्प आपके ${f.sip.units} units के लिए क्या बदलता है।`];
    },
  },
};

const KEYS = ['headline', 'why', 'built', 'well', 'better', 'dips', 'purpose', 'habit', 'stop'];
function templates(f, lang) {
  const t = T[lang] || T.en; const out = {};
  for (const k of KEYS) out[k] = t[k].call(t, f);
  return out;
}

// ---------------- checks ----------------
// English patterns use word boundaries; Hindi (Devanagari) patterns are plain substrings,
// because \b only understands Latin letters.
const RULES = [
  { id: 'prediction', re: [
    /\bwill\s+(?:surely\s+|definitely\s+|soon\s+)?(?:rise|recover|go up|bounce|grow|come back|increase|improve|turn green|be fine|double)/i,
    /\b(?:expected|likely|bound|sure|certain)\s+to\s+(?:rise|recover|grow|go up|bounce|come back|improve)/i,
    /\bguarantee/i, /\bforecast/i, /\bpredict/i, /\brecover(?:s|y)?\s+soon\b/i, /\bnext (?:month|year) (?:it|this fund|your sip) will\b/i,
    /ज़रूर|जरूर|पक्का|बढ़ेगा|बढ़ेगी|लौटेगा|लौटेगी|वापस आएगा|रिकवर होगा|ऊपर जाएगा|गारंटी|भविष्यवाणी|अनुमान है कि/,
  ] },
  { id: 'advice', re: [
    /\bshould\s+(?:not\s+)?(?:buy|sell|switch|redeem|stop|continue|keep|invest|hold|add|exit|pause)/i,
    /\brecommend/i, /\b(?:best|top|better)\s+fund/i, /\bswitch\s+to\b/i, /\b(?:buy|invest)\s+more\b/i,
    /\bdon'?t\s+(?:stop|sell|redeem|exit|pause)/i, /\bkeep\s+(?:investing|going|your sip|the sip|it running)/i,
    /\bstay\s+invested\b/i, /\bgood\s+time\s+to\b/i,
    /बंद मत|मत रोक|रोकिए मत|जारी रखें|जारी रखिए|चालू रखें|चालू रखिए|और निवेश कर|ज़्यादा निवेश कर|खरीदें|खरीदिए|बेचें|बेचिए|सलाह देते|सुझाव देते|बेहतर फंड|सबसे अच्छा फंड/,
  ] },
  { id: 'calm', re: [
    /\b(?:crash|panic|disaster|plunge|bloodbath|terrible|scary|horrible|wiped out|lose everything|act now|hurry|last chance|don'?t miss|missing out|fomo)\b/i,
    /घबरा|डर|क्रैश|तबाही|बर्बाद|जल्दी कीजिए|जल्दी करें|मौका न चूक|डूब/,
  ] },
  { id: 'blame', re: [/\b(?:your fault|you made a mistake|wrong decision|you did wrong)\b/i, /गलती|ग़लती|आपकी भूल|गलत फ़ैसला|गलत फैसला/] },
];

function allowedNumbers(f) {
  const set = new Set([1, 2, 3, 12, 50, 65, 80, 100, 250, 251, 500]);
  const walk = (v) => {
    if (v == null) return;
    if (typeof v === 'number') { set.add(Math.abs(v)); return; }
    if (typeof v === 'string') { (v.match(/\d[\d,]*(?:\.\d+)?/g) || []).forEach((n) => set.add(Number(n.replace(/,/g, '')))); return; }
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(f);
  if (f && f.months != null) set.add(f.months + 1);
  return [...set].filter((x) => isFinite(x));
}
function numbersOk(text, allowed) {
  const found = (String(text).match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => Number(n.replace(/,/g, '')));
  const bad = found.filter((x) => !allowed.some((a) => Math.abs(x - a) <= Math.max(0.051, 0.006 * a) || (Number.isInteger(x) && a >= 1 && Math.abs(x - a) < 1)));
  return { ok: bad.length === 0, bad };
}
function checkText(text, allowed) {
  text = String(text).replace(/[‘’]/g, "'");
  const fails = [];
  for (const r of RULES) if (r.re.some((re) => re.test(text))) fails.push(r.id);
  if (/[०-९]/.test(text)) fails.push('numbers'); // Devanagari digits can't be checked; ask for 0-9
  const n = numbersOk(text, allowed);
  if (!n.ok) fails.push('numbers');
  return { fails: [...new Set(fails)], badNumbers: n.bad };
}

// ---------------- AI rewrite ----------------
function prompt(f, lang, draft) {
  const voice = lang === 'hi'
    ? 'Write in simple, warm Hindi in Devanagari script, the way a helpful colleague would explain it. Keep these words in English: SIP, NAV, units, Nifty 50, factsheet, redeem, pause, fund manager. Write all numbers with the digits 0-9.'
    : 'Write in plain, warm English for someone who started investing this year. Short sentences. No jargon (no "XIRR", "drawdown", "alpha").';
  return `You write the text of "SIP Lens", an AI analyser beside a first-time investor's SIP in an Indian investing app.
It helps them understand why their SIP moved and what they have built, so they can decide calmly. It is not personal advice.

${voice}

Hard rules (a checker rejects any part that breaks them, and a fixed template is shown instead):
1. Use ONLY numbers that appear in FACTS. Do not compute new numbers, totals or percentages.
2. Never predict: no "will recover", "will grow", "soon", "expected to", no guarantees.
3. Never advise: no "you should", "keep investing", "don't stop", "invest more", "switch", "best fund"; no buy/sell/hold/continue/restart suggestions. Describe; let them decide.
4. Calm words only: no crash, panic, disaster, plunge, hurry, missing out.
5. Never blame the investor. Habits are "what you can build on".
6. Past falls are history only: the last point of "dips" must say it is history, not a promise.
7. Every key except "headline" is a JSON array of 2 to 4 short points, each at most 22 words. "headline" is one sentence of at most 30 words.

Return JSON with exactly these keys: headline, why, built, well, better, dips, purpose, habit, stop.
DRAFT holds a safe version of every key: improve its warmth and clarity, keep its facts, keep the same meaning per key.

FACTS:
${JSON.stringify(compact(f))}

DRAFT:
${JSON.stringify(draft)}`;
}
function compact(f) {
  return {
    fund: f.label, category: f.category, status: f.status, monthlyAmount: f.amount, started: f.startName, asOf: f.asOfName, monthsIn: f.months,
    stopped: f.stopped, sip: f.sip, why: f.why, habit: f.habit, pastFalls: f.dips, purpose: f.purpose, exit: f.exit,
  };
}

async function write(f, lang) {
  const draft = templates(f, lang);
  const allowed = allowedNumbers(f);
  const report = { source: 'template', model: null, replaced: [] };
  let ai = null;
  try {
    const out = await gemini(prompt(f, lang, draft), true);
    ai = JSON.parse(out.text.replace(/^```(?:json)?|```$/g, '').trim());
    report.model = out.model; report.source = 'ai';
  } catch (e) {
    report.error = e && e.code ? e.code : 'ai_failed';
    return { cards: draft, report };
  }
  const cards = {};
  for (const k of KEYS) {
    const want = draft[k], got = ai && ai[k];
    const isList = Array.isArray(want);
    const ok = isList ? Array.isArray(got) && got.length >= 1 && got.length <= 5 && got.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 240)
      : typeof got === 'string' && got.length > 0 && got.length <= 280;
    if (!ok) { cards[k] = want; report.replaced.push({ key: k, why: ['shape'] }); continue; }
    const text = isList ? got.join(' | ') : got;
    const c = checkText(text, allowed);
    if (k === 'dips' && !/history|इतिहास/i.test(text)) c.fails.push('history_label');
    if (c.fails.length) { cards[k] = want; report.replaced.push({ key: k, why: c.fails, numbers: c.badNumbers }); } else cards[k] = got;
  }
  return { cards, report };
}

module.exports = { templates, write, checkText, allowedNumbers, RULES, KEYS };
