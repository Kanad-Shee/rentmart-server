import type { Request, Response } from "express";
import { AUTH_COOKIE_NAME } from "../configs/auth.config";
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
} from "../services/auth.service";

function isProduction() {
  return process.env.NODE_ENV === "production";
}

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

  console.error("Auth controller error:", error);
  return sendError(res, 500, "Something went wrong.");
}

export async function signUpController(req: Request, res: Response) {
  try {
    const result = await registerUser(req.body);

    return sendSuccess(res, 201, "Account created successfully. Verify your OTP.", {
      user: result.user,
      otpExpiresAt: result.otpExpiresAt,
    });
  } catch (error) {
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

    const users = await listUsersForAdmin(userId, req.query);

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
