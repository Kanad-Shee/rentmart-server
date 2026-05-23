import crypto from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import {
  BookingStatus,
  EquipmentStatus,
  OtpPurpose,
  Prisma,
  UserRole,
} from "@prisma/client";
import { AUTH_TOKEN_ISSUER } from "../configs/auth.config.js";
import {
  createOtpHash as buildOtpHash,
  createPasswordHashForAuth as buildPasswordHash,
  generateAuthOtp as buildAuthOtp,
  validateOtp as compareAuthOtp,
  validatePassword as compareAuthPassword,
} from "../lib/auth-crypto.js";
import { db } from "../lib/db.js";
import { logServiceError } from "../lib/error-logger.js";
import { sendAccountEventEmail, sendOtpEmail } from "../lib/brevo-mailer.js";
import { logger } from "../lib/logger.js";
import {
  createPaginatedResult,
  normalizePagination,
  type PaginatedResult,
} from "../lib/pagination.js";
// import { sendOtpEmail } from "../lib/resend.js";
import { checkSmsVerification, startSmsVerification } from "../lib/twilio.js";
import {
  createAddressUpdatedNotification,
  createPasswordUpdatedNotification,
  createPhoneVerifiedNotification,
} from "./notification.service.js";
import type {
  ResendOtpInput,
  SignInInput,
  SignUpInput,
  StartPhoneVerificationInput,
  UpdatePasswordInput,
  UpdateProfileInput,
  VerifyOtpInput,
  VerifyPhoneInput,
  ListUsersQueryInput,
} from "../validators/auth.schema.js";

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const PASSWORD_SALT_ROUNDS = 10;
const DEFAULT_ACCESS_TOKEN_EXPIRES_IN = "7d";
const DEFAULT_ACCESS_TOKEN_EXPIRES_IN_REMEMBER_ME = "30d";

const publicUserSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  address: true,
  role: true,
  emailVerified: true,
  phoneVerified: true,
  createdAt: true,
  updatedAt: true,
} as const;

const authUserSelect = {
  ...publicUserSelect,
  passwordHash: true,
} as const;

export type PublicUser = Prisma.UserGetPayload<{
  select: typeof publicUserSelect;
}>;
type AuthUserRecord = Prisma.UserGetPayload<{ select: typeof authUserSelect }>;

export type SignUpResult = {
  user: PublicUser;
  otpExpiresAt: Date;
};

export type SignInResult = {
  user: PublicUser;
  accessToken: string;
  accessTokenExpiresIn: string;
};

export type VerifyOtpResult = {
  user: PublicUser;
  accessToken: string;
  accessTokenExpiresIn: string;
};

export type ResendOtpResult = {
  user: PublicUser;
  otpExpiresAt: Date;
};

export type StartPhoneVerificationResult = {
  phone: string;
};

export type VerifyPhoneResult = {
  user: PublicUser;
};

export type UpdateProfileResult = {
  user: PublicUser;
};

export type AdminUserManagementItem = PublicUser & {
  listingCount: number;
  renterBookingCount: number;
  ownerBookingCount: number;
  unreadNotificationCount: number;
  lastActivityAt: Date;
};

export type DashboardMetrics = {
  pendingVerifications: number;
  activeUsers: number;
  platformAlerts: number;
  manualSettlementQueue: number;
  totalUsers: number;
  activeListings: number;
  bookingRequests: number;
  recentSignups: number;
};

export class AuthServiceError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = "AUTH_ERROR") {
    super(message);
    this.name = "AuthServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function maskEmailForLogs(email: string) {
  if (!email.includes("@")) {
    return email;
  }

  const [localPartRaw, domain] = email.split("@");
  const localPart = localPartRaw ?? "";
  const visibleLocal =
    localPart.length <= 2
      ? `${localPart[0] ?? "*"}*`
      : `${localPart.slice(0, 2)}***`;

  return `${visibleLocal}@${domain}`;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizePhoneNumber(phone: string) {
  const sanitized = phone.trim().replace(/[\s()-]/g, "");

  if (sanitized.startsWith("+")) {
    return `+${sanitized.slice(1).replace(/\D/g, "")}`;
  }

  if (sanitized.startsWith("00")) {
    return `+${sanitized.slice(2).replace(/\D/g, "")}`;
  }

  const digits = sanitized.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return `+91${digits.slice(1)}`;
  }

  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }

  return sanitized;
}

