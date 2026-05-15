import { randomUUID } from "node:crypto";
import { Prisma } from "../generated/prisma/client";
import { db } from "../lib/db";
import type { SafeEquipment } from "../types/equipment";

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

export class WishlistServiceError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = "WISHLIST_ERROR") {
    super(message);
    this.name = "WishlistServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function mapRowToSafeEquipment(
  row: EquipmentRow,
  images: EquipmentImageRow[],
): SafeEquipment {
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
    status: row.status as SafeEquipment["status"],
    rejectionReason: row.rejectionReason,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    images: images
      .sort((left, right) => left.position - right.position)
      .map((image) => ({
        id: image.id,
        url: image.url,
        position: image.position,
      })),
    isWishlisted: true,
  };
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

async function queryActiveEquipmentById(equipmentId: string) {
  const rows = await db.$queryRaw<EquipmentRow[]>(Prisma.sql`
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
    WHERE e."id" = ${equipmentId}
      AND e."status" = ${"ACTIVE"}
    LIMIT 1
  `);

  return rows[0] ?? null;
}

async function queryWishlistEquipmentByUser(userId: string) {
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
      e."createdAt",
      e."updatedAt",
      c."title" AS "categoryTitle",
      c."description" AS "categoryDescription",
      c."imageUrl" AS "categoryImageUrl",
      c."createdAt" AS "categoryCreatedAt",
      c."updatedAt" AS "categoryUpdatedAt"
    FROM "WishlistItem" w
    INNER JOIN "Equipment" e ON e."id" = w."equipmentId"
    INNER JOIN "User" u ON u."id" = e."ownerId"
    INNER JOIN "Category" c ON c."id" = e."categoryId"
    WHERE w."userId" = ${userId}
      AND e."status" = ${"ACTIVE"}
    ORDER BY w."createdAt" DESC
  `);
}

export async function getMyWishlistListings(userId: string) {
  const equipmentRows = await queryWishlistEquipmentByUser(userId);
  const imageRows = await queryEquipmentImagesByIds(
    equipmentRows.map((row) => row.id),
  );
  const groupedImages = groupImagesByEquipmentId(imageRows);

  return equipmentRows.map((row) =>
    mapRowToSafeEquipment(row, groupedImages[row.id] ?? []),
  );
}

export async function addWishlistItem(userId: string, equipmentId: string) {
  const equipment = await queryActiveEquipmentById(equipmentId);

  if (!equipment) {
    throw new WishlistServiceError(
      "Equipment listing not found.",
      404,
      "EQUIPMENT_NOT_FOUND",
    );
  }

  await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    INSERT INTO "WishlistItem" (
      "id",
      "userId",
      "equipmentId",
      "createdAt"
    )
    VALUES (
      ${randomUUID()},
      ${userId},
      ${equipmentId},
      NOW()
    )
    ON CONFLICT ("userId", "equipmentId") DO NOTHING
    RETURNING "id"
  `);

  const imageRows = await queryEquipmentImagesByIds([equipmentId]);
  return mapRowToSafeEquipment(equipment, imageRows);
}

export async function removeWishlistItem(userId: string, equipmentId: string) {
  await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    DELETE FROM "WishlistItem"
    WHERE "userId" = ${userId}
      AND "equipmentId" = ${equipmentId}
    RETURNING "id"
  `);

  return { equipmentId };
}
