import { Router } from "express";
import { UserRole } from "@prisma/client";
import { authenticateUser, requireRole } from "../middlewares/auth.middleware.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import {
  addWishlistItemController,
  getMyWishlistController,
  removeWishlistItemController,
} from "../controllers/wishlist.controller.js";
import { wishlistEquipmentParamsSchema } from "../validators/wishlist.schema.js";

const wishlistRouter = Router();

wishlistRouter.get(
  "/mine",
  authenticateUser,
  requireRole(UserRole.RENTER),
  getMyWishlistController,
);

wishlistRouter.post(
  "/:equipmentId",
  authenticateUser,
  requireRole(UserRole.RENTER),
  validateRequest(wishlistEquipmentParamsSchema, "params"),
  addWishlistItemController,
);

wishlistRouter.delete(
  "/:equipmentId",
  authenticateUser,
  requireRole(UserRole.RENTER),
  validateRequest(wishlistEquipmentParamsSchema, "params"),
  removeWishlistItemController,
);

export { wishlistRouter };