function mapSignupRoleToDbRole(role: SignUpInput["role"]) {
  return role === "owner" ? UserRole.OWNER : UserRole.RENTER;
}

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new AuthServiceError(
      `Missing required environment variable: ${name}`,
      500,
      "MISSING_ENV",
    );
  }

  return value;
}

function getAccessTokenExpiresIn(rememberMe = false) {
  return rememberMe
    ? (process.env.JWT_ACCESS_TOKEN_EXPIRES_IN_REMEMBER_ME ??
        DEFAULT_ACCESS_TOKEN_EXPIRES_IN_REMEMBER_ME)
    : (process.env.JWT_ACCESS_TOKEN_EXPIRES_IN ??
        DEFAULT_ACCESS_TOKEN_EXPIRES_IN);
}

function getOtpExpiresAt() {
  return new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
}

function generateOtpCode() {
  return buildAuthOtp();
}

async function hashPassword(password: string) {
  return buildPasswordHash(password);
}

async function comparePassword(password: string, passwordHash: string) {
  return compareAuthPassword(password, passwordHash);
}

async function hashOtp(otp: string) {
  return buildOtpHash(otp);
}

async function compareOtp(otp: string, otpHash: string) {
  return compareAuthOtp(otp, otpHash);
}

function toPublicUser(
  user: Pick<AuthUserRecord, keyof typeof publicUserSelect>,
) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    address: user.address,
    role: user.role,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function createAccessToken(user: PublicUser, rememberMe = false) {
  const secret = getRequiredEnv("JWT_ACCESS_SECRET");
  const expiresIn = getAccessTokenExpiresIn(rememberMe);
  const signOptions: SignOptions = {
    expiresIn: expiresIn as SignOptions["expiresIn"],
    issuer: AUTH_TOKEN_ISSUER,
  };

  const accessToken = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      issuer: AUTH_TOKEN_ISSUER,
    },
    secret,
    signOptions,
  );

  return { accessToken, accessTokenExpiresIn: expiresIn };
}

type AdminUserRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  address: string;
  role: UserRole;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  listingCount: bigint;
  renterBookingCount: bigint;
  ownerBookingCount: bigint;
  unreadNotificationCount: bigint;
};

function mapAdminUserRow(row: AdminUserRow): AdminUserManagementItem {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    address: row.address,
    role: row.role,
    emailVerified: row.emailVerified,
    phoneVerified: row.phoneVerified,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    listingCount: Number(row.listingCount),
    renterBookingCount: Number(row.renterBookingCount),
    ownerBookingCount: Number(row.ownerBookingCount),
    unreadNotificationCount: Number(row.unreadNotificationCount),
    lastActivityAt: row.updatedAt,
  };
}

async function findUserByEmail(email: string) {
  return db.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: authUserSelect,
  });
}

async function findPublicUserById(id: string) {
  return db.user.findUnique({
    where: { id },
    select: publicUserSelect,
  });
}

