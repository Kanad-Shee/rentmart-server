import { Prisma, UserRole } from "@prisma/client";
import {
  EQUIPMENT_IMAGE_LIMITS,
  type EquipmentStatusValue,
} from "../configs/equipment.config.js";
import { db } from "../lib/db.js";
import { logServiceError } from "../lib/error-logger.js";
import { generateGeminiText } from "../lib/gemini.js";
import { logger } from "../lib/logger.js";
import {
  createPaginatedResult,
  normalizePagination,
  type PaginatedResult,
} from "../lib/pagination.js";
import {
  deleteCloudinaryImage,
  uploadEquipmentImage,
  uploadReviewImage,
} from "../lib/cloudinary.js";
import {
  autocompleteEquipmentAddresses,
  geocodeEquipmentAddress,
  geocodeEquipmentPlaceId,
} from "../lib/mapbox.js";
import {
  createEquipmentApprovedNotification,
  createEquipmentRejectedNotification,
} from "./notification.service.js";
import type {
  EquipmentReviewSummaryDigest,
  EquipmentReviewSummary,
  EquipmentReviewViewerState,
  SafeEquipment,
} from "../types/equipment.js";
import type {
  AdminEquipmentReviewSummaryQueryInput,
  CreateEquipmentInput,
  CreateDraftEquipmentInput,
  GenerateListingDescriptionInput,
  OwnerEquipmentQueryInput,
  PendingEquipmentQueryInput,
  CreateEquipmentReviewInput,
  RejectEquipmentInput,
  UpdateEquipmentReviewInput,
  UpdateOwnerEquipmentInput,
} from "../validators/equipment.schema.js";

type CategoryRow = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  imagePublicId: string;
  createdAt: Date;
  updatedAt: Date;
};

type EquipmentRow = {
  id: string;
  ownerId: string;
  ownerFullName: string;
  ownerEmail: string;
  ownerPhone: string | null;
  ownerAddress: string;
  ownerPhoneVerified: boolean;
  ownerCreatedAt: Date;
  title: string;
  description: string | null;
  categoryId: string;
  price: number;
  deliveryRadius: number;
  address: string;
  normalizedAddress: string;
  latitude: number;
  longitude: number;
  status: string;
  rejectionReason: string | null;
  reviewedAt: Date | null;
  reviewSummaryText: string | null;
  reviewSummaryGeneratedAt: Date | null;
  reviewSummaryReviewCount: number | null;
  reviewSummaryVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
  categoryTitle: string;
  categoryDescription: string;
  categoryImageUrl: string;
  categoryCreatedAt: Date;
  categoryUpdatedAt: Date;
};

type EquipmentImageRow = {
  id: string;
  equipmentId: string;
  url: string;
  publicId: string;
  position: number;
};

type WishlistItemRow = {
  equipmentId: string;
};

type EquipmentReviewAggregateRow = {
  equipmentId: string;
  averageRating: number | null;
  reviewCount: bigint;
};

export class EquipmentServiceError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = "EQUIPMENT_ERROR") {
    super(message);
    this.name = "EquipmentServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

const allowedStatuses: EquipmentStatusValue[] = [
  "DRAFT",
  "PENDING_VERIFICATION",
  "ACTIVE",
  "REJECTED",
];

function mapRowToPublicEquipment(
  row: EquipmentRow,
  images: EquipmentImageRow[],
  isWishlisted = false,
  options?: { includeHiddenReviewSummary?: boolean },
): SafeEquipment {
  if (!row.categoryId) {
    throw new EquipmentServiceError(
      "Invalid equipment category stored in the database.",
      500,
      "INVALID_CATEGORY",
    );
  }

  return {
    id: row.id,
    ownerId: row.ownerId,
    owner: {
      id: row.ownerId,
      fullName: row.ownerFullName,
      email: row.ownerEmail,
      phone: row.ownerPhone,
      address: row.ownerAddress,
      phoneVerified: row.ownerPhoneVerified,
      createdAt: row.ownerCreatedAt,
    },
    title: row.title,
    description: row.description,
    category: {
      id: row.categoryId,
      title: row.categoryTitle,
      description: row.categoryDescription,
      imageUrl: row.categoryImageUrl,
      activeListingCount: 0,
      createdAt: row.categoryCreatedAt,
      updatedAt: row.categoryUpdatedAt,
    },
    price: row.price,
    deliveryRadius: row.deliveryRadius,
    address: row.address,
    normalizedAddress: row.normalizedAddress,
    latitude: row.latitude,
    longitude: row.longitude,
    status: row.status as EquipmentStatusValue,
    rejectionReason: row.rejectionReason,
    reviewedAt: row.reviewedAt,
    reviewSummaryVisible: row.reviewSummaryVisible,
    reviewSummary:
      row.reviewSummaryText &&
      row.reviewSummaryGeneratedAt &&
      row.reviewSummaryReviewCount !== null &&
      (options?.includeHiddenReviewSummary || row.reviewSummaryVisible)
        ? {
            text: row.reviewSummaryText,
            generatedAt: row.reviewSummaryGeneratedAt,
            reviewCount: row.reviewSummaryReviewCount,
            visible: row.reviewSummaryVisible,
          }
        : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    images: images
      .sort((left, right) => left.position - right.position)
      .map((image) => ({
        id: image.id,
        url: image.url,
        position: image.position,
      })),
    isWishlisted,
  };
}

function computeAverageRating(reviews: Array<{ rating: number }>) {
  if (reviews.length === 0) {
    return null;
  }

  return (
    Math.round(
      (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length) *
        10,
    ) / 10
  );
}

function mapAggregateByEquipmentId(rows: EquipmentReviewAggregateRow[]) {
  return rows.reduce<
    Record<
      string,
      {
        averageRating: number | null;
        reviewCount: number;
      }
    >
  >((grouped, row) => {
    grouped[row.equipmentId] = {
      averageRating:
        typeof row.averageRating === "number"
          ? Number(row.averageRating.toFixed(1))
          : null,
      reviewCount: Number(row.reviewCount),
    };
    return grouped;
  }, {});
}

function sanitizeGeneratedText(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength).trim();
}

function buildListingDescriptionPrompt(input: GenerateListingDescriptionInput) {
  const currentDescription = input.description?.trim();

  if (currentDescription) {
    return [
      "You are writing marketplace copy for a heavy equipment rental listing.",
      "Rewrite and improve the owner's draft while preserving the same intent.",
      "Keep it concise, practical, and renter-friendly.",
      "Focus on what the machine is, the kind of day-to-day work it helps with, and the common job-site situations where it is useful.",
      "Describe the item in a natural, informative way instead of sounding like a sales or support message.",
      "Do not invent technical specs, attachments, pricing, guarantees, or condition claims that are not supported by the input.",
      "Do not ask the renter to contact the owner, discuss pricing, confirm availability, or review rental terms.",
      "Do not include calls to action.",
      "Do not use bullet points or headings.",
      "Return plain description text only.",
      "",
      `Listing title: ${input.title.trim()}`,
      `Owner draft: ${currentDescription}`,
    ].join("\n");
  }

  return [
    "You are writing marketplace copy for a heavy equipment rental listing.",
    "Write a short, practical description for renters based only on the listing title.",
    "Keep it concise, readable, and suitable for a public equipment marketplace.",
    "Focus on what the item is, how it helps with daily work, and the kinds of tasks or projects it is commonly used for.",
    "The description should help a renter quickly understand the machine's role and usefulness.",
    "Do not invent technical specs, attachments, pricing, guarantees, or condition claims that are not supported by the title.",
    "Do not ask the renter to contact the owner, confirm availability, discuss rental terms, or take any next step.",
    "Do not include calls to action or customer-support style wording.",
    "Do not use bullet points or headings.",
    "Return plain description text only.",
    "",
    `Listing title: ${input.title.trim()}`,
  ].join("\n");
}

