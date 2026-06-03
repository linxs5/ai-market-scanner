import type { Handler } from "@netlify/functions";
import { z } from "zod";
import { connectBlobs, getBlobStore } from "../../lib/server/blob-storage";
import { errorResponse, jsonResponse } from "../../lib/server/http";

const TRADE_STORE_KEY = "paper-trades";

const tradeSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  ticker: z.string(),
  marketType: z.enum(["stock", "polymarket"]),
  createdAt: z.string(),
  status: z.enum(["open", "win", "loss", "breakeven", "skipped"]),
  score: z.number(),
  confidence: z.string(),
  catalystType: z.string(),
  entryZone: z.string(),
  stopLoss: z.string(),
  target: z.string(),
  riskLevel: z.string(),
  holdingPeriod: z.string(),
  finalResult: z.string(),
  failureReason: z.string(),
  notes: z.string()
});

const bodySchema = z.object({
  trades: z.array(tradeSchema).max(500)
});

function paperTradeStore() {
  return getBlobStore("market-intelligence-paper-trades");
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse({});
  if (!["GET", "POST"].includes(event.httpMethod)) return errorResponse("Method not allowed.", 405);
  connectBlobs(event);

  try {
    const store = paperTradeStore();

    if (event.httpMethod === "GET") {
      const trades = (await store.get(TRADE_STORE_KEY, { type: "json" })) ?? [];
      return jsonResponse({ available: true, trades });
    }

    const parsed = bodySchema.safeParse(JSON.parse(event.body || "{}"));
    if (!parsed.success) return errorResponse("Invalid paper trade payload.", 400, parsed.error.flatten());

    await store.setJSON(TRADE_STORE_KEY, parsed.data.trades);
    return jsonResponse({ available: true, trades: parsed.data.trades });
  } catch (error) {
    return jsonResponse({
      available: false,
      trades: [],
      warning: error instanceof Error ? error.message : "Netlify Blob storage is unavailable."
    });
  }
};