export async function registerUser(input: SignUpInput): Promise<SignUpResult> {
  const email = normalizeEmail(input.email);

  logger.info("[auth.service] Starting user registration", {
    service: "auth.service",
    action: "registerUser.start",
    email: maskEmailForLogs(email),
    role: input.role,
    timestamp: new Date().toISOString(),
  });

  const existingUser = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    logger.warn("[auth.service] Registration blocked because email already exists", {
      service: "auth.service",
      action: "registerUser.emailExists",
      email: maskEmailForLogs(email),
      existingUserId: existingUser.id,
      timestamp: new Date().toISOString(),
    });
    throw new AuthServiceError(
      "An account with this email already exists.",
      409,
      "EMAIL_EXISTS",
    );
  }

  const passwordHash = await hashPassword(input.password);
  const otpCode = generateOtpCode();
  const otpHash = await hashOtp(otpCode);
  const otpExpiresAt = getOtpExpiresAt();

  logger.info("[auth.service] Signup credentials and OTP prepared", {
    service: "auth.service",
    action: "registerUser.otpPrepared",
    email: maskEmailForLogs(email),
    otpExpiresAt: otpExpiresAt.toISOString(),
    timestamp: new Date().toISOString(),
  });

  const createdUser = await db.$transaction(async (tx) => {
    logger.info("[auth.service] Creating signup user and OTP records", {
      service: "auth.service",
      action: "registerUser.transactionStart",
      email: maskEmailForLogs(email),
      timestamp: new Date().toISOString(),
    });

    const user = await tx.user.create({
      data: {
        fullName: input.fullName.trim(),
        email,
        phone: null,
        address: input.address.trim(),
        role: mapSignupRoleToDbRole(input.role),
        passwordHash,
        emailVerified: false,
        phoneVerified: false,
      },
      select: publicUserSelect,
    });

    await tx.otpVerification.create({
      data: {
        userId: user.id,
        email,
        purpose: OtpPurpose.SIGNUP,
        otpHash,
        expiresAt: otpExpiresAt,
        attempts: 0,
      },
    });

    logger.info("[auth.service] Signup user and OTP records created", {
      service: "auth.service",
      action: "registerUser.transactionCreated",
      userId: user.id,
      email: maskEmailForLogs(user.email),
      timestamp: new Date().toISOString(),
    });

    return user;
  });

  logger.info("[auth.service] Sending signup OTP email", {
    service: "auth.service",
    action: "registerUser.sendOtpStart",
    userId: createdUser.id,
    email: maskEmailForLogs(createdUser.email),
    timestamp: new Date().toISOString(),
  });

  try {
    await sendOtpEmail({
      to: {
        email: createdUser.email,
        name: createdUser.fullName,
      },
      otpCode,
      expiresAt: otpExpiresAt,
      message: "Use this code to verify your RentMart account.",
    });
  } catch (error) {
    logServiceError({
      service: "auth.service",
      action: "registerUser.sendOtpEmail",
      error,
      context: {
        userId: createdUser.id,
        email: maskEmailForLogs(createdUser.email),
      },
    });

    throw new AuthServiceError(
      "Unable to send verification email. If you are using Resend test sender onboarding@resend.dev, switch to RESEND_FROM_EMAIL on a verified domain.",
      502,
      "EMAIL_SEND_FAILED",
    );
  }

  logger.info("[auth.service] Signup OTP email sent", {
    service: "auth.service",
    action: "registerUser.sendOtpSuccess",
    userId: createdUser.id,
    email: maskEmailForLogs(createdUser.email),
    otpExpiresAt: otpExpiresAt.toISOString(),
    timestamp: new Date().toISOString(),
  });

  return {
    user: createdUser,
    otpExpiresAt,
  };
}

export async function signInUser(input: SignInInput): Promise<SignInResult> {
  const user = await findUserByEmail(input.email);

  if (!user) {
    throw new AuthServiceError(
      "Invalid email or password.",
      401,
      "INVALID_CREDENTIALS",
    );
  }

  const passwordMatches = await comparePassword(
    input.password,
    user.passwordHash,
  );

  if (!passwordMatches) {
    throw new AuthServiceError(
      "Invalid email or password.",
      401,
      "INVALID_CREDENTIALS",
    );
  }

  if (!user.emailVerified) {
    throw new AuthServiceError(
      "Please verify your email address before signing in.",
      403,
      "EMAIL_NOT_VERIFIED",
    );
  }

  const publicUser = toPublicUser(user);
  const { accessToken, accessTokenExpiresIn } = createAccessToken(
    publicUser,
    input.rememberMe ?? false,
  );

  return {
    user: publicUser,
    accessToken,
    accessTokenExpiresIn,
  };
}

