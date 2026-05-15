import twilio from "twilio";

let verifyClient: ReturnType<typeof twilio> | null = null;

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getVerifyClient() {
  if (verifyClient) {
    return verifyClient;
  }

  verifyClient = twilio(
    getRequiredEnv("TWILIO_ACCOUNT_SID"),
    getRequiredEnv("TWILIO_AUTH_TOKEN"),
  );

  return verifyClient;
}

function getVerifyServiceSid() {
  return getRequiredEnv("TWILIO_VERIFY_SERVICE_SID");
}

export async function startSmsVerification(phone: string) {
  const client = getVerifyClient();

  return client.verify.v2.services(getVerifyServiceSid()).verifications.create({
    to: phone,
    channel: "sms",
  });
}

export async function checkSmsVerification(phone: string, code: string) {
  const client = getVerifyClient();

  return client.verify.v2
    .services(getVerifyServiceSid())
    .verificationChecks.create({
      to: phone,
      code,
    });
}
