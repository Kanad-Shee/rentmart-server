import { Router } from "express";
import { UserRole } from "../generated/prisma/client";
import { authenticateUser, requireRole } from "../middlewares/auth.middleware";
import { uploadCategoryImage, uploadOptionalCategoryImage } from "../middlewares/image-upload.middleware";
import { validateRequest } from "../middlewares/validate.middleware";
import {
  createCategoryController,
  deleteCategoryController,
  getCategoryController,
  listCategoriesController,
  updateCategoryController,
} from "../controllers/category.controller";
import { createCategorySchema, updateCategorySchema } from "../validators/category.schema";

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
