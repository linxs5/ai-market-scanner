import type { Handler } from "@netlify/functions";
import { errorResponse, jsonResponse } from "../../lib/server/http";
import { runPolymarketScan } from "../../lib/server/polymarket";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse({});
  if (!["GET", "POST"].includes(event.httpMethod)) return errorResponse("Method not allowed.", 405);

  try {
    return jsonResponse(await runPolymarketScan());
  } catch (error) {
    return errorResponse("Polymarket scan failed.", 500, error instanceof Error ? error.message : error);
  }
};
