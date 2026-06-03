import type { DailyReportType, OpportunityEngineResponse } from "@/lib/shared/types";
import { sendAlert } from "./alerts";
import { buildDailyReport, formatDailyTelegram, saveDailyReport, saveScheduleDiagnostics, telegramStatusFromAlert } from "./daily-reports";
import { env } from "./env";
import { runOpportunityEngine } from "./opportunity-engine";

export async function runScheduledDailyReport(reportType: DailyReportType) {
  const errors: string[] = [];
  const runStartedAt = new Date().toISOString();
  console.log(`[scheduled:${reportType}] starting opportunity engine`);
  await saveScheduleDiagnostics({ lastScheduledRun: runStartedAt, lastError: null }).catch(() => null);
  let engine: OpportunityEngineResponse;
  try {
    engine = await runOpportunityEngine();
    console.log(`[scheduled:${reportType}] opportunity engine completed`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Opportunity engine failed before scheduled report could be built.";
    errors.push(message);
    console.error(`[scheduled:${reportType}] ${message}`);
    await saveScheduleDiagnostics({ lastScheduledRun: runStartedAt, lastError: message }).catch(() => null);
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
      console.log(`[scheduled:${reportType}] attempting Telegram`);
      await saveScheduleDiagnostics({ lastTelegramAttempt: new Date().toISOString() }).catch(() => null);
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
      console.log(`[scheduled:${reportType}] Telegram sent=${alert.sent}`);
    } else {
      console.log(`[scheduled:${reportType}] Telegram skipped: env vars missing`);
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
    console.error(`[scheduled:${reportType}] ${message}`);
    await saveScheduleDiagnostics({ lastTelegramAttempt: new Date().toISOString(), lastError: message }).catch(() => null);
    report = {
      ...report,
      telegram: telegramStatusFromAlert(alert, message)
    };
  }

  try {
    console.log(`[scheduled:${reportType}] saving report`);
    await saveScheduleDiagnostics({ lastReportSaveAttempt: new Date().toISOString() }).catch(() => null);
    report = await saveDailyReport({
      ...report,
      errors: [...report.errors, ...errors]
    });
    console.log(`[scheduled:${reportType}] report saved ${report.id}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scheduled report persistence failed.";
    errors.push(message);
    console.error(message);
    await saveScheduleDiagnostics({ lastReportSaveAttempt: new Date().toISOString(), lastError: message }).catch(() => null);
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
