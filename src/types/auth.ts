import type { UserRole } from "../generated/prisma/client";

export type AuthenticatedUser = {
  userId: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
  phoneVerified: boolean;
};
