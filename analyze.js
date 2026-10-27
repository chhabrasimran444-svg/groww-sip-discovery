// POST /api/analyze {posts[], source} -> {labels[]}
// Labels pasted posts with the same codebook used for the 899 stored posts.
// The page checks every value and the evidence phrase again after this returns.
const { data, gemini, handler } = require('./_lib');

const SOURCES = ['Play Store review', 'App Store review', 'Reddit', 'YouTube comment', 'Forum post', 'Social media', 'Other'];

module.exports = handler(async (b) => {
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
  const { text, model } = await gemini(prompt, { json: true });
  let labels;
  try { labels = JSON.parse(text); }
  catch (e) {
    const m = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    try { labels = m ? JSON.parse(m[0]) : null; } catch (e2) { labels = null; }
  }
  if (!labels) throw { status: 502, code: 'invalid_json' };
  if (!Array.isArray(labels)) labels = [labels];
  return { labels, model };
});
