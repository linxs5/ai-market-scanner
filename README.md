# Market Intelligence AI

Market Intelligence AI is a research-only dashboard for a beginner retail trader with a small account. It scans a starter watchlist, fetches real market quotes and recent company news from server-side providers, scores possible research setups, asks OpenAI for beginner-friendly JSON explanations, and lets you track paper trades in localStorage.

This is not an auto-trading bot, not financial advice, not a Robinhood integration, and not a profit-promise tool. It never places trades.

## What It Does

- Scans a starter watchlist: SPY, QQQ, AAPL, MSFT, NVDA, AMD, TSLA, META, AMZN, GOOG, PLTR, SOFI, HOOD, RIVN, SMCI, MSTR, IONQ.
- Fetches real quotes from Finnhub and optionally uses Polygon when `POLYGON_API_KEY` is configured.
- Fetches recent company news from Finnhub.
- Detects a simple market regime from SPY/QQQ movement, intraday range, and news flow.
- Scores setups from 0 to 100 with a non-random multi-factor model.
- Sends only fetched and scored data to OpenAI from Netlify functions.
- Returns structured setup reports with bull case, bear case, catalyst, entry zone idea, stop idea, target idea, risk/reward, invalidation, skip reason, confidence, and a manual checklist.
- Tracks paper trades, skipped setups, and outcomes in browser localStorage.

## What It Does Not Do

- Does not auto-trade.
- Does not connect to Robinhood.
- Does not place orders.
- Does not use browser automation to click trades.
- Does not expose API keys in frontend code.
- Does not use fake random stock prices.
- Does not promise profit or easy gains.
- Does not support options in v1.
- Does not support penny stocks under $2 in v1.

## Scoring Formula

The scoring engine is in `lib/server/scoring.ts`. It produces a 0-100 score from:

- Momentum, 30%: absolute percent change versus previous close, capped to avoid extreme runaway scores.
- Relative volatility/volume proxy, 25%: intraday high-low range as a percentage of current price. Finnhub free quotes do not include volume, so range is used as the v1 proxy.
- News catalyst, 25%: recent headline count plus extra credit for catalyst terms such as earnings, guidance, upgrade, deal, contract, launch, approval, partnership, revenue, profit, acquisition, SEC, or investigation.
- Risk/reward quality, 20%: favors tradable symbols above $2 with enough movement but penalizes extreme extension.

The score is never random. Weak setups, stocks below $2, and setups without recent news are filtered or warned.

## Environment Variables

Required:

```bash
OPENAI_API_KEY=your_openai_key
FINNHUB_API_KEY=your_finnhub_key
```

Optional:

```bash
POLYGON_API_KEY=your_polygon_key
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
USER_PHONE_NUMBER=
```

Twilio variables are reserved for future alerting and are not used in v1.

## Get API Keys

- Finnhub: create an account at [finnhub.io](https://finnhub.io), then copy your API token from the dashboard.
- OpenAI: create an API key in the [OpenAI platform](https://platform.openai.com/api-keys).
- Polygon is optional: create a key at [polygon.io](https://polygon.io) if you want the app to prefer Polygon snapshots when available.

## Install

```bash
npm install
```

Create `.env.local` for local development:

```bash
OPENAI_API_KEY=...
FINNHUB_API_KEY=...
POLYGON_API_KEY=...
```

## Run Locally

For the full Netlify function experience, install and use the Netlify CLI:

```bash
npm install -g netlify-cli
netlify dev
```

Then open the local URL shown by Netlify.

For frontend-only development:

```bash
npm run dev
```

The scanner functions require Netlify functions, so `netlify dev` is recommended.

## Test The Scan Function

With `netlify dev` running:

```bash
curl -s http://localhost:8888/.netlify/functions/check-setup
curl -s -X POST http://localhost:8888/.netlify/functions/run-market-scan
```

The setup check reports whether env vars are configured without exposing secret values.

## Deploy To Netlify

1. Push the repository to GitHub.
2. Create a Netlify site from the repo.
3. Use the build command `npm run build`.
4. Use `.next` as the publish directory. The included `@netlify/plugin-nextjs` handles Next.js routing.
5. Add required environment variables in Netlify site settings.
6. Deploy.

## Risk Disclaimers

This project is research software only. It is not financial advice. It cannot guarantee profits. All setup language is a paper-trade idea or research setup, not an instruction to buy or sell. A beginner with a small account should keep paper risk between $2 and $5 per idea, avoid market orders, avoid options in v1, avoid penny stocks under $2, and paper trade for at least 30 days before considering real money.

Manual review is required. Skip any setup with low confidence, no clear catalyst, wide spread/liquidity concerns, unclear invalidation, or market conditions you do not understand.
