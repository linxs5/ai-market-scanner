import type { Handler } from "@netlify/functions";
import { sendAlert } from "../../lib/server/alerts";
import { jsonResponse } from "../../lib/server/http";
import { runOpportunityEngine } from "../../lib/server/opportunity-engine";

export const config = {
  schedule: "30 16 * * 1-5"
};

export const handler: Handler = async () => {
  const engine = await runOpportunityEngine();
  const report = engine.reports.find((item) => item.title === "Midday Update") ?? engine.reports[1];
  const alert = await sendAlert({
    title: "Midday Update",
    message: [report.biggestRiskToday, ...report.monitorNext, "Research only. Manual review required."].join("\n"),
    severity: "medium",
    alertType: "midday update",
    channels: ["telegram"]
  });
  return jsonResponse({ report, alert });
};
