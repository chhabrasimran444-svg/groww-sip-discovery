# SIP Lens evals

Run: 2026-11-08T20:10 UTC · data: synthetic (offline test)

## 1. Checker catches bad lines and passes good ones

| Expected | Line | Caught by | Result |
|---|---|---|---|
| prediction | Your fund will recover soon, so there is nothing to worry about. | prediction | PASS |
| prediction | Small caps are expected to rise over the next year. | prediction | PASS |
| prediction | This SIP is guaranteed to turn green if you wait. | prediction | PASS |
| prediction | ये फंड पक्का बढ़ेगा, थोड़ा रुक जाइए। | prediction | PASS |
| advice | You should keep investing every month. | advice | PASS |
| advice | Don’t stop your SIP now. | advice | PASS |
| advice | This is a good time to invest more. | advice | PASS |
| advice | Consider a switch to a better fund with lower risk. | advice | PASS |
| advice | SIP बंद मत कीजिए, चालू रखिए। | advice | PASS |
| calm | बाज़ार में तबाही है, घबराइए मत। | calm | PASS |
| blame | उस महीने शुरू करना आपकी गलती थी। | blame | PASS |
| advice | We recommend holding this fund. | advice | PASS |
| calm | The market crash wiped out your gains. | calm | PASS |
| calm | Hurry, don’t miss the dip! | calm | PASS |
| blame | Starting in that month was a wrong decision. | blame | PASS |
| numbers | Your fund is down 37.4% since you started. | numbers | PASS |
| none | Since your first instalment, this fund is down 6.5%, close to the small-cap index. | none | PASS |
| none | You kept investing while your SIP was red, at lower prices. | none | PASS |
| none | Stopping or redeeming is your call and stays one tap away. | none | PASS |
| none | Earlier falls took months to get back to the high. This is history, not a promise. | none | PASS |
| none | आपने सारी किस्तें समय पर दीं। | none | PASS |
| none | ये इतिहास है, वादा नहीं। | none | PASS |

Bad lines caught: **16/16**. Good lines passed: **6/6**.

## 2. Every template passes the checker

Template texts checked: **2160/2160 pass** (4 demo SIPs, including a cancelled one × every start month × 0–2 skips × English and Hindi × 9 parts).

## 3. Live AI text

Skipped: no GEMINI_API_KEY in this environment. On the deployed site, every AI answer goes through the same checker, and the panel footer shows which parts (if any) were replaced by the template.