export async function verifyOtp(
  input: VerifyOtpInput,
): Promise<VerifyOtpResult> {
  const email = normalizeEmail(input.email);

  const user = await db.user.findUnique({
    where: { email },
    select: publicUserSelect,
  });

  if (!user) {
    throw new AuthServiceError(
      "No account found for this email.",
      404,
      "USER_NOT_FOUND",
    );
  }

  if (user.emailVerified) {
    throw new AuthServiceError(
      "Email address is already verified.",
      409,
      "ALREADY_VERIFIED",
    );
  }

  const otpRecord = await db.otpVerification.findFirst({
    where: {
      email,
      purpose: OtpPurpose.SIGNUP,
      usedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otpRecord) {
    throw new AuthServiceError(
      "No active OTP found. Please request a new code.",
      404,
      "OTP_NOT_FOUND",
    );
  }

  if (otpRecord.expiresAt.getTime() < Date.now()) {
    throw new AuthServiceError(
      "OTP has expired. Please request a new code.",
      400,
      "OTP_EXPIRED",
    );
  }

  const otpMatches = await compareOtp(input.otp, otpRecord.otpHash);

  if (!otpMatches) {
    const nextAttempts = otpRecord.attempts + 1;

    await db.otpVerification.update({
      where: { id: otpRecord.id },
      data: {
        attempts: nextAttempts,
        usedAt: nextAttempts >= OTP_MAX_ATTEMPTS ? new Date() : null,
      },
    });

    if (nextAttempts >= OTP_MAX_ATTEMPTS) {
      throw new AuthServiceError(
        "Too many incorrect OTP attempts. Request a new code.",
        429,
        "OTP_TOO_MANY_ATTEMPTS",
      );
    }

    throw new AuthServiceError("Invalid OTP.", 400, "OTP_INVALID");
  }

  const updatedUser = await db.$transaction(async (tx) => {
    await tx.otpVerification.update({
      where: { id: otpRecord.id },
      data: {
        attempts: otpRecord.attempts,
        usedAt: new Date(),
      },
    });

    return tx.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
      },
      select: publicUserSelect,
    });
  });

  const { accessToken, accessTokenExpiresIn } = createAccessToken(updatedUser);

  return {
    user: updatedUser,
    accessToken,
    accessTokenExpiresIn,
  };
}

