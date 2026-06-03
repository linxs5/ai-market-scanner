# Market Intelligence AI V3

Market Intelligence AI is a research-only multi-market opportunity intelligence dashboard for stocks, ETFs, and Polymarket prediction markets. It scans public data, scores ideas, explains risk, generates briefings, tracks paper decisions, and builds a local learning loop.

It is not an auto-trading bot, not financial advice, not gambling advice, and not a guaranteed-profit system.

## What V3 Does

- Scans stocks and ETFs with Finnhub quotes/news and optional Polygon snapshots.
- Scans active Polymarket events and markets with public Gamma API data.
- Uses Polymarket Data API leaderboard data for Smart Money Watch context.
- Uses public CLOB price history when token IDs and liquidity make it practical.
- Creates a unified opportunity engine across stocks and Polymarket.
- Detects biggest movers, high-volume markets, high-liquidity markets, near-resolution markets, strong catalysts, and cross-market hypotheses.
- Scores stock setups and Polymarket opportunities with non-random formulas.
- Classifies stock and Polymarket catalysts.
- Flags ambiguous wording, thin liquidity, wide spread, resolution-source risk, binary news shock, crowded trade risk, manipulation/whale risk, and time/opportunity cost.
- Builds research packets with YES/NO cases, consensus odds, resolution criteria, skip reasons, and invalidation.
- Generates Morning Brief, Midday Update, Closing Watchlist, and Weekend Deep Dive report cards.
- Adds Macro Risk Today and Earnings Watch placeholders for future provider integration.
- Compares stock narratives with Polymarket themes as clearly marked hypotheses.
- Tracks paper trades, skipped ideas, local outcomes, score buckets, market type, catalyst type, and failure reasons.
- Stores a local research feed in browser localStorage.
- Provides optional Telegram-first alert architecture, with email and SMS fallbacks.

## What It Does Not Do

- Does not auto-trade.
- Does not connect to Robinhood.
- Does not connect to a Polymarket wallet.
- Does not place Polymarket orders.
- Does not handle private keys.
- Does not expose API keys in frontend code.
- Does not promise profit.
- Does not provide hype language about guaranteed or effortless gains.
- Does not support real-money execution workflows.

## Public Polymarket APIs

V2 uses public endpoints documented by Polymarket:

- Gamma API: `https://gamma-api.polymarket.com`
- Data API: `https://data-api.polymarket.com`
- CLOB public market data: `https://clob.polymarket.com`
- CLOB price history: `https://clob.polymarket.com/prices-history`

No Polymarket API key, wallet, or authentication is required for the V2 scanner. Trading endpoints are intentionally not used.

## Scoring

### Stock Score

The stock score remains 0-100:

- Momentum: 30%
- Relative volatility/range proxy: 25%
- News catalyst: 25%
- Risk/reward quality: 20%

### Polymarket Score

The Polymarket score is 0-100:

- Liquidity / volume: 25%
- Odds movement / momentum: 20%
- Catalyst strength: 20%
- Resolution clarity: 15%
- Time-to-resolution attractiveness: 10%
- Crowd/top-trader signal: 10%

If data is missing or the market has risk flags, confidence is lowered.

## Unified Opportunity Fields

Every unified V3 opportunity includes:

- market type
- title and symbol/slug
- current stock price or Polymarket odds
- score and score breakdown
- catalyst type and source quality
- bull/YES case and bear/NO case
- trap risk
- invalidation
- what to monitor next
- risk level
- confidence and data confidence
- suggested paper-trade action only
- skip reason

## Environment Variables

Required for stock scanner:

```bash
OPENAI_API_KEY=
FINNHUB_API_KEY=
```

Optional:

```bash
POLYGON_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
USER_PHONE_NUMBER=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
RESEND_API_KEY=
ALERT_EMAIL_TO=
ALERT_EMAIL_FROM=
```

Polymarket public scanning needs no key.

## Install

```bash
npm install
```

## Run Locally

Use Netlify Dev for serverless functions:

```bash
netlify dev
```

Then open the local URL Netlify prints.

## Test Stocks

```bash
curl -s http://localhost:8888/.netlify/functions/check-setup
curl -s -X POST http://localhost:8888/.netlify/functions/run-market-scan
```

Stock scanning requires `OPENAI_API_KEY` and `FINNHUB_API_KEY`.

## Test Polymarket

```bash
curl -s -X POST http://localhost:8888/.netlify/functions/run-polymarket-scan
```

This uses public Polymarket data and should work without keys if the public APIs are reachable.

## Test Unified Opportunities

```bash
curl -s -X POST http://localhost:8888/.netlify/functions/run-opportunity-engine
```

If stock keys are missing, the engine still returns Polymarket opportunities and report cards while warning that stock scanning was skipped.

## Test Cross-Market Scan

```bash
curl -s -X POST http://localhost:8888/.netlify/functions/run-cross-market-scan
```

If stock keys are missing, the function still returns Polymarket data and marks the stock scan as skipped.

## Test Alerts

```bash
curl -s -X POST http://localhost:8888/.netlify/functions/send-alert \
  -H "Content-Type: application/json" \
  -d '{"title":"Test alert","message":"Research only. Manual review required.","severity":"medium","alertType":"test","channels":["telegram"]}'
```

Alerts only send through configured channels:

- Telegram requires `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
- Email requires `RESEND_API_KEY`, `ALERT_EMAIL_TO`, and `ALERT_EMAIL_FROM`.
- SMS requires Twilio account SID, auth token, from number, and user phone number.

## Telegram Setup

1. Create a bot with BotFather.
2. Set `TELEGRAM_BOT_TOKEN`.
3. Send a message to the bot from the target chat.
4. Retrieve the chat id and set `TELEGRAM_CHAT_ID`.

## Twilio Setup

1. Create a Twilio account.
2. Add `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.
3. Add `TWILIO_FROM_NUMBER`.
4. Add `USER_PHONE_NUMBER`.

## Netlify Scheduled Functions

V3 includes:

- `netlify/functions/scheduled-stock-scan.ts`
- `netlify/functions/scheduled-polymarket-scan.ts`
- `netlify/functions/scheduled-morning-brief.ts`
- `netlify/functions/scheduled-midday-scan.ts`
- `netlify/functions/scheduled-closing-watch.ts`

Both use this UTC cron:

```ts
schedule: "30 12,16,19 * * 1-5"
```

That approximates 8:30 AM, 12:30 PM, and 3:30 PM ET during Eastern Daylight Time. Adjust for EST/DST in Netlify if exact wall-clock timing matters.

The V3 report schedules are:

```ts
scheduled-morning-brief: "30 12 * * 1-5"
scheduled-midday-scan: "30 16 * * 1-5"
scheduled-closing-watch: "30 19 * * 1-5"
```

These are UTC schedules and require DST review for exact ET behavior.

## Macro And Earnings Placeholders

The app includes lightweight static macro categories:

- CPI
- PPI
- FOMC
- Fed speeches
- jobs report
- GDP
- treasury auctions
- major earnings weeks

Ticker-level earnings awareness is currently a provider placeholder. Finnhub earnings calendar can be wired once the active key/plan confirms access.

## Risk Rules

- Research only, not financial advice.
- Prediction-market research is not gambling advice.
- Every idea needs a skip reason and invalidation.
- Do not copy top traders blindly.
- Skip unclear resolution criteria.
- Skip thin liquidity or wide spread.
- Skip low-confidence AI or low-confidence market data.
- Paper trade before risking real money.
