import type { Handler } from "@netlify/functions";
import { buildCrossMarketInsights } from "../../lib/server/cross-market";
import { getSetupCheck } from "../../lib/server/env";
import { errorResponse, jsonResponse } from "../../lib/server/http";
import { runPolymarketScan } from "../../lib/server/polymarket";
import { runMarketScan } from "../../lib/server/scan";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse({});
  if (!["GET", "POST"].includes(event.httpMethod)) return errorResponse("Method not allowed.", 405);

  const setup = getSetupCheck();
  let stockScan = null;
  let stockError: string | null = null;
  try {
    if (!setup.requiredMissing.length) {
      stockScan = await runMarketScan();
    } else {
      stockError = `Stock scan skipped; missing ${setup.requiredMissing.join(", ")}.`;
    }
  } catch (error) {
    stockError = error instanceof Error ? error.message : "Stock scan failed.";
  }

  const polyScan = await runPolymarketScan();
  return jsonResponse({
    generatedAt: new Date().toISOString(),
    stockScan,
    stockError,
    polymarketScan: polyScan,
    insights: buildCrossMarketInsights(stockScan, polyScan)
  });
};
