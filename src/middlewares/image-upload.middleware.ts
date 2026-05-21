import multer from "multer";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ImageValidationOptions } from "../lib/equipment-image-validation";
import { validateImageFiles } from "../lib/equipment-image-validation";
import { CATEGORY_IMAGE_LIMITS } from "../configs/category.config";
import { BOOKING_DISPUTE_IMAGE_LIMITS } from "../configs/booking.config";
import { EQUIPMENT_IMAGE_LIMITS, REVIEW_IMAGE_LIMITS } from "../configs/equipment.config";

type UploadOptions = ImageValidationOptions & {
  fieldName: string;
};

const memoryStorage = multer.memoryStorage();

function sendUploadError(res: Response, message: string) {
  return res.status(400).json({
    success: false,
    message,
  });
}

export function createImageUploadMiddleware(options: UploadOptions): RequestHandler {
  const upload = multer({
    storage: memoryStorage,
    limits: {
      files: options.maxFiles,
      fileSize: options.maxBytes,
    },
    fileFilter(_req, file, cb) {
      if (!file.mimetype.startsWith("image/")) {
        return cb(new Error("Only image files are allowed."));
      }

      return cb(null, true);
    },
  });

  return (req: Request, res: Response, next: NextFunction) => {
    const middleware = upload.array(options.fieldName, options.maxFiles);

    middleware(req, res, (error) => {
      if (error) {
        if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
          return sendUploadError(res, `Each image must be ${Math.floor(options.maxBytes / 1024)} KB or smaller.`);
        }

        if (error instanceof multer.MulterError && error.code === "LIMIT_UNEXPECTED_FILE") {
          return sendUploadError(
            res,
            `Please upload no more than ${options.maxFiles} image${options.maxFiles === 1 ? "" : "s"}.`
          );
        }

        return sendUploadError(res, error instanceof Error ? error.message : "Image upload failed.");
      }

      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const validation = validateImageFiles(files, options);

      if (!validation.ok) {
        return sendUploadError(res, validation.message);
      }

      return next();
    });
  };
}

export const uploadEquipmentImages = createImageUploadMiddleware({
  fieldName: "images",
  minFiles: EQUIPMENT_IMAGE_LIMITS.min,
  maxFiles: EQUIPMENT_IMAGE_LIMITS.max,
  maxBytes: EQUIPMENT_IMAGE_LIMITS.maxBytes,
});

export const uploadOptionalEquipmentImages = createImageUploadMiddleware({
  fieldName: "images",
  minFiles: 0,
  maxFiles: EQUIPMENT_IMAGE_LIMITS.max,
  maxBytes: EQUIPMENT_IMAGE_LIMITS.maxBytes,
});

export const uploadOptionalReviewImages = createImageUploadMiddleware({
  fieldName: "photos",
  minFiles: REVIEW_IMAGE_LIMITS.min,
  maxFiles: REVIEW_IMAGE_LIMITS.max,
  maxBytes: REVIEW_IMAGE_LIMITS.maxBytes,
});

export const uploadOptionalBookingDisputeImages = createImageUploadMiddleware({
  fieldName: "photos",
  minFiles: BOOKING_DISPUTE_IMAGE_LIMITS.min,
  maxFiles: BOOKING_DISPUTE_IMAGE_LIMITS.max,
  maxBytes: BOOKING_DISPUTE_IMAGE_LIMITS.maxBytes,
});

export const uploadCategoryImage = createImageUploadMiddleware({
  fieldName: "image",
  minFiles: CATEGORY_IMAGE_LIMITS.min,
  maxFiles: CATEGORY_IMAGE_LIMITS.max,
  maxBytes: CATEGORY_IMAGE_LIMITS.maxBytes,
});

export const uploadOptionalCategoryImage = createImageUploadMiddleware({
  fieldName: "image",
  minFiles: 0,
  maxFiles: CATEGORY_IMAGE_LIMITS.max,
  maxBytes: CATEGORY_IMAGE_LIMITS.maxBytes,
});
