import { Router } from "express";
import { UserRole } from "@prisma/client";
import { authenticateUser, requireRole } from "../middlewares/auth.middleware.js";
import { uploadCategoryImage, uploadOptionalCategoryImage } from "../middlewares/image-upload.middleware.js";
import { validateRequest } from "../middlewares/validate.middleware.js";
import {
  createCategoryController,
  deleteCategoryController,
  getCategoryController,
  listCategoriesController,
  updateCategoryController,
} from "../controllers/category.controller.js";
import { createCategorySchema, updateCategorySchema } from "../validators/category.schema.js";

const categoryRouter = Router();

categoryRouter.get("/", listCategoriesController);
categoryRouter.get("/:id", getCategoryController);

categoryRouter.post(
  "/",
  authenticateUser,
  requireRole(UserRole.ADMIN),
  uploadCategoryImage,
  validateRequest(createCategorySchema),
  createCategoryController
);

categoryRouter.delete(
  "/:id",
  authenticateUser,
  requireRole(UserRole.ADMIN),
  deleteCategoryController
);

categoryRouter.patch(
  "/:id",
  authenticateUser,
  requireRole(UserRole.ADMIN),
  uploadOptionalCategoryImage,
  validateRequest(updateCategorySchema),
  updateCategoryController
);

export { categoryRouter };
