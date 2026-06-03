import type { Quote } from "@/lib/shared/types";
import { env } from "./env";

type PolygonSnapshot = {
  ticker?: {
    lastTrade?: { p?: number; t?: number };
    todaysChangePerc?: number;
    day?: { h?: number; l?: number; o?: number; c?: number; v?: number };
    prevDay?: { c?: number };
  };
};

export async function fetchPolygonQuote(ticker: string): Promise<Quote | null> {
  if (!env.polygonKey) {
    return null;
  }

  const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(
    ticker
  )}?apiKey=${env.polygonKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    return null;
  }

  const raw = (await response.json()) as PolygonSnapshot;
  const last = Number(raw.ticker?.lastTrade?.p ?? raw.ticker?.day?.c);
  const previousClose = Number(raw.ticker?.prevDay?.c);

  if (!Number.isFinite(last) || !Number.isFinite(previousClose) || last <= 0 || previousClose <= 0) {
    return null;
  }

  return {
    ticker,
    price: last,
    previousClose,
    changePercent:
      Number(raw.ticker?.todaysChangePerc) || ((last - previousClose) / previousClose) * 100,
    high: Number(raw.ticker?.day?.h) || last,
    low: Number(raw.ticker?.day?.l) || last,
    open: Number(raw.ticker?.day?.o) || previousClose,
    timestamp: Number(raw.ticker?.lastTrade?.t)
      ? Math.floor(Number(raw.ticker?.lastTrade?.t) / 1_000_000_000)
      : Math.floor(Date.now() / 1000),
    source: "polygon"
  };
}
