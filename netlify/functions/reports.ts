import type { Handler } from "@netlify/functions";
import { z } from "zod";
import type { DailyReportType, SavedDailyReport } from "../../lib/shared/types";
import { buildDailyReport, clearSavedReports, loadSavedReports, saveDailyReport } from "../../lib/server/daily-reports";
import { errorResponse, jsonResponse } from "../../lib/server/http";
import { runOpportunityEngine } from "../../lib/server/opportunity-engine";

const reportTypeSchema = z.enum(["morning", "midday", "closing"]);

const postSchema = z.object({
  reportType: reportTypeSchema.default("morning"),
  report: z.custom<SavedDailyReport>().optional()
});

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse({});

  if (event.httpMethod === "GET") {
    const limit = Number(event.queryStringParameters?.limit ?? 20);
    return jsonResponse(await loadSavedReports(Number.isFinite(limit) ? limit : 20));
  }

  if (event.httpMethod === "DELETE") {
    try {
      await clearSavedReports();
      return jsonResponse(await loadSavedReports());
    } catch (error) {
      return errorResponse("Saved reports clear failed.", 500, error instanceof Error ? error.message : error);
    }
  }

  if (event.httpMethod === "POST") {
    try {
      const parsed = postSchema.safeParse(JSON.parse(event.body || "{}"));
      if (!parsed.success) return errorResponse("Invalid report payload.", 400, parsed.error.flatten());

      const report =
        parsed.data.report ??
        buildDailyReport(parsed.data.reportType as DailyReportType, await runOpportunityEngine(), {
          attempted: false,
          sent: false,
          warnings: ["Manual save. Telegram was not attempted by this endpoint."]
        });

      return jsonResponse({ report: await saveDailyReport(report), saved: true });
    } catch (error) {
      return errorResponse("Report save failed.", 500, error instanceof Error ? error.message : error);
    }
  }

  return errorResponse("Method not allowed.", 405);
};