function buildReviewSummaryPrompt(input: {
  title: string;
  averageRating: number | null;
  reviewCount: number;
  reviews: Array<{
    rating: number;
    title: string;
    description: string;
  }>;
}) {
  const serializedReviews = input.reviews
    .map(
      (review, index) =>
        `Review ${index + 1}\nRating: ${review.rating}/5\nTitle: ${review.title}\nText: ${review.description}`,
    )
    .join("\n\n");

  return [
    "You are summarizing product reviews for a public ecommerce-style equipment listing.",
    "Write one short paragraph that highlights only the most repeated strengths or concerns from the reviews.",
    "Keep it brief, high-signal, and shopper-friendly.",
    "Do not mention reviewer names, personal details, or individual stories.",
    "Do not mention that AI generated the summary.",
    "Do not use bullet points or headings.",
    "Return plain summary text only.",
    "",
    `Listing title: ${input.title}`,
    `Average rating: ${input.averageRating ?? "N/A"}`,
    `Review count: ${input.reviewCount}`,
    "",
    serializedReviews,
  ].join("\n");
}

function ensureAllowedStatus(status: string): EquipmentStatusValue {
  if (!allowedStatuses.includes(status as EquipmentStatusValue)) {
    throw new EquipmentServiceError(
      "Invalid equipment status stored in the database.",
      500,
      "INVALID_STATUS",
    );
  }

  return status as EquipmentStatusValue;
}

function groupImagesByEquipmentId(imageRows: EquipmentImageRow[]) {
  return imageRows.reduce<Record<string, EquipmentImageRow[]>>(
    (grouped, image) => {
      const nextImages = grouped[image.equipmentId] ?? [];
      grouped[image.equipmentId] = [...nextImages, image];
      return grouped;
    },
    {},
  );
}

function mapEquipmentReview(review: {
  id: string;
  rating: number;
  title: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  renter: {
    id: string;
    fullName: string;
  };
  images: Array<{
    id: string;
    url: string;
    position: number;
  }>;
}): EquipmentReviewSummary {
  return {
    id: review.id,
    rating: review.rating,
    title: review.title,
    description: review.description,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    renter: review.renter,
    images: [...review.images].sort(
      (left, right) => left.position - right.position,
    ),
  };
}

async function queryEquipmentReviews(equipmentId: string) {
  const reviews = await db.equipmentReview.findMany({
    where: { equipmentId },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    include: {
      renter: {
        select: {
          id: true,
          fullName: true,
        },
      },
      images: {
        orderBy: {
          position: "asc",
        },
        select: {
          id: true,
          url: true,
          position: true,
        },
      },
    },
  });

  return reviews.map(mapEquipmentReview);
}

async function queryEquipmentReviewAggregates(equipmentIds: string[]) {
  if (equipmentIds.length === 0) {
    return [];
  }

  return db.$queryRaw<EquipmentReviewAggregateRow[]>(Prisma.sql`
    SELECT
      r."equipmentId",
      ROUND(AVG(r."rating")::numeric, 1)::float8 AS "averageRating",
      COUNT(*)::bigint AS "reviewCount"
    FROM "EquipmentReview" r
    WHERE r."equipmentId" IN (${Prisma.join(equipmentIds)})
    GROUP BY r."equipmentId"
  `);
}

async function buildEquipmentReviewViewerState(
  equipmentId: string,
  renterId?: string,
): Promise<EquipmentReviewViewerState> {
  if (!renterId) {
    return {
      isLoggedIn: false,
      canReview: false,
      code: "NOT_AUTHENTICATED",
      message:
        "Sign in as a renter to write a review after completing a booking.",
      review: null,
    };
  }

  const renter = await db.user.findUnique({
    where: { id: renterId },
    select: {
      id: true,
      role: true,
    },
  });

  if (!renter || renter.role !== UserRole.RENTER) {
    return {
      isLoggedIn: true,
      canReview: false,
      code: "ROLE_NOT_ALLOWED",
      message: "Only renter accounts can review equipment listings.",
      review: null,
    };
  }

  const existingReview = await db.equipmentReview.findUnique({
    where: {
      equipmentId_renterId: {
        equipmentId,
        renterId,
      },
    },
    include: {
      renter: {
        select: {
          id: true,
          fullName: true,
        },
      },
      images: {
        orderBy: {
          position: "asc",
        },
        select: {
          id: true,
          url: true,
          position: true,
        },
      },
    },
  });

  const completedBooking = await db.booking.findFirst({
    where: {
      equipmentId,
      renterId,
      status: "COMPLETED",
    },
    select: {
      id: true,
    },
  });

  if (!completedBooking) {
    return {
      isLoggedIn: true,
      canReview: false,
      code: "BOOKING_NOT_COMPLETED",
      message: "Reviews unlock after you complete a booking for this machine.",
      review: existingReview ? mapEquipmentReview(existingReview) : null,
    };
  }

  if (existingReview) {
    return {
      isLoggedIn: true,
      canReview: true,
      code: "CAN_UPDATE",
      message: "You can update your existing review for this machine.",
      review: mapEquipmentReview(existingReview),
    };
  }

  return {
    isLoggedIn: true,
    canReview: true,
    code: "CAN_CREATE",
    message: "Share your experience with this machine.",
    review: null,
  };
}

async function attachReviewDetails(
  equipment: SafeEquipment,
  renterId?: string,
): Promise<SafeEquipment> {
  const reviews = await queryEquipmentReviews(equipment.id);
  const reviewCount = reviews.length;
  const averageRating = computeAverageRating(reviews);

  return {
    ...equipment,
    averageRating,
    reviewCount,
    reviews,
    viewerReviewState: await buildEquipmentReviewViewerState(
      equipment.id,
      renterId,
    ),
  };
}

async function uploadReviewImages(files: Express.Multer.File[]) {
  const uploadedImages: Array<{
    publicId: string;
    url: string;
    position: number;
  }> = [];

  for (const [index, file] of files.entries()) {
    const result = await uploadReviewImage(file);

    uploadedImages.push({
      publicId: result.publicId,
      url: result.secureUrl,
      position: index,
    });
  }

  return uploadedImages;
}

async function queryCategoriesByIds(categoryIds: string[]) {
  if (categoryIds.length === 0) {
    return [];
  }

  return db.$queryRaw<CategoryRow[]>(Prisma.sql`
    SELECT
      c."id",
      c."title",
      c."description",
      c."imageUrl",
      c."imagePublicId",
      c."createdAt",
      c."updatedAt"
    FROM "Category" c
    WHERE c."id" IN (${Prisma.join(categoryIds)})
  `);
}

async function queryEquipmentImagesByIds(equipmentIds: string[]) {
  if (equipmentIds.length === 0) {
    return [];
  }

  return db.$queryRaw<EquipmentImageRow[]>(Prisma.sql`
    SELECT
      i."id",
      i."equipmentId",
      i."url",
      i."publicId",
      i."position"
    FROM "EquipmentImage" i
    WHERE i."equipmentId" IN (${Prisma.join(equipmentIds)})
    ORDER BY i."position" ASC
  `);
}

