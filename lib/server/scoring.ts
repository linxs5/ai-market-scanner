import type { NewsItem, Quote, RiskLevel, ScoreBreakdown, ScoredSetupInput } from "@/lib/shared/types";

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function headlineHasCatalyst(news: NewsItem[]) {
  const catalystWords = [
    "earnings",
    "guidance",
    "upgrade",
    "downgrade",
    "deal",
    "contract",
    "launch",
    "approval",
    "partnership",
    "forecast",
    "revenue",
    "profit",
    "acquisition",
    "sec",
    "investigation"
  ];

  return news.some((item) => {
    const text = `${item.headline} ${item.summary}`.toLowerCase();
    return catalystWords.some((word) => text.includes(word));
  });
}

export function scoreTicker(ticker: string, quote: Quote, news: NewsItem[]): ScoredSetupInput {
  const dayRangePercent = quote.price > 0 ? ((quote.high - quote.low) / quote.price) * 100 : 0;
  const absoluteMove = Math.abs(quote.changePercent);
  const hasCatalyst = headlineHasCatalyst(news);

  /*
   * Score formula:
   * - Momentum (30%): rewards directional movement while capping extreme moves.
   * - Relative volatility/volume proxy (25%): uses intraday range because Finnhub free quotes do not include volume.
   * - News catalyst (25%): rewards recent relevant headlines and stronger catalyst words.
   * - Risk/reward quality (20%): favors tradable $2+ symbols with movement that is not wildly extended.
   */
  const momentum = clamp((absoluteMove / 5) * 100);
  const volatility = clamp((dayRangePercent / 4) * 100);
  const catalyst = clamp(news.length * 14 + (hasCatalyst ? 30 : 0));
  const tooExtendedPenalty = absoluteMove > 8 ? 35 : absoluteMove > 5 ? 18 : 0;
  const pennyPenalty = quote.price < 2 ? 100 : 0;
  const riskReward = clamp(80 - tooExtendedPenalty - pennyPenalty + Math.min(dayRangePercent * 3, 15));

  const breakdown: ScoreBreakdown = {
    momentum: round(momentum),
    volatility: round(volatility),
    catalyst: round(catalyst),
    riskReward: round(riskReward)
  };

  const score = round(
    breakdown.momentum * 0.3 +
      breakdown.volatility * 0.25 +
      breakdown.catalyst * 0.25 +
      breakdown.riskReward * 0.2
  );

  const warnings: string[] = [];
  if (quote.price < 2) warnings.push("Excluded: v1 does not support penny stocks under $2.");
  if (!news.length) warnings.push("No recent company catalyst found.");
  if (dayRangePercent > 8) warnings.push("Large intraday range: liquidity/spread check is required.");
  if (absoluteMove > 10) warnings.push("Move may be extended; beginner accounts should be extra cautious.");
  if (score < 55) warnings.push("Weak multi-factor score. Research setup should likely be skipped.");

  let riskLevel: RiskLevel = "low";
  if (dayRangePercent > 6 || absoluteMove > 7 || !news.length) riskLevel = "high";
  else if (dayRangePercent > 3 || absoluteMove > 4) riskLevel = "medium";

  return { ticker, quote, news, score, breakdown, riskLevel, warnings };
}
