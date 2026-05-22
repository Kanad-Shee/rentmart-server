import { Router } from "express";
import { authenticateUser } from "../middlewares/auth.middleware.js";
import {
  getMyNotificationsController,
  markAllNotificationsAsReadController,
  markNotificationAsReadController,
} from "../controllers/notification.controller.js";

const notificationRouter = Router();

notificationRouter.get(
  "/me",
  authenticateUser,
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
