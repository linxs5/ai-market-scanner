import type { Handler } from "@netlify/functions";
import { z } from "zod";
import { errorResponse, jsonResponse } from "../../lib/server/http";
import { runPriceActionAnalyzer } from "../../lib/server/price-action-analyzer";

const requestSchema = z.object({
  ticker: z.string().min(1).max(10).default("QQQ"),
  timeframe: z.enum(["5m", "15m", "1h", "4h", "1d"]).default("15m")
});

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse({});
  if (!["GET", "POST"].includes(event.httpMethod)) return errorResponse("Method not allowed.", 405);

  const query = event.queryStringParameters ?? {};
  const body = event.httpMethod === "POST" ? JSON.parse(event.body || "{}") : {};
  const parsed = requestSchema.safeParse({ ...query, ...body });
  if (!parsed.success) return errorResponse("Invalid price action analyzer request.", 400, parsed.error.flatten());

  try {
    return jsonResponse(await runPriceActionAnalyzer(parsed.data.ticker, parsed.data.timeframe));
  } catch (error) {
    return errorResponse("Price action analyzer failed.", 500, error instanceof Error ? error.message : error);
  }
};
