import OpenAI from "openai";
import { z } from "zod";
import type { AiSetupReport, MarketRegime, ScoredSetupInput } from "@/lib/shared/types";
import { env } from "./env";

const setupSchema = z.object({
  ticker: z.string(),
  bullCase: z.string(),
  bearCase: z.string(),
  catalyst: z.string(),
  entryZone: z.string(),
  stopLoss: z.string(),
  target: z.string(),
  riskReward: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  whyToSkip: z.string(),
  invalidation: z.string(),
  checkBeforeTrading: z.array(z.string()).min(3).max(8)
});

const responseSchema = z.object({
  setups: z.array(setupSchema)
});

function fallbackReport(setup: ScoredSetupInput, regime: MarketRegime): AiSetupReport {
  const price = setup.quote.price;
  const stop = Math.max(0, price * 0.97);
  const target = price * 1.05;

  return {
    ticker: setup.ticker,
    bullCase: `${setup.ticker} has a real fetched quote with a ${setup.quote.changePercent.toFixed(
      2
    )}% move and a multi-factor score of ${setup.score}.`,
    bearCase: `The setup can fail if the move fades, the broad regime stays ${regime.label}, or the catalyst is not strong enough.`,
    catalyst: setup.news[0]?.headline ?? "No clear recent company catalyst was found.",
    entryZone: `Research-only idea near current price $${price.toFixed(2)} after confirming a limit order plan.`,
    stopLoss: `Paper stop idea near $${stop.toFixed(2)}; size so the paper risk stays between $2 and $5.`,
    target: `First paper target idea near $${target.toFixed(2)} if momentum continues.`,
    riskReward: "Estimate only. Confirm spread, liquidity, stop distance, and target before paper trading.",
    confidence: setup.score >= 75 ? "medium" : "low",
    whyToSkip: setup.warnings.length
      ? setup.warnings.join(" ")
      : "Skip if there is no clean catalyst, no clear level, or the market becomes choppy.",
    invalidation: "Invalid if price breaks the planned stop area or the catalyst is contradicted by new news.",
    checkBeforeTrading: [
      "Confirm the headline and quote are current.",
      "Check that the spread is tight enough for a small account.",
      "Use a limit order only in paper tracking.",
      "Verify max paper risk stays between $2 and $5."
    ]
  };
}

function extractJson(content: string) {
  const trimmed = content.trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1) {
    throw new Error("OpenAI response did not contain a JSON object.");
  }
  return trimmed.slice(first, last + 1);
}

export async function generateAiReports(
  setups: ScoredSetupInput[],
  regime: MarketRegime
): Promise<AiSetupReport[]> {
  if (!env.openAiKey || setups.length === 0) {
    return setups.map((setup) => fallbackReport(setup, regime));
  }

  const client = new OpenAI({ apiKey: env.openAiKey });
  const compactSetups = setups.map((setup) => ({
    ticker: setup.ticker,
    quote: setup.quote,
    score: setup.score,
    breakdown: setup.breakdown,
    riskLevel: setup.riskLevel,
    warnings: setup.warnings,
    news: setup.news.map((item) => ({
      headline: item.headline,
      summary: item.summary,
      source: item.source,
      publishedAt: item.publishedAt,
      url: item.url
    }))
  }));

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You produce beginner-friendly trading research reports as strict JSON only. Never recommend real trades, promise profit, invent data, mention options, or use buy/sell commands. Use paper-trade idea or research setup language only."
      },
      {
        role: "user",
        content: JSON.stringify({
          task:
            "For each setup, return one report. Use only the supplied fetched data. Every report needs risk, invalidation, why to skip, and a checklist.",
          requiredShape: {
            setups: [
              {
                ticker: "string",
                bullCase: "string",
                bearCase: "string",
                catalyst: "string",
                entryZone: "string",
                stopLoss: "string",
                target: "string",
                riskReward: "string",
                confidence: "low|medium|high",
                whyToSkip: "string",
                invalidation: "string",
                checkBeforeTrading: ["string"]
              }
            ]
          },
          guardrails: [
            "research only, not financial advice",
            "manual review only",
            "limit orders only",
            "max paper risk $2-$5",
            "skip if confidence is low",
            "no penny stocks under $2",
            "no market orders",
            "no guaranteed profit"
          ],
          marketRegime: regime,
          setups: compactSetups
        })
      }
    ]
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  const parsed = responseSchema.safeParse(JSON.parse(extractJson(content)));

  if (!parsed.success) {
    return setups.map((setup) => fallbackReport(setup, regime));
  }

  return setups.map((setup) => {
    const report = parsed.data.setups.find((item) => item.ticker.toUpperCase() === setup.ticker);
    return report ?? fallbackReport(setup, regime);
  });
}
