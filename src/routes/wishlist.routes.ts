import { Router } from "express";
import { UserRole } from "../generated/prisma/client";
import { authenticateUser, requireRole } from "../middlewares/auth.middleware";
import { validateRequest } from "../middlewares/validate.middleware";
import {
  addWishlistItemController,
  getMyWishlistController,
  removeWishlistItemController,
} from "../controllers/wishlist.controller";
import { wishlistEquipmentParamsSchema } from "../validators/wishlist.schema";

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