async function queryEquipmentByIds(equipmentIds: string[]) {
  if (equipmentIds.length === 0) {
    return [];
  }

  return db.$queryRaw<EquipmentRow[]>(Prisma.sql`
    SELECT
      e."id",
      e."ownerId",
      u."fullName" AS "ownerFullName",
      u."email" AS "ownerEmail",
      u."phone" AS "ownerPhone",
      u."address" AS "ownerAddress",
      u."phoneVerified" AS "ownerPhoneVerified",
      u."createdAt" AS "ownerCreatedAt",
      e."title",
      e."description",
      e."categoryId",
      e."price",
      e."deliveryRadius",
      e."address",
      e."normalizedAddress",
      e."latitude",
      e."longitude",
      e."status",
      e."rejectionReason",
      e."reviewedAt",
      e."reviewSummaryText",
      e."reviewSummaryGeneratedAt",
      e."reviewSummaryReviewCount",
      e."reviewSummaryVisible",
      e."createdAt",
      e."updatedAt",
      c."title" AS "categoryTitle",
      c."description" AS "categoryDescription",
      c."imageUrl" AS "categoryImageUrl",
      c."createdAt" AS "categoryCreatedAt",
      c."updatedAt" AS "categoryUpdatedAt"
    FROM "Equipment" e
    INNER JOIN "User" u ON u."id" = e."ownerId"
    INNER JOIN "Category" c ON c."id" = e."categoryId"
    WHERE e."id" IN (${Prisma.join(equipmentIds)})
    ORDER BY e."createdAt" DESC
  `);
}

async function queryEquipmentById(equipmentId: string) {
  const rows = await queryEquipmentByIds([equipmentId]);
  return rows[0] ?? null;
}

async function queryWishlistItemsByUser(
  userId: string,
  equipmentIds: string[],
) {
  if (equipmentIds.length === 0) {
    return [];
  }

  return db.$queryRaw<WishlistItemRow[]>(Prisma.sql`
    SELECT
      w."equipmentId"
    FROM "WishlistItem" w
    WHERE w."userId" = ${userId}
      AND w."equipmentId" IN (${Prisma.join(equipmentIds)})
  `);
}

async function getWishlistedEquipmentIdSet(
  userId: string | undefined,
  equipmentIds: string[],
) {
  if (!userId || equipmentIds.length === 0) {
    return new Set<string>();
  }

  const rows = await queryWishlistItemsByUser(userId, equipmentIds);
  return new Set(rows.map((row) => row.equipmentId));
}

async function queryEquipmentByOwner(
  ownerId: string,
  input?: {
    tab?: "live" | "pending" | "draft";
    limit?: number;
    offset?: number;
  },
) {
  const tabFilter =
    input?.tab === "live"
      ? Prisma.sql`AND e."status" = ${"ACTIVE"}`
      : input?.tab === "pending"
        ? Prisma.sql`AND e."status" IN (${Prisma.join(["PENDING_VERIFICATION", "REJECTED"])})`
        : input?.tab === "draft"
          ? Prisma.sql`AND e."status" = ${"DRAFT"}`
          : Prisma.empty;
  const paginationClause =
    typeof input?.limit === "number" && typeof input?.offset === "number"
      ? Prisma.sql`LIMIT ${input.limit} OFFSET ${input.offset}`
      : Prisma.empty;

  return db.$queryRaw<EquipmentRow[]>(Prisma.sql`
    SELECT
      e."id",
      e."ownerId",
      u."fullName" AS "ownerFullName",
      u."email" AS "ownerEmail",
      u."phone" AS "ownerPhone",
      u."address" AS "ownerAddress",
      u."phoneVerified" AS "ownerPhoneVerified",
      u."createdAt" AS "ownerCreatedAt",
      e."title",
      e."description",
      e."categoryId",
      e."price",
      e."deliveryRadius",
      e."address",
      e."normalizedAddress",
      e."latitude",
      e."longitude",
      e."status",
      e."rejectionReason",
      e."reviewedAt",
      e."reviewSummaryText",
      e."reviewSummaryGeneratedAt",
      e."reviewSummaryReviewCount",
      e."reviewSummaryVisible",
      e."createdAt",
      e."updatedAt",
      c."title" AS "categoryTitle",
      c."description" AS "categoryDescription",
      c."imageUrl" AS "categoryImageUrl",
      c."createdAt" AS "categoryCreatedAt",
      c."updatedAt" AS "categoryUpdatedAt"
    FROM "Equipment" e
    INNER JOIN "User" u ON u."id" = e."ownerId"
    INNER JOIN "Category" c ON c."id" = e."categoryId"
    WHERE e."ownerId" = ${ownerId}
    ${tabFilter}
    ORDER BY e."createdAt" DESC
    ${paginationClause}
  `);
}

async function countEquipmentByOwner(ownerId: string, tab?: "live" | "pending" | "draft") {
  const tabFilter =
    tab === "live"
      ? Prisma.sql`AND e."status" = ${"ACTIVE"}`
      : tab === "pending"
        ? Prisma.sql`AND e."status" IN (${Prisma.join(["PENDING_VERIFICATION", "REJECTED"])})`
        : tab === "draft"
          ? Prisma.sql`AND e."status" = ${"DRAFT"}`
          : Prisma.empty;

  const rows = await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS "count"
    FROM "Equipment" e
    WHERE e."ownerId" = ${ownerId}
    ${tabFilter}
  `);

  return Number(rows[0]?.count ?? 0n);
}

async function queryEquipmentByStatus(
  status: EquipmentStatusValue,
  input?: { search?: string; limit?: number; offset?: number },
) {
  const searchClause = input?.search?.trim()
    ? Prisma.sql`
        AND (
          e."title" ILIKE ${`%${input.search.trim()}%`}
          OR u."fullName" ILIKE ${`%${input.search.trim()}%`}
          OR u."email" ILIKE ${`%${input.search.trim()}%`}
          OR c."title" ILIKE ${`%${input.search.trim()}%`}
          OR e."normalizedAddress" ILIKE ${`%${input.search.trim()}%`}
        )
      `
    : Prisma.empty;
  const paginationClause =
    typeof input?.limit === "number" && typeof input?.offset === "number"
      ? Prisma.sql`LIMIT ${input.limit} OFFSET ${input.offset}`
      : Prisma.empty;

  return db.$queryRaw<EquipmentRow[]>(Prisma.sql`
    SELECT
      e."id",
      e."ownerId",
      u."fullName" AS "ownerFullName",
      u."email" AS "ownerEmail",
      u."phone" AS "ownerPhone",
      u."address" AS "ownerAddress",
      u."phoneVerified" AS "ownerPhoneVerified",
      u."createdAt" AS "ownerCreatedAt",
      e."title",
      e."description",
      e."categoryId",
      e."price",
      e."deliveryRadius",
      e."address",
      e."normalizedAddress",
      e."latitude",
      e."longitude",
      e."status",
      e."rejectionReason",
      e."reviewedAt",
      e."reviewSummaryText",
      e."reviewSummaryGeneratedAt",
      e."reviewSummaryReviewCount",
      e."reviewSummaryVisible",
      e."createdAt",
      e."updatedAt",
      c."title" AS "categoryTitle",
      c."description" AS "categoryDescription",
      c."imageUrl" AS "categoryImageUrl",
      c."createdAt" AS "categoryCreatedAt",
      c."updatedAt" AS "categoryUpdatedAt"
    FROM "Equipment" e
    INNER JOIN "User" u ON u."id" = e."ownerId"
    INNER JOIN "Category" c ON c."id" = e."categoryId"
    WHERE e."status" = ${status}
    ${searchClause}
    ORDER BY e."createdAt" DESC
    ${paginationClause}
  `);
}

async function countEquipmentByStatus(
  status: EquipmentStatusValue,
  search?: string,
) {
  const searchClause = search?.trim()
    ? Prisma.sql`
        AND (
          e."title" ILIKE ${`%${search.trim()}%`}
          OR u."fullName" ILIKE ${`%${search.trim()}%`}
          OR u."email" ILIKE ${`%${search.trim()}%`}
          OR c."title" ILIKE ${`%${search.trim()}%`}
          OR e."normalizedAddress" ILIKE ${`%${search.trim()}%`}
        )
      `
    : Prisma.empty;

  const rows = await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS "count"
    FROM "Equipment" e
    INNER JOIN "User" u ON u."id" = e."ownerId"
    INNER JOIN "Category" c ON c."id" = e."categoryId"
    WHERE e."status" = ${status}
    ${searchClause}
  `);

  return Number(rows[0]?.count ?? 0n);
}

