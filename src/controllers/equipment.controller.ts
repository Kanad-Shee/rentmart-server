import type { Request, Response } from "express";
import { logger } from "../lib/logger.js";
import {
  approveEquipmentListing,
  createDraftEquipmentListing,
  createEquipmentListing,
  createEquipmentReview,
  deleteEquipmentListing,
  EquipmentServiceError,
  getEquipmentReviewDetails,
  getFeaturedEquipmentListings,
  getEquipmentAddressSuggestions,
  getPublicEquipmentListings,
  geocodeEquipmentLocation,
  geocodeEquipmentLocationByPlaceId,
  getOwnerEquipmentListings,
  getPendingEquipmentListings,
  getPublicEquipmentListingById,
  rejectEquipmentListing,
  updateEquipmentReview,
  updateOwnerEquipmentListing,
} from "../services/equipment.service.js";
import type {
  AddressSuggestionsInput,
  CreateEquipmentInput,
  CreateDraftEquipmentInput,
  CreateEquipmentReviewInput,
  GeocodeEquipmentInput,
  OwnerEquipmentQueryInput,
  PendingEquipmentQueryInput,
  PlaceIdInput,
  RejectEquipmentInput,
  UpdateEquipmentReviewInput,
  UpdateOwnerEquipmentInput,
} from "../validators/equipment.schema.js";

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

