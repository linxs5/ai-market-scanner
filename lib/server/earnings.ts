import type { Confidence } from "@/lib/shared/types";
import { fetchFinnhubEarningsCalendar } from "./finnhub";

export type EarningsSignal = {
  ticker: string;
  reportingToday: boolean;
  reportingSoon: boolean;
  reportDate: string | null;
  hour: string | null;
  epsActual: number | null;
  epsEstimate: number | null;
  epsSurprisePercent: number | null;
  confidence: Confidence;
  badge: "EARNINGS TODAY" | "EARNINGS SOON" | null;
  explanation: string;
  warning: string | null;
};

function isoDateDaysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function toFiniteNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function surprise(actual: number | null, estimate: number | null) {
  if (actual === null || estimate === null || estimate === 0) return null;
  return Math.round(((actual - estimate) / Math.abs(estimate)) * 1000) / 10;
}

function emptySignal(ticker: string): EarningsSignal {
  return {
    ticker,
    reportingToday: false,
    reportingSoon: false,
    reportDate: null,
    hour: null,
    epsActual: null,
    epsEstimate: null,
    epsSurprisePercent: null,
    confidence: "medium",
    badge: null,
    explanation: "No earnings date was returned for this ticker in the current Finnhub earnings-calendar window.",
    warning: null
  };
}

export async function fetchEarningsSignals(tickers: string[]): Promise<Record<string, EarningsSignal>> {
  const uniqueTickers = [...new Set(tickers.map((ticker) => ticker.toUpperCase()))];
  const output: Record<string, EarningsSignal> = Object.fromEntries(uniqueTickers.map((ticker) => [ticker, emptySignal(ticker)]));
  const today = isoDateDaysFromNow(0);
  const soon = isoDateDaysFromNow(7);

  try {
    const calendar = await fetchFinnhubEarningsCalendar(today, soon);
    uniqueTickers.forEach((ticker) => {
      const item = calendar
        .filter((entry) => String(entry.symbol ?? "").toUpperCase() === ticker)
        .sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")))[0];
      if (!item?.date) return;

      const epsActual = toFiniteNumber(item.epsActual);
      const epsEstimate = toFiniteNumber(item.epsEstimate);
      const epsSurprisePercent = surprise(epsActual, epsEstimate);
      const reportingToday = item.date === today;
      const reportingSoon = !reportingToday && item.date > today && item.date <= soon;

      output[ticker] = {
        ticker,
        reportingToday,
        reportingSoon,
        reportDate: item.date,
        hour: item.hour ?? null,
        epsActual,
        epsEstimate,
        epsSurprisePercent,
        confidence: "high",
        badge: reportingToday ? "EARNINGS TODAY" : reportingSoon ? "EARNINGS SOON" : null,
        explanation:
          epsSurprisePercent === null
            ? `${ticker} has an earnings date returned by Finnhub for ${item.date}. EPS actual/estimate were not both available, so no surprise was calculated.`
            : `${ticker} EPS surprise is ${epsSurprisePercent}% based only on Finnhub actual versus estimate fields.`,
        warning:
          reportingToday || reportingSoon
            ? "Earnings can gap a stock before or after hours. Beginners should usually paper-watch instead of forcing a trade right before the report."
            : null
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Finnhub earnings calendar request failed.";
    uniqueTickers.forEach((ticker) => {
      output[ticker] = {
        ...emptySignal(ticker),
        confidence: "low",
        explanation: "Earnings calendar was unavailable on this scan, so no earnings signal was assumed.",
        warning: message
      };
    });
  }

  return output;
}
