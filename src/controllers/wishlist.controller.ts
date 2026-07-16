import type { Request, Response } from "express";
import { logger } from "../lib/logger.js";
import {
  addWishlistItem,
  getMyWishlistListings,
  removeWishlistItem,
  WishlistServiceError,
} from "../services/wishlist.service.js";
import type { WishlistEquipmentParams } from "../validators/wishlist.schema.js";

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

function handleWishlistError(res: Response, error: unknown) {
  if (error instanceof WishlistServiceError) {
    return sendError(res, error.statusCode, error.message, { code: error.code });
  }

  logger.error("Wishlist controller error", {
    service: "wishlist.controller",
    action: "handleWishlistError",
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return sendError(res, 500, "Something went wrong.");
}

function getAuthenticatedUserId(req: Request) {
  return req.user?.userId ?? null;
}

function getEquipmentId(req: Request) {
  const params = req.params as WishlistEquipmentParams;
  return params.equipmentId?.trim() || null;
}

export async function getMyWishlistController(req: Request, res: Response) {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return sendError(res, 401, "Unauthorized.");
    }

    const listings = await getMyWishlistListings(userId);
    return sendSuccess(res, 200, "Wishlist fetched successfully.", listings);
  } catch (error) {
    return handleWishlistError(res, error);
  }
}

export async function addWishlistItemController(req: Request, res: Response) {
  try {
    const userId = getAuthenticatedUserId(req);
    const equipmentId = getEquipmentId(req);

    if (!userId) {
      return sendError(res, 401, "Unauthorized.");
    }

    if (!equipmentId) {
      return sendError(res, 400, "Equipment id is required.");
    }

    const listing = await addWishlistItem(userId, equipmentId);
    return sendSuccess(res, 201, "Equipment added to wishlist successfully.", listing);
  } catch (error) {
    return handleWishlistError(res, error);
  }
}


export async function removeWishlistItemController(req: Request, res: Response) {
  try {
    const userId = getAuthenticatedUserId(req);
    const equipmentId = getEquipmentId(req);

    if (!userId) {
      return sendError(res, 401, "Unauthorized.");
    }

    if (!equipmentId) {
      return sendError(res, 400, "Equipment id is required.");
    }

    const result = await removeWishlistItem(userId, equipmentId);
    return sendSuccess(res, 200, "Equipment removed from wishlist successfully.", result);
  } catch (error) {
    return handleWishlistError(res, error);
  }
}
