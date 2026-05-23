import { Router } from "express";
import { authenticateUser } from "../middlewares/auth.middleware.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import {
  getMyNotificationsController,
  markAllNotificationsAsReadController,
  markNotificationAsReadController,
} from "../controllers/notification.controller.js";
import { paginationQuerySchema } from "../validators/pagination.schema.js";

const notificationRouter = Router();

notificationRouter.get(
  "/me",
  authenticateUser,
  validateRequest(paginationQuerySchema, "query"),
  getMyNotificationsController,
);

notificationRouter.patch(
  "/read-all",
  authenticateUser,
  markAllNotificationsAsReadController,
);

notificationRouter.patch(
  "/:id/read",
  authenticateUser,
  markNotificationAsReadController,
);

export { notificationRouter };