export async function resendOtp(
  input: ResendOtpInput,
): Promise<ResendOtpResult> {
  const email = normalizeEmail(input.email);

  const user = await db.user.findUnique({
    where: { email },
    select: publicUserSelect,
  });

  if (!user) {
    throw new AuthServiceError(
      "No account found for this email.",
      404,
      "USER_NOT_FOUND",
    );
  }

  if (user.emailVerified) {
    throw new AuthServiceError(
      "Email address is already verified.",
      409,
      "ALREADY_VERIFIED",
    );
  }

  const otpCode = generateOtpCode();
  const otpHash = await hashOtp(otpCode);
  const otpExpiresAt = getOtpExpiresAt();

  await db.$transaction(async (tx) => {
    await tx.otpVerification.updateMany({
      where: {
        email,
        purpose: OtpPurpose.SIGNUP,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    await tx.otpVerification.create({
      data: {
        userId: user.id,
        email,
        purpose: OtpPurpose.SIGNUP,
        otpHash,
        expiresAt: otpExpiresAt,
        attempts: 0,
      },
    });
  });

  try {
    await sendOtpEmail({
      to: {
        email: user.email,
        name: user.fullName,
      },
      otpCode,
      expiresAt: otpExpiresAt,
      message: "Use this new code to finish verifying your RentMart account.",
    });
  } catch (error) {
    logServiceError({
      service: "auth.service",
      action: "resendOtp.sendOtpEmail",
      error,
      context: {
        userId: user.id,
        email: maskEmailForLogs(user.email),
      },
    });

    throw new AuthServiceError(
      "Unable to resend verification email. If you are using Resend test sender onboarding@resend.dev, switch to RESEND_FROM_EMAIL on a verified domain.",
      502,
      "EMAIL_SEND_FAILED",
    );
  }

  return {
    user,
    otpExpiresAt,
  };
}

export async function startPhoneVerificationForUser(
  userId: string,
  input: StartPhoneVerificationInput,
): Promise<StartPhoneVerificationResult> {
  const user = await findPublicUserById(userId);

  if (!user) {
    throw new AuthServiceError("User not found.", 404, "USER_NOT_FOUND");
  }

  const phone = normalizePhoneNumber(input.phone);

  if (user.phoneVerified && user.phone === phone) {
    throw new AuthServiceError(
      "This phone number is already verified.",
      409,
      "PHONE_ALREADY_VERIFIED",
    );
  }

  try {
    await startSmsVerification(phone);
  } catch (error) {
    logServiceError({
      service: "auth.service",
      action: "startPhoneVerificationForUser.startSmsVerification",
      error,
      context: {
        userId,
        phone,
      },
    });
    throw new AuthServiceError(
      "Unable to send phone verification code right now.",
      502,
      "PHONE_VERIFICATION_SEND_FAILED",
    );
  }

  return {
    phone,
  };
}

export async function verifyPhoneNumberForUser(
  userId: string,
  input: VerifyPhoneInput,
): Promise<VerifyPhoneResult> {
  const user = await findPublicUserById(userId);

  if (!user) {
    throw new AuthServiceError("User not found.", 404, "USER_NOT_FOUND");
  }

  const phone = normalizePhoneNumber(input.phone);

  try {
    const verificationCheck = await checkSmsVerification(
      phone,
      input.code.trim(),
    );

    if (verificationCheck.status !== "approved") {
      throw new AuthServiceError(
        "Invalid or expired phone verification code.",
        400,
        "PHONE_VERIFICATION_INVALID",
      );
    }
  } catch (error) {
    if (error instanceof AuthServiceError) {
      throw error;
    }

    logServiceError({
      service: "auth.service",
      action: "verifyPhoneNumberForUser.checkSmsVerification",
      error,
      context: {
        userId,
        phone,
      },
    });
    throw new AuthServiceError(
      "Unable to verify this phone number right now.",
      502,
      "PHONE_VERIFICATION_CHECK_FAILED",
    );
  }

  const updatedUser = await db.user.update({
    where: { id: user.id },
    data: {
      phone,
      phoneVerified: true,
    },
    select: publicUserSelect,
  });

  await createPhoneVerifiedNotification(db, {
    userId: updatedUser.id,
  });
  try {
    await sendAccountEventEmail({
      to: {
        email: updatedUser.email,
        name: updatedUser.fullName,
      },
      subject: "Your phone number is verified",
      title: "Phone verification complete",
      message:
        "Your RentMart account can now use booking flows that require a verified phone number.",
      ctaLabel: "Review Settings",
      ctaHref: "/dashboard/settings",
    });
  } catch (error) {
    logServiceError({
      service: "auth.service",
      action: "verifyPhoneNumberForUser.sendAccountEventEmail",
      error,
      context: {
        userId: updatedUser.id,
        email: maskEmailForLogs(updatedUser.email),
      },
    });
  }

  return {
    user: updatedUser,
  };
}

export async function updateCurrentUserProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<UpdateProfileResult> {
  const user = await findPublicUserById(userId);

  if (!user) {
    throw new AuthServiceError("User not found.", 404, "USER_NOT_FOUND");
  }

  const nextAddress = input.address.trim();

  logger.info("[auth.service] Processing profile address update", {
    service: "auth.service",
    action: "updateCurrentUserProfile.start",
    userId,
    previousAddress: user.address,
    nextAddress,
    timestamp: new Date().toISOString(),
  });

  if (user.address === nextAddress) {
    logger.info("[auth.service] Skipping profile update because address is unchanged", {
      service: "auth.service",
      action: "updateCurrentUserProfile.noop",
      userId,
      address: user.address,
      timestamp: new Date().toISOString(),
    });
    return { user };
  }

  const updatedUser = await db.user.update({
    where: { id: userId },
    data: {
      address: nextAddress,
    },
    select: publicUserSelect,
  });

  logger.info("[auth.service] Profile address update committed", {
    service: "auth.service",
    action: "updateCurrentUserProfile.success",
    userId: updatedUser.id,
    address: updatedUser.address,
    updatedAt: updatedUser.updatedAt.toISOString(),
    timestamp: new Date().toISOString(),
  });

  await createAddressUpdatedNotification(db, {
    userId: updatedUser.id,
  });
  try {
    await sendAccountEventEmail({
      to: {
        email: updatedUser.email,
        name: updatedUser.fullName,
      },
      subject: "Your address was updated",
      title: "Account address updated",
      message:
        "We saved your new address on RentMart. If you did not make this change, contact support immediately.",
      ctaLabel: "Review Settings",
      ctaHref: "/dashboard/settings",
    });
  } catch (error) {
    logServiceError({
      service: "auth.service",
      action: "updateCurrentUserProfile.sendAccountEventEmail",
      error,
      context: {
        userId: updatedUser.id,
        email: maskEmailForLogs(updatedUser.email),
      },
    });
  }

  return {
    user: updatedUser,
  };
}

export async function updateCurrentUserPassword(
  userId: string,
  input: UpdatePasswordInput,
) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: authUserSelect,
  });

  if (!user) {
    throw new AuthServiceError("User not found.", 404, "USER_NOT_FOUND");
  }

  const currentPasswordMatches = await comparePassword(
    input.currentPassword,
    user.passwordHash,
  );

  if (!currentPasswordMatches) {
    throw new AuthServiceError(
      "Current password is incorrect.",
      400,
      "INVALID_CURRENT_PASSWORD",
    );
  }

  const nextPasswordHash = await hashPassword(input.newPassword);

  await db.user.update({
    where: { id: userId },
    data: {
      passwordHash: nextPasswordHash,
    },
  });
  await createPasswordUpdatedNotification(db, {
    userId: user.id,
  });
  try {
    await sendAccountEventEmail({
      to: {
        email: user.email,
        name: user.fullName,
      },
      subject: "Your password was changed",
      title: "Password updated",
      message:
        "Your RentMart password was updated successfully. If this was not you, secure your account immediately.",
      ctaLabel: "Review Settings",
      ctaHref: "/dashboard/settings",
    });
  } catch (error) {
    logServiceError({
      service: "auth.service",
      action: "updateCurrentUserPassword.sendAccountEventEmail",
      error,
      context: {
        userId: user.id,
        email: maskEmailForLogs(user.email),
      },
    });
  }

  return {
    success: true,
  };
}

