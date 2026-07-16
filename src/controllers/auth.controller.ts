import type { Request, Response } from "express";
import { AUTH_COOKIE_NAME } from "../configs/auth.config.js";
import { logger } from "../lib/logger.js";
import type { MobileAuthPayload } from "../types/auth.js";
import {
  AuthServiceError,
  getDashboardMetrics,
  getCurrentUser,
  listUsersForAdmin,
  registerUser,
  resendOtp,
  signInUser,
  startPhoneVerificationForUser,
  updateCurrentUserPassword,
  updateCurrentUserProfile,
  verifyOtp,
  verifyPhoneNumberForUser,
} from "../services/auth.service.js";

function maskEmailForLogs(email: unknown) {
  if (typeof email !== "string" || !email.includes("@")) {
    return null;
  }

  const [localPartRaw, domain] = email.split("@");
  const localPart = localPartRaw ?? "";
  const visibleLocal =
    localPart.length <= 2
      ? `${localPart[0] ?? "*"}*`
      : `${localPart.slice(0, 2)}***`;

  return `${visibleLocal}@${domain}`;
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

//
function getAuthCookieOptions(maxAgeMs?: number) {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax" as const,
    path: "/",
    ...(typeof maxAgeMs === "number" ? { maxAge: maxAgeMs } : {}),
  };
}

function setAuthCookie(res: Response, accessToken: string, expiresIn: string) {
  const durationMatch = /^(\d+)([smhd])$/i.exec(expiresIn.trim());

  if (!durationMatch) {
    res.cookie(AUTH_COOKIE_NAME, accessToken, getAuthCookieOptions());
    return;
  }

  const value = Number(durationMatch[1] ?? "0");
  const unit = (durationMatch[2] ?? "d").toLowerCase() as "s" | "m" | "h" | "d";
  const multiplier = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  } as const;

  res.cookie(AUTH_COOKIE_NAME, accessToken, getAuthCookieOptions(value * multiplier[unit]));
}

function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
  });
}

function sendSuccess<T>(res: Response, status: number, message: string, data: T) {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
}

function sendError(res: Response, status: number, message: string, errors?: unknown) {
  return res.status(status).json({
    success: false,
    message,
    ...(errors ? { errors } : {}),
  });
}

