import { Router } from "express";
import { UserRole } from "@prisma/client";
import {
  AUTH_RATE_LIMITS,
  getBodyEmailRateLimitKey,
  getIpRateLimitKey,
} from "../configs/rate-limit.config.js";
import { authenticateUser, requireRole } from "../middlewares/auth.middleware.js";
import { createRateLimiter } from "../middlewares/rate-limit.middleware.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import {
  dashboardMetricsController,
  listUsersController,
  logoutController,
  meController,
  mobileSignInController,
  mobileVerifyOtpController,
  resendOtpController,
  signInController,
  signUpController,
  startPhoneVerificationController,
  updatePasswordController,
  updateProfileController,
  verifyOtpController,
  verifyPhoneController,
} from "../controllers/auth.controller.js";
import {
  resendOtpSchema,
  signInSchema,
  signUpSchema,
  listUsersQuerySchema,
  startPhoneVerificationSchema,
  updatePasswordSchema,
  updateProfileSchema,
  verifyOtpSchema,
  verifyPhoneSchema,
} from "../validators/auth.schema.js";

const authRouter = Router();

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

const signupRateLimit = createRateLimiter({
  ...AUTH_RATE_LIMITS.signup,
  getIdentifier: getIpRateLimitKey,
});

const signInRateLimit = createRateLimiter({
  ...AUTH_RATE_LIMITS.signin,
  getIdentifier: getBodyEmailRateLimitKey,
});

const verifyOtpRateLimit = createRateLimiter({
  ...AUTH_RATE_LIMITS.verifyOtp,
  getIdentifier: getBodyEmailRateLimitKey,
});

const resendOtpRateLimit = createRateLimiter({
  ...AUTH_RATE_LIMITS.resendOtp,
  getIdentifier: getBodyEmailRateLimitKey,
});

authRouter.post(
  "/signup",
  (req, _res, next) => {
    console.log("[auth.routes] Signup request received", {
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      email: maskEmailForLogs(req.body?.email),
      role: req.body?.role ?? null,
      timestamp: new Date().toISOString(),
    });
    next();
  },
  signupRateLimit,
  validateRequest(signUpSchema),
  signUpController,
);
authRouter.post(
  "/signin",
  signInRateLimit,
  validateRequest(signInSchema),
  signInController,
);
authRouter.post(
  "/mobile/signin",
  signInRateLimit,
  validateRequest(signInSchema),
  mobileSignInController,
);
authRouter.post(
  "/verify-otp",
  verifyOtpRateLimit,
  validateRequest(verifyOtpSchema),
  verifyOtpController,
);
authRouter.post(
  "/mobile/verify-otp",
  verifyOtpRateLimit,
  validateRequest(verifyOtpSchema),
  mobileVerifyOtpController,
);
authRouter.post(
  "/resend-otp",
  resendOtpRateLimit,
  validateRequest(resendOtpSchema),
  resendOtpController,
);
authRouter.post(
  "/phone/start",
  authenticateUser,
  validateRequest(startPhoneVerificationSchema),
  startPhoneVerificationController,
);
authRouter.post(
  "/phone/verify",
  authenticateUser,
  validateRequest(verifyPhoneSchema),
  verifyPhoneController,
);
authRouter.patch(
  "/profile",
  authenticateUser,
  validateRequest(updateProfileSchema),
  updateProfileController,
);
authRouter.patch(
  "/password",
  authenticateUser,
  validateRequest(updatePasswordSchema),
  updatePasswordController,
);
authRouter.get(
  "/users",
  authenticateUser,
  requireRole(UserRole.ADMIN),
  validateRequest(listUsersQuerySchema, "query"),
  listUsersController,
);
authRouter.get(
  "/dashboard-metrics",
  authenticateUser,
  requireRole(UserRole.ADMIN),
  dashboardMetricsController,
);
authRouter.post("/logout", authenticateUser, logoutController);
authRouter.get("/me", authenticateUser, meController);

export { authRouter };