async function queryPublicEquipmentByCategory(categoryId?: string) {
  return db.$queryRaw<EquipmentRow[]>(Prisma.sql`
    SELECT
      e."id",
      e."ownerId",
      u."fullName" AS "ownerFullName",
      u."email" AS "ownerEmail",
      u."phone" AS "ownerPhone",
      u."address" AS "ownerAddress",
      u."phoneVerified" AS "ownerPhoneVerified",
      u."createdAt" AS "ownerCreatedAt",
      e."title",
      e."description",
      e."categoryId",
      e."price",
      e."deliveryRadius",
      e."address",
      e."normalizedAddress",
      e."latitude",
      e."longitude",
      e."status",
      e."rejectionReason",
      e."reviewedAt",
      e."reviewSummaryText",
      e."reviewSummaryGeneratedAt",
      e."reviewSummaryReviewCount",
      e."reviewSummaryVisible",
      e."createdAt",
      e."updatedAt",
      c."title" AS "categoryTitle",
      c."description" AS "categoryDescription",
      c."imageUrl" AS "categoryImageUrl",
      c."createdAt" AS "categoryCreatedAt",
      c."updatedAt" AS "categoryUpdatedAt"
    FROM "Equipment" e
    INNER JOIN "User" u ON u."id" = e."ownerId"
    INNER JOIN "Category" c ON c."id" = e."categoryId"
    WHERE e."status" = ${"ACTIVE"}
      AND (${categoryId ?? null}::text IS NULL OR e."categoryId" = ${categoryId ?? null})
    ORDER BY e."createdAt" DESC
  `);
}

async function uploadListingImages(files: Express.Multer.File[]) {
  const uploadedImages: Array<{
    publicId: string;
    url: string;
    position: number;
  }> = [];

  for (const [index, file] of files.entries()) {
    const result = await uploadEquipmentImage(file);

    uploadedImages.push({
      publicId: result.publicId,
      url: result.secureUrl,
      position: index,
    });
  }

  return uploadedImages;
}

async function cleanupUploadedImages(publicIds: string[]) {
  const deleteResults = await Promise.allSettled(
    publicIds.map((publicId) => deleteCloudinaryImage(publicId)),
  );

  deleteResults.forEach((result, index) => {
    if (result.status === "rejected") {
      logger.error("Failed to delete uploaded Cloudinary image", {
        service: "equipment.service",
        action: "cleanupUploadedImages",
        publicId: publicIds[index] ?? "unknown",
        reason:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      });
    }
  });
}

function validateImageCountForSubmission(imageCount: number) {
  if (
    imageCount < EQUIPMENT_IMAGE_LIMITS.min ||
    imageCount > EQUIPMENT_IMAGE_LIMITS.max
  ) {
    throw new EquipmentServiceError(
      `Upload between ${EQUIPMENT_IMAGE_LIMITS.min} and ${EQUIPMENT_IMAGE_LIMITS.max} images before submitting for verification.`,
      400,
      "INVALID_IMAGE_COUNT",
    );
  }
}

function buildUpdatedImagePayload(
  retainedImages: EquipmentImageRow[],
  uploadedImages: Array<{ publicId: string; url: string; position: number }>,
) {
  return [
    ...retainedImages.map((image) => ({
      url: image.url,
      publicId: image.publicId,
    })),
    ...uploadedImages.map((image) => ({
      url: image.url,
      publicId: image.publicId,
    })),
  ].map((image, index) => ({
    ...image,
    position: index,
  }));
}

async function getCategoryById(id: string) {
  const rows = await db.$queryRaw<CategoryRow[]>(Prisma.sql`
    SELECT
      c."id",
      c."title",
      c."description",
      c."imageUrl",
      c."imagePublicId",
      c."createdAt",
      c."updatedAt"
    FROM "Category" c
    WHERE c."id" = ${id}
    LIMIT 1
  `);

  return rows[0] ?? null;
}

export async function geocodeEquipmentLocation(address: string) {
  try {
    return await geocodeEquipmentAddress(address);
  } catch (error) {
    logServiceError({
      service: "equipment.service",
      action: "geocodeEquipmentLocation",
      error,
      context: { address },
    });
    throw new EquipmentServiceError(
      error instanceof Error
        ? error.message
        : "Failed to resolve the equipment address.",
      400,
      "GEOCODE_FAILED",
    );
  }
}

export async function getEquipmentAddressSuggestions(input: string) {
  try {
    return await autocompleteEquipmentAddresses(input);
  } catch (error) {
    logServiceError({
      service: "equipment.service",
      action: "getEquipmentAddressSuggestions",
      error,
      context: { input },
    });
    throw new EquipmentServiceError(
      error instanceof Error
        ? error.message
        : "Failed to load address suggestions.",
      400,
      "ADDRESS_SUGGESTIONS_FAILED",
    );
  }
}

export async function geocodeEquipmentLocationByPlaceId(placeId: string) {
  try {
    return await geocodeEquipmentPlaceId(placeId);
  } catch (error) {
    logServiceError({
      service: "equipment.service",
      action: "geocodeEquipmentLocationByPlaceId",
      error,
      context: { placeId },
    });
    throw new EquipmentServiceError(
      error instanceof Error
        ? error.message
        : "Failed to resolve the selected address.",
      400,
      "GEOCODE_FAILED",
    );
  }
}

