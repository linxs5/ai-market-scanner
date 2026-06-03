import type { AlertChannel, AlertRequest, AlertResponse } from "@/lib/shared/types";
import { env } from "./env";

function channelConfig(): Record<AlertChannel, boolean> {
  return {
    sms: Boolean(env.twilioAccountSid && env.twilioAuthToken && env.twilioFromNumber && env.userPhoneNumber),
    telegram: Boolean(env.telegramBotToken && env.telegramChatId),
    email: Boolean(env.resendApiKey && env.alertEmailTo && env.alertEmailFrom)
  };
}

async function sendTelegram(message: string) {
  const response = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.telegramChatId, text: message })
  });
  if (!response.ok) throw new Error(`Telegram alert failed (${response.status}).`);
}

async function sendResendEmail(title: string, message: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.resendApiKey}`
    },
    body: JSON.stringify({
      from: env.alertEmailFrom,
      to: [env.alertEmailTo],
      subject: title,
      text: message
    })
  });
  if (!response.ok) throw new Error(`Email alert failed (${response.status}).`);
}

async function sendTwilioSms(message: string) {
  const credentials = Buffer.from(`${env.twilioAccountSid}:${env.twilioAuthToken}`).toString("base64");
  const body = new URLSearchParams({
    To: env.userPhoneNumber ?? "",
    From: env.twilioFromNumber ?? "",
    Body: message
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.twilioAccountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  if (!response.ok) throw new Error(`SMS alert failed (${response.status}).`);
}

export async function sendAlert(request: AlertRequest): Promise<AlertResponse> {
  const configuredChannels = channelConfig();
  const requestedChannels = request.channels?.length ? request.channels : (["telegram", "email", "sms"] satisfies AlertChannel[]);
  const attemptedChannels = requestedChannels.filter((channel) => configuredChannels[channel]);
  const deliveredChannels: AlertChannel[] = [];
  const warnings: string[] = [];
  const typeLabel = request.alertType ? ` · ${request.alertType}` : "";
  const message = `[${request.severity ?? "medium"}${typeLabel}] ${request.title}\n\n${request.message}\n\nResearch only. No auto-trading. Manual review required.`;

  for (const channel of requestedChannels) {
    if (!configuredChannels[channel]) {
      warnings.push(`${channel} not configured; skipped.`);
      continue;
    }

    try {
      if (channel === "telegram") await sendTelegram(message);
      if (channel === "email") await sendResendEmail(request.title, message);
      if (channel === "sms") await sendTwilioSms(message);
      deliveredChannels.push(channel);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `${channel} alert failed.`);
    }
  }

  return {
    sent: deliveredChannels.length > 0,
    configuredChannels,
    attemptedChannels,
    deliveredChannels,
    warnings
  };
}