function handleEquipmentError(res: Response, error: unknown) {
  if (error instanceof EquipmentServiceError) {
    return sendError(res, error.statusCode, error.message, { code: error.code });
  }

  logger.error("Equipment controller error", {
    service: "equipment.controller",
    action: "handleEquipmentError",
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return sendError(res, 500, "Something went wrong.");
}

function getAuthenticatedOwnerId(req: Request) {
  return req.user?.userId ?? null;
}

function getEquipmentIdParam(req: Request) {
  const equipmentId = req.params.id;

  if (typeof equipmentId !== "string" || equipmentId.trim().length === 0) {
    return null;
  }

  return equipmentId.trim();
}

export async function geocodeEquipmentController(req: Request, res: Response) {
  try {
    const input = req.body as GeocodeEquipmentInput;
    const location = await geocodeEquipmentLocation(input.address);

    return sendSuccess(res, 200, "Address resolved successfully.", location);
  } catch (error) {
    return handleEquipmentError(res, error);
  }
}

export async function addressSuggestionsController(req: Request, res: Response) {
  try {
    const input = req.query as AddressSuggestionsInput;
    const suggestions = await getEquipmentAddressSuggestions(input.input);

    return sendSuccess(res, 200, "Address suggestions fetched successfully.", suggestions);
  } catch (error) {
    return handleEquipmentError(res, error);
  }
}

export async function geocodeEquipmentPlaceIdController(req: Request, res: Response) {
  try {
    const input = req.query as PlaceIdInput;
    const location = await geocodeEquipmentLocationByPlaceId(input.placeId);

    return sendSuccess(res, 200, "Address resolved successfully.", location);
  } catch (error) {
    return handleEquipmentError(res, error);
  }
}

export async function createEquipmentController(req: Request, res: Response) {
  try {
    const ownerId = getAuthenticatedOwnerId(req);

    if (!ownerId) {
      return sendError(res, 401, "Unauthorized.");
    }

    const input = req.body as CreateEquipmentInput;
    const files = (req.files as Express.Multer.File[]) ?? [];
    const equipment = await createEquipmentListing(ownerId, input, files);

    return sendSuccess(res, 201, "Equipment listing created successfully.", equipment);
  } catch (error) {
    return handleEquipmentError(res, error);
  }
}

export async function createDraftEquipmentController(req: Request, res: Response) {
  try {
    const ownerId = getAuthenticatedOwnerId(req);

    if (!ownerId) {
      return sendError(res, 401, "Unauthorized.");
    }

    const input = req.body as CreateDraftEquipmentInput;
    const files = (req.files as Express.Multer.File[]) ?? [];
    const equipment = await createDraftEquipmentListing(ownerId, input, files);

    return sendSuccess(res, 201, "Draft listing saved successfully.", equipment);
  } catch (error) {
    return handleEquipmentError(res, error);
  }
}

export async function getMyEquipmentController(req: Request, res: Response) {
  try {
    const ownerId = getAuthenticatedOwnerId(req);

    if (!ownerId) {
      return sendError(res, 401, "Unauthorized.");
    }

    const listings = await getOwnerEquipmentListings(
      ownerId,
      req.query as unknown as OwnerEquipmentQueryInput,
    );

    return sendSuccess(res, 200, "Equipment listings fetched successfully.", listings);
  } catch (error) {
    return handleEquipmentError(res, error);
  }
}

export async function getFeaturedEquipmentController(_req: Request, res: Response) {
  try {
    const renterId = _req.user?.role === "RENTER" ? _req.user.userId : undefined;
    const listings = await getFeaturedEquipmentListings(4, renterId);

    return sendSuccess(res, 200, "Featured equipment listings fetched successfully.", listings);
  } catch (error) {
    return handleEquipmentError(res, error);
  }
}

export async function getPublicEquipmentController(req: Request, res: Response) {
  try {
    const categoryId =
      typeof req.query.categoryId === "string" ? req.query.categoryId.trim() : undefined;
    const renterId = req.user?.role === "RENTER" ? req.user.userId : undefined;
    const listings = await getPublicEquipmentListings(categoryId, renterId);

    return sendSuccess(res, 200, "Equipment listings fetched successfully.", listings);
  } catch (error) {
    return handleEquipmentError(res, error);
  }
}

export async function getPublicEquipmentByIdController(req: Request, res: Response) {
  try {
    const equipmentId = getEquipmentIdParam(req);

    if (!equipmentId) {
      return sendError(res, 400, "Equipment id is required.");
    }

    const renterId = req.user?.role === "RENTER" ? req.user.userId : undefined;
    const equipment = await getPublicEquipmentListingById(equipmentId, renterId);

    return sendSuccess(res, 200, "Equipment listing fetched successfully.", equipment);
  } catch (error) {
    return handleEquipmentError(res, error);
  }
}

export async function deleteEquipmentController(req: Request, res: Response) {
  try {
    const ownerId = getAuthenticatedOwnerId(req);
    const equipmentId = getEquipmentIdParam(req);

    if (!ownerId) {
      return sendError(res, 401, "Unauthorized.");
    }

    if (!equipmentId) {
      return sendError(res, 400, "Equipment id is required.");
    }

    const result = await deleteEquipmentListing(ownerId, equipmentId);

    return sendSuccess(res, 200, "Equipment listing deleted successfully.", result);
  } catch (error) {
    return handleEquipmentError(res, error);
  }
}

export async function updateOwnerEquipmentController(req: Request, res: Response) {
  try {
    const ownerId = getAuthenticatedOwnerId(req);
    const equipmentId = getEquipmentIdParam(req);

    if (!ownerId) {
      return sendError(res, 401, "Unauthorized.");
    }

    if (!equipmentId) {
      return sendError(res, 400, "Equipment id is required.");
    }

    const input = req.body as UpdateOwnerEquipmentInput;
    const files = (req.files as Express.Multer.File[]) ?? [];
    const equipment = await updateOwnerEquipmentListing(ownerId, equipmentId, input, files, "DRAFT");

    return sendSuccess(res, 200, "Draft listing updated successfully.", equipment);
  } catch (error) {
    return handleEquipmentError(res, error);
  }
}

export async function submitOwnerEquipmentController(req: Request, res: Response) {
  try {
    const ownerId = getAuthenticatedOwnerId(req);
    const equipmentId = getEquipmentIdParam(req);

    if (!ownerId) {
      return sendError(res, 401, "Unauthorized.");
    }

    if (!equipmentId) {
      return sendError(res, 400, "Equipment id is required.");
    }

    const input = req.body as UpdateOwnerEquipmentInput;
    const files = (req.files as Express.Multer.File[]) ?? [];
    const equipment = await updateOwnerEquipmentListing(
      ownerId,
      equipmentId,
      input,
      files,
      "PENDING_VERIFICATION",
    );

    return sendSuccess(res, 200, "Listing submitted for verification successfully.", equipment);
  } catch (error) {
    return handleEquipmentError(res, error);
  }
}

export async function getPendingEquipmentController(req: Request, res: Response) {
  try {
    const listings = await getPendingEquipmentListings(
      req.query as unknown as PendingEquipmentQueryInput,
    );

    return sendSuccess(res, 200, "Pending equipment listings fetched successfully.", listings);
  } catch (error) {
    return handleEquipmentError(res, error);
  }
}

export async function approveEquipmentController(req: Request, res: Response) {
  try {
    const adminId = getAuthenticatedOwnerId(req);
    const equipmentId = getEquipmentIdParam(req);

    if (!adminId) {
      return sendError(res, 401, "Unauthorized.");
    }

    if (!equipmentId) {
      return sendError(res, 400, "Equipment id is required.");
    }

    const equipment = await approveEquipmentListing(adminId, equipmentId);

    return sendSuccess(res, 200, "Equipment listing approved successfully.", equipment);
  } catch (error) {
    return handleEquipmentError(res, error);
  }
}

export async function rejectEquipmentController(req: Request, res: Response) {
  try {
    const adminId = getAuthenticatedOwnerId(req);
    const equipmentId = getEquipmentIdParam(req);

    if (!adminId) {
      return sendError(res, 401, "Unauthorized.");
    }

    if (!equipmentId) {
      return sendError(res, 400, "Equipment id is required.");
    }

    const input = req.body as RejectEquipmentInput;
    const equipment = await rejectEquipmentListing(adminId, equipmentId, input);

    return sendSuccess(res, 200, "Equipment listing rejected successfully.", equipment);
  } catch (error) {
    return handleEquipmentError(res, error);
  }
}

export async function getEquipmentReviewsController(req: Request, res: Response) {
  try {
    const equipmentId = getEquipmentIdParam(req);

    if (!equipmentId) {
      return sendError(res, 400, "Equipment id is required.");
    }

    const renterId = req.user?.role === "RENTER" ? req.user.userId : undefined;
    const reviews = await getEquipmentReviewDetails(equipmentId, renterId);

    return sendSuccess(res, 200, "Equipment reviews fetched successfully.", reviews);
  } catch (error) {
    return handleEquipmentError(res, error);
  }
}

export async function createEquipmentReviewController(req: Request, res: Response) {
  try {
    const renterId = req.user?.userId ?? null;
    const equipmentId = getEquipmentIdParam(req);

    if (!renterId) {
      return sendError(res, 401, "Unauthorized.");
    }

    if (!equipmentId) {
      return sendError(res, 400, "Equipment id is required.");
    }

    const input = req.body as CreateEquipmentReviewInput;
    const files = (req.files as Express.Multer.File[]) ?? [];
    const reviews = await createEquipmentReview(renterId, equipmentId, input, files);

    return sendSuccess(res, 201, "Equipment review created successfully.", reviews);
  } catch (error) {
    return handleEquipmentError(res, error);
  }
}

export async function updateEquipmentReviewController(req: Request, res: Response) {
  try {
    const renterId = req.user?.userId ?? null;
    const equipmentId = getEquipmentIdParam(req);

    if (!renterId) {
      return sendError(res, 401, "Unauthorized.");
    }

    if (!equipmentId) {
      return sendError(res, 400, "Equipment id is required.");
    }

    const input = req.body as UpdateEquipmentReviewInput;
    const files = (req.files as Express.Multer.File[]) ?? [];
    const reviews = await updateEquipmentReview(renterId, equipmentId, input, files);

    return sendSuccess(res, 200, "Equipment review updated successfully.", reviews);
  } catch (error) {
    return handleEquipmentError(res, error);
  }
}
