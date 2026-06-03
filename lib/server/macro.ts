import type { EarningsWatchItem, MacroRiskEvent } from "@/lib/shared/types";
import { WATCHLIST } from "@/lib/shared/watchlist";

export function getMacroRiskToday(): MacroRiskEvent[] {
  return [
    {
      category: "CPI",
      whyItMatters: "Inflation surprises can move SPY, QQQ, rates-sensitive tech, and Fed-related prediction markets.",
      monitor: "Add a future economic-calendar provider for exact CPI dates and consensus estimates."
    },
    {
      category: "FOMC",
      whyItMatters: "Fed decision days can change market regime and make ordinary technical setups less reliable.",
      monitor: "Watch Fed statement language, press conference tone, and rate-cut odds."
    },
    {
      category: "major earnings weeks",
      whyItMatters: "Large-cap earnings can spill into sector ETFs and related Polymarket tech/AI narratives.",
      monitor: "Add a future earnings calendar provider for exact ticker-level dates."
    }
  ];
}

export async function getEarningsWatch(): Promise<EarningsWatchItem[]> {
  return WATCHLIST.map((ticker) => ({
    ticker,
    status: "provider-needed",
    note: "Earnings awareness placeholder. Finnhub earnings calendar support can be wired when an enabled key/plan confirms access."
  }));
}
