import type { CrossMarketInsight, PolymarketScanResponse, ScanResponse } from "@/lib/shared/types";

const themeMap = [
  { theme: "AI / semiconductors", tickers: ["NVDA", "AMD", "SMCI", "MSFT", "GOOG"], words: ["ai", "nvidia", "chip", "semiconductor"] },
  { theme: "Crypto", tickers: ["MSTR", "COIN", "HOOD", "TSLA"], words: ["bitcoin", "crypto", "ethereum", "kraken"] },
  { theme: "Rates / macro", tickers: ["SPY", "QQQ"], words: ["fed", "inflation", "cpi", "rate"] },
  { theme: "Politics / election", tickers: ["SPY", "QQQ"], words: ["election", "president", "senate", "congress"] }
];

export function buildCrossMarketInsights(stockScan: ScanResponse | null, polyScan: PolymarketScanResponse | null): CrossMarketInsight[] {
  const insights: Array<CrossMarketInsight | null> = themeMap.map((theme, index) => {
      const stockMatches =
        stockScan?.setups.filter((setup) =>
          theme.tickers.includes(setup.ticker) || theme.words.some((word) => setup.ai.catalyst.toLowerCase().includes(word))
        ) ?? [];
      const polyMatches =
        polyScan?.opportunities.filter((market) =>
          theme.words.some((word) => `${market.question} ${market.description}`.toLowerCase().includes(word))
        ) ?? [];

      if (!stockMatches.length && !polyMatches.length) return null;

      return {
        id: `cross-${index}`,
        title: theme.theme,
        hypothesis:
          "Hypothesis: related public narratives may be moving both listed securities and prediction-market odds. Treat this as a research lead, not a trade instruction.",
        stockSignals: stockMatches.map((setup) => `${setup.ticker}: score ${setup.score}, ${setup.ai.catalyst}`).slice(0, 3),
        polymarketSignals: polyMatches.map((market) => `${market.question}: score ${market.score}, ${market.currentConsensus}`).slice(0, 3),
        relatedTickers: [...new Set(stockMatches.map((setup) => setup.ticker))],
        relatedMarkets: polyMatches.map((market) => market.question).slice(0, 3),
        confidence: stockMatches.length && polyMatches.length ? "medium" : "low",
        risk: "Correlation can be false. A headline can move odds without moving stocks, or move stocks without changing market resolution odds.",
        followUp: "Check the primary news source, stock volume, Polymarket spread, and resolution criteria before logging any paper idea."
      } satisfies CrossMarketInsight;
    });

  return insights.filter((item): item is CrossMarketInsight => item !== null);
}
