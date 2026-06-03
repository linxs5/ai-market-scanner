export const env = {
  openAiKey: process.env.OPENAI_API_KEY,
  finnhubKey: process.env.FINNHUB_API_KEY,
  polygonKey: process.env.POLYGON_API_KEY,
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER,
  userPhoneNumber: process.env.USER_PHONE_NUMBER
};

export function getSetupCheck() {
  const configured = {
    OPENAI_API_KEY: Boolean(env.openAiKey),
    FINNHUB_API_KEY: Boolean(env.finnhubKey),
    POLYGON_API_KEY: Boolean(env.polygonKey),
    TWILIO_ACCOUNT_SID: Boolean(env.twilioAccountSid),
    TWILIO_AUTH_TOKEN: Boolean(env.twilioAuthToken),
    TWILIO_FROM_NUMBER: Boolean(env.twilioFromNumber),
    USER_PHONE_NUMBER: Boolean(env.userPhoneNumber)
  };

  return {
    configured,
    requiredMissing: Object.entries(configured)
      .filter(([key, value]) => !value && ["OPENAI_API_KEY", "FINNHUB_API_KEY"].includes(key))
      .map(([key]) => key),
    optionalMissing: Object.entries(configured)
      .filter(([key, value]) => !value && !["OPENAI_API_KEY", "FINNHUB_API_KEY"].includes(key))
      .map(([key]) => key)
  };
}
