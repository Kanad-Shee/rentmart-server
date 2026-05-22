import { Resend } from "resend";

type MailRecipient = {
  email: string;
  name?: string;
};

type SendOtpEmailInput = {
  to: MailRecipient | string;
  otpCode: string;
  expiresAt: Date;
  subject?: string;
  message?: string;
};

type SendAccountEventEmailInput = {
  to: MailRecipient | string;
  subject: string;
  title: string;
  message: string;
  ctaLabel?: string;
  ctaHref?: string;
};

type SendBookingEventEmailInput = {
  to: MailRecipient | string;
  subject: string;
  title: string;
  message: string;
  equipmentTitle: string;
  startDate: string;
  endDate: string;
  statusLabel: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export enum EmailPurpose {
  OTP = "OTP",
  ACCOUNT = "ACCOUNT",
  BOOKING = "BOOKING",
}

type SendEmailInput = {
  email: string;
  title: string;
  body: string;
  purpose: EmailPurpose;
  url?: string;
  actionLabel?: string;
  footerNote?: string;
  details?: Array<{
    label: string;
    value: string;
  }>;
};

const APP_NAME = "RentMart";
const DEFAULT_FROM_NAME = "RentMart";
const DEFAULT_TEST_FROM_EMAIL = "onboarding@resend.dev";

let resend: Resend | null = null;

function getEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function getRequiredEnv(name: string) {
  const value = getEnv(name);

  if (!value) {
    throw new Error(`[resend] Missing required environment variable: ${name}`);
  }

  return value;
}

function initializeResend() {
  if (!resend) {
    resend = new Resend(getRequiredEnv("RESEND_API_KEY"));
    console.log("[resend] Client initialized successfully");
  }

  return resend;
}

function getResendClient() {
  return resend ?? initializeResend();
}

export function initializeMailer(): { status: string; initialized: boolean } {
  try {
    initializeResend();
    getFromAddress();

    return {
      status: "Resend mailer initialized successfully",
      initialized: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[resend] Failed to initialize at startup:", error);

    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }

    return {
      status: `Failed to initialize resend mailer: ${errorMessage}`,
      initialized: false,
    };
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value: Date) {
  return value.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDateRangeLabel(startDate: string, endDate: string) {
  return `${startDate} to ${endDate}`;
}

function formatOtpCode(value: string) {
  const compact = value.replace(/\s+/g, "").trim();

  if (compact.length <= 3) {
    return compact;
  }

  return `${compact.slice(0, 3)} - ${compact.slice(3)}`;
}

function getFromAddress() {
  const fromName = getEnv("RESEND_FROM_NAME") ?? DEFAULT_FROM_NAME;
  const fromEmail = getEnv("RESEND_FROM_EMAIL") ?? DEFAULT_TEST_FROM_EMAIL;
  return `${fromName} <${fromEmail}>`;
}

function isUsingTestSender() {
  const fromEmail = getEnv("RESEND_FROM_EMAIL") ?? DEFAULT_TEST_FROM_EMAIL;
  return fromEmail === DEFAULT_TEST_FROM_EMAIL;
}

function getPurposeHeading(purpose: EmailPurpose) {
  switch (purpose) {
    case EmailPurpose.OTP:
      return "Verify your email";
    case EmailPurpose.ACCOUNT:
      return "Account update";
    case EmailPurpose.BOOKING:
      return "Booking update";
  }
}

function getPurposeDefaultActionLabel(purpose: EmailPurpose) {
  switch (purpose) {
    case EmailPurpose.OTP:
      return "Complete Verification";
    case EmailPurpose.ACCOUNT:
      return "View Account";
    case EmailPurpose.BOOKING:
      return "View Booking";
  }
}

function renderDetailRows(
  details?: Array<{
    label: string;
    value: string;
  }>,
) {
  if (!details || details.length === 0) {
    return "";
  }

  return `
    <div style="margin-top: 28px; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px 20px; text-align: left; background-color: #f9faf6;">
      ${details
        .map(
          (detail, index) => `
            <div style="display: flex; justify-content: space-between; gap: 16px; ${
              index < details.length - 1
                ? "padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid #e5e7eb;"
                : ""
            }">
              <span style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em;">
                ${escapeHtml(detail.label)}
              </span>
              <span style="font-size: 14px; color: #111827; font-weight: 600; text-align: right;">
                ${escapeHtml(detail.value)}
              </span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderEmailSkeleton(input: SendEmailInput) {
  const buttonHtml = input.url
    ? `
      <div style="margin-top: 32px;">
        <a href="${escapeHtml(input.url)}" style="display: inline-block; background-color: #111827; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 500;">
          ${escapeHtml(input.actionLabel ?? getPurposeDefaultActionLabel(input.purpose))}
        </a>
      </div>
    `
    : "";

  return `
    <div style="background-color: #ffffff; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; line-height: 1.6;">
      <div style="max-width: 500px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; padding: 40px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        <h2 style="margin-top: 0; font-size: 24px; font-weight: 600; color: #111827; letter-spacing: -0.025em;">
          ${escapeHtml(getPurposeHeading(input.purpose))}
        </h2>
        <div style="margin-top: 24px; font-size: 16px; color: #4b5563;">
          ${input.body}
        </div>
        ${renderDetailRows(input.details)}
        ${buttonHtml}
        ${
          input.footerNote
            ? `<p style="margin-top: 32px; color: #9ca3af; font-size: 13px;">${escapeHtml(input.footerNote)}</p>`
            : ""
        }
      </div>
      <div style="max-width: 500px; margin: 20px auto; text-align: center;">
        <p style="font-size: 12px; color: #9ca3af;">
          If you didn't request this, you can safely ignore this email.
        </p>
        <p style="font-size: 12px; color: #9ca3af; margin-top: 10px;">
          &copy; 2024 ${escapeHtml(APP_NAME)} Industrial Marketplace.
        </p>
      </div>
    </div>
  `;
}

export const sendEmail = async ({
  email,
  body,
  title,
  url,
  purpose,
  actionLabel,
  footerNote,
  details,
}: SendEmailInput) => {
  const resendClient = getResendClient();
  const html = renderEmailSkeleton({
    email,
    title,
    body,
    url,
    purpose,
    actionLabel,
    footerNote,
    details,
  });

  const { data, error } = await resendClient.emails.send({
    from: getFromAddress(),
    to: email,
    subject: title,
    html,
  });

  if (error) {
    const guidance = isUsingTestSender()
      ? " Using onboarding@resend.dev is limited by Resend for testing. Set RESEND_FROM_EMAIL to an address on a verified domain to send OTP emails to real users."
      : "";

    console.error("[resend] sendEmail error:", {
      to: email,
      subject: title,
      purpose,
      error,
      usingTestSender: isUsingTestSender(),
      timestamp: new Date().toISOString(),
    });
    throw new Error(`${error.message}${guidance}`);
  }

  console.log("[resend] message sent successfully", {
    to: email,
    subject: title,
    purpose,
    messageId: data?.id,
    timestamp: new Date().toISOString(),
  });

  return data;
};

export async function sendOtpEmail(input: SendOtpEmailInput) {
  const recipientEmail =
    typeof input.to === "string" ? input.to : input.to.email;
  const recipientName =
    typeof input.to === "string" ? null : (input.to.name ?? null);
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi there,";
  const formattedOtpCode = formatOtpCode(input.otpCode);
  const expiresAtLabel = formatDateTime(input.expiresAt);

  const body = `
    <p style="margin: 0;">${escapeHtml(greeting)}</p>
    <p style="margin: 18px 0 0;">${escapeHtml(
      input.message ?? "Use this code to complete your verification.",
    )}</p>
    <div style="margin-top: 22px; font-size: 34px; font-weight: 700; color: #111827; letter-spacing: 0.28em;">
      ${escapeHtml(formattedOtpCode)}
    </div>
  `;

  return sendEmail({
    email: recipientEmail,
    title: input.subject ?? `${APP_NAME} OTP verification code`,
    body,
    purpose: EmailPurpose.OTP,
    footerNote: `This code expires at ${expiresAtLabel}.`,
  });
}

export async function sendAccountEventEmail(input: SendAccountEventEmailInput) {
  const recipientEmail =
    typeof input.to === "string" ? input.to : input.to.email;
  const recipientName =
    typeof input.to === "string" ? null : (input.to.name ?? null);
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi there,";

  const body = `
    <p style="margin: 0;">${escapeHtml(greeting)}</p>
    <p style="margin: 18px 0 0; font-size: 16px; color: #4b5563;">
      ${escapeHtml(input.title)}
    </p>
    <p style="margin: 18px 0 0;">${escapeHtml(input.message)}</p>
  `;

  return sendEmail({
    email: recipientEmail,
    title: input.subject,
    body,
    purpose: EmailPurpose.ACCOUNT,
    url: input.ctaHref,
    actionLabel: input.ctaLabel,
  });
}

export async function sendBookingEventEmail(input: SendBookingEventEmailInput) {
  const recipientEmail =
    typeof input.to === "string" ? input.to : input.to.email;
  const recipientName =
    typeof input.to === "string" ? null : (input.to.name ?? null);
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi there,";

  const body = `
    <p style="margin: 0;">${escapeHtml(greeting)}</p>
    <p style="margin: 18px 0 0; font-size: 16px; color: #4b5563;">
      ${escapeHtml(input.title)}
    </p>
    <p style="margin: 18px 0 0;">${escapeHtml(input.message)}</p>
  `;

  return sendEmail({
    email: recipientEmail,
    title: input.subject,
    body,
    purpose: EmailPurpose.BOOKING,
    url: input.ctaHref,
    actionLabel: input.ctaLabel,
    details: [
      { label: "Equipment", value: input.equipmentTitle },
      {
        label: "Dates",
        value: formatDateRangeLabel(input.startDate, input.endDate),
      },
      { label: "Status", value: input.statusLabel },
    ],
  });
}