function handleAuthError(res: Response, error: unknown) {
  if (error instanceof AuthServiceError) {
    return sendError(res, error.statusCode, error.message, { code: error.code });
  }

  logger.error("Auth controller error", {
    service: "auth.controller",
    action: "handleAuthError",
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return sendError(res, 500, "Something went wrong.");
}

export async function signUpController(req: Request, res: Response) {
  try {
    logger.info("[auth.controller] Signup payload validated, entering controller", {
      service: "auth.controller",
      action: "signUpController.start",
      path: req.originalUrl,
      ip: req.ip,
      email: maskEmailForLogs(req.body?.email),
      role: req.body?.role ?? null,
      timestamp: new Date().toISOString(),
    });

    const result = await registerUser(req.body);

    logger.info("[auth.controller] Signup completed successfully", {
      service: "auth.controller",
      action: "signUpController.success",
      userId: result.user.id,
      email: maskEmailForLogs(result.user.email),
      otpExpiresAt: result.otpExpiresAt.toISOString(),
      timestamp: new Date().toISOString(),
    });

    return sendSuccess(res, 201, "Account created successfully. Verify your OTP.", {
      user: result.user,
      otpExpiresAt: result.otpExpiresAt,
    });
  } catch (error) {
    logger.error("[auth.controller] Signup failed", {
      service: "auth.controller",
      action: "signUpController.error",
      email: maskEmailForLogs(req.body?.email),
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
    return handleAuthError(res, error);
  }
}

export async function signInController(req: Request, res: Response) {
  try {
    const result = await signInUser(req.body);
    setAuthCookie(res, result.accessToken, result.accessTokenExpiresIn);

    return sendSuccess(res, 200, "Signed in successfully.", {
      user: result.user,
    });
  } catch (error) {
    return handleAuthError(res, error);
  }
}

export async function verifyOtpController(req: Request, res: Response) {
  try {
    const result = await verifyOtp(req.body);
    setAuthCookie(res, result.accessToken, result.accessTokenExpiresIn);

    return sendSuccess(res, 200, "OTP verified successfully.", {
      user: result.user,
    });
  } catch (error) {
    return handleAuthError(res, error);
  }
}

function toMobileAuthPayload(result: MobileAuthPayload): MobileAuthPayload {
  return {
    user: result.user,
    accessToken: result.accessToken,
    accessTokenExpiresIn: result.accessTokenExpiresIn,
  };
}

export async function mobileSignInController(req: Request, res: Response) {
  try {
    const result = await signInUser(req.body);

    return sendSuccess(res, 200, "Signed in successfully.", toMobileAuthPayload(result));
  } catch (error) {
    return handleAuthError(res, error);
  }
}

export async function mobileVerifyOtpController(req: Request, res: Response) {
  try {
    const result = await verifyOtp(req.body);

    return sendSuccess(
      res,
      200,
      "OTP verified successfully.",
      toMobileAuthPayload(result),
    );
  } catch (error) {
    return handleAuthError(res, error);
  }
}

export async function resendOtpController(req: Request, res: Response) {
  try {
    const result = await resendOtp(req.body);

    return sendSuccess(res, 200, "OTP resent successfully.", {
      user: result.user,
      otpExpiresAt: result.otpExpiresAt,
    });
  } catch (error) {
    return handleAuthError(res, error);
  }
}

export async function logoutController(_req: Request, res: Response) {
  clearAuthCookie(res);

  return sendSuccess(res, 200, "Logged out successfully.", null);
}

export async function meController(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return sendError(res, 401, "Unauthorized.");
    }

    const user = await getCurrentUser(userId);

    return sendSuccess(res, 200, "Current user fetched successfully.", {
      user,
    });
  } catch (error) {
    return handleAuthError(res, error);
  }
}

export async function listUsersController(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return sendError(res, 401, "Unauthorized.");
    }

    const users = await listUsersForAdmin(
      userId,
      req.query as unknown as Parameters<typeof listUsersForAdmin>[1],
    );

    return sendSuccess(res, 200, "Users fetched successfully.", users);
  } catch (error) {
    return handleAuthError(res, error);
  }
}

export async function dashboardMetricsController(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return sendError(res, 401, "Unauthorized.");
    }

    const metrics = await getDashboardMetrics(userId);

    return sendSuccess(res, 200, "Dashboard metrics fetched successfully.", metrics);
  } catch (error) {
    return handleAuthError(res, error);
  }
}

export async function startPhoneVerificationController(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return sendError(res, 401, "Unauthorized.");
    }

    const result = await startPhoneVerificationForUser(userId, req.body);

    return sendSuccess(res, 200, "Phone verification code sent successfully.", result);
  } catch (error) {
    return handleAuthError(res, error);
  }
}

export async function verifyPhoneController(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return sendError(res, 401, "Unauthorized.");
    }

    const result = await verifyPhoneNumberForUser(userId, req.body);

    return sendSuccess(res, 200, "Phone number verified successfully.", {
      user: result.user,
    });
  } catch (error) {
    return handleAuthError(res, error);
  }
}

export async function updateProfileController(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return sendError(res, 401, "Unauthorized.");
    }

    const result = await updateCurrentUserProfile(userId, req.body);

    return sendSuccess(res, 200, "Profile updated successfully.", {
      user: result.user,
    });
  } catch (error) {
    return handleAuthError(res, error);
  }
}

export async function updatePasswordController(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return sendError(res, 401, "Unauthorized.");
    }

    await updateCurrentUserPassword(userId, req.body);

    return sendSuccess(res, 200, "Password updated successfully.", null);
  } catch (error) {
    return handleAuthError(res, error);
  }
}

export const authCookie = {
  name: AUTH_COOKIE_NAME,
  options: getAuthCookieOptions,
};

export { clearAuthCookie, setAuthCookie };