export async function createEquipmentListing(
  ownerId: string,
  input: CreateEquipmentInput,
  files: Express.Multer.File[],
) {
  const category = await getCategoryById(input.categoryId);

  if (!category) {
    throw new EquipmentServiceError(
      "Category not found.",
      404,
      "CATEGORY_NOT_FOUND",
    );
  }

  let location;

  try {
    location = await geocodeEquipmentAddress(input.address);
  } catch (error) {
    logServiceError({
      service: "equipment.service",
      action: "createEquipmentListing.geocodeEquipmentAddress",
      error,
      context: {
        ownerId,
        categoryId: input.categoryId,
        address: input.address,
      },
    });
    throw new EquipmentServiceError(
      error instanceof Error
        ? error.message
        : "Failed to resolve the equipment address.",
      400,
      "GEOCODE_FAILED",
    );
  }

  let uploadedImages: Array<{
    publicId: string;
    url: string;
    position: number;
  }> = [];

  try {
    uploadedImages = await uploadListingImages(files);

    const createdEquipmentId = await db.$transaction(async (tx) => {
      const createdRow = await tx.equipment.create({
        data: {
          ownerId,
          title: input.title.trim(),
          description: input.description ?? null,
          categoryId: input.categoryId,
          price: input.price,
          deliveryRadius: input.deliveryRadius,
          address: input.address.trim(),
          normalizedAddress: location.normalizedAddress,
          latitude: location.latitude,
          longitude: location.longitude,
          status: "PENDING_VERIFICATION",
        },
      });

      if (!createdRow) {
        throw new EquipmentServiceError(
          "Equipment listing could not be created.",
          500,
          "EQUIPMENT_CREATE_FAILED",
        );
      }

      await tx.equipmentImage.createMany({
        data: uploadedImages.map((image) => ({
          equipmentId: createdRow.id,
          url: image.url,
          publicId: image.publicId,
          position: image.position,
        })),
      });

      return createdRow.id;
    });

    const equipment = await queryEquipmentById(createdEquipmentId);

    if (!equipment) {
      throw new EquipmentServiceError(
        "Equipment listing could not be created.",
        500,
        "EQUIPMENT_CREATE_FAILED",
      );
    }

    const imageRows = await queryEquipmentImagesByIds([equipment.id]);
    return mapRowToPublicEquipment(equipment, imageRows);
  } catch (error) {
    await cleanupUploadedImages(uploadedImages.map((image) => image.publicId));

    logServiceError({
      service: "equipment.service",
      action: "createEquipmentListing",
      error,
      context: {
        ownerId,
        categoryId: input.categoryId,
        uploadedImageCount: uploadedImages.length,
      },
    });

    if (error instanceof EquipmentServiceError) {
      throw error;
    }

    throw new EquipmentServiceError(
      "Failed to create the equipment listing.",
      500,
      "EQUIPMENT_CREATE_FAILED",
    );
  }
}

export async function createDraftEquipmentListing(
  ownerId: string,
  input: CreateDraftEquipmentInput,
  files: Express.Multer.File[],
) {
  const category = await getCategoryById(input.categoryId);

  if (!category) {
    throw new EquipmentServiceError(
      "Category not found.",
      404,
      "CATEGORY_NOT_FOUND",
    );
  }

  let location;

  try {
    location = await geocodeEquipmentAddress(input.address);
  } catch (error) {
    logServiceError({
      service: "equipment.service",
      action: "createDraftEquipmentListing.geocodeEquipmentAddress",
      error,
      context: {
        ownerId,
        categoryId: input.categoryId,
        address: input.address,
      },
    });
    throw new EquipmentServiceError(
      error instanceof Error
        ? error.message
        : "Failed to resolve the equipment address.",
      400,
      "GEOCODE_FAILED",
    );
  }

  let uploadedImages: Array<{
    publicId: string;
    url: string;
    position: number;
  }> = [];

  try {
    uploadedImages = await uploadListingImages(files);

    const createdEquipmentId = await db.$transaction(async (tx) => {
      const createdRow = await tx.equipment.create({
        data: {
          ownerId,
          title: input.title.trim(),
          description: input.description ?? null,
          categoryId: input.categoryId,
          price: input.price,
          deliveryRadius: input.deliveryRadius,
          address: input.address.trim(),
          normalizedAddress: location.normalizedAddress,
          latitude: location.latitude,
          longitude: location.longitude,
          status: "DRAFT",
        },
      });

      if (!createdRow) {
        throw new EquipmentServiceError(
          "Equipment draft could not be created.",
          500,
          "EQUIPMENT_CREATE_FAILED",
        );
      }

      if (uploadedImages.length > 0) {
        await tx.equipmentImage.createMany({
          data: uploadedImages.map((image) => ({
            equipmentId: createdRow.id,
            url: image.url,
            publicId: image.publicId,
            position: image.position,
          })),
        });
      }

      return createdRow.id;
    });

    const equipment = await queryEquipmentById(createdEquipmentId);

    if (!equipment) {
      throw new EquipmentServiceError(
        "Equipment draft could not be created.",
        500,
        "EQUIPMENT_CREATE_FAILED",
      );
    }

    const imageRows = await queryEquipmentImagesByIds([equipment.id]);
    return mapRowToPublicEquipment(equipment, imageRows);
  } catch (error) {
    await cleanupUploadedImages(uploadedImages.map((image) => image.publicId));

    logServiceError({
      service: "equipment.service",
      action: "createDraftEquipmentListing",
      error,
      context: {
        ownerId,
        categoryId: input.categoryId,
        uploadedImageCount: uploadedImages.length,
      },
    });

    if (error instanceof EquipmentServiceError) {
      throw error;
    }

    throw new EquipmentServiceError(
      "Failed to create the draft listing.",
      500,
      "EQUIPMENT_CREATE_FAILED",
    );
  }
}

export async function getOwnerEquipmentListings(
  ownerId: string,
  input: OwnerEquipmentQueryInput,
): Promise<PaginatedResult<SafeEquipment>> {
  const pagination = normalizePagination(input);
  const [equipmentRows, totalItems] = await Promise.all([
    queryEquipmentByOwner(ownerId, {
      tab: input.tab,
      limit: pagination.take,
      offset: pagination.skip,
    }),
    countEquipmentByOwner(ownerId, input.tab),
  ]);
  const imageRows = await queryEquipmentImagesByIds(
    equipmentRows.map((row) => row.id),
  );
  const groupedImages = groupImagesByEquipmentId(imageRows);

  return createPaginatedResult(
    equipmentRows.map((row) =>
      mapRowToPublicEquipment(row, groupedImages[row.id] ?? []),
    ),
    {
      page: pagination.page,
      pageSize: pagination.pageSize,
    },
    totalItems,
  );
}

export async function getPendingEquipmentListings(
  input: PendingEquipmentQueryInput,
): Promise<PaginatedResult<SafeEquipment>> {
  const pagination = normalizePagination(input);
  const [equipmentRows, totalItems] = await Promise.all([
    queryEquipmentByStatus("PENDING_VERIFICATION", {
      search: input.search,
      limit: pagination.take,
      offset: pagination.skip,
    }),
    countEquipmentByStatus("PENDING_VERIFICATION", input.search),
  ]);
  const imageRows = await queryEquipmentImagesByIds(
    equipmentRows.map((row) => row.id),
  );
  const groupedImages = groupImagesByEquipmentId(imageRows);

  return createPaginatedResult(
    equipmentRows.map((row) =>
      mapRowToPublicEquipment(row, groupedImages[row.id] ?? []),
    ),
    {
      page: pagination.page,
      pageSize: pagination.pageSize,
    },
    totalItems,
  );
}

export async function getAdminEquipmentReviewSummaryListings(
  input: AdminEquipmentReviewSummaryQueryInput,
): Promise<PaginatedResult<SafeEquipment>> {
  const pagination = normalizePagination(input);
  const [equipmentRows, totalItems] = await Promise.all([
    queryEquipmentByStatus("ACTIVE", {
      search: input.search,
      limit: pagination.take,
      offset: pagination.skip,
    }),
    countEquipmentByStatus("ACTIVE", input.search),
  ]);
  const equipmentIds = equipmentRows.map((row) => row.id);
  const [imageRows, aggregateRows] = await Promise.all([
    queryEquipmentImagesByIds(equipmentIds),
    queryEquipmentReviewAggregates(equipmentIds),
  ]);
  const groupedImages = groupImagesByEquipmentId(imageRows);
  const aggregates = mapAggregateByEquipmentId(aggregateRows);

  return createPaginatedResult(
    equipmentRows.map((row) => {
      const aggregate = aggregates[row.id];
      const listing = mapRowToPublicEquipment(
        row,
        groupedImages[row.id] ?? [],
        false,
        { includeHiddenReviewSummary: true },
      );

      return {
        ...listing,
        averageRating: aggregate?.averageRating ?? null,
        reviewCount: aggregate?.reviewCount ?? 0,
      };
    }),
    {
      page: pagination.page,
      pageSize: pagination.pageSize,
    },
    totalItems,
  );
}

