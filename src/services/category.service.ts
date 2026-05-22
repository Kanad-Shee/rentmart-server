import { Prisma } from "@prisma/client";
import { deleteCloudinaryImage, uploadCategoryImage } from "../lib/cloudinary.js";
import { db } from "../lib/db.js";
import { logServiceError } from "../lib/error-logger.js";
import type { SafeCategory } from "../types/category.js";
import type { CreateCategoryInput, UpdateCategoryInput } from "../validators/category.schema.js";

type CategoryRow = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  imagePublicId: string;
  activeListingCount?: bigint;
  createdAt: Date;
  updatedAt: Date;
};

export class CategoryServiceError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = "CATEGORY_ERROR") {
    super(message);
    this.name = "CategoryServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function toSafeCategory(row: CategoryRow): SafeCategory {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    activeListingCount: Number(row.activeListingCount ?? 0n),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getCategoryByTitle(title: string) {
  const rows = await db.$queryRaw<CategoryRow[]>(Prisma.sql`
    SELECT
      c."id",
      c."title",
      c."description",
      c."imageUrl",
      c."imagePublicId",
      (
        SELECT COUNT(*)::bigint
        FROM "Equipment" e
        WHERE e."categoryId" = c."id"
          AND e."status" = ${"ACTIVE"}
      ) AS "activeListingCount",
      c."createdAt",
      c."updatedAt"
    FROM "Category" c
    WHERE LOWER(c."title") = LOWER(${title})
    LIMIT 1
  `);

  return rows[0] ?? null;
}

async function getCategoryById(id: string) {
  const rows = await db.$queryRaw<CategoryRow[]>(Prisma.sql`
    SELECT
      c."id",
      c."title",
      c."description",
      c."imageUrl",
      c."imagePublicId",
      (
        SELECT COUNT(*)::bigint
        FROM "Equipment" e
        WHERE e."categoryId" = c."id"
          AND e."status" = ${"ACTIVE"}
      ) AS "activeListingCount",
      c."createdAt",
      c."updatedAt"
    FROM "Category" c
    WHERE c."id" = ${id}
    LIMIT 1
  `);

  return rows[0] ?? null;
}

export async function getCategory(id: string) {
  const category = await getCategoryById(id);

  if (!category) {
    throw new CategoryServiceError("Category not found.", 404, "CATEGORY_NOT_FOUND");
  }

  return toSafeCategory(category);
}

export async function getCategories() {
  const rows = await db.$queryRaw<CategoryRow[]>(Prisma.sql`
    SELECT
      c."id",
      c."title",
      c."description",
      c."imageUrl",
      c."imagePublicId",
      COUNT(e."id")::bigint AS "activeListingCount",
      c."createdAt",
      c."updatedAt"
    FROM "Category" c
    LEFT JOIN "Equipment" e
      ON e."categoryId" = c."id"
      AND e."status" = ${"ACTIVE"}
    GROUP BY
      c."id",
      c."title",
      c."description",
      c."imageUrl",
      c."imagePublicId",
      c."createdAt",
      c."updatedAt"
    ORDER BY c."createdAt" ASC
  `);

  return rows.map(toSafeCategory);
}

export async function createCategory(input: CreateCategoryInput, file: Express.Multer.File) {
  const existingCategory = await getCategoryByTitle(input.title);

  if (existingCategory) {
    throw new CategoryServiceError("A category with this title already exists.", 409, "CATEGORY_EXISTS");
  }

  let uploadedImage;

  try {
    uploadedImage = await uploadCategoryImage(file);
  } catch (error) {
    logServiceError({
      service: "category.service",
      action: "createCategory.uploadCategoryImage",
      error,
      context: {
        title: input.title.trim(),
      },
    });
    throw new CategoryServiceError(
      error instanceof Error ? error.message : "Failed to upload category image.",
      502,
      "IMAGE_UPLOAD_FAILED"
    );
  }

  try {
    const created = await db.category.create({
      data: {
        title: input.title.trim(),
        description: input.description.trim(),
        imageUrl: uploadedImage.secureUrl,
        imagePublicId: uploadedImage.publicId,
      },
    });

    if (!created) {
      throw new CategoryServiceError("Category could not be created.", 500, "CATEGORY_CREATE_FAILED");
    }

    return toSafeCategory(created);
  } catch (error) {
    try {
      await deleteCloudinaryImage(uploadedImage.publicId);
    } catch (cleanupError) {
      logServiceError({
        service: "category.service",
        action: "createCategory.cleanupUploadedImage",
        error: cleanupError,
        context: {
          publicId: uploadedImage.publicId,
        },
      });
    }

    logServiceError({
      service: "category.service",
      action: "createCategory.dbCreate",
      error,
      context: {
        title: input.title.trim(),
        imagePublicId: uploadedImage.publicId,
      },
    });

    if (error instanceof CategoryServiceError) {
      throw error;
    }

    throw new CategoryServiceError("Category could not be created.", 500, "CATEGORY_CREATE_FAILED");
  }
}