export async function listUsersForAdmin(
  adminId: string,
  input: ListUsersQueryInput,
): Promise<PaginatedResult<AdminUserManagementItem>> {
  const admin = await db.user.findUnique({
    where: { id: adminId },
    select: { id: true, role: true },
  });

  if (!admin || admin.role !== UserRole.ADMIN) {
    throw new AuthServiceError("Admin access required.", 403, "FORBIDDEN");
  }

  const pagination = normalizePagination(input);
  const filters: Prisma.Sql[] = [];

  if (input.search?.trim()) {
    const search = `%${input.search.trim()}%`;
    filters.push(Prisma.sql`
      (
        u."fullName" ILIKE ${search}
        OR u."email" ILIKE ${search}
        OR u."address" ILIKE ${search}
        OR COALESCE(u."phone", '') ILIKE ${search}
      )
    `);
  }

  if (input.role && input.role !== "ALL") {
    filters.push(Prisma.sql`u."role" = ${input.role}`);
  }

  if (input.verification === "VERIFIED") {
    filters.push(
      Prisma.sql`u."emailVerified" = true AND u."phoneVerified" = true`,
    );
  }

  if (input.verification === "ACTION_REQUIRED") {
    filters.push(
      Prisma.sql`u."emailVerified" = false OR u."phoneVerified" = false`,
    );
  }

  const whereClause =
    filters.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(filters, " AND ")}`
      : Prisma.empty;

  const [rows, countRows] = await Promise.all([
    db.$queryRaw<AdminUserRow[]>(Prisma.sql`
      SELECT
      u."id",
      u."fullName",
      u."email",
      u."phone",
      u."address",
      u."role",
      u."emailVerified",
      u."phoneVerified",
      u."createdAt",
      u."updatedAt",
      (
        SELECT COUNT(*)::bigint
        FROM "Equipment" e
        WHERE e."ownerId" = u."id"
      ) AS "listingCount",
      (
        SELECT COUNT(*)::bigint
        FROM "Booking" b
        WHERE b."renterId" = u."id"
      ) AS "renterBookingCount",
      (
        SELECT COUNT(*)::bigint
        FROM "Booking" b
        WHERE b."ownerId" = u."id"
      ) AS "ownerBookingCount",
      (
        SELECT COUNT(*)::bigint
        FROM "Notification" n
        WHERE n."userId" = u."id"
          AND n."isRead" = false
      ) AS "unreadNotificationCount"
      FROM "User" u
      ${whereClause}
      ORDER BY u."updatedAt" DESC, u."createdAt" DESC
      LIMIT ${pagination.take}
      OFFSET ${pagination.skip}
    `),
    db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count"
      FROM "User" u
      ${whereClause}
    `),
  ]);

  return createPaginatedResult(
    rows.map(mapAdminUserRow),
    {
      page: pagination.page,
      pageSize: pagination.pageSize,
    },
    Number(countRows[0]?.count ?? 0n),
  );
}

