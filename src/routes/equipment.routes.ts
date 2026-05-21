import { Router } from "express";
import { UserRole } from "../generated/prisma/client";
import { attachOptionalUser, authenticateUser, requireRole, requireVerifiedMobile } from "../middlewares/auth.middleware";
import { validateRequest } from "../middlewares/validate.middleware";
import { uploadEquipmentImages, uploadOptionalEquipmentImages, uploadOptionalReviewImages } from "../middlewares/image-upload.middleware";
import {
  addressSuggestionsController,
  approveEquipmentController,
  createDraftEquipmentController,
  createEquipmentController,
  createEquipmentReviewController,
  deleteEquipmentController,
  geocodeEquipmentController,
  geocodeEquipmentPlaceIdController,
  getFeaturedEquipmentController,
  getMyEquipmentController,
  getPendingEquipmentController,
  getPublicEquipmentController,
  getPublicEquipmentByIdController,
  getEquipmentReviewsController,
  rejectEquipmentController,
  submitOwnerEquipmentController,
  updateEquipmentReviewController,
  updateOwnerEquipmentController,
} from "../controllers/equipment.controller";
import {
  addressSuggestionsSchema,
  createEquipmentSchema,
  createDraftEquipmentSchema,
  createEquipmentReviewSchema,
  equipmentIdSchema,
  geocodeEquipmentSchema,
  placeIdSchema,
  rejectEquipmentSchema,
  updateEquipmentReviewSchema,
  updateOwnerEquipmentSchema,
} from "../validators/equipment.schema";

const equipmentRouter = Router();

equipmentRouter.get(
  "/",
  attachOptionalUser,
  getPublicEquipmentController
);

equipmentRouter.get(
  "/featured",
  attachOptionalUser,
  getFeaturedEquipmentController
);

equipmentRouter.get(
  "/address-suggestions",
  authenticateUser,
  requireVerifiedMobile(),
  requireRole(UserRole.OWNER),
  validateRequest(addressSuggestionsSchema, "query"),
  addressSuggestionsController
);

equipmentRouter.get(
  "/address-details",
  authenticateUser,
  requireVerifiedMobile(),
  requireRole(UserRole.OWNER),
  validateRequest(placeIdSchema, "query"),
  geocodeEquipmentPlaceIdController
);

equipmentRouter.post(
  "/geocode",
  authenticateUser,
  requireVerifiedMobile(),
  requireRole(UserRole.OWNER),
  validateRequest(geocodeEquipmentSchema),
  geocodeEquipmentController
);

equipmentRouter.post(
  "/",
  authenticateUser,
  requireVerifiedMobile(),
  requireRole(UserRole.OWNER),
  uploadEquipmentImages,
  validateRequest(createEquipmentSchema),
  createEquipmentController
);

equipmentRouter.post(
  "/drafts",
  authenticateUser,
  requireRole(UserRole.OWNER),
  uploadOptionalEquipmentImages,
  validateRequest(createDraftEquipmentSchema),
  createDraftEquipmentController
);

equipmentRouter.get(
  "/mine",
  authenticateUser,
  requireRole(UserRole.OWNER),
  getMyEquipmentController
);

equipmentRouter.patch(
  "/:id",
  authenticateUser,
  requireRole(UserRole.OWNER),
  uploadOptionalEquipmentImages,
  validateRequest(updateOwnerEquipmentSchema),
  updateOwnerEquipmentController
);

equipmentRouter.patch(
  "/:id/submit",
  authenticateUser,
  requireVerifiedMobile(),
  requireRole(UserRole.OWNER),
  uploadOptionalEquipmentImages,
  validateRequest(updateOwnerEquipmentSchema),
  submitOwnerEquipmentController
);

equipmentRouter.delete(
  "/:id",
  authenticateUser,
  requireRole(UserRole.OWNER),
  deleteEquipmentController
);

equipmentRouter.get(
  "/pending",
  authenticateUser,
  requireRole(UserRole.ADMIN),
  getPendingEquipmentController
);

equipmentRouter.patch(
  "/:id/approve",
  authenticateUser,
  requireRole(UserRole.ADMIN),
  approveEquipmentController
);

equipmentRouter.patch(
  "/:id/reject",
  authenticateUser,
  requireRole(UserRole.ADMIN),
  validateRequest(rejectEquipmentSchema),
  rejectEquipmentController
);

equipmentRouter.get(
  "/:id/reviews",
  attachOptionalUser,
  validateRequest(equipmentIdSchema, "params"),
  getEquipmentReviewsController
);

equipmentRouter.post(
  "/:id/reviews",
  authenticateUser,
  uploadOptionalReviewImages,
  validateRequest(equipmentIdSchema, "params"),
  validateRequest(createEquipmentReviewSchema),
  createEquipmentReviewController
);

equipmentRouter.patch(
  "/:id/reviews/me",
  authenticateUser,
  uploadOptionalReviewImages,
  validateRequest(equipmentIdSchema, "params"),
  validateRequest(updateEquipmentReviewSchema),
  updateEquipmentReviewController
);

equipmentRouter.get(
  "/:id",
  attachOptionalUser,
  getPublicEquipmentByIdController
);

export { equipmentRouter };
