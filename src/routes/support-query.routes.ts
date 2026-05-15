import { Router } from "express";
import { UserRole } from "../generated/prisma/client";
import { authenticateUser, requireRole } from "../middlewares/auth.middleware";
import { validateRequest } from "../middlewares/validate.middleware";
import {
  createSupportQueryController,
  listSupportQueriesController,
  resolveSupportQueryController,
} from "../controllers/support-query.controller";
import { createSupportQuerySchema } from "../validators/support-query.schema";

const supportQueryRouter = Router();

supportQueryRouter.get(
  "/",
  authenticateUser,
  requireRole(UserRole.ADMIN),
  listSupportQueriesController,
);

supportQueryRouter.post(
  "/",
  authenticateUser,
  requireRole(UserRole.OWNER, UserRole.RENTER),
  validateRequest(createSupportQuerySchema),
  createSupportQueryController,
);

supportQueryRouter.delete(
  "/:id",
  authenticateUser,
  requireRole(UserRole.ADMIN),
  resolveSupportQueryController,
);

export { supportQueryRouter };