export async function getDashboardMetrics(
  userId: string,
): Promise<DashboardMetrics> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });

  if (!user || user.role !== UserRole.ADMIN) {
    throw new AuthServiceError("Admin access required.", 403, "FORBIDDEN");
  }

  const manualSettlementWhere = {
    isPaymentCompleted: true,
    OR: [
      { ownerPayoutStatus: { not: "PAID" as const } },
      { depositRefundStatus: { not: "REFUNDED" as const } },
    ],
    status: {
      in: [BookingStatus.COMPLETED, BookingStatus.DISPUTED],
    },
  } satisfies Prisma.BookingWhereInput;

  const [
    pendingVerifications,
    activeUsers,
    blockedSettlements,
    disputedBookings,
    manualSettlementQueue,
    totalUsers,
    activeListings,
    bookingRequests,
    recentSignups,
  ] = await Promise.all([
    db.equipment.count({
      where: { status: EquipmentStatus.PENDING_VERIFICATION },
    }),
    db.user.count({
      where: {
        emailVerified: true,
        phoneVerified: true,
      },
    }),
    db.booking.count({
      where: {
        OR: [
          { ownerPayoutStatus: "BLOCKED" },
          { depositRefundStatus: "BLOCKED" },
        ],
      },
    }),
    db.booking.count({
      where: { status: BookingStatus.DISPUTED },
    }),
    db.booking.count({
      where: manualSettlementWhere,
    }),
    db.user.count(),
    db.equipment.count({
      where: { status: EquipmentStatus.ACTIVE },
    }),
    db.booking.count({
      where: {
        status: {
          in: [
            BookingStatus.PENDING_OWNER_APPROVAL,
            BookingStatus.PENDING_RENTER_PAYMENT,
            BookingStatus.CONFIRMED,
            BookingStatus.IN_PROGRESS,
          ],
        },
      },
    }),
    db.user.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    }),
  ]);

  return {
    pendingVerifications,
    activeUsers,
    platformAlerts: disputedBookings + blockedSettlements,
    manualSettlementQueue,
    totalUsers,
    activeListings,
    bookingRequests,
    recentSignups,
  };
}

export async function getCurrentUser(userId: string) {
  const user = await findPublicUserById(userId);

  if (!user) {
    throw new AuthServiceError("User not found.", 404, "USER_NOT_FOUND");
  }

  logger.info("[auth.service] Current user fetched", {
    service: "auth.service",
    action: "getCurrentUser",
    userId: user.id,
    address: user.address,
    updatedAt: user.updatedAt.toISOString(),
    timestamp: new Date().toISOString(),
  });

  return user;
}

export function createAuthTokenForUser(user: PublicUser, rememberMe = false) {
  return createAccessToken(user, rememberMe);
}

export async function validatePassword(password: string, passwordHash: string) {
  return comparePassword(password, passwordHash);
}

export async function createPasswordHashForAuth(password: string) {
  return buildPasswordHash(password);
}

export function generateAuthOtp() {
  return buildAuthOtp();
}

export async function createOtpHash(otp: string) {
  return buildOtpHash(otp);
}

export async function validateOtp(otp: string, otpHash: string) {
  return compareAuthOtp(otp, otpHash);
}

export function getAuthAccessTokenExpiresIn(rememberMe = false) {
  return getAccessTokenExpiresIn(rememberMe);
}

export function getAuthOtpExpiresAt() {
  return getOtpExpiresAt();
}

export { normalizeEmail, publicUserSelect };
