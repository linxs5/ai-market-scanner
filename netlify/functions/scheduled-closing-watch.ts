import type { Handler } from "@netlify/functions";
import { sendAlert } from "../../lib/server/alerts";
import { jsonResponse } from "../../lib/server/http";
import { runOpportunityEngine } from "../../lib/server/opportunity-engine";

export const config = {
  schedule: "30 19 * * 1-5"
};

export const handler: Handler = async () => {
  const engine = await runOpportunityEngine();
  const report = engine.reports.find((item) => item.title === "Closing Watchlist") ?? engine.reports[2];
  const alert = await sendAlert({
    title: "Closing Watchlist",
    message: [report.biggestRiskToday, ...report.whatToIgnore, "Research only. Manual review required."].join("\n"),
    severity: "medium",
    alertType: "closing report",
    channels: ["telegram"]
  });
  return jsonResponse({ report, alert });
};
