import type { NewsItem, Quote } from "@/lib/shared/types";
import { fetchFinnhubNews, fetchFinnhubQuote } from "./finnhub";
import { fetchPolygonQuote } from "./polygon";

export async function fetchQuote(ticker: string): Promise<Quote | null> {
  const polygonQuote = await fetchPolygonQuote(ticker);
  if (polygonQuote) {
    return polygonQuote;
  }

  return fetchFinnhubQuote(ticker);
}

export async function fetchNews(ticker: string): Promise<NewsItem[]> {
  return fetchFinnhubNews(ticker);
}
