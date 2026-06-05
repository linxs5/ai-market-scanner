import type { Candle, Quote } from "@/lib/shared/types";
import { env } from "./env";

type PolygonSnapshot = {
  ticker?: {
    lastTrade?: { p?: number; t?: number };
    todaysChangePerc?: number;
    day?: { h?: number; l?: number; o?: number; c?: number; v?: number };
    prevDay?: { c?: number };
  };
};

type PolygonAggregatesResponse = {
  results?: Array<{
    t?: number;
    o?: number;
    h?: number;
    l?: number;
    c?: number;
    v?: number;
  }>;
};

function timeframeToPolygon(timeframe: string) {
  const normalized = timeframe.toLowerCase();
  if (normalized.endsWith("m")) return { multiplier: normalized.replace("m", ""), timespan: "minute" };
  if (normalized.endsWith("h")) return { multiplier: normalized.replace("h", ""), timespan: "hour" };
  if (normalized.endsWith("d")) return { multiplier: normalized.replace("d", ""), timespan: "day" };
  return { multiplier: "15", timespan: "minute" };
}

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

export async function fetchPolygonCandles(ticker: string, timeframe: string): Promise<Candle[]> {
  if (!env.polygonKey) return [];

  const { multiplier, timespan } = timeframeToPolygon(timeframe);
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - (timespan === "day" ? 180 : 14));
  const date = (value: Date) => value.toISOString().slice(0, 10);
  const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${multiplier}/${timespan}/${date(from)}/${date(
    to
  )}?adjusted=true&sort=asc&limit=5000&apiKey=${env.polygonKey}`;
  const response = await fetch(url);
  if (!response.ok) return [];

  const raw = (await response.json()) as PolygonAggregatesResponse;
  return (raw.results ?? [])
    .map((item) => ({
      timestamp: Math.floor(Number(item.t ?? 0) / 1000),
      open: Number(item.o),
      high: Number(item.h),
      low: Number(item.l),
      close: Number(item.c),
      volume: Number(item.v ?? 0)
    }))
    .filter((item) => [item.timestamp, item.open, item.high, item.low, item.close].every(Number.isFinite));
}
