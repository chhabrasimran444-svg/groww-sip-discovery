# SIP Lens: concept prototype

SIP Lens is an AI SIP analyser for every SIP a first-time investor has: red or green, active, skipped or cancelled. It explains:

- why the SIP moved: the fund, compared with the whole market (Nifty 50) and with its segment index
- what the investor has built: units, average price, and the extra units bought when prices were lower
- what they've done well and which habits to build on
- how this fund's past dips played out, as history
- what this kind of fund is built for
- what pausing, stopping or redeeming would change

It explains. It never predicts returns, never recommends a fund and never tells the investor what to do.

This is a case-study prototype for a Product Management fellowship. It is **not the Groww app and not affiliated with Groww.** The layout follows the familiar fund and investment-details screens so the feature can be judged in context.

## What's real

- **NAVs:** real daily NAVs of one fund per category (small cap, technology, flexi cap and a Nifty 50 index fund). They are fetched at request time from [mfapi.in](https://www.mfapi.in/), a mirror of AMFI's daily NAV data. Fund names are hidden so the demo never reads as a recommendation.
- **Investors:** the demo SIPs (amounts, start months, skips) are illustrative. You can change them with the demo controls.

## How the AI is kept safe

1. **Code computes every number.** It works out returns, units, comparisons, past dips and the habit score from the NAV record (`lib/facts.js`).
2. **The AI writes the plain words.** Gemini, set by `GEMINI_API_KEY`, rewrites a safe template into short points in plain English or Hindi (`lib/cards.js`).
3. **A checker reviews every part of the AI text.** A part is rejected if it does any of these:
   - predicts
   - advises
   - uses fear words
   - blames the investor
   - contains a number that isn't in the facts
4. **Rejected parts fall back to the template.** The panel footer shows what was checked and what, if anything, was replaced.

## Evals

Run `npm run eval`. Add `MOCK_NAV=1` to run offline, or set `GEMINI_API_KEY` to also test live AI output. Results are written to `evals/results.md`. The eval checks three things:

- The checker catches every known-bad line and passes every known-good line.
- Every template passes the checker, for every demo SIP, start month, skip count and language.
- With a key, how many AI-written parts survive the checker.

## Run locally

```
MOCK_NAV=1 node dev/server.js   # synthetic NAVs, for layout only
node dev/server.js              # live NAVs (needs internet access to api.mfapi.in)
```

## Deploy

Import the repo into Vercel and add `GEMINI_API_KEY` as an environment variable. Without a key, the page still works and shows the safe templates.

Mutual fund investments are subject to market risks. Past performance does not guarantee future results.
