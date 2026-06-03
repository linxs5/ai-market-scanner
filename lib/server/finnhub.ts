import type { NewsItem, Quote } from "@/lib/shared/types";
import { env } from "./env";

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

type FinnhubQuote = {
  c?: number;
  d?: number;
  dp?: number;
  h?: number;
  l?: number;
  o?: number;
  pc?: number;
  t?: number;
};

type FinnhubNews = {
  id?: number;
  headline?: string;
  summary?: string;
  url?: string;
  source?: string;
  datetime?: number;
};

async function finnhubFetch<T>(path: string): Promise<T> {
  if (!env.finnhubKey) {
    throw new Error("FINNHUB_API_KEY is required for market scans.");
  }

  const joiner = path.includes("?") ? "&" : "?";
  const response = await fetch(`${FINNHUB_BASE_URL}${path}${joiner}token=${env.finnhubKey}`, {
    headers: { "Content-Type": "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Finnhub request failed (${response.status}) for ${path}`);
  }

  return (await response.json()) as T;
}

export async function fetchFinnhubQuote(ticker: string): Promise<Quote | null> {
  const raw = await finnhubFetch<FinnhubQuote>(`/quote?symbol=${encodeURIComponent(ticker)}`);
  const price = Number(raw.c);
  const previousClose = Number(raw.pc);

  if (!Number.isFinite(price) || !Number.isFinite(previousClose) || price <= 0 || previousClose <= 0) {
    return null;
  }

  const changePercent = Number.isFinite(raw.dp)
    ? Number(raw.dp)
    : ((price - previousClose) / previousClose) * 100;

  return {
    ticker,
    price,
    previousClose,
    changePercent,
    high: Number(raw.h) || price,
    low: Number(raw.l) || price,
    open: Number(raw.o) || previousClose,
    timestamp: Number(raw.t) || Math.floor(Date.now() / 1000),
    source: "finnhub"
  };
}

export async function fetchFinnhubNews(ticker: string): Promise<NewsItem[]> {
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - 7);

  const formatDate = (date: Date) => date.toISOString().slice(0, 10);
  const raw = await finnhubFetch<FinnhubNews[]>(
    `/company-news?symbol=${encodeURIComponent(ticker)}&from=${formatDate(from)}&to=${formatDate(to)}`
  );

  return raw
    .filter((item) => item.headline && item.url)
    .slice(0, 5)
    .map((item) => ({
      id: String(item.id ?? `${ticker}-${item.datetime ?? item.url}`),
      ticker,
      headline: item.headline ?? "Untitled catalyst",
      summary: item.summary ?? "",
      url: item.url ?? "",
      source: item.source ?? "Finnhub",
      publishedAt: item.datetime
        ? new Date(item.datetime * 1000).toISOString()
        : new Date().toISOString()
    }));
}
