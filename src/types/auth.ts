import type { UserRole } from "@prisma/client";
import type { PublicUser } from "../services/auth.service.js";

export type AuthenticatedUser = {
  userId: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
  phoneVerified: boolean;
};

export type MobileAuthPayload = {
  user: PublicUser;
  accessToken: string;
  accessTokenExpiresIn: string;
};