export async function updateCategory(
  id: string,
  input: UpdateCategoryInput,
  file?: Express.Multer.File
) {
  const category = await getCategoryById(id);

  if (!category) {
    throw new CategoryServiceError("Category not found.", 404, "CATEGORY_NOT_FOUND");
  }

  const normalizedTitle = input.title.trim();
  const existingCategory = await getCategoryByTitle(normalizedTitle);

  if (existingCategory && existingCategory.id !== id) {
    throw new CategoryServiceError("A category with this title already exists.", 409, "CATEGORY_EXISTS");
  }

  let nextImageUrl = category.imageUrl;
  let nextImagePublicId = category.imagePublicId;
  let uploadedImage:
    | {
        secureUrl: string;
        publicId: string;
      }
    | undefined;

  if (file) {
    try {
      uploadedImage = await uploadCategoryImage(file);
      nextImageUrl = uploadedImage.secureUrl;
      nextImagePublicId = uploadedImage.publicId;
    } catch (error) {
      logServiceError({
        service: "category.service",
        action: "updateCategory.uploadCategoryImage",
        error,
        context: {
          categoryId: id,
          title: normalizedTitle,
        },
      });
      throw new CategoryServiceError(
        error instanceof Error ? error.message : "Failed to upload category image.",
        502,
        "IMAGE_UPLOAD_FAILED"
      );
    }
  }

  try {
    const updated = await db.category.update({
      where: { id },
      data: {
        title: normalizedTitle,
        description: input.description.trim(),
        imageUrl: nextImageUrl,
        imagePublicId: nextImagePublicId,
      },
    });

    if (uploadedImage && category.imagePublicId !== nextImagePublicId) {
      await deleteCloudinaryImage(category.imagePublicId);
    }

    return toSafeCategory(updated);
  } catch (error) {
    if (uploadedImage) {
      try {
        await deleteCloudinaryImage(uploadedImage.publicId);
      } catch (cleanupError) {
        logServiceError({
          service: "category.service",
          action: "updateCategory.cleanupUploadedImage",
          error: cleanupError,
          context: {
            categoryId: id,
            publicId: uploadedImage.publicId,
          },
        });
      }
    }

    logServiceError({
      service: "category.service",
      action: "updateCategory.dbUpdate",
      error,
      context: {
        categoryId: id,
        hasNewUpload: Boolean(uploadedImage),
      },
    });

    if (error instanceof CategoryServiceError) {
      throw error;
    }

    throw new CategoryServiceError("Category could not be updated.", 500, "CATEGORY_UPDATE_FAILED");
  }
}

export async function deleteCategory(id: string) {
  const category = await getCategoryById(id);

  if (!category) {
    throw new CategoryServiceError("Category not found.", 404, "CATEGORY_NOT_FOUND");
  }

  const usageCount = Number(category.activeListingCount ?? 0);

  if (usageCount > 0) {
    throw new CategoryServiceError("Category is currently used by equipment listings.", 409, "CATEGORY_IN_USE");
  }

  await deleteCloudinaryImage(category.imagePublicId);

  const deletedRows = await db.$queryRaw<CategoryRow[]>(Prisma.sql`
    DELETE FROM "Category"
    WHERE "id" = ${id}
    RETURNING
      "id",
      "title",
      "description",
      "imageUrl",
      "imagePublicId",
      0::bigint AS "activeListingCount",
      "createdAt",
      "updatedAt"
  `);

  const deleted = deletedRows[0];

  if (!deleted) {
    throw new CategoryServiceError("Category not found.", 404, "CATEGORY_NOT_FOUND");
  }

  return { id: deleted.id };
}
