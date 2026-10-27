// POST /api/ask {question, refs[], history[]} -> {text, truncated}
// The prompt is built here from fixed text and the stored posts, so the endpoint
// can only answer questions about this dataset.
const { data, gemini, handler } = require('./_lib');

module.exports = handler(async (b) => {
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
  const { text, truncated, model } = await gemini(prompt);
  return { text, truncated, model };
});
