import type { Handler } from "@netlify/functions";
import { z } from "zod";
import { sendAlert } from "../../lib/server/alerts";
import { errorResponse, jsonResponse } from "../../lib/server/http";

const requestSchema = z.object({
  title: z.string().min(1).max(120),
  message: z.string().min(1).max(2000),
  severity: z.enum(["low", "medium", "high"]).optional(),
  alertType: z
    .enum(["high score opportunity", "risk warning", "morning brief", "midday update", "closing report", "polymarket mover", "stock mover", "test"])
    .optional(),
  channels: z.array(z.enum(["sms", "telegram", "email"])).optional()
});

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse({});
  if (event.httpMethod !== "POST") return errorResponse("Method not allowed.", 405);

  const parsed = requestSchema.safeParse(JSON.parse(event.body || "{}"));
  if (!parsed.success) return errorResponse("Invalid alert payload.", 400, parsed.error.flatten());

  return jsonResponse(await sendAlert(parsed.data));
};
