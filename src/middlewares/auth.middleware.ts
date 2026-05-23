import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { UserRole } from "@prisma/client";
import { db } from "../lib/db.js";
import { AUTH_COOKIE_NAME, AUTH_TOKEN_ISSUER } from "../configs/auth.config.js";
import { logger } from "../lib/logger.js";
import type { AuthenticatedUser } from "../types/auth.js";

type TokenPayload = JwtPayload & {
  sub?: string;
  email?: string;
  role?: UserRole;
  emailVerified?: boolean;
  phoneVerified?: boolean;
};

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getTokenFromRequest(req: Request) {
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];

  if (typeof cookieToken === "string" && cookieToken.length > 0) {
    return cookieToken;
  }

  const authorizationHeader = req.headers.authorization;

  if (authorizationHeader?.startsWith("Bearer ")) {
    const bearerToken = authorizationHeader.slice(7).trim();
    return bearerToken.length > 0 ? bearerToken : null;
  }

  return null;
}

function sendUnauthorized(res: Response) {
  return res.status(401).json({
    success: false,
    message: "Unauthorized.",
  });
}

function sendForbidden(res: Response, message: string) {
  return res.status(403).json({
    success: false,
    message,
  });
}

async function resolveAuthenticatedUser(req: Request) {
  const token = getTokenFromRequest(req);

  if (!token) {
    return null;
  }

  const secret = getRequiredEnv("JWT_ACCESS_SECRET");
  const payload = jwt.verify(token, secret, {
    issuer: AUTH_TOKEN_ISSUER,
  }) as TokenPayload;

  const userId = typeof payload.sub === "string" ? payload.sub : null;
  const email = typeof payload.email === "string" ? payload.email : null;
  const role = payload.role ?? null;
  const emailVerified =
    typeof payload.emailVerified === "boolean" ? payload.emailVerified : null;
  const phoneVerified =
    typeof payload.phoneVerified === "boolean" ? payload.phoneVerified : null;

  if (!userId || !email || !role || emailVerified === null || phoneVerified === null) {
    return null;
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      emailVerified: true,
      phoneVerified: true,
    },
  });

  if (!user) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
  } satisfies AuthenticatedUser;
}

export const authenticateUser: RequestHandler = async (req, res, next) => {
  try {
    const user = await resolveAuthenticatedUser(req);

    if (!user) {
      return sendUnauthorized(res);
    }

    req.user = user;
    return next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return sendUnauthorized(res);
    }

    logger.error("Authenticate user middleware error", {
      service: "auth.middleware",
      action: "authenticateUser",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return res.status(500).json({
      success: false,
      message: "Something went wrong.",
    });
  }
};

export const attachOptionalUser: RequestHandler = async (req, _res, next) => {
  try {
    const user = await resolveAuthenticatedUser(req);

    if (user) {
      req.user = user;
    }

    return next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return next();
    }

    logger.error("Optional auth middleware error", {
      service: "auth.middleware",
      action: "attachOptionalUser",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return next();
  }
};

export function requireVerifiedEmail(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendUnauthorized(res);
    }

    if (!req.user.emailVerified) {
      return sendForbidden(res, "Please verify your email address first.");
    }

    return next();
  };
}

export function requireVerifiedMobile(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendUnauthorized(res);
    }

    if (!req.user.phoneVerified) {
      return sendForbidden(res, "Please verify your phone number first.");
    }

    return next();
  };
}

export function requireRole(...allowedRoles: UserRole[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendUnauthorized(res);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendForbidden(res, "You do not have permission to access this resource.");
    }

    return next();
  };
}
