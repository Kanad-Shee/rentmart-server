import { Router } from "express";
import { UserRole } from "@prisma/client";
import { authenticateUser, requireRole } from "../middlewares/auth.middleware.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import {
  createSupportQueryController,
  listSupportQueriesController,
  resolveSupportQueryController,
} from "../controllers/support-query.controller.js";
import { createSupportQuerySchema } from "../validators/support-query.schema.js";

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
