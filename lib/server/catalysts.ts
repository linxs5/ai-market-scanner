import type { CatalystProfile, CatalystType, NewsItem, PolymarketOpportunity } from "@/lib/shared/types";

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

export function classifyStockCatalyst(news: NewsItem[], fallbackText: string): CatalystProfile {
  const text = `${fallbackText} ${news.map((item) => `${item.headline} ${item.summary}`).join(" ")}`.toLowerCase();
  let type: CatalystType = "unknown";

  if (includesAny(text, ["earnings", "eps", "revenue", "guidance"])) type = "earnings";
  else if (includesAny(text, ["upgrade", "downgrade", "price target", "analyst"])) type = "analyst";
  else if (includesAny(text, ["sec", "10-k", "10-q", "8-k", "filing"])) type = "SEC filing";
  else if (includesAny(text, ["fed", "cpi", "ppi", "jobs", "gdp", "inflation", "rates"])) type = "macro";
  else if (includesAny(text, ["ai", "nvidia", "chip", "semiconductor", "cloud"])) type = "AI/tech";
  else if (includesAny(text, ["bitcoin", "crypto", "ethereum", "coinbase", "microstrategy"])) type = "crypto-linked";
  else if (includesAny(text, ["lawsuit", "court", "regulatory", "probe", "investigation", "approval"])) type = "legal/regulatory";
  else if (news.length > 0) type = "product/news";

  const sourceQuality = news.length >= 3 ? "high" : news.length >= 1 ? "medium" : "low";
  return {
    type,
    sourceQuality,
    whyItMatters:
      type === "unknown"
        ? "The setup is mostly price-action driven because no clear catalyst category was detected."
        : `${type} catalysts can change expectations quickly and should be checked against the original source.`,
    whatWouldMoveTheMarket: [
      "A fresh headline that confirms or contradicts the setup.",
      "Unusual volume that matches the direction of the thesis.",
      "Broad-market regime change that overwhelms the individual catalyst."
    ],
    invalidation: "Invalidated if the headline is stale, the move fades below the planned level, or the market regime turns against the setup."
  };
}

export function classifyPolymarketCatalyst(market: PolymarketOpportunity): CatalystProfile {
  const text = `${market.question} ${market.description} ${market.category}`.toLowerCase();
  let type: CatalystType = "unknown";

  if (includesAny(text, ["election", "president", "senate", "congress", "minister"])) type = "politics";
  else if (includesAny(text, ["fed", "inflation", "cpi", "ppi", "recession", "gdp", "jobs"])) type = "economics";
  else if (includesAny(text, ["bitcoin", "crypto", "ethereum", "solana", "kraken"])) type = "crypto";
  else if (includesAny(text, ["nba", "nfl", "mlb", "nhl", "soccer", "match", "game"])) type = "sports";
  else if (includesAny(text, ["ai", "tech", "nvidia", "apple", "google", "openai"])) type = "tech";
  else if (includesAny(text, ["hurricane", "weather", "temperature", "storm"])) type = "weather";
  else if (includesAny(text, ["movie", "music", "celebrity", "award", "culture"])) type = "culture";
  else if (includesAny(text, ["ipo", "stock", "earnings", "finance", "company"])) type = "finance";
  else if (includesAny(text, ["war", "ceasefire", "country", "china", "russia", "ukraine", "israel"])) type = "geopolitical";

  const sourceQuality = market.resolutionSource.includes("Not listed") ? "low" : market.riskFlags.ambiguousWording ? "medium" : "high";
  return {
    type,
    sourceQuality,
    whyItMatters:
      type === "unknown"
        ? "The market topic is not clearly classified, which lowers confidence until the user reviews the rules."
        : `${type} markets can reprice quickly around public news, official statements, and resolution-source updates.`,
    whatWouldMoveTheMarket: market.whatWouldMoveIt,
    invalidation: market.invalidation
  };
}
