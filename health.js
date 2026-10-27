// GET /api/health -> {ai: true|false}. Tells the page whether the AI key is set (never the key itself).
module.exports = (req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify({ ai: Boolean(process.env.GEMINI_API_KEY) }));
};