export async function getFeaturedEquipmentListings(
  limit = 4,
  renterId?: string,
) {
  const equipmentRows = await db.$queryRaw<EquipmentRow[]>(Prisma.sql`
    SELECT
      e."id",
      e."ownerId",
      u."fullName" AS "ownerFullName",
      u."email" AS "ownerEmail",
      u."phone" AS "ownerPhone",
      u."address" AS "ownerAddress",
      u."phoneVerified" AS "ownerPhoneVerified",
      u."createdAt" AS "ownerCreatedAt",
      e."title",
      e."description",
      e."categoryId",
      e."price",
      e."deliveryRadius",
      e."address",
      e."normalizedAddress",
      e."latitude",
      e."longitude",
      e."status",
      e."rejectionReason",
      e."reviewedAt",
      e."reviewSummaryText",
      e."reviewSummaryGeneratedAt",
      e."reviewSummaryReviewCount",
      e."reviewSummaryVisible",
      e."createdAt",
      e."updatedAt",
      c."title" AS "categoryTitle",
      c."description" AS "categoryDescription",
      c."imageUrl" AS "categoryImageUrl",
      c."createdAt" AS "categoryCreatedAt",
      c."updatedAt" AS "categoryUpdatedAt"
    FROM "Equipment" e
    INNER JOIN "User" u ON u."id" = e."ownerId"
    INNER JOIN "Category" c ON c."id" = e."categoryId"
    WHERE e."status" = ${"ACTIVE"}
    ORDER BY e."createdAt" DESC
    LIMIT ${limit}
  `);
  const imageRows = await queryEquipmentImagesByIds(
    equipmentRows.map((row) => row.id),
  );
  const groupedImages = groupImagesByEquipmentId(imageRows);
  const wishlistedIds = await getWishlistedEquipmentIdSet(
    renterId,
    equipmentRows.map((row) => row.id),
  );

  return equipmentRows.map((row) =>
    mapRowToPublicEquipment(
      row,
      groupedImages[row.id] ?? [],
      wishlistedIds.has(row.id),
    ),
  );
}

export async function getPublicEquipmentListings(
  categoryId?: string,
  renterId?: string,
) {
  const rows = await queryPublicEquipmentByCategory(
    categoryId?.trim() || undefined,
  );
  const equipmentIds = rows.map((row) => row.id);
  const imageRows = await queryEquipmentImagesByIds(equipmentIds);
  const imagesByEquipmentId = groupImagesByEquipmentId(imageRows);
  const wishlistedIds = await getWishlistedEquipmentIdSet(
    renterId,
    equipmentIds,
  );

  return rows.map((row) =>
    mapRowToPublicEquipment(
      row,
      imagesByEquipmentId[row.id] ?? [],
      wishlistedIds.has(row.id),
    ),
  );
}

export async function getPublicEquipmentListingById(
  equipmentId: string,
  renterId?: string,
) {
  const equipment = await queryEquipmentById(equipmentId);

  if (!equipment || equipment.status !== "ACTIVE") {
    throw new EquipmentServiceError(
      "Equipment listing not found.",
      404,
      "EQUIPMENT_NOT_FOUND",
    );
  }

  const imageRows = await queryEquipmentImagesByIds([equipmentId]);
  const wishlistedIds = await getWishlistedEquipmentIdSet(renterId, [
    equipmentId,
  ]);
  const listing = mapRowToPublicEquipment(
    equipment,
    imageRows,
    wishlistedIds.has(equipmentId),
  );
  return attachReviewDetails(listing, renterId);
}

export async function generateEquipmentListingDescription(
  input: GenerateListingDescriptionInput,
) {
  try {
    const description = await generateGeminiText({
      prompt: buildListingDescriptionPrompt(input),
      temperature: 0.35,
    });

    return {
      description: sanitizeGeneratedText(description, 2000),
    };
  } catch (error) {
    logServiceError({
      service: "equipment.service",
      action: "generateEquipmentListingDescription",
      error,
      context: {
        title: input.title,
        hasDraftDescription: Boolean(input.description?.trim()),
      },
    });

    throw new EquipmentServiceError(
      error instanceof Error
        ? error.message
        : "Unable to generate the listing description right now.",
      502,
      "AI_GENERATION_FAILED",
    );
  }
}

export async function generateEquipmentReviewSummary(equipmentId: string) {
  const equipment = await queryEquipmentById(equipmentId);

  if (!equipment || equipment.status !== "ACTIVE") {
    throw new EquipmentServiceError(
      "Equipment listing not found.",
      404,
      "EQUIPMENT_NOT_FOUND",
    );
  }

  const reviews = await queryEquipmentReviews(equipmentId);

  if (reviews.length === 0) {
    throw new EquipmentServiceError(
      "Generate a summary only after reviews are available for this listing.",
      400,
      "REVIEWS_NOT_FOUND",
    );
  }

  const averageRating = computeAverageRating(reviews);

  try {
    const text = await generateGeminiText({
      prompt: buildReviewSummaryPrompt({
        title: equipment.title,
        averageRating,
        reviewCount: reviews.length,
        reviews: reviews.map((review) => ({
          rating: review.rating,
          title: review.title,
          description: review.description,
        })),
      }),
      temperature: 0.25,
    });

    const summaryText = sanitizeGeneratedText(text, 400);
    const generatedAt = new Date();

    await db.$executeRaw(Prisma.sql`
      UPDATE "Equipment"
      SET
        "reviewSummaryText" = ${summaryText},
        "reviewSummaryGeneratedAt" = ${generatedAt},
        "reviewSummaryReviewCount" = ${reviews.length},
        "reviewSummaryVisible" = ${true},
        "updatedAt" = NOW()
      WHERE "id" = ${equipmentId}
    `);

    const digest: EquipmentReviewSummaryDigest = {
      text: summaryText,
      generatedAt,
      reviewCount: reviews.length,
      visible: true,
    };

    return {
      reviewSummary: digest,
      reviewSummaryVisible: true,
      averageRating,
      reviewCount: reviews.length,
    };
  } catch (error) {
    logServiceError({
      service: "equipment.service",
      action: "generateEquipmentReviewSummary",
      error,
      context: {
        equipmentId,
        reviewCount: reviews.length,
      },
    });

    if (error instanceof EquipmentServiceError) {
      throw error;
    }

    throw new EquipmentServiceError(
      error instanceof Error
        ? error.message
        : "Unable to generate the review summary right now.",
      502,
      "AI_GENERATION_FAILED",
    );
  }
}

export async function updateEquipmentReviewSummaryVisibility(
  equipmentId: string,
  visible: boolean,
) {
  const equipment = await queryEquipmentById(equipmentId);

  if (!equipment || equipment.status !== "ACTIVE") {
    throw new EquipmentServiceError(
      "Equipment listing not found.",
      404,
      "EQUIPMENT_NOT_FOUND",
    );
  }

  const reviews = await queryEquipmentReviews(equipmentId);
  const averageRating = computeAverageRating(reviews);

  await db.$executeRaw(Prisma.sql`
    UPDATE "Equipment"
    SET
      "reviewSummaryVisible" = ${visible},
      "updatedAt" = NOW()
    WHERE "id" = ${equipmentId}
  `);

  return {
    reviewSummary:
      equipment.reviewSummaryText &&
      equipment.reviewSummaryGeneratedAt &&
      equipment.reviewSummaryReviewCount !== null
        ? {
            text: equipment.reviewSummaryText,
            generatedAt: equipment.reviewSummaryGeneratedAt,
            reviewCount: equipment.reviewSummaryReviewCount,
            visible,
          }
        : null,
    reviewSummaryVisible: visible,
    averageRating,
    reviewCount: reviews.length,
  };
}

