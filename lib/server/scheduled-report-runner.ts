import type { DailyReportType, OpportunityEngineResponse } from "@/lib/shared/types";
import { sendAlert } from "./alerts";
import { buildDailyReport, formatDailyTelegram, saveDailyReport, telegramStatusFromAlert } from "./daily-reports";
import { env } from "./env";
import { runOpportunityEngine } from "./opportunity-engine";

export async function runScheduledDailyReport(reportType: DailyReportType) {
  const errors: string[] = [];
  let engine: OpportunityEngineResponse;
  try {
    engine = await runOpportunityEngine();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Opportunity engine failed before scheduled report could be built.";
    errors.push(message);
    engine = {
      generatedAt: new Date().toISOString(),
      disclaimer: "Research only. Scheduled report generated from error fallback.",
      opportunities: [],
      stockScan: null,
      polymarketScan: {
        generatedAt: new Date().toISOString(),
        disclaimer: "Polymarket scan unavailable.",
        opportunities: [],
        skipped: [],
        smartMoney: {
          generatedAt: new Date().toISOString(),
          source: "unavailable",
          traders: [],
          repeatedThemes: [],
          warnings: [message]
        },
        warnings: [message]
      },
      crossMarketInsights: [],
      reports: [],
      macroRiskToday: [],
      earningsWatch: [],
      warnings: [message]
    };
  }
  let report = buildDailyReport(reportType, engine);
  let alert = null;

  try {
    if (env.telegramBotToken && env.telegramChatId) {
      alert = await sendAlert({
        title: report.title,
        message: formatDailyTelegram(report),
        severity: "medium",
        alertType: reportType === "morning" ? "morning brief" : reportType === "midday" ? "midday update" : "closing report",
        channels: ["telegram"]
      });
      report = {
        ...report,
        telegram: telegramStatusFromAlert(alert)
      };
    } else {
      report = {
        ...report,
        telegram: {
          attempted: false,
          sent: false,
          deliveredChannels: [],
          warnings: ["Telegram env vars are not configured."],
          error: null,
          attemptedAt: null
        }
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram delivery failed.";
    errors.push(message);
    report = {
      ...report,
      telegram: telegramStatusFromAlert(alert, message)
    };
  }

  try {
    report = await saveDailyReport({
      ...report,
      errors: [...report.errors, ...errors]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scheduled report persistence failed.";
    errors.push(message);
    console.error(message);
  }

  console.log(
    JSON.stringify({
      reportType,
      reportId: report.id,
      savedAt: report.timestamp,
      telegramSent: report.telegram.sent,
      telegramWarnings: report.telegram.warnings,
      errors
    })
  );

  return { report, alert, errors };
}
