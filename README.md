# Groww SIP Discovery Engine

Why do first-time investors stop their SIPs? This site lets you ask questions about 899 labelled public posts
(Play Store, Reddit, TradingQ&A, Upstox Community, YouTube), browse the findings, and label new posts live.

Independent fellowship case study on public posts. Not affiliated with Groww. No fund or stock recommendations.

## What's here

| Path | What it is |
|---|---|
| `index.html` | The whole site: Ask Assistant, Dashboard, Live Analyzer, Method & evidence |
| `*.json`, `*.csv` | The labelled posts (codebook v5), codebook, golden-set results, v5 change log (one snapshot, collected 26 Oct 2026) |
| `api/ai.js` | The one server function: `?op=ask` answers typed questions with Google Gemini citing post refs, `?op=analyze` labels pasted posts with the same codebook, `?op=health` says whether the AI key is set |
| `posts.json`, `stats_brief.txt`, `codebook.json` | What the server uses to build prompts, so the endpoint can only answer about this dataset |

Everything except typed questions and Analyze works with no key. The AI key is never in the code.

## Deploy on Vercel (free)

1. On vercel.com, sign in with GitHub, click **Add New... > Project**, and import this repository.
2. Leave every build setting as it is and click **Deploy**.
3. In the project, open **Settings > Environment Variables**, add `GEMINI_API_KEY` with your free key from
   aistudio.google.com, and save it for Production.
4. Open **Deployments**, click the three dots on the latest one and choose **Redeploy** so the key takes effect.

Optional variables: `GEMINI_MODEL` (default tries gemini-2.5-flash, then gemini-2.5-flash-lite, then gemini-2.0-flash),
`PER_VISITOR_PER_MINUTE` (default 6).

Free-tier limits are shared by all visitors. When they're reached the site says the AI is busy; nothing is charged unless
you turn on billing in Google AI Studio.

## How the data was made

The posts were collected with a Colab notebook and an Apify Reddit run, screened, and labelled by Claude against a written
codebook; every evidence phrase was checked by code to appear in its post. A blind golden set of 25 posts compares the labels
with a researcher's own. Full write-up: the AI Evidence Log linked from the site.