export async function getEquipmentReviewDetails(
  equipmentId: string,
  renterId?: string,
) {
  const equipment = await queryEquipmentById(equipmentId);

  if (!equipment || equipment.status !== "ACTIVE") {
    throw new EquipmentServiceError(
      "Equipment listing not found.",
      404,
      "EQUIPMENT_NOT_FOUND",
    );
  }

  const viewerReviewState = await buildEquipmentReviewViewerState(
    equipmentId,
    renterId,
  );
  const reviews = await queryEquipmentReviews(equipmentId);
  const reviewCount = reviews.length;
  const averageRating = computeAverageRating(reviews);

  return {
    equipmentId,
    averageRating,
    reviewCount,
    reviews,
    viewerReviewState,
  };
}

async function ensureReviewEligibility(equipmentId: string, renterId: string) {
  const equipment = await queryEquipmentById(equipmentId);

  if (!equipment || equipment.status !== "ACTIVE") {
    throw new EquipmentServiceError(
      "Equipment listing not found.",
      404,
      "EQUIPMENT_NOT_FOUND",
    );
  }

  const renter = await db.user.findUnique({
    where: { id: renterId },
    select: {
      id: true,
      role: true,
    },
  });

  if (!renter || renter.role !== UserRole.RENTER) {
    throw new EquipmentServiceError(
      "Only renters can review equipment listings.",
      403,
      "ROLE_NOT_ALLOWED",
    );
  }

  const completedBooking = await db.booking.findFirst({
    where: {
      equipmentId,
      renterId,
      status: "COMPLETED",
    },
    select: {
      id: true,
    },
  });

  if (!completedBooking) {
    throw new EquipmentServiceError(
      "You can review this machine only after completing a booking for it.",
      403,
      "BOOKING_NOT_COMPLETED",
    );
  }

  return equipment;
}

export async function createEquipmentReview(
  renterId: string,
  equipmentId: string,
  input: CreateEquipmentReviewInput,
  files: Express.Multer.File[],
) {
  await ensureReviewEligibility(equipmentId, renterId);

  const existingReview = await db.equipmentReview.findUnique({
    where: {
      equipmentId_renterId: {
        equipmentId,
        renterId,
      },
    },
    select: {
      id: true,
    },
  });

  if (existingReview) {
    throw new EquipmentServiceError(
      "You already reviewed this machine. Please update your existing review instead.",
      409,
      "REVIEW_ALREADY_EXISTS",
    );
  }

  const uploadedImages = await uploadReviewImages(files);

  try {
    await db.equipmentReview.create({
      data: {
        equipmentId,
        renterId,
        rating: input.rating,
        title: input.title.trim(),
        description: input.description.trim(),
        images: {
          create: uploadedImages.map((image) => ({
            url: image.url,
            publicId: image.publicId,
            position: image.position,
          })),
        },
      },
    });
  } catch (error) {
    logServiceError({
      service: "equipment.service",
      action: "createEquipmentReview",
      error,
      context: {
        renterId,
        equipmentId,
        uploadedImageCount: uploadedImages.length,
      },
    });
    await cleanupUploadedImages(uploadedImages.map((image) => image.publicId));
    throw error;
  }

  return getEquipmentReviewDetails(equipmentId, renterId);
}

export async function updateEquipmentReview(
  renterId: string,
  equipmentId: string,
  input: UpdateEquipmentReviewInput,
  files: Express.Multer.File[],
) {
  await ensureReviewEligibility(equipmentId, renterId);

  const existingReview = await db.equipmentReview.findUnique({
    where: {
      equipmentId_renterId: {
        equipmentId,
        renterId,
      },
    },
    include: {
      images: {
        orderBy: {
          position: "asc",
        },
      },
    },
  });

  if (!existingReview) {
    throw new EquipmentServiceError(
      "You have not reviewed this machine yet.",
      404,
      "REVIEW_NOT_FOUND",
    );
  }

  const retainedImages = existingReview.images.filter((image) =>
    input.retainedPhotoIds.includes(image.id),
  );
  const removedImages = existingReview.images.filter(
    (image) => !input.retainedPhotoIds.includes(image.id),
  );
  const uploadedImages = await uploadReviewImages(files);

  if (retainedImages.length + uploadedImages.length > 5) {
    await cleanupUploadedImages(uploadedImages.map((image) => image.publicId));
    throw new EquipmentServiceError(
      "Please upload no more than 5 images.",
      400,
      "REVIEW_IMAGE_LIMIT_EXCEEDED",
    );
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.equipmentReview.update({
        where: { id: existingReview.id },
        data: {
          rating: input.rating,
          title: input.title.trim(),
          description: input.description.trim(),
        },
      });

      if (removedImages.length > 0) {
        await tx.equipmentReviewImage.deleteMany({
          where: {
            id: {
              in: removedImages.map((image) => image.id),
            },
          },
        });
      }

      if (retainedImages.length > 0) {
        await Promise.all(
          retainedImages.map((image, index) =>
            tx.equipmentReviewImage.update({
              where: { id: image.id },
              data: { position: index },
            }),
          ),
        );
      }

      if (uploadedImages.length > 0) {
        await tx.equipmentReviewImage.createMany({
          data: uploadedImages.map((image, index) => ({
            reviewId: existingReview.id,
            url: image.url,
            publicId: image.publicId,
            position: retainedImages.length + index,
          })),
        });
      }
    });
  } catch (error) {
    logServiceError({
      service: "equipment.service",
      action: "updateEquipmentReview",
      error,
      context: {
        renterId,
        equipmentId,
        uploadedImageCount: uploadedImages.length,
      },
    });
    await cleanupUploadedImages(uploadedImages.map((image) => image.publicId));
    throw error;
  }

  if (removedImages.length > 0) {
    await cleanupUploadedImages(removedImages.map((image) => image.publicId));
  }

  return getEquipmentReviewDetails(equipmentId, renterId);
}

async function ensureOwnedEquipment(ownerId: string, equipmentId: string) {
  const equipment = await queryEquipmentById(equipmentId);

  if (!equipment) {
    throw new EquipmentServiceError(
      "Equipment listing not found.",
      404,
      "EQUIPMENT_NOT_FOUND",
    );
  }

  if (equipment.ownerId !== ownerId) {
    throw new EquipmentServiceError(
      "You do not have permission to access this listing.",
      403,
      "FORBIDDEN",
    );
  }

  const imageRows = await queryEquipmentImagesByIds([equipmentId]);
  return {
    row: equipment,
    imageRows,
  };
}

