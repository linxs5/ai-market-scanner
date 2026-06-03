import type { Handler } from "@netlify/functions";
import { sendAlert } from "../../lib/server/alerts";
import { jsonResponse } from "../../lib/server/http";
import { runOpportunityEngine } from "../../lib/server/opportunity-engine";

export const config = {
  schedule: "30 12 * * 1-5"
};

export const handler: Handler = async () => {
  const engine = await runOpportunityEngine();
  const report = engine.reports.find((item) => item.title === "Morning Brief") ?? engine.reports[0];
  const alert = await sendAlert({
    title: "Morning Brief",
    message: [
      report.biggestRiskToday,
      ...report.paperTradeIdeasOnly.slice(0, 5),
      "Research only. Manual review required."
    ].join("\n"),
    severity: "medium",
    alertType: "morning brief",
    channels: ["telegram"]
  });
  return jsonResponse({ report, alert });
};
