import { randomUUID } from "node:crypto";
import { Prisma, UserRole } from "@prisma/client";
import { db } from "../lib/db.js";
import type { CreateSupportQueryInput } from "../validators/support-query.schema.js";

export type SupportQueryListItem = {
  id: string;
  userId: string;
  topic:
    | "GENERAL_INQUIRY"
    | "LISTING_HELP"
    | "RENTAL_HELP"
    | "PAYMENT_HELP"
    | "ACCOUNT_HELP";
  fullName: string;
  email: string;
  role: "OWNER" | "RENTER";
  message: string;
  createdAt: Date;
  updatedAt: Date;
};

export class SupportQueryServiceError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = "SUPPORT_QUERY_ERROR") {
    super(message);
    this.name = "SupportQueryServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

type SupportQueryRow = {
  id: string;
  userId: string;
  topic: SupportQueryListItem["topic"];
  fullName: string;
  email: string;
  role: "OWNER" | "RENTER";
  message: string;
  createdAt: Date;
  updatedAt: Date;
};

function toSupportQueryItem(query: SupportQueryRow): SupportQueryListItem {
  return {
    id: query.id,
    userId: query.userId,
    topic: query.topic,
    fullName: query.fullName,
    email: query.email,
    role: query.role,
    message: query.message,
    createdAt: query.createdAt,
    updatedAt: query.updatedAt,
  };
}

export async function createSupportQuery(
  userId: string,
  input: CreateSupportQueryInput,
) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
    },
  });

  if (!user) {
    throw new SupportQueryServiceError(
      "User not found.",
      404,
      "USER_NOT_FOUND",
    );
  }

  if (user.role !== UserRole.OWNER && user.role !== UserRole.RENTER) {
    throw new SupportQueryServiceError(
      "Only owners and renters can submit support queries.",
      403,
      "SUPPORT_QUERY_ROLE_NOT_ALLOWED",
    );
  }

  const createdRows = await db.$queryRaw<SupportQueryRow[]>(Prisma.sql`
    INSERT INTO "SupportQuery" (
      "id",
      "userId",
      "topic",
      "fullName",
      "email",
      "role",
      "message",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${randomUUID()},
      ${user.id},
      ${input.topic}::"SupportQueryTopic",
      ${user.fullName},
      ${user.email},
      ${user.role}::"UserRole",
      ${input.message.trim()},
      NOW(),
      NOW()
    )
    RETURNING
      "id",
      "userId",
      "topic",
      "fullName",
      "email",
      "role",
      "message",
      "createdAt",
      "updatedAt"
  `);

  const created = createdRows[0];

  if (!created) {
    throw new SupportQueryServiceError(
      "Support query could not be created.",
      500,
      "SUPPORT_QUERY_CREATE_FAILED",
    );
  }

  return toSupportQueryItem(created);
}

export async function listSupportQueries() {
  const queries = await db.$queryRaw<SupportQueryRow[]>(Prisma.sql`
    SELECT
      "id",
      "userId",
      "topic",
      "fullName",
      "email",
      "role",
      "message",
      "createdAt",
      "updatedAt"
    FROM "SupportQuery"
    ORDER BY "createdAt" DESC
  `);

  return queries.map(toSupportQueryItem);
}

export async function resolveSupportQuery(id: string) {
  const deletedRows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    DELETE FROM "SupportQuery"
    WHERE "id" = ${id}
    RETURNING "id"
  `);

  const deleted = deletedRows[0];

  if (!deleted) {
    throw new SupportQueryServiceError(
      "Support query not found.",
      404,
      "SUPPORT_QUERY_NOT_FOUND",
    );
  }

  return { id };
}