export async function updateOwnerEquipmentListing(
  ownerId: string,
  equipmentId: string,
  input: UpdateOwnerEquipmentInput,
  files: Express.Multer.File[],
  nextStatus: "DRAFT" | "PENDING_VERIFICATION" = "DRAFT",
) {
  const equipment = await ensureOwnedEquipment(ownerId, equipmentId);
  const category = await getCategoryById(input.categoryId);

  if (!category) {
    throw new EquipmentServiceError(
      "Category not found.",
      404,
      "CATEGORY_NOT_FOUND",
    );
  }

  let location;

  try {
    location = await geocodeEquipmentAddress(input.address);
  } catch (error) {
    logServiceError({
      service: "equipment.service",
      action: "updateOwnerEquipmentListing.geocodeEquipmentAddress",
      error,
      context: {
        ownerId,
        equipmentId,
        address: input.address,
      },
    });
    throw new EquipmentServiceError(
      error instanceof Error
        ? error.message
        : "Failed to resolve the equipment address.",
      400,
      "GEOCODE_FAILED",
    );
  }

  const retainedImageSet = new Set(input.retainedImageIds);
  const retainedImages = equipment.imageRows.filter((image) =>
    retainedImageSet.has(image.id),
  );

  if (retainedImages.length !== retainedImageSet.size) {
    throw new EquipmentServiceError(
      "One or more retained images are invalid.",
      400,
      "INVALID_IMAGE_REFERENCE",
    );
  }

  let uploadedImages: Array<{
    publicId: string;
    url: string;
    position: number;
  }> = [];

  try {
    uploadedImages = await uploadListingImages(files);

    const nextImages = buildUpdatedImagePayload(retainedImages, uploadedImages);

    if (nextStatus === "PENDING_VERIFICATION") {
      validateImageCountForSubmission(nextImages.length);
    }

    await db.$transaction(async (tx) => {
      await tx.equipment.update({
        where: { id: equipment.row.id },
        data: {
          title: input.title.trim(),
          description: input.description ?? null,
          categoryId: input.categoryId,
          price: input.price,
          deliveryRadius: input.deliveryRadius,
          address: input.address.trim(),
          normalizedAddress: location.normalizedAddress,
          latitude: location.latitude,
          longitude: location.longitude,
          status: nextStatus,
          rejectionReason:
            nextStatus === "PENDING_VERIFICATION"
              ? null
              : equipment.row.rejectionReason,
          reviewedById: null,
          reviewedAt: null,
        },
      });

      await tx.equipmentImage.deleteMany({
        where: { equipmentId: equipment.row.id },
      });

      if (nextImages.length > 0) {
        await tx.equipmentImage.createMany({
          data: nextImages.map((image) => ({
            equipmentId: equipment.row.id,
            url: image.url,
            publicId: image.publicId,
            position: image.position,
          })),
        });
      }
    });

    const removedPublicIds = equipment.imageRows
      .filter((image) => !retainedImageSet.has(image.id))
      .map((image) => image.publicId);

    if (removedPublicIds.length > 0) {
      await cleanupUploadedImages(removedPublicIds);
    }

    const refreshed = await queryEquipmentById(equipment.row.id);

    if (!refreshed) {
      throw new EquipmentServiceError(
        "Equipment listing not found.",
        404,
        "EQUIPMENT_NOT_FOUND",
      );
    }

    const imageRows = await queryEquipmentImagesByIds([equipment.row.id]);
    return mapRowToPublicEquipment(refreshed, imageRows);
  } catch (error) {
    await cleanupUploadedImages(uploadedImages.map((image) => image.publicId));

    logServiceError({
      service: "equipment.service",
      action: "updateOwnerEquipmentListing",
      error,
      context: {
        ownerId,
        equipmentId,
        nextStatus,
        uploadedImageCount: uploadedImages.length,
      },
    });

    if (error instanceof EquipmentServiceError) {
      throw error;
    }

    throw new EquipmentServiceError(
      nextStatus === "PENDING_VERIFICATION"
        ? "Failed to submit the listing for verification."
        : "Failed to save the draft listing.",
      500,
      "EQUIPMENT_UPDATE_FAILED",
    );
  }
}

export async function deleteEquipmentListing(
  ownerId: string,
  equipmentId: string,
) {
  const equipment = await ensureOwnedEquipment(ownerId, equipmentId);

  await cleanupUploadedImages(
    equipment.imageRows.map((image) => image.publicId),
  );

  const deletedEquipment = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    DELETE FROM "Equipment"
    WHERE "id" = ${equipment.row.id}
      AND "ownerId" = ${ownerId}
    RETURNING "id"
  `);

  if (deletedEquipment.length === 0) {
    throw new EquipmentServiceError(
      "Equipment listing not found.",
      404,
      "EQUIPMENT_NOT_FOUND",
    );
  }

  return { id: equipment.row.id };
}

async function ensureAdminEquipment(equipmentId: string) {
  const equipment = await queryEquipmentById(equipmentId);

  if (!equipment) {
    throw new EquipmentServiceError(
      "Equipment listing not found.",
      404,
      "EQUIPMENT_NOT_FOUND",
    );
  }

  return equipment;
}

function ensurePendingEquipmentStatus(status: string) {
  if (ensureAllowedStatus(status) !== "PENDING_VERIFICATION") {
    throw new EquipmentServiceError(
      "Only pending listings can be moderated.",
      409,
      "INVALID_STATUS",
    );
  }
}

export async function approveEquipmentListing(
  adminId: string,
  equipmentId: string,
) {
  const equipment = await ensureAdminEquipment(equipmentId);
  ensurePendingEquipmentStatus(equipment.status);

  const updatedEquipment = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<EquipmentRow[]>(Prisma.sql`
      UPDATE "Equipment"
      SET
        "status" = ${"ACTIVE"},
        "rejectionReason" = NULL,
        "reviewedById" = ${adminId},
        "reviewedAt" = NOW(),
        "updatedAt" = NOW()
      WHERE "id" = ${equipment.id}
        AND "status" = ${"PENDING_VERIFICATION"}
      RETURNING "id"
    `);

    if (rows[0]) {
      await createEquipmentApprovedNotification(tx, {
        ownerId: equipment.ownerId,
        equipmentId: equipment.id,
        listingTitle: equipment.title,
      });
    }

    return rows;
  });

  const row = updatedEquipment[0];

  if (!row) {
    throw new EquipmentServiceError(
      "Only pending listings can be moderated.",
      409,
      "INVALID_STATUS",
    );
  }

  const refreshed = await queryEquipmentById(equipment.id);

  if (!refreshed) {
    throw new EquipmentServiceError(
      "Equipment listing not found.",
      404,
      "EQUIPMENT_NOT_FOUND",
    );
  }

  const imageRows = await queryEquipmentImagesByIds([equipment.id]);
  return mapRowToPublicEquipment(refreshed, imageRows);
}

export async function rejectEquipmentListing(
  adminId: string,
  equipmentId: string,
  input: RejectEquipmentInput,
) {
  const equipment = await ensureAdminEquipment(equipmentId);
  ensurePendingEquipmentStatus(equipment.status);

  const updatedEquipment = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<EquipmentRow[]>(Prisma.sql`
      UPDATE "Equipment"
      SET
        "status" = ${"REJECTED"},
        "rejectionReason" = ${input.reason.trim()},
        "reviewedById" = ${adminId},
        "reviewedAt" = NOW(),
        "updatedAt" = NOW()
      WHERE "id" = ${equipment.id}
        AND "status" = ${"PENDING_VERIFICATION"}
      RETURNING "id"
    `);

    if (rows[0]) {
      await createEquipmentRejectedNotification(tx, {
        ownerId: equipment.ownerId,
        equipmentId: equipment.id,
        listingTitle: equipment.title,
        rejectionReason: input.reason,
      });
    }

    return rows;
  });

  const row = updatedEquipment[0];

  if (!row) {
    throw new EquipmentServiceError(
      "Only pending listings can be moderated.",
      409,
      "INVALID_STATUS",
    );
  }

  const refreshed = await queryEquipmentById(equipment.id);

  if (!refreshed) {
    throw new EquipmentServiceError(
      "Equipment listing not found.",
      404,
      "EQUIPMENT_NOT_FOUND",
    );
  }

  const imageRows = await queryEquipmentImagesByIds([equipment.id]);
  return mapRowToPublicEquipment(refreshed, imageRows);
}
