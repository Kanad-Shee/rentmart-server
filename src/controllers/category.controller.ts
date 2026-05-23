import type { Request, Response } from "express";
import { logger } from "../lib/logger.js";
import {
  CategoryServiceError,
  createCategory,
  deleteCategory,
  getCategory,
  getCategories,
  updateCategory,
} from "../services/category.service.js";
import type { CreateCategoryInput, UpdateCategoryInput } from "../validators/category.schema.js";

function sendSuccess<T>(res: Response, status: number, message: string, data: T) {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
}

function sendError(res: Response, status: number, message: string, errors?: unknown) {
  return res.status(status).json({
    success: false,
    message,
    ...(errors ? { errors } : {}),
  });
}

function handleCategoryError(res: Response, error: unknown) {
  if (error instanceof CategoryServiceError) {
    return sendError(res, error.statusCode, error.message, { code: error.code });
  }

  logger.error("Category controller error", {
    service: "category.controller",
    action: "handleCategoryError",
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return sendError(res, 500, "Something went wrong.");
}

function getCategoryIdParam(req: Request) {
  const id = req.params.id;

  if (typeof id !== "string" || id.trim().length === 0) {
    return null;
  }

  return id.trim();
}

export async function listCategoriesController(_req: Request, res: Response) {
  try {
    const categories = await getCategories();

    return sendSuccess(res, 200, "Categories fetched successfully.", categories);
  } catch (error) {
    return handleCategoryError(res, error);
  }
}

export async function getCategoryController(req: Request, res: Response) {
  try {
    const id = getCategoryIdParam(req);

    if (!id) {
      return sendError(res, 400, "Category id is required.");
    }

    const category = await getCategory(id);

    return sendSuccess(res, 200, "Category fetched successfully.", category);
  } catch (error) {
    return handleCategoryError(res, error);
  }
}

export async function createCategoryController(req: Request, res: Response) {
  try {
    const input = req.body as CreateCategoryInput;
    const file = (req.files as Express.Multer.File[] | undefined)?.[0];

    if (!file) {
      return sendError(res, 400, "Category image is required.");
    }

    const category = await createCategory(input, file);

    return sendSuccess(res, 201, "Category created successfully.", category);
  } catch (error) {
    return handleCategoryError(res, error);
  }
}

export async function deleteCategoryController(req: Request, res: Response) {
  try {
    const id = getCategoryIdParam(req);

    if (!id) {
      return sendError(res, 400, "Category id is required.");
    }

    const result = await deleteCategory(id);

    return sendSuccess(res, 200, "Category deleted successfully.", result);
  } catch (error) {
    return handleCategoryError(res, error);
  }
}

export async function updateCategoryController(req: Request, res: Response) {
  try {
    const id = getCategoryIdParam(req);

    if (!id) {
      return sendError(res, 400, "Category id is required.");
    }

    const input = req.body as UpdateCategoryInput;
    const file = (req.files as Express.Multer.File[] | undefined)?.[0];
    const category = await updateCategory(id, input, file);

    return sendSuccess(res, 200, "Category updated successfully.", category);
  } catch (error) {
    return handleCategoryError(res, error);
  }
}
