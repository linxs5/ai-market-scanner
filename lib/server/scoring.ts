import type { NewsItem, Quote, RiskLevel, ScoreBreakdown, ScoredSetupInput } from "@/lib/shared/types";
import { DEFAULT_SCORING_CONFIG } from "./scoring-config";

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function headlineHasCatalyst(news: NewsItem[]) {
  return news.some((item) => {
    const text = `${item.headline} ${item.summary}`.toLowerCase();
    return DEFAULT_SCORING_CONFIG.stock.catalystWords.some((word) => text.includes(word));
  });
}

export function scoreTicker(ticker: string, quote: Quote, news: NewsItem[]): ScoredSetupInput {
  const dayRangePercent = quote.price > 0 ? ((quote.high - quote.low) / quote.price) * 100 : 0;
  const absoluteMove = Math.abs(quote.changePercent);
  const hasCatalyst = headlineHasCatalyst(news);
  const config = DEFAULT_SCORING_CONFIG.stock;

  const momentum = clamp((absoluteMove / config.momentumFullMovePercent) * 100);
  const volatility = clamp((dayRangePercent / config.volatilityFullDayRangePercent) * 100);
  const catalyst = clamp(news.length * config.catalystPointsPerHeadline + (hasCatalyst ? config.catalystKeywordBonus : 0));
  const tooExtendedPenalty =
    absoluteMove > config.severeExtensionMovePercent ? 35 : absoluteMove > config.moderateExtensionMovePercent ? 18 : 0;
  const pennyPenalty = quote.price < config.pennyStockPrice ? 100 : 0;
  const riskReward = clamp(
    config.baseRiskReward - tooExtendedPenalty - pennyPenalty + Math.min(dayRangePercent * 3, config.maxDayRangeRiskRewardBonus)
  );

  const breakdown: ScoreBreakdown = {
    momentum: round(momentum),
    volatility: round(volatility),
    catalyst: round(catalyst),
    riskReward: round(riskReward)
  };

  const score = round(
    breakdown.momentum * config.weights.momentum +
      breakdown.volatility * config.weights.volatility +
      breakdown.catalyst * config.weights.catalyst +
      breakdown.riskReward * config.weights.riskReward
  );

  const warnings: string[] = [];
  if (quote.price < config.pennyStockPrice) warnings.push("Excluded: v1 does not support penny stocks under $2.");
  if (!news.length) warnings.push("No recent company catalyst found.");
  if (dayRangePercent > config.wideRangeWarningPercent) warnings.push("Large intraday range: liquidity/spread check is required.");
  if (absoluteMove > config.extremeMoveWarningPercent) warnings.push("Move may be extended; beginner accounts should be extra cautious.");
  if (score < config.weakSetupScore) warnings.push("Weak multi-factor score. Research setup should likely be skipped.");

  let riskLevel: RiskLevel = "low";
  if (dayRangePercent > 6 || absoluteMove > 7 || !news.length) riskLevel = "high";
  else if (dayRangePercent > 3 || absoluteMove > 4) riskLevel = "medium";

  return { ticker, quote, news, score, breakdown, riskLevel, warnings };
}
