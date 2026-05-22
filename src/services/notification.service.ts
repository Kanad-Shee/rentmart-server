import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../lib/db.js";
import type { NotificationType, SafeNotification } from "../types/notification.js";

type NotificationRow = {
  id: string;
  userId: string;
  equipmentId: string | null;
  type: NotificationType;
  title: string;
  message: string;
  actionLabel: string | null;
  actionHref: string | null;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type NotificationQueryExecutor = Pick<typeof db, "$queryRaw">;

type CreateNotificationInput = {
  userId: string;
  equipmentId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  actionLabel?: string | null;
  actionHref?: string | null;
};

type BookingActorInput = {
  equipmentId: string;
  equipmentTitle: string;
  renterId: string;
  renterFullName: string;
  ownerId: string;
  ownerFullName: string;
  startDate: string;
  endDate: string;
};

export class NotificationServiceError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = "NOTIFICATION_ERROR") {
    super(message);
    this.name = "NotificationServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function mapRowToSafeNotification(row: NotificationRow): SafeNotification {
  return {
    id: row.id,
    userId: row.userId,
    equipmentId: row.equipmentId,
    type: row.type,
    title: row.title,
    message: row.message,
    actionLabel: row.actionLabel,
    actionHref: row.actionHref,
    isRead: row.isRead,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createNotificationRecord(
  executor: NotificationQueryExecutor,
  input: CreateNotificationInput,
) {
  const notificationId = randomUUID();

  await executor.$queryRaw<{ id: string }[]>(Prisma.sql`
    INSERT INTO "Notification" (
      "id",
      "userId",
      "equipmentId",
      "type",
      "title",
      "message",
      "actionLabel",
      "actionHref",
      "isRead",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${notificationId},
      ${input.userId},
      ${input.equipmentId ?? null},
      ${input.type},
      ${input.title},
      ${input.message},
      ${input.actionLabel ?? null},
      ${input.actionHref ?? null},
      false,
      NOW(),
      NOW()
    )
    RETURNING "id"
  `);
}

async function createAccountNotification(
  executor: NotificationQueryExecutor,
  input: {
    userId: string;
    type: Extract<NotificationType, "ADDRESS_UPDATED" | "PASSWORD_UPDATED" | "PHONE_VERIFIED">;
    title: string;
    message: string;
  },
) {
  return createNotificationRecord(executor, {
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    actionLabel: "Review Settings",
    actionHref: "/dashboard/settings",
  });
}

async function createBookingNotification(
  executor: NotificationQueryExecutor,
  input: {
    userId: string;
    equipmentId: string;
    type: Extract<
      NotificationType,
      | "BOOKING_REQUEST_RECEIVED"
      | "BOOKING_REQUEST_SUBMITTED"
      | "BOOKING_APPROVED"
      | "BOOKING_REJECTED"
      | "BOOKING_PAYMENT_REQUIRED"
      | "BOOKING_PAYMENT_CONFIRMED"
      | "RENTER_PAYMENT_CONFIRMED"
      | "BOOKING_STARTED"
      | "BOOKING_COMPLETED"
      | "BOOKING_CANCELLED"
      | "BOOKING_DISPUTED"
    >;
    title: string;
    message: string;
    actionLabel: string;
    actionHref: string;
  },
) {
  return createNotificationRecord(executor, {
    userId: input.userId,
    equipmentId: input.equipmentId,
    type: input.type,
    title: input.title,
    message: input.message,
    actionLabel: input.actionLabel,
    actionHref: input.actionHref,
  });
}

export async function createEquipmentApprovedNotification(
  executor: NotificationQueryExecutor,
  input: {
    ownerId: string;
    equipmentId: string;
    listingTitle: string;
  },
) {
  return createNotificationRecord(executor, {
    userId: input.ownerId,
    equipmentId: input.equipmentId,
    type: "EQUIPMENT_APPROVED",
    title: `Admin verified and published ${input.listingTitle}.`,
    message:
      "Your listing is now live in the marketplace and visible to renters.",
    actionLabel: "View Live Product",
    actionHref: `/details/${input.equipmentId}`,
  });
}

export async function createEquipmentRejectedNotification(
  executor: NotificationQueryExecutor,
  input: {
    ownerId: string;
    equipmentId: string;
    listingTitle: string;
    rejectionReason: string;
  },
) {
  return createNotificationRecord(executor, {
    userId: input.ownerId,
    equipmentId: input.equipmentId,
    type: "EQUIPMENT_REJECTED",
    title: `Admin reviewed ${input.listingTitle} and requested changes.`,
    message: input.rejectionReason.trim(),
    actionLabel: "Review & Edit",
    actionHref: `/dashboard/add-listing?listingId=${input.equipmentId}`,
  });
}

export async function createAddressUpdatedNotification(
  executor: NotificationQueryExecutor,
  input: { userId: string },
) {
  return createAccountNotification(executor, {
    userId: input.userId,
    type: "ADDRESS_UPDATED",
    title: "Your address was updated.",
    message: "We saved the latest address on your RentMart account.",
  });
}

export async function createPasswordUpdatedNotification(
  executor: NotificationQueryExecutor,
  input: { userId: string },
) {
  return createAccountNotification(executor, {
    userId: input.userId,
    type: "PASSWORD_UPDATED",
    title: "Your password was changed.",
    message: "If this was not you, secure your account immediately and contact support.",
  });
}

export async function createPhoneVerifiedNotification(
  executor: NotificationQueryExecutor,
  input: { userId: string },
) {
  return createAccountNotification(executor, {
    userId: input.userId,
    type: "PHONE_VERIFIED",
    title: "Your phone number is now verified.",
    message: "Your booking profile is ready for renter and owner actions that require phone verification.",
  });
}

export async function createBookingRequestNotification(
  executor: NotificationQueryExecutor,
  input: {
    ownerId: string;
    equipmentId: string;
    equipmentTitle: string;
    renterFullName: string;
  },
) {
  return createBookingNotification(executor, {
    userId: input.ownerId,
    equipmentId: input.equipmentId,
    type: "BOOKING_REQUEST_RECEIVED",
    title: `${input.renterFullName} requested to book ${input.equipmentTitle}.`,
    message:
      "Review the renter request, approve it, or reject it from your rental requests dashboard.",
    actionLabel: "Review Request",
    actionHref: "/dashboard/rental-requests",
  });
}

export async function createBookingRequestSubmittedNotification(
  executor: NotificationQueryExecutor,
  input: {
    renterId: string;
    equipmentId: string;
    equipmentTitle: string;
  },
) {
  return createBookingNotification(executor, {
    userId: input.renterId,
    equipmentId: input.equipmentId,
    type: "BOOKING_REQUEST_SUBMITTED",
    title: `Your request for ${input.equipmentTitle} was submitted.`,
    message: "The owner can now approve or reject the booking from their rental requests dashboard.",
    actionLabel: "View My Bookings",
    actionHref: "/dashboard/bookings",
  });
}

export async function createBookingApprovedNotification(
  executor: NotificationQueryExecutor,
  input: {
    renterId: string;
    equipmentId: string;
    equipmentTitle: string;
  },
) {
  return createBookingNotification(executor, {
    userId: input.renterId,
    equipmentId: input.equipmentId,
    type: "BOOKING_APPROVED",
    title: `${input.equipmentTitle} was approved by the owner.`,
    message: "Your rental request has been accepted and the dates are still reserved for you.",
    actionLabel: "Open My Bookings",
    actionHref: "/dashboard/bookings",
  });
}

export async function createBookingPaymentRequiredNotification(
  executor: NotificationQueryExecutor,
  input: {
    renterId: string;
    equipmentId: string;
    equipmentTitle: string;
  },
) {
  return createBookingNotification(executor, {
    userId: input.renterId,
    equipmentId: input.equipmentId,
    type: "BOOKING_PAYMENT_REQUIRED",
    title: `Complete the payment step for ${input.equipmentTitle}.`,
    message: "The owner approved your booking. Finish the temporary payment confirmation within the active window.",
    actionLabel: "Complete Payment Step",
    actionHref: "/dashboard/bookings",
  });
}

export async function createBookingRejectedNotification(
  executor: NotificationQueryExecutor,
  input: {
    renterId: string;
    equipmentId: string;
    equipmentTitle: string;
    reason: string;
  },
) {
  return createBookingNotification(executor, {
    userId: input.renterId,
    equipmentId: input.equipmentId,
    type: "BOOKING_REJECTED",
    title: `Your request for ${input.equipmentTitle} was rejected.`,
    message: input.reason.trim(),
    actionLabel: "Browse Alternatives",
    actionHref: "/equipment",
  });
}

export async function createBookingPaymentConfirmedNotification(
  executor: NotificationQueryExecutor,
  input: {
    renterId: string;
    equipmentId: string;
    equipmentTitle: string;
  },
) {
  return createBookingNotification(executor, {
    userId: input.renterId,
    equipmentId: input.equipmentId,
    type: "BOOKING_PAYMENT_CONFIRMED",
    title: `Payment confirmed for ${input.equipmentTitle}.`,
    message: "Your booking is now confirmed and will stay visible in active rentals until the owner starts it.",
    actionLabel: "View Booking",
    actionHref: "/dashboard/bookings",
  });
}

export async function createRenterPaymentConfirmedNotification(
  executor: NotificationQueryExecutor,
  input: {
    ownerId: string;
    equipmentId: string;
    equipmentTitle: string;
    renterFullName: string;
  },
) {
  return createBookingNotification(executor, {
    userId: input.ownerId,
    equipmentId: input.equipmentId,
    type: "RENTER_PAYMENT_CONFIRMED",
    title: `${input.renterFullName} completed the payment step for ${input.equipmentTitle}.`,
    message: "The booking is confirmed and ready for the upcoming rental handoff.",
    actionLabel: "Open Rental Requests",
    actionHref: "/dashboard/rental-requests",
  });
}

export async function createBookingStartedNotification(
  executor: NotificationQueryExecutor,
  input: {
    renterId: string;
    equipmentId: string;
    equipmentTitle: string;
  },
) {
  return createBookingNotification(executor, {
    userId: input.renterId,
    equipmentId: input.equipmentId,
    type: "BOOKING_STARTED",
    title: `${input.equipmentTitle} is now in progress.`,
    message: "The owner marked the rental as started. Track the booking timeline from your dashboard.",
    actionLabel: "Track Rental",
    actionHref: "/dashboard/bookings",
  });
}

export async function createBookingCompletedNotifications(
  executor: NotificationQueryExecutor,
  input: BookingActorInput,
) {
  await createBookingNotification(executor, {
    userId: input.renterId,
    equipmentId: input.equipmentId,
    type: "BOOKING_COMPLETED",
    title: `${input.equipmentTitle} was marked as completed.`,
    message: "Your rental is complete. The booking record and hold status remain available in your dashboard.",
    actionLabel: "View History",
    actionHref: "/dashboard/bookings",
  });

  await createBookingNotification(executor, {
    userId: input.ownerId,
    equipmentId: input.equipmentId,
    type: "BOOKING_COMPLETED",
    title: `${input.equipmentTitle} rental is complete.`,
    message: `The booking with ${input.renterFullName} has been moved into history.`,
    actionLabel: "Open Rental Requests",
    actionHref: "/dashboard/rental-requests",
  });
}

export async function createBookingDisputedNotifications(
  executor: NotificationQueryExecutor,
  input: BookingActorInput & { reason: string },
) {
  await createBookingNotification(executor, {
    userId: input.renterId,
    equipmentId: input.equipmentId,
    type: "BOOKING_DISPUTED",
    title: `A dispute was opened for ${input.equipmentTitle}.`,
    message: input.reason.trim(),
    actionLabel: "Review Booking",
    actionHref: "/dashboard/bookings",
  });

  await createBookingNotification(executor, {
    userId: input.ownerId,
    equipmentId: input.equipmentId,
    type: "BOOKING_DISPUTED",
    title: `Dispute opened for ${input.equipmentTitle}.`,
    message: input.reason.trim(),
    actionLabel: "Open Rental Requests",
    actionHref: "/dashboard/rental-requests",
  });
}

export async function createBookingCancelledNotifications(
  executor: NotificationQueryExecutor,
  input: BookingActorInput & { message: string },
) {
  await createBookingNotification(executor, {
    userId: input.renterId,
    equipmentId: input.equipmentId,
    type: "BOOKING_CANCELLED",
    title: `${input.equipmentTitle} booking was cancelled.`,
    message: input.message,
    actionLabel: "Review Booking",
    actionHref: "/dashboard/bookings",
  });

  await createBookingNotification(executor, {
    userId: input.ownerId,
    equipmentId: input.equipmentId,
    type: "BOOKING_CANCELLED",
    title: `${input.equipmentTitle} booking was cancelled.`,
    message: input.message,
    actionLabel: "Open Rental Requests",
    actionHref: "/dashboard/rental-requests",
  });
}

export async function getMyNotifications(userId: string) {
  const rows = await db.$queryRaw<NotificationRow[]>(Prisma.sql`
    SELECT
      n."id",
      n."userId",
      n."equipmentId",
      n."type",
      n."title",
      n."message",
      n."actionLabel",
      n."actionHref",
      n."isRead",
      n."createdAt",
      n."updatedAt"
    FROM "Notification" n
    WHERE n."userId" = ${userId}
    ORDER BY n."createdAt" DESC
  `);

  return rows.map(mapRowToSafeNotification);
}

export async function markNotificationAsRead(userId: string, notificationId: string) {
  const rows = await db.$queryRaw<NotificationRow[]>(Prisma.sql`
    UPDATE "Notification"
    SET
      "isRead" = true,
      "updatedAt" = NOW()
    WHERE "id" = ${notificationId}
      AND "userId" = ${userId}
    RETURNING
      "id",
      "userId",
      "equipmentId",
      "type",
      "title",
      "message",
      "actionLabel",
      "actionHref",
      "isRead",
      "createdAt",
      "updatedAt"
  `);

  const notification = rows[0];

  if (!notification) {
    throw new NotificationServiceError(
      "Notification not found.",
      404,
      "NOTIFICATION_NOT_FOUND",
    );
  }

  return mapRowToSafeNotification(notification);
}

export async function markAllNotificationsAsRead(userId: string) {
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    UPDATE "Notification"
    SET
      "isRead" = true,
      "updatedAt" = NOW()
    WHERE "userId" = ${userId}
      AND "isRead" = false
    RETURNING "id"
  `);

  return {
    count: rows.length,
  };
}
