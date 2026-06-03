import type { ScanResponse, ScoredSetupInput } from "@/lib/shared/types";
import { WATCHLIST } from "@/lib/shared/watchlist";
import { generateAiReports } from "./ai-report";
import { fetchNews, fetchQuote } from "./market-data";
import { detectMarketRegime } from "./regime";
import { scoreTicker } from "./scoring";

export async function runMarketScan(): Promise<ScanResponse> {
  const warnings: string[] = [];
  const scored: ScoredSetupInput[] = [];
  const newsByTicker: Record<string, Awaited<ReturnType<typeof fetchNews>>> = {};

  await Promise.all(
    WATCHLIST.map(async (ticker) => {
      try {
        const [quote, news] = await Promise.all([fetchQuote(ticker), fetchNews(ticker)]);
        newsByTicker[ticker] = news;

        if (!quote) {
          warnings.push(`${ticker}: no valid quote returned by data provider.`);
          return;
        }

        scored.push(scoreTicker(ticker, quote, news));
      } catch (error) {
        warnings.push(`${ticker}: ${error instanceof Error ? error.message : "data fetch failed"}`);
      }
    })
  );

  const quotes = scored.map((setup) => setup.quote);
  const regime = detectMarketRegime(quotes, newsByTicker);
  const eligible = scored
    .filter((setup) => setup.score >= 55 && setup.quote.price >= 2 && setup.news.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  const skipped = scored.filter((setup) => !eligible.includes(setup)).sort((a, b) => b.score - a.score);
  const aiReports = await generateAiReports(eligible, regime);

  return {
    generatedAt: new Date().toISOString(),
    disclaimer:
      "Research only, not financial advice. This app does not place trades. All ideas are manual-review paper-trade research setups.",
    regime,
    setups: eligible.map((setup, index) => ({
      ...setup,
      regime,
      ai: aiReports[index]
    })),
    skipped,
    warnings
  };
}
