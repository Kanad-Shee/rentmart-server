import { Router } from "express";
import { UserRole } from "@prisma/client";
import { attachOptionalUser, authenticateUser, requireRole, requireVerifiedMobile } from "../middlewares/auth.middleware.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import { uploadEquipmentImages, uploadOptionalEquipmentImages, uploadOptionalReviewImages } from "../middlewares/image-upload.middleware.js";
import {
  addressSuggestionsController,
  approveEquipmentController,
  createDraftEquipmentController,
  createEquipmentController,
  generateEquipmentListingDescriptionController,
  generateEquipmentReviewSummaryController,
  createEquipmentReviewController,
  deleteEquipmentController,
  geocodeEquipmentController,
  geocodeEquipmentPlaceIdController,
  getFeaturedEquipmentController,
  getAdminEquipmentReviewSummaryListingsController,
  getMyEquipmentController,
  getPendingEquipmentController,
  getPublicEquipmentController,
  getPublicEquipmentByIdController,
  getEquipmentReviewsController,
  rejectEquipmentController,
  submitOwnerEquipmentController,
  updateEquipmentReviewController,
  updateEquipmentReviewSummaryVisibilityController,
  updateOwnerEquipmentController,
} from "../controllers/equipment.controller.js";
import {
  addressSuggestionsSchema,
  adminEquipmentReviewSummaryQuerySchema,
  createEquipmentSchema,
  createDraftEquipmentSchema,
  createEquipmentReviewSchema,
  equipmentIdSchema,
  generateListingDescriptionSchema,
  geocodeEquipmentSchema,
  ownerEquipmentQuerySchema,
  pendingEquipmentQuerySchema,
  placeIdSchema,
  rejectEquipmentSchema,
  updateEquipmentReviewSchema,
  updateOwnerEquipmentSchema,
  updateReviewSummaryVisibilitySchema,
} from "../validators/equipment.schema.js";

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
  "/ai/listing-description",
  authenticateUser,
  requireRole(UserRole.OWNER),
  validateRequest(generateListingDescriptionSchema),
  generateEquipmentListingDescriptionController
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
  validateRequest(ownerEquipmentQuerySchema, "query"),
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
  "/admin/review-summaries",
  authenticateUser,
  requireRole(UserRole.ADMIN),
  validateRequest(adminEquipmentReviewSummaryQuerySchema, "query"),
  getAdminEquipmentReviewSummaryListingsController
);

equipmentRouter.get(
  "/pending",
  authenticateUser,
  requireRole(UserRole.ADMIN),
  validateRequest(pendingEquipmentQuerySchema, "query"),
  getPendingEquipmentController
);

equipmentRouter.patch(
  "/:id/review-summary/generate",
  authenticateUser,
  requireRole(UserRole.ADMIN),
  validateRequest(equipmentIdSchema, "params"),
  generateEquipmentReviewSummaryController
);

equipmentRouter.patch(
  "/:id/review-summary/visibility",
  authenticateUser,
  requireRole(UserRole.ADMIN),
  validateRequest(equipmentIdSchema, "params"),
  validateRequest(updateReviewSummaryVisibilitySchema),
  updateEquipmentReviewSummaryVisibilityController
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
