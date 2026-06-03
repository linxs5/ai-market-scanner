import type { Handler } from "@netlify/functions";
import { jsonResponse } from "../../lib/server/http";
import { runPolymarketScan } from "../../lib/server/polymarket";

export const config = {
  schedule: "30 12,16,19 * * 1-5"
};

export const handler: Handler = async () => {
  return jsonResponse(await runPolymarketScan());
};
