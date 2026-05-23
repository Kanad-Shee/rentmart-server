import {
  Prisma,
  type BookingStatus,
  type DepositRefundStatus,
  type FinancialStatus,
  type OwnerPayoutStatus,
} from "@prisma/client";
import { db } from "../lib/db.js";
import { logServiceError } from "../lib/error-logger.js";
import { logger } from "../lib/logger.js";
import {
  canOwnerCompleteBookingStatus,
  canOwnerDisputeBookingStatus,
} from "../lib/booking-state.js";
import {
  BOOKING_DAMAGE_WAIVER_FEE,
  BOOKING_DISPUTE_IMAGE_LIMITS,
  BOOKING_OWNER_APPROVAL_WINDOW_HOURS,
  BOOKING_PAYMENT_PROVIDER,
  BOOKING_PLATFORM_FEE_RATE,
  BOOKING_RENTER_PAYMENT_WINDOW_HOURS,
  BOOKING_SECURITY_DEPOSIT_MAX,
  BOOKING_SECURITY_DEPOSIT_MIN,
  BOOKING_SECURITY_DEPOSIT_RATE,
} from "../configs/booking.config.js";
import { sendBookingEventEmail } from "../lib/brevo-mailer.js";
import { deleteCloudinaryImage, uploadBookingDisputeImage } from "../lib/cloudinary.js";
import {
  CashfreeApiError,
  createCashfreeOrder,
  getCashfreeCheckoutEnvironment,
  getCashfreeOrder,
  getCashfreePaymentsForOrder,
  toPaise,
  verifyCashfreeWebhookSignature,
} from "../lib/cashfree.js";
import type { BookingPaymentOrder, SafeBooking } from "../types/booking.js";
import type { AdminWebhookEvent } from "../types/payment.js";
import {
  createBookingApprovedNotification,
  createBookingCancelledNotifications,
  createBookingCompletedNotifications,
  createBookingDisputedNotifications,
  createBookingPaymentConfirmedNotification,
  createBookingPaymentRequiredNotification,
  createBookingRejectedNotification,
  createBookingRequestNotification,
  createBookingRequestSubmittedNotification,
  createBookingStartedNotification,
  createRenterPaymentConfirmedNotification,
} from "./notification.service.js";
import type {
  CreateBookingInput,
  DisputeBookingInput,
  RejectBookingInput,
  VerifyBookingPaymentInput,
} from "../validators/booking.schema.js";

const overlapStatuses: BookingStatus[] = [
  "PENDING_OWNER_APPROVAL",
  "PENDING_RENTER_PAYMENT",
  "CONFIRMED",
  "IN_PROGRESS",
];

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseDateOnly(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new BookingServiceError(
      "Invalid booking date provided.",
      400,
      "INVALID_DATE",
    );
  }

  return date;
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function uploadBookingDisputeImages(files: Express.Multer.File[]) {
  const uploadedImages: Array<{
    publicId: string;
    url: string;
    position: number;
  }> = [];

  for (const [index, file] of files.entries()) {
    const result = await uploadBookingDisputeImage(file);

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
        service: "booking.service",
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

function createBookingEventPayload(
  booking: Prisma.BookingGetPayload<{
    include: {
      equipment: {
        include: {
          images: {
            orderBy: { position: "asc" };
            take: 1;
          };
        };
      };
      renter: true;
      owner: true;
    };
  }>,
) {
  return {
    equipmentId: booking.equipmentId,
    equipmentTitle: booking.equipment.title,
    renterId: booking.renterId,
    renterFullName: booking.renter.fullName,
    ownerId: booking.ownerId,
    ownerFullName: booking.owner.fullName,
    startDate: formatDateOnly(booking.startDate),
    endDate: formatDateOnly(booking.endDate),
  };
}

function calculateRentalDays(startDate: Date, endDate: Date) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((endDate.getTime() - startDate.getTime()) / millisecondsPerDay) + 1;
}

function calculateSecurityDeposit(rentalFee: number) {
  return roundCurrency(
    Math.max(
      BOOKING_SECURITY_DEPOSIT_MIN,
      Math.min(BOOKING_SECURITY_DEPOSIT_MAX, rentalFee * BOOKING_SECURITY_DEPOSIT_RATE),
    ),
  );
}

function calculateBookingPricing(pricePerDay: number, rentalDays: number) {
  const rentalFee = roundCurrency(pricePerDay * rentalDays);
  const platformFee = roundCurrency(rentalFee * BOOKING_PLATFORM_FEE_RATE);
  const damageWaiverFee = roundCurrency(BOOKING_DAMAGE_WAIVER_FEE);
  const securityDeposit = calculateSecurityDeposit(rentalFee);
  const totalAuthorized = roundCurrency(
    rentalFee + platformFee + damageWaiverFee + securityDeposit,
  );

  return {
    rentalFee,
    platformFee,
    damageWaiverFee,
    securityDeposit,
    totalAuthorized,
  };
}

function generatePaymentReference(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function deriveFinancialStatusFromManualSettlement(input: {
  ownerPayoutStatus: OwnerPayoutStatus;
  depositRefundStatus: DepositRefundStatus;
  bookingStatus: BookingStatus;
  isPaymentCompleted: boolean;
}) {
  if (input.bookingStatus === "DISPUTED") {
    return "DISPUTED" satisfies FinancialStatus;
  }

  if (!input.isPaymentCompleted) {
    return "NONE" satisfies FinancialStatus;
  }

  if (
    input.ownerPayoutStatus === "PAID" &&
    (input.depositRefundStatus === "REFUNDED" || input.depositRefundStatus === "SKIPPED")
  ) {
    return "MANUAL_SETTLEMENT_COMPLETE" satisfies FinancialStatus;
  }

  if (
    input.ownerPayoutStatus === "PENDING" ||
    input.depositRefundStatus === "PENDING" ||
    input.ownerPayoutStatus === "BLOCKED" ||
    input.depositRefundStatus === "BLOCKED"
  ) {
    return "MANUAL_SETTLEMENT_PENDING" satisfies FinancialStatus;
  }

  return "PAYMENT_CAPTURED" satisfies FinancialStatus;
}

function isPaymentWindowExpired(booking: {
  renterPaymentDeadlineAt: Date | null;
}) {
  return Boolean(
    booking.renterPaymentDeadlineAt &&
      booking.renterPaymentDeadlineAt.getTime() <= Date.now(),
  );
}

function mapCashfreeError(error: unknown): never {
  if (error instanceof CashfreeApiError) {
    throw new BookingServiceError(error.message, error.statusCode, error.code);
  }

  throw error;
}

async function sendBookingEventEmailSafe(
  input: Parameters<typeof sendBookingEventEmail>[0],
) {
  try {
    await sendBookingEventEmail(input);
  } catch (error) {
    logServiceError({
      service: "booking.service",
      action: "sendBookingEventEmailSafe",
      error,
      context: {
        to: typeof input.to === "string" ? input.to : input.to.email,
        subject: input.subject,
        equipmentTitle: input.equipmentTitle,
      },
    });
  }
}

function mapBooking(booking: {
  id: string;
  equipmentId: string;
  renterId: string;
  ownerId: string;
  startDate: Date;
  endDate: Date;
  rentalDays: number;
  rentalFee: number;
  platformFee: number;
  damageWaiverFee: number;
  securityDeposit: number;
  totalAuthorized: number;
  currency: string;
  isPaymentCompleted: boolean;
  financialStatus: FinancialStatus;
  paymentProvider: string | null;
  paymentIntentId: string | null;
  paymentAuthorizationId: string | null;
  cashfreeOrderId: string | null;
  cashfreePaymentId: string | null;
  cashfreePaymentSessionId: string | null;
  payoutLinkedAccountId: string | null;
  paymentAmountInPaise: number | null;
  paymentCurrency: string | null;
  lastPaymentError: string | null;
  paymentCapturedAt: Date | null;
  ownerActionDeadlineAt: Date;
  renterPaymentDeadlineAt: Date | null;
  conditionLoggedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  disputedAt: Date | null;
  paymentFailedAt: Date | null;
  paymentVoidedAt: Date | null;
  paymentReleasedAt: Date | null;
  paymentDisputedAt: Date | null;
  ownerPayoutSettledAt: Date | null;
  depositRefundInitiatedAt: Date | null;
  depositRefundedAt: Date | null;
  ownerPayoutStatus: OwnerPayoutStatus;
  ownerPaidAt: Date | null;
  ownerPayoutReference: string | null;
  depositRefundStatus: DepositRefundStatus;
  depositRefundReference: string | null;
  status: BookingStatus;
  ownerDecisionReason: string | null;
  disputeReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  equipment: {
    id: string;
    title: string;
    price: number;
    normalizedAddress: string;
    status: string;
    images: Array<{ url: string }>;
  };
  renter: {
    id: string;
    fullName: string;
    email: string;
    phoneVerified: boolean;
  };
  owner: {
    id: string;
    fullName: string;
    email: string;
    phoneVerified: boolean;
  };
  disputeImages?: Array<{
    id: string;
    url: string;
    position: number;
  }>;
}): SafeBooking {
  return {
    id: booking.id,
    equipmentId: booking.equipmentId,
    renterId: booking.renterId,
    ownerId: booking.ownerId,
    startDate: formatDateOnly(booking.startDate),
    endDate: formatDateOnly(booking.endDate),
    rentalDays: booking.rentalDays,
    rentalFee: booking.rentalFee,
    platformFee: booking.platformFee,
    damageWaiverFee: booking.damageWaiverFee,
    securityDeposit: booking.securityDeposit,
    totalAuthorized: booking.totalAuthorized,
    currency: booking.currency,
    isPaymentCompleted: booking.isPaymentCompleted,
    financialStatus: booking.financialStatus,
    paymentProvider: booking.paymentProvider,
    paymentIntentId: booking.paymentIntentId,
    paymentAuthorizationId: booking.paymentAuthorizationId,
    cashfreeOrderId: booking.cashfreeOrderId,
    cashfreePaymentId: booking.cashfreePaymentId,
    cashfreePaymentSessionId: booking.cashfreePaymentSessionId,
    payoutLinkedAccountId: booking.payoutLinkedAccountId,
    paymentAmountInPaise: booking.paymentAmountInPaise,
    paymentCurrency: booking.paymentCurrency,
    lastPaymentError: booking.lastPaymentError,
    paymentCapturedAt: booking.paymentCapturedAt?.toISOString() ?? null,
    ownerActionDeadlineAt: booking.ownerActionDeadlineAt.toISOString(),
    renterPaymentDeadlineAt: booking.renterPaymentDeadlineAt?.toISOString() ?? null,
    conditionLoggedAt: booking.conditionLoggedAt?.toISOString() ?? null,
    completedAt: booking.completedAt?.toISOString() ?? null,
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    disputedAt: booking.disputedAt?.toISOString() ?? null,
    paymentFailedAt: booking.paymentFailedAt?.toISOString() ?? null,
    paymentVoidedAt: booking.paymentVoidedAt?.toISOString() ?? null,
    paymentReleasedAt: booking.paymentReleasedAt?.toISOString() ?? null,
    paymentDisputedAt: booking.paymentDisputedAt?.toISOString() ?? null,
    ownerPayoutSettledAt: booking.ownerPayoutSettledAt?.toISOString() ?? null,
    depositRefundInitiatedAt: booking.depositRefundInitiatedAt?.toISOString() ?? null,
    depositRefundedAt: booking.depositRefundedAt?.toISOString() ?? null,
    ownerPayoutStatus: booking.ownerPayoutStatus,
    ownerPaidAt: booking.ownerPaidAt?.toISOString() ?? null,
    ownerPayoutReference: booking.ownerPayoutReference,
    depositRefundStatus: booking.depositRefundStatus,
    depositRefundReference: booking.depositRefundReference,
    status: booking.status,
    ownerDecisionReason: booking.ownerDecisionReason,
    disputeReason: booking.disputeReason,
    disputeImages: [...(booking.disputeImages ?? [])]
      .sort((left, right) => left.position - right.position)
      .map((image) => ({
        id: image.id,
        url: image.url,
        position: image.position,
      })),
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
    equipment: {
      id: booking.equipment.id,
      title: booking.equipment.title,
      price: booking.equipment.price,
      normalizedAddress: booking.equipment.normalizedAddress,
      status: booking.equipment.status,
      imageUrl: booking.equipment.images[0]?.url ?? null,
    },
    renter: {
      id: booking.renter.id,
      fullName: booking.renter.fullName,
      email: booking.renter.email,
      phoneVerified: booking.renter.phoneVerified,
    },
    owner: {
      id: booking.owner.id,
      fullName: booking.owner.fullName,
      email: booking.owner.email,
      phoneVerified: booking.owner.phoneVerified,
    },
  };
}

async function getBookingById(bookingId: string) {
  await expireStaleBookings();

  return db.booking.findUnique({
    where: { id: bookingId },
    include: {
      equipment: {
        include: {
          images: {
            orderBy: { position: "asc" },
            take: 1,
          },
        },
      },
      renter: true,
      owner: true,
      disputeImages: {
        orderBy: { position: "asc" },
      },
    },
  });
}

async function expireStaleBookings() {
  const now = new Date();
  const expiredOwnerApprovalBookings = await db.booking.findMany({
    where: {
      status: "PENDING_OWNER_APPROVAL",
      ownerActionDeadlineAt: {
        lt: now,
      },
    },
    include: {
      equipment: {
        include: {
          images: {
            orderBy: { position: "asc" },
            take: 1,
          },
        },
      },
      renter: true,
      owner: true,
    },
  });

  for (const booking of expiredOwnerApprovalBookings) {
    const updatedBooking = await db.booking.update({
      where: { id: booking.id },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        ownerDecisionReason: "Owner approval window expired.",
      },
      include: {
        equipment: {
          include: {
            images: {
              orderBy: { position: "asc" },
              take: 1,
            },
          },
        },
        renter: true,
        owner: true,
      },
    });
    const eventPayload = createBookingEventPayload(updatedBooking);
    const message = "The booking was cancelled because the owner approval window expired.";

    await createBookingCancelledNotifications(db, {
      ...eventPayload,
      message,
    });
    await Promise.all([
      sendBookingEventEmailSafe({
        to: {
          email: updatedBooking.renter.email,
          name: updatedBooking.renter.fullName,
        },
        subject: `Booking cancelled for ${updatedBooking.equipment.title}`,
        title: `Booking cancelled for ${updatedBooking.equipment.title}`,
        message,
        equipmentTitle: updatedBooking.equipment.title,
        startDate: eventPayload.startDate,
        endDate: eventPayload.endDate,
        statusLabel: "Cancelled",
        ctaLabel: "Review Booking",
        ctaHref: "/dashboard/bookings",
      }),
      sendBookingEventEmailSafe({
        to: {
          email: updatedBooking.owner.email,
          name: updatedBooking.owner.fullName,
        },
        subject: `Booking cancelled for ${updatedBooking.equipment.title}`,
        title: `Booking cancelled for ${updatedBooking.equipment.title}`,
        message,
        equipmentTitle: updatedBooking.equipment.title,
        startDate: eventPayload.startDate,
        endDate: eventPayload.endDate,
        statusLabel: "Cancelled",
        ctaLabel: "Open Rental Requests",
        ctaHref: "/dashboard/rental-requests",
      }),
    ]);
  }

  const expiredRenterPaymentBookings = await db.booking.findMany({
    where: {
      status: "PENDING_RENTER_PAYMENT",
      renterPaymentDeadlineAt: {
        lt: now,
      },
    },
    include: {
      equipment: {
        include: {
          images: {
            orderBy: { position: "asc" },
            take: 1,
          },
        },
      },
      renter: true,
      owner: true,
    },
  });

  for (const booking of expiredRenterPaymentBookings) {
    const updatedBooking = await db.booking.update({
      where: { id: booking.id },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        ownerDecisionReason: "Renter payment window expired.",
      },
      include: {
        equipment: {
          include: {
            images: {
              orderBy: { position: "asc" },
              take: 1,
            },
          },
        },
        renter: true,
        owner: true,
      },
    });
    const eventPayload = createBookingEventPayload(updatedBooking);
    const message = "The booking was cancelled because the renter payment window expired.";

    await createBookingCancelledNotifications(db, {
      ...eventPayload,
      message,
    });
    await Promise.all([
      sendBookingEventEmailSafe({
        to: {
          email: updatedBooking.renter.email,
          name: updatedBooking.renter.fullName,
        },
        subject: `Booking expired for ${updatedBooking.equipment.title}`,
        title: `Booking expired for ${updatedBooking.equipment.title}`,
        message,
        equipmentTitle: updatedBooking.equipment.title,
        startDate: eventPayload.startDate,
        endDate: eventPayload.endDate,
        statusLabel: "Cancelled",
        ctaLabel: "Review Booking",
        ctaHref: "/dashboard/bookings",
      }),
      sendBookingEventEmailSafe({
        to: {
          email: updatedBooking.owner.email,
          name: updatedBooking.owner.fullName,
        },
        subject: `Booking expired for ${updatedBooking.equipment.title}`,
        title: `Booking expired for ${updatedBooking.equipment.title}`,
        message,
        equipmentTitle: updatedBooking.equipment.title,
        startDate: eventPayload.startDate,
        endDate: eventPayload.endDate,
        statusLabel: "Cancelled",
        ctaLabel: "Open Rental Requests",
        ctaHref: "/dashboard/rental-requests",
      }),
    ]);
  }
}

async function ensureBooking(bookingId: string) {
  const booking = await getBookingById(bookingId);

  if (!booking) {
    throw new BookingServiceError("Booking not found.", 404, "BOOKING_NOT_FOUND");
  }

  return booking;
}

function ensureBookingStatus(
  currentStatus: BookingStatus,
  allowedStatuses: BookingStatus[],
  message: string,
  code: string,
) {
  if (!allowedStatuses.includes(currentStatus)) {
    throw new BookingServiceError(message, 409, code);
  }
}

function assertPricingSnapshot(
  input: CreateBookingInput,
  expected: ReturnType<typeof calculateBookingPricing>,
  rentalDays: number,
) {
  if (
    input.rentalDays !== rentalDays ||
    roundCurrency(input.rentalFee) !== expected.rentalFee ||
    roundCurrency(input.platformFee) !== expected.platformFee ||
    roundCurrency(input.damageWaiverFee) !== expected.damageWaiverFee ||
    roundCurrency(input.securityDeposit) !== expected.securityDeposit ||
    roundCurrency(input.totalAuthorized) !== expected.totalAuthorized
  ) {
    throw new BookingServiceError(
      "Booking pricing is out of date. Please review the latest quote and try again.",
      409,
      "PRICING_MISMATCH",
    );
  }
}

export class BookingServiceError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = "BOOKING_ERROR") {
    super(message);
    this.name = "BookingServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export async function createBookingRequest(
  renterId: string,
  input: CreateBookingInput,
  idempotencyKey?: string,
) {
  const renter = await db.user.findUnique({
    where: { id: renterId },
    select: {
      id: true,
      role: true,
      phoneVerified: true,
    },
  });

  if (!renter) {
    throw new BookingServiceError("Unauthorized.", 401, "UNAUTHORIZED");
  }

  if (renter.role !== "RENTER") {
    throw new BookingServiceError(
      "Only renters can create booking requests.",
      403,
      "ROLE_NOT_ALLOWED",
    );
  }

  if (!renter.phoneVerified) {
    throw new BookingServiceError(
      "Please verify your phone number before requesting a rental.",
      403,
      "PHONE_NOT_VERIFIED",
    );
  }

  const equipment = await db.equipment.findUnique({
    where: { id: input.equipmentId },
    select: {
      id: true,
      ownerId: true,
      price: true,
      status: true,
    },
  });

  if (!equipment || equipment.status !== "ACTIVE") {
    throw new BookingServiceError(
      "This equipment is not available for booking.",
      404,
      "EQUIPMENT_NOT_BOOKABLE",
    );
  }

  if (equipment.ownerId === renterId) {
    throw new BookingServiceError(
      "You cannot book your own equipment listing.",
      409,
      "SELF_BOOKING_NOT_ALLOWED",
    );
  }

  const startDate = parseDateOnly(input.startDate);
  const endDate = parseDateOnly(input.endDate);
  const today = new Date();
  const todayAtMidnightUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  if (startDate < todayAtMidnightUtc) {
    throw new BookingServiceError(
      "Bookings must start today or later.",
      400,
      "START_DATE_IN_PAST",
    );
  }

  const rentalDays = calculateRentalDays(startDate, endDate);

  if (rentalDays < 1) {
    throw new BookingServiceError(
      "Select a valid rental range.",
      400,
      "INVALID_RENTAL_RANGE",
    );
  }

  const expectedPricing = calculateBookingPricing(equipment.price, rentalDays);
  assertPricingSnapshot(input, expectedPricing, rentalDays);

  const overlappingBooking = await db.booking.findFirst({
    where: {
      equipmentId: equipment.id,
      status: { in: overlapStatuses },
      OR: [
        {
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
      ],
    },
    select: { id: true },
  });

  if (overlappingBooking) {
    throw new BookingServiceError(
      "These dates are no longer available for this listing.",
      409,
      "BOOKING_DATES_UNAVAILABLE",
    );
  }

  const ownerActionDeadlineAt = new Date(
    Date.now() + BOOKING_OWNER_APPROVAL_WINDOW_HOURS * 60 * 60 * 1000,
  );

  const booking = await db.booking.create({
    data: {
      equipmentId: equipment.id,
      renterId,
      ownerId: equipment.ownerId,
      startDate,
      endDate,
      rentalDays,
      rentalFee: expectedPricing.rentalFee,
      platformFee: expectedPricing.platformFee,
      damageWaiverFee: expectedPricing.damageWaiverFee,
      securityDeposit: expectedPricing.securityDeposit,
      totalAuthorized: expectedPricing.totalAuthorized,
      isPaymentCompleted: false,
      paymentProvider: null,
      paymentIntentId: null,
      paymentAuthorizationId: null,
      paymentIdempotencyKey: idempotencyKey?.trim() || null,
      ownerActionDeadlineAt,
      renterPaymentDeadlineAt: null,
      status: "PENDING_OWNER_APPROVAL",
    },
    include: {
      equipment: {
        include: {
          images: {
            orderBy: { position: "asc" },
            take: 1,
          },
        },
      },
      renter: true,
      owner: true,
    },
  });

  await createBookingRequestNotification(db, {
    ownerId: equipment.ownerId,
    equipmentId: equipment.id,
    equipmentTitle: booking.equipment.title,
    renterFullName: booking.renter.fullName,
  });
  await createBookingRequestSubmittedNotification(db, {
    renterId,
    equipmentId: equipment.id,
    equipmentTitle: booking.equipment.title,
  });
  await Promise.all([
    sendBookingEventEmailSafe({
      to: {
        email: booking.renter.email,
        name: booking.renter.fullName,
      },
      subject: `Booking request submitted for ${booking.equipment.title}`,
      title: `Your booking request was submitted`,
      message: `We sent your request for ${booking.equipment.title} to the owner. You will see approval updates in your dashboard.`,
      equipmentTitle: booking.equipment.title,
      startDate: formatDateOnly(booking.startDate),
      endDate: formatDateOnly(booking.endDate),
      statusLabel: "Pending owner approval",
      ctaLabel: "View My Bookings",
      ctaHref: "/dashboard/bookings",
    }),
    sendBookingEventEmailSafe({
      to: {
        email: booking.owner.email,
        name: booking.owner.fullName,
      },
      subject: `New booking request for ${booking.equipment.title}`,
      title: `A renter requested ${booking.equipment.title}`,
      message: `${booking.renter.fullName} sent a booking request that needs your approval or rejection.`,
      equipmentTitle: booking.equipment.title,
      startDate: formatDateOnly(booking.startDate),
      endDate: formatDateOnly(booking.endDate),
      statusLabel: "Pending owner approval",
      ctaLabel: "Review Request",
      ctaHref: "/dashboard/rental-requests",
    }),
  ]);

  return mapBooking(booking);
}

export async function getRenterBookings(renterId: string) {
  await expireStaleBookings();

  const bookings = await db.booking.findMany({
    where: { renterId },
    orderBy: { createdAt: "desc" },
    include: {
      equipment: {
        include: {
          images: {
            orderBy: { position: "asc" },
            take: 1,
          },
        },
      },
      renter: true,
      owner: true,
      disputeImages: {
        orderBy: { position: "asc" },
      },
    },
  });

  return bookings.map(mapBooking);
}

export async function getOwnerBookings(ownerId: string) {
  await expireStaleBookings();

  const bookings = await db.booking.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    include: {
      equipment: {
        include: {
          images: {
            orderBy: { position: "asc" },
            take: 1,
          },
        },
      },
      renter: true,
      owner: true,
      disputeImages: {
        orderBy: { position: "asc" },
      },
    },
  });

  return bookings.map(mapBooking);
}

export async function getAdminBookings(_adminId: string) {
  await expireStaleBookings();

  const bookings = await db.booking.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      equipment: {
        include: {
          images: {
            orderBy: { position: "asc" },
            take: 1,
          },
        },
      },
      renter: true,
      owner: true,
      disputeImages: {
        orderBy: { position: "asc" },
      },
    },
  });

  return bookings.map(mapBooking);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNestedRecord(source: unknown, ...keys: string[]) {
  let current: unknown = source;

  for (const key of keys) {
    if (!isRecord(current)) {
      return null;
    }

    current = current[key];
  }

  return isRecord(current) ? current : null;
}

function getNestedString(source: unknown, ...keys: string[]) {
  let current: unknown = source;

  for (const key of keys) {
    if (!isRecord(current)) {
      return null;
    }

    current = current[key];
  }

  return typeof current === "string" && current.trim().length > 0 ? current.trim() : null;
}

function buildWebhookReferenceMap(event: { entityId: string | null; payload: unknown }) {
  const orderEntity = getNestedRecord(event.payload, "data", "order");
  const paymentEntity = getNestedRecord(event.payload, "data", "payment");

  const orderId = getNestedString(orderEntity, "order_id");
  const paymentId = getNestedString(paymentEntity, "cf_payment_id");

  return {
    orderId,
    paymentId,
    entityId: event.entityId,
  };
}

function getWebhookEventStatus(input: {
  processedAt: Date | null;
  linkedBookingId: string | null;
}) {
  if (!input.processedAt) {
    return "unprocessed" satisfies AdminWebhookEvent["status"];
  }

  if (!input.linkedBookingId) {
    return "unmatched" satisfies AdminWebhookEvent["status"];
  }

  return "processed" satisfies AdminWebhookEvent["status"];
}

export async function getAdminCashfreeWebhookEvents(_adminId: string) {
  const events = await db.cashfreeWebhookEvent.findMany({
    orderBy: [{ createdAt: "desc" }, { processedAt: "desc" }],
  });

  const references = events.map((event) => ({
    eventId: event.eventId,
    ...buildWebhookReferenceMap({
      entityId: event.entityId,
      payload: event.payload,
    }),
  }));

  const orderIds = Array.from(
    new Set(references.map((reference) => reference.orderId).filter(Boolean)),
  ) as string[];
  const paymentIds = Array.from(
    new Set(
      references
        .flatMap((reference) => [reference.paymentId, reference.entityId])
        .filter(Boolean),
    ),
  ) as string[];

  const relatedBookings =
    orderIds.length > 0 || paymentIds.length > 0
      ? await db.booking.findMany({
          where: {
            OR: [
              orderIds.length > 0 ? { cashfreeOrderId: { in: orderIds } } : undefined,
              paymentIds.length > 0 ? { cashfreePaymentId: { in: paymentIds } } : undefined,
            ].filter(Boolean) as Prisma.BookingWhereInput[],
          },
          select: {
            id: true,
            cashfreeOrderId: true,
            cashfreePaymentId: true,
            equipment: {
              select: {
                title: true,
              },
            },
            owner: {
              select: {
                fullName: true,
              },
            },
            renter: {
              select: {
                fullName: true,
              },
            },
          },
        })
      : [];

  const bookingsByOrderId = new Map<string, (typeof relatedBookings)[number]>();
  const bookingsByPaymentId = new Map<string, (typeof relatedBookings)[number]>();

  for (const booking of relatedBookings) {
    if (booking.cashfreeOrderId) {
      bookingsByOrderId.set(booking.cashfreeOrderId, booking);
    }

    if (booking.cashfreePaymentId) {
      bookingsByPaymentId.set(booking.cashfreePaymentId, booking);
    }
  }

  return events.map((event) => {
    const refs = buildWebhookReferenceMap({
      entityId: event.entityId,
      payload: event.payload,
    });
    const linkedBooking =
      (refs.orderId ? bookingsByOrderId.get(refs.orderId) : null) ??
      (refs.paymentId ? bookingsByPaymentId.get(refs.paymentId) : null) ??
      (refs.entityId ? bookingsByPaymentId.get(refs.entityId) : null) ??
      null;

    return {
      id: event.id,
      eventId: event.eventId,
      eventType: event.eventType,
      entityId: event.entityId,
      processedAt: event.processedAt?.toISOString() ?? null,
      createdAt: event.createdAt.toISOString(),
      payload: event.payload,
      linkedOrderId: refs.orderId,
      linkedPaymentId: refs.paymentId,
      linkedBooking: linkedBooking
        ? {
            id: linkedBooking.id,
            equipmentTitle: linkedBooking.equipment.title,
            ownerName: linkedBooking.owner.fullName,
            renterName: linkedBooking.renter.fullName,
          }
        : null,
      status: getWebhookEventStatus({
        processedAt: event.processedAt,
        linkedBookingId: linkedBooking?.id ?? null,
      }),
    } satisfies AdminWebhookEvent;
  });
}

export async function approveBookingRequest(
  ownerId: string,
  bookingId: string,
) {
  const booking = await ensureBooking(bookingId);

  if (booking.ownerId !== ownerId) {
    throw new BookingServiceError(
      "You do not have permission to manage this booking.",
      403,
      "FORBIDDEN",
    );
  }

  ensureBookingStatus(
    booking.status,
    ["PENDING_OWNER_APPROVAL"],
    "Only pending requests can be approved.",
    "INVALID_BOOKING_STATUS",
  );

  const renterPaymentDeadlineAt = new Date(
    Date.now() + BOOKING_RENTER_PAYMENT_WINDOW_HOURS * 60 * 60 * 1000,
  );

  const updatedBooking = await db.booking.update({
    where: { id: booking.id },
    data: {
      status: "PENDING_RENTER_PAYMENT",
      renterPaymentDeadlineAt,
      ownerDecisionReason: null,
    },
    include: {
      equipment: {
        include: {
          images: {
            orderBy: { position: "asc" },
            take: 1,
          },
        },
      },
      renter: true,
      owner: true,
    },
  });
  await createBookingApprovedNotification(db, {
    renterId: updatedBooking.renterId,
    equipmentId: updatedBooking.equipmentId,
    equipmentTitle: updatedBooking.equipment.title,
  });
  await createBookingPaymentRequiredNotification(db, {
    renterId: updatedBooking.renterId,
    equipmentId: updatedBooking.equipmentId,
    equipmentTitle: updatedBooking.equipment.title,
  });
  await Promise.all([
    sendBookingEventEmailSafe({
      to: {
        email: updatedBooking.renter.email,
        name: updatedBooking.renter.fullName,
      },
      subject: `${updatedBooking.equipment.title} was approved`,
      title: `Your booking was approved`,
      message: `The owner approved your request for ${updatedBooking.equipment.title}.`,
      equipmentTitle: updatedBooking.equipment.title,
      startDate: formatDateOnly(updatedBooking.startDate),
      endDate: formatDateOnly(updatedBooking.endDate),
      statusLabel: "Approved",
      ctaLabel: "Open My Bookings",
      ctaHref: "/dashboard/bookings",
    }),
    sendBookingEventEmailSafe({
      to: {
        email: updatedBooking.renter.email,
        name: updatedBooking.renter.fullName,
      },
      subject: `Complete the payment step for ${updatedBooking.equipment.title}`,
      title: `Payment step required`,
      message: `Your approved booking now needs the temporary payment confirmation before it becomes fully confirmed.`,
      equipmentTitle: updatedBooking.equipment.title,
      startDate: formatDateOnly(updatedBooking.startDate),
      endDate: formatDateOnly(updatedBooking.endDate),
      statusLabel: "Awaiting payment confirmation",
      ctaLabel: "Complete Payment Step",
      ctaHref: "/dashboard/bookings",
    }),
  ]);

  return mapBooking(updatedBooking);
}

export async function createBookingPaymentOrder(
  renterId: string,
  bookingId: string,
  idempotencyKey?: string,
): Promise<BookingPaymentOrder> {
  const booking = await ensureBooking(bookingId);

  if (booking.renterId !== renterId) {
    throw new BookingServiceError(
      "You do not have permission to pay for this booking.",
      403,
      "FORBIDDEN",
    );
  }

  ensureBookingStatus(
    booking.status,
    ["PENDING_RENTER_PAYMENT"],
    "Only owner-approved bookings can be paid.",
    "INVALID_BOOKING_STATUS",
  );

  if (isPaymentWindowExpired(booking)) {
    throw new BookingServiceError(
      "The payment window for this booking has expired.",
      409,
      "PAYMENT_WINDOW_EXPIRED",
    );
  }

  const amountInPaise = toPaise(booking.totalAuthorized);
  const customerPhone = booking.renter.phone?.trim();

  if (!customerPhone) {
    throw new BookingServiceError(
      "Add a verified phone number before completing payment.",
      409,
      "PHONE_NOT_AVAILABLE",
    );
  }

  let orderId = booking.cashfreeOrderId;
  let paymentSessionId = booking.cashfreePaymentSessionId;

  if (!orderId || !paymentSessionId) {
    const nextOrderId = orderId ?? generatePaymentReference("booking");
    const nextIdempotencyKey =
      idempotencyKey?.trim() || booking.paymentIdempotencyKey || generatePaymentReference("order");

    try {
      const order = await createCashfreeOrder({
        orderId: nextOrderId,
        amount: booking.totalAuthorized,
        currency: booking.currency,
        customer: {
          id: booking.renterId,
          name: booking.renter.fullName,
          email: booking.renter.email,
          phone: customerPhone,
        },
        note: `Rent ${booking.equipment.title} on RentMart`,
        idempotencyKey: nextIdempotencyKey,
      });

      orderId = order.order_id;
      paymentSessionId = order.payment_session_id;
    } catch (error) {
      logServiceError({
        service: "booking.service",
        action: "createBookingPaymentOrder.createCashfreeOrder",
        error,
        context: {
          bookingId: booking.id,
          cashfreeOrderId: nextOrderId,
          renterId: booking.renterId,
        },
      });
      mapCashfreeError(error);
    }
  }

  const updatedBooking = await db.booking.update({
    where: { id: booking.id },
    data: {
      paymentProvider: BOOKING_PAYMENT_PROVIDER,
      paymentIntentId: orderId,
      paymentIdempotencyKey:
        idempotencyKey?.trim() || booking.paymentIdempotencyKey || generatePaymentReference("order"),
      cashfreeOrderId: orderId,
      cashfreePaymentSessionId: paymentSessionId,
      payoutLinkedAccountId: null,
      paymentAmountInPaise: amountInPaise,
      paymentCurrency: booking.currency,
      financialStatus: "PAYMENT_PENDING",
      lastPaymentError: null,
    },
    include: {
      equipment: {
        include: {
          images: {
            orderBy: { position: "asc" },
            take: 1,
          },
        },
      },
      renter: true,
      owner: true,
    },
  });

  return {
    bookingId: updatedBooking.id,
    orderId: updatedBooking.cashfreeOrderId ?? updatedBooking.paymentIntentId ?? "",
    paymentSessionId: updatedBooking.cashfreePaymentSessionId ?? "",
    amount: updatedBooking.paymentAmountInPaise ?? amountInPaise,
    currency: updatedBooking.paymentCurrency ?? updatedBooking.currency,
    environment: getCashfreeCheckoutEnvironment(),
    renterName: updatedBooking.renter.fullName,
    renterEmail: updatedBooking.renter.email,
    renterPhone: updatedBooking.renter.phone ?? null,
    description: `Rent ${updatedBooking.equipment.title} on RentMart`,
  };
}

export async function verifyCompletedBookingPayment(
  renterId: string,
  bookingId: string,
  input: VerifyBookingPaymentInput,
) {
  const booking = await ensureBooking(bookingId);
  const cashfreeOrderId = input.cashfreeOrderId.trim();

  if (booking.renterId !== renterId) {
    throw new BookingServiceError(
      "You do not have permission to verify payment for this booking.",
      403,
      "FORBIDDEN",
    );
  }

  if (booking.cashfreeOrderId && booking.cashfreeOrderId !== cashfreeOrderId) {
    throw new BookingServiceError(
      "The payment order does not match this booking.",
      409,
      "PAYMENT_ORDER_MISMATCH",
    );
  }

  if (
    booking.isPaymentCompleted &&
    ["CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(booking.status)
  ) {
    return mapBooking(booking);
  }

  ensureBookingStatus(
    booking.status,
    ["PENDING_RENTER_PAYMENT"],
    "Only owner-approved bookings can be verified.",
    "INVALID_BOOKING_STATUS",
  );

  let order;

  try {
    order = await getCashfreeOrder(cashfreeOrderId);
  } catch (error) {
    logServiceError({
      service: "booking.service",
      action: "verifyBookingPayment.getCashfreeOrder",
      error,
      context: {
        bookingId: booking.id,
        cashfreeOrderId,
      },
    });
    mapCashfreeError(error);
  }

  if (!order || order.order_id !== cashfreeOrderId) {
    throw new BookingServiceError(
      "The payment order could not be verified.",
      400,
      "PAYMENT_ORDER_INVALID",
    );
  }

  if (roundCurrency(order.order_amount) !== roundCurrency(booking.totalAuthorized)) {
    throw new BookingServiceError(
      "The verified payment amount does not match this booking.",
      409,
      "PAYMENT_AMOUNT_MISMATCH",
    );
  }

  if (order.order_status === "PAID") {
    let paymentId = booking.cashfreePaymentId ?? booking.paymentAuthorizationId ?? order.cf_order_id;

    try {
      const payments = await getCashfreePaymentsForOrder(cashfreeOrderId);
      const successfulPayment = [...payments]
        .reverse()
        .find((payment) => payment.payment_status === "SUCCESS");

      if (successfulPayment?.cf_payment_id) {
        paymentId = successfulPayment.cf_payment_id;
      }
    } catch (error) {
      logServiceError({
        service: "booking.service",
        action: "verifyBookingPayment.getCashfreePaymentsForOrder",
        error,
        context: {
          bookingId: booking.id,
          cashfreeOrderId,
        },
      });
      mapCashfreeError(error);
    }

    return finalizeCapturedBookingPayment(booking.id, paymentId);
  }

  const updatedBooking = await db.booking.update({
    where: { id: booking.id },
    data: {
      cashfreeOrderId,
      cashfreePaymentSessionId: order.payment_session_id,
      financialStatus: "PAYMENT_PENDING",
      lastPaymentError: null,
    },
    include: {
      equipment: {
        include: {
          images: {
            orderBy: { position: "asc" },
            take: 1,
          },
        },
      },
      renter: true,
      owner: true,
    },
  });

  return mapBooking(updatedBooking);
}

async function finalizeCapturedBookingPayment(bookingId: string, paymentId: string) {
  const booking = await ensureBooking(bookingId);

  if (booking.isPaymentCompleted) {
    return mapBooking(booking);
  }

  const updatedBooking = await db.booking.update({
    where: { id: booking.id },
    data: {
      status: "CONFIRMED",
      isPaymentCompleted: true,
      paymentProvider: BOOKING_PAYMENT_PROVIDER,
      paymentIntentId: booking.cashfreeOrderId ?? booking.paymentIntentId,
      paymentAuthorizationId: paymentId,
      cashfreePaymentId: paymentId,
      payoutLinkedAccountId: null,
      financialStatus: "PAYMENT_CAPTURED",
      ownerPayoutStatus: "NONE",
      ownerPaidAt: null,
      ownerPayoutReference: null,
      depositRefundStatus: "NONE",
      depositRefundReference: null,
      paymentCapturedAt: new Date(),
      paymentFailedAt: null,
      lastPaymentError: null,
      ownerDecisionReason: null,
    },
    include: {
      equipment: {
        include: {
          images: {
            orderBy: { position: "asc" },
            take: 1,
          },
        },
      },
      renter: true,
      owner: true,
    },
  });

  await createBookingPaymentConfirmedNotification(db, {
    renterId: updatedBooking.renterId,
    equipmentId: updatedBooking.equipmentId,
    equipmentTitle: updatedBooking.equipment.title,
  });
  await createRenterPaymentConfirmedNotification(db, {
    ownerId: updatedBooking.ownerId,
    equipmentId: updatedBooking.equipmentId,
    equipmentTitle: updatedBooking.equipment.title,
    renterFullName: updatedBooking.renter.fullName,
  });
  await Promise.all([
    sendBookingEventEmailSafe({
      to: {
        email: updatedBooking.renter.email,
        name: updatedBooking.renter.fullName,
      },
      subject: `Payment confirmed for ${updatedBooking.equipment.title}`,
      title: `Your booking is confirmed`,
      message: `We received your Cashfree payment and your booking is now confirmed.`,
      equipmentTitle: updatedBooking.equipment.title,
      startDate: formatDateOnly(updatedBooking.startDate),
      endDate: formatDateOnly(updatedBooking.endDate),
      statusLabel: "Confirmed",
      ctaLabel: "View Booking",
      ctaHref: "/dashboard/bookings",
    }),
    sendBookingEventEmailSafe({
      to: {
        email: updatedBooking.owner.email,
        name: updatedBooking.owner.fullName,
      },
      subject: `${updatedBooking.renter.fullName} completed payment for ${updatedBooking.equipment.title}`,
      title: `Renter payment confirmed`,
      message: `${updatedBooking.renter.fullName} completed payment and the booking is ready for handoff.`,
      equipmentTitle: updatedBooking.equipment.title,
      startDate: formatDateOnly(updatedBooking.startDate),
      endDate: formatDateOnly(updatedBooking.endDate),
      statusLabel: "Confirmed",
      ctaLabel: "Open Rental Requests",
      ctaHref: "/dashboard/rental-requests",
    }),
  ]);

  return mapBooking(updatedBooking);
}

export async function rejectBookingRequest(
  ownerId: string,
  bookingId: string,
  input: RejectBookingInput,
) {
  const booking = await ensureBooking(bookingId);

  if (booking.ownerId !== ownerId) {
    throw new BookingServiceError(
      "You do not have permission to manage this booking.",
      403,
      "FORBIDDEN",
    );
  }

  ensureBookingStatus(
    booking.status,
    ["PENDING_OWNER_APPROVAL"],
    "Only pending requests can be rejected.",
    "INVALID_BOOKING_STATUS",
  );

  const updatedBooking = await db.booking.update({
    where: { id: booking.id },
    data: {
      status: "CANCELLED",
      paymentVoidedAt: new Date(),
      cancelledAt: new Date(),
      ownerDecisionReason: input.reason.trim(),
    },
    include: {
      equipment: {
        include: {
          images: {
            orderBy: { position: "asc" },
            take: 1,
          },
        },
      },
      renter: true,
      owner: true,
    },
  });
  await createBookingRejectedNotification(db, {
    renterId: updatedBooking.renterId,
    equipmentId: updatedBooking.equipmentId,
    equipmentTitle: updatedBooking.equipment.title,
    reason: input.reason,
  });
  await sendBookingEventEmailSafe({
    to: {
      email: updatedBooking.renter.email,
      name: updatedBooking.renter.fullName,
    },
    subject: `Booking rejected for ${updatedBooking.equipment.title}`,
    title: `Your booking request was rejected`,
    message: input.reason.trim(),
    equipmentTitle: updatedBooking.equipment.title,
    startDate: formatDateOnly(updatedBooking.startDate),
    endDate: formatDateOnly(updatedBooking.endDate),
    statusLabel: "Rejected",
    ctaLabel: "Browse Alternatives",
    ctaHref: "/equipment",
  });

  return mapBooking(updatedBooking);
}

export async function markBookingInProgress(ownerId: string, bookingId: string) {
  const booking = await ensureBooking(bookingId);

  if (booking.ownerId !== ownerId) {
    throw new BookingServiceError(
      "You do not have permission to manage this booking.",
      403,
      "FORBIDDEN",
    );
  }

  ensureBookingStatus(
    booking.status,
    ["CONFIRMED"],
    "Only confirmed bookings can be started.",
    "INVALID_BOOKING_STATUS",
  );

  const updatedBooking = await db.booking.update({
    where: { id: booking.id },
    data: {
      status: "IN_PROGRESS",
      conditionLoggedAt: new Date(),
    },
    include: {
      equipment: {
        include: {
          images: {
            orderBy: { position: "asc" },
            take: 1,
          },
        },
      },
      renter: true,
      owner: true,
    },
  });
  await createBookingStartedNotification(db, {
    renterId: updatedBooking.renterId,
    equipmentId: updatedBooking.equipmentId,
    equipmentTitle: updatedBooking.equipment.title,
  });
  await sendBookingEventEmailSafe({
    to: {
      email: updatedBooking.renter.email,
      name: updatedBooking.renter.fullName,
    },
    subject: `${updatedBooking.equipment.title} rental has started`,
    title: `Your rental is now in progress`,
    message: `The owner marked ${updatedBooking.equipment.title} as started.`,
    equipmentTitle: updatedBooking.equipment.title,
    startDate: formatDateOnly(updatedBooking.startDate),
    endDate: formatDateOnly(updatedBooking.endDate),
    statusLabel: "In progress",
    ctaLabel: "Track Rental",
    ctaHref: "/dashboard/bookings",
  });

  return mapBooking(updatedBooking);
}

export async function completeBooking(ownerId: string, bookingId: string) {
  const booking = await ensureBooking(bookingId);

  if (booking.ownerId !== ownerId) {
    throw new BookingServiceError(
      "You do not have permission to manage this booking.",
      403,
      "FORBIDDEN",
    );
  }

  if (!canOwnerCompleteBookingStatus(booking.status, booking.endDate)) {
    throw new BookingServiceError(
      "Only in-progress bookings or confirmed bookings whose rental window has ended can be completed.",
      409,
      "INVALID_BOOKING_STATUS",
    );
  }

  const now = new Date();
  const updatedBooking = await db.booking.update({
    where: { id: booking.id },
    data: {
      status: "COMPLETED",
      financialStatus: "MANUAL_SETTLEMENT_PENDING",
      ownerPayoutStatus: "PENDING",
      ownerPaidAt: null,
      ownerPayoutReference: null,
      depositRefundStatus: "PENDING",
      depositRefundInitiatedAt: now,
      depositRefundedAt: null,
      depositRefundReference: null,
      completedAt: now,
      ownerDecisionReason: null,
      disputeReason: null,
    },
    include: {
      equipment: {
        include: {
          images: {
            orderBy: { position: "asc" },
            take: 1,
          },
        },
      },
      renter: true,
      owner: true,
    },
  });
  const eventPayload = createBookingEventPayload(updatedBooking);
  await createBookingCompletedNotifications(db, eventPayload);
  await Promise.all([
    sendBookingEventEmailSafe({
      to: {
        email: updatedBooking.renter.email,
        name: updatedBooking.renter.fullName,
      },
      subject: `${updatedBooking.equipment.title} rental completed`,
      title: `Your rental is complete`,
      message: `The owner marked ${updatedBooking.equipment.title} as completed.`,
      equipmentTitle: updatedBooking.equipment.title,
      startDate: eventPayload.startDate,
      endDate: eventPayload.endDate,
      statusLabel: "Completed",
      ctaLabel: "View History",
      ctaHref: "/dashboard/bookings",
    }),
    sendBookingEventEmailSafe({
      to: {
        email: updatedBooking.owner.email,
        name: updatedBooking.owner.fullName,
      },
      subject: `${updatedBooking.equipment.title} rental completed`,
      title: `Rental completed`,
      message: `The booking with ${updatedBooking.renter.fullName} is now complete.`,
      equipmentTitle: updatedBooking.equipment.title,
      startDate: eventPayload.startDate,
      endDate: eventPayload.endDate,
      statusLabel: "Completed",
      ctaLabel: "Open Rental Requests",
      ctaHref: "/dashboard/rental-requests",
    }),
  ]);

  return mapBooking(updatedBooking);
}

export async function disputeBooking(
  ownerId: string,
  bookingId: string,
  input: DisputeBookingInput,
  files: Express.Multer.File[],
) {
  const booking = await ensureBooking(bookingId);

  if (booking.ownerId !== ownerId) {
    throw new BookingServiceError(
      "You do not have permission to manage this booking.",
      403,
      "FORBIDDEN",
    );
  }

  if (!canOwnerDisputeBookingStatus(booking.status, booking.endDate)) {
    throw new BookingServiceError(
      "Only in-progress bookings or confirmed bookings whose rental window has ended can be disputed.",
      409,
      "INVALID_BOOKING_STATUS",
    );
  }

  if (files.length > BOOKING_DISPUTE_IMAGE_LIMITS.max) {
    throw new BookingServiceError(
      `Please upload no more than ${BOOKING_DISPUTE_IMAGE_LIMITS.max} images.`,
      400,
      "DISPUTE_IMAGE_LIMIT_EXCEEDED",
    );
  }

  const uploadedImages = await uploadBookingDisputeImages(files);

  let updatedBooking;

  try {
    const now = new Date();
    updatedBooking = await db.booking.update({
      where: { id: booking.id },
      data: {
        status: "DISPUTED",
        financialStatus: "DISPUTED",
        ownerPayoutStatus: booking.isPaymentCompleted ? "BLOCKED" : booking.ownerPayoutStatus,
        depositRefundStatus: booking.isPaymentCompleted ? "BLOCKED" : booking.depositRefundStatus,
        paymentDisputedAt: now,
        disputedAt: now,
        disputeReason: input.reason.trim(),
        disputeImages: {
          create: uploadedImages.map((image) => ({
            url: image.url,
            publicId: image.publicId,
            position: image.position,
          })),
        },
      },
      include: {
        equipment: {
          include: {
            images: {
              orderBy: { position: "asc" },
              take: 1,
            },
          },
        },
        renter: true,
        owner: true,
        disputeImages: {
          orderBy: { position: "asc" },
        },
      },
    });
  } catch (error) {
    logServiceError({
      service: "booking.service",
      action: "disputeBooking.dbUpdate",
      error,
      context: {
        bookingId: booking.id,
        ownerId,
        uploadedImageCount: uploadedImages.length,
      },
    });
    await cleanupUploadedImages(uploadedImages.map((image) => image.publicId));
    throw error;
  }
  const eventPayload = createBookingEventPayload(updatedBooking);
  await createBookingDisputedNotifications(db, {
    ...eventPayload,
    reason: input.reason,
  });
  await Promise.all([
    sendBookingEventEmailSafe({
      to: {
        email: updatedBooking.renter.email,
        name: updatedBooking.renter.fullName,
      },
      subject: `Dispute opened for ${updatedBooking.equipment.title}`,
      title: `A dispute was opened`,
      message: input.reason.trim(),
      equipmentTitle: updatedBooking.equipment.title,
      startDate: eventPayload.startDate,
      endDate: eventPayload.endDate,
      statusLabel: "Disputed",
      ctaLabel: "Review Booking",
      ctaHref: "/dashboard/bookings",
    }),
    sendBookingEventEmailSafe({
      to: {
        email: updatedBooking.owner.email,
        name: updatedBooking.owner.fullName,
      },
      subject: `Dispute opened for ${updatedBooking.equipment.title}`,
      title: `A dispute was opened`,
      message: input.reason.trim(),
      equipmentTitle: updatedBooking.equipment.title,
      startDate: eventPayload.startDate,
      endDate: eventPayload.endDate,
      statusLabel: "Disputed",
      ctaLabel: "Open Rental Requests",
      ctaHref: "/dashboard/rental-requests",
    }),
  ]);

  return mapBooking(updatedBooking);
}

export async function markOwnerPayoutPaid(
  _adminId: string,
  bookingId: string,
  reference?: string,
) {
  const booking = await ensureBooking(bookingId);

  if (!booking.isPaymentCompleted) {
    throw new BookingServiceError(
      "Only paid bookings can be marked for owner payout.",
      409,
      "PAYMENT_NOT_CAPTURED",
    );
  }

  if (!["COMPLETED", "DISPUTED"].includes(booking.status)) {
    throw new BookingServiceError(
      "Owner payout can only be recorded after completion or dispute review.",
      409,
      "INVALID_BOOKING_STATUS",
    );
  }

  if (booking.ownerPayoutStatus === "PAID") {
    return mapBooking(booking);
  }

  const now = new Date();
  const nextOwnerPayoutStatus = "PAID" satisfies OwnerPayoutStatus;
  const updatedBooking = await db.booking.update({
    where: { id: booking.id },
    data: {
      ownerPayoutStatus: nextOwnerPayoutStatus,
      ownerPaidAt: now,
      ownerPayoutReference: reference?.trim() || null,
      financialStatus: deriveFinancialStatusFromManualSettlement({
        ownerPayoutStatus: nextOwnerPayoutStatus,
        depositRefundStatus: booking.depositRefundStatus,
        bookingStatus: booking.status,
        isPaymentCompleted: booking.isPaymentCompleted,
      }),
    },
    include: {
      equipment: {
        include: {
          images: {
            orderBy: { position: "asc" },
            take: 1,
          },
        },
      },
      renter: true,
      owner: true,
    },
  });

  return mapBooking(updatedBooking);
}

export async function markDepositRefunded(
  _adminId: string,
  bookingId: string,
  reference?: string,
) {
  const booking = await ensureBooking(bookingId);

  if (!booking.isPaymentCompleted) {
    throw new BookingServiceError(
      "Only paid bookings can be marked as refunded.",
      409,
      "PAYMENT_NOT_CAPTURED",
    );
  }

  if (!["COMPLETED", "DISPUTED"].includes(booking.status)) {
    throw new BookingServiceError(
      "Deposit refunds can only be recorded after completion or dispute review.",
      409,
      "INVALID_BOOKING_STATUS",
    );
  }

  if (booking.depositRefundStatus === "REFUNDED") {
    return mapBooking(booking);
  }

  const now = new Date();
  const nextDepositRefundStatus = "REFUNDED" satisfies DepositRefundStatus;
  const updatedBooking = await db.booking.update({
    where: { id: booking.id },
    data: {
      depositRefundStatus: nextDepositRefundStatus,
      depositRefundInitiatedAt: booking.depositRefundInitiatedAt ?? now,
      depositRefundedAt: now,
      depositRefundReference: reference?.trim() || null,
      financialStatus: deriveFinancialStatusFromManualSettlement({
        ownerPayoutStatus: booking.ownerPayoutStatus,
        depositRefundStatus: nextDepositRefundStatus,
        bookingStatus: booking.status,
        isPaymentCompleted: booking.isPaymentCompleted,
      }),
    },
    include: {
      equipment: {
        include: {
          images: {
            orderBy: { position: "asc" },
            take: 1,
          },
        },
      },
      renter: true,
      owner: true,
    },
  });

  return mapBooking(updatedBooking);
}

async function storeIncomingWebhookEvent(eventId: string, eventType: string, entityId: string | null, payload: unknown) {
  try {
    return await db.cashfreeWebhookEvent.create({
      data: {
        eventId,
        eventType,
        entityId,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return null;
    }

    logServiceError({
      service: "booking.service",
      action: "storeIncomingWebhookEvent",
      error,
      context: {
        eventId,
        eventType,
        entityId,
      },
    });
    throw error;
  }
}

function buildCashfreeWebhookEventId(input: {
  eventType: string;
  entityId: string | null;
  createdAt?: string;
  idempotencyKey?: string | null;
}) {
  if (input.idempotencyKey) {
    return input.idempotencyKey;
  }

  if (input.entityId) {
    return `${input.eventType}:${input.entityId}:${input.createdAt ?? "unknown"}`;
  }

  return `${input.eventType}:${input.createdAt ?? Date.now()}`;
}

function getWebhookSignatureHeader(signature: string | string[] | undefined) {
  if (typeof signature !== "string" || signature.trim().length === 0) {
    throw new BookingServiceError(
      "Missing Cashfree webhook signature.",
      400,
      "WEBHOOK_SIGNATURE_MISSING",
    );
  }

  return signature.trim();
}

function getWebhookTimestampHeader(timestamp: string | string[] | undefined) {
  if (typeof timestamp !== "string" || timestamp.trim().length === 0) {
    throw new BookingServiceError(
      "Missing Cashfree webhook timestamp.",
      400,
      "WEBHOOK_TIMESTAMP_MISSING",
    );
  }

  return timestamp.trim();
}

export async function processCashfreeWebhook(
  payload: Buffer,
  signatureHeader: string | string[] | undefined,
  timestampHeader: string | string[] | undefined,
  idempotencyHeader?: string | string[] | undefined,
) {
  const signature = getWebhookSignatureHeader(signatureHeader);
  const timestamp = getWebhookTimestampHeader(timestampHeader);
  const idempotencyKey =
    typeof idempotencyHeader === "string" && idempotencyHeader.trim().length > 0
      ? idempotencyHeader.trim()
      : null;

  if (!verifyCashfreeWebhookSignature(payload, signature, timestamp)) {
    throw new BookingServiceError(
      "Invalid Cashfree webhook signature.",
      400,
      "WEBHOOK_SIGNATURE_INVALID",
    );
  }

  const body = JSON.parse(payload.toString("utf8")) as {
    type?: string;
    event_time?: string;
    data?: {
      order?: Record<string, unknown>;
      payment?: Record<string, unknown>;
      error_details?: Record<string, unknown>;
    };
  };

  const eventType = body.type?.trim();

  if (!eventType) {
    throw new BookingServiceError("Webhook event type is missing.", 400, "WEBHOOK_EVENT_INVALID");
  }

  logger.info("[cashfree:webhook] received", {
    service: "booking.service",
    action: "processCashfreeWebhook.received",
    eventType,
  });

  const paymentEntity = body.data?.payment ?? null;
  const orderEntity = body.data?.order ?? null;
  const entityId =
    typeof paymentEntity?.cf_payment_id === "string" ? paymentEntity.cf_payment_id.trim() : null;
  const eventId = buildCashfreeWebhookEventId({
    eventType,
    entityId,
    createdAt: body.event_time,
    idempotencyKey,
  });

  const storedEvent = await storeIncomingWebhookEvent(
    eventId,
    eventType,
    entityId,
    body,
  );

  if (!storedEvent) {
    logger.warn("[cashfree:webhook] duplicate ignored", {
      service: "booking.service",
      action: "processCashfreeWebhook.duplicate",
      eventType,
      entityId: entityId ?? "none",
      eventId,
    });
    return { duplicated: true };
  }

  if (eventType === "PAYMENT_SUCCESS_WEBHOOK") {
    const orderId =
      typeof orderEntity?.order_id === "string" ? orderEntity.order_id.trim() : null;
    const paymentId =
      typeof paymentEntity?.cf_payment_id === "string" ? paymentEntity.cf_payment_id.trim() : null;
    const amount =
      typeof paymentEntity?.payment_amount === "number"
        ? paymentEntity.payment_amount
        : null;
    const currency =
      typeof paymentEntity?.payment_currency === "string"
        ? paymentEntity.payment_currency.trim()
        : null;

    if (!orderId || !paymentId || amount == null || !currency) {
      logger.error("[cashfree:webhook] success payload invalid", {
        service: "booking.service",
        action: "processCashfreeWebhook.invalidSuccessPayload",
        entityId: entityId ?? "none",
      });
      throw new BookingServiceError(
        "The payment success payload is incomplete.",
        400,
        "PAYMENT_WEBHOOK_INVALID",
      );
    }

    const booking = await db.booking.findFirst({
      where: { cashfreeOrderId: orderId },
      include: {
        equipment: {
          include: {
            images: {
              orderBy: { position: "asc" },
              take: 1,
            },
          },
        },
        renter: true,
        owner: true,
      },
    });

    if (!booking) {
      logger.error("[cashfree:webhook] booking not found for captured payment", {
        service: "booking.service",
        action: "processCashfreeWebhook.bookingNotFound",
        orderId,
        paymentId,
      });
      throw new BookingServiceError("Booking not found for captured payment.", 404, "BOOKING_NOT_FOUND");
    }

    logger.info("[cashfree:webhook] success matched booking", {
      service: "booking.service",
      action: "processCashfreeWebhook.bookingMatched",
      bookingId: booking.id,
      orderId,
      paymentId,
    });

    if (
      booking.paymentAmountInPaise !== toPaise(amount) ||
      (booking.paymentCurrency ?? booking.currency) !== currency
    ) {
      logger.error("[cashfree:webhook] amount mismatch", {
        service: "booking.service",
        action: "processCashfreeWebhook.amountMismatch",
        bookingId: booking.id,
        expectedAmountInPaise: booking.paymentAmountInPaise,
        expectedCurrency: booking.paymentCurrency ?? booking.currency,
        receivedAmount: amount,
        receivedCurrency: currency,
      });
      throw new BookingServiceError(
        "Captured payment does not match the expected booking amount.",
        409,
        "PAYMENT_AMOUNT_MISMATCH",
      );
    }

    await finalizeCapturedBookingPayment(booking.id, paymentId);
    logger.info("[cashfree:webhook] success processed", {
      service: "booking.service",
      action: "processCashfreeWebhook.successProcessed",
      bookingId: booking.id,
      paymentId,
      status: "CONFIRMED",
    });
  }

  if (eventType === "PAYMENT_FAILED_WEBHOOK") {
    const orderId =
      typeof orderEntity?.order_id === "string" ? orderEntity.order_id.trim() : null;
    const errorEntity = body.data?.error_details ?? null;
    const errorDescription =
      typeof errorEntity?.error_description === "string"
        ? errorEntity.error_description.trim()
        : "Payment failed in Cashfree.";

    if (orderId) {
      await db.booking.updateMany({
        where: {
          cashfreeOrderId: orderId,
          status: "PENDING_RENTER_PAYMENT",
        },
        data: {
          financialStatus: "PAYMENT_FAILED",
          paymentFailedAt: new Date(),
          lastPaymentError: errorDescription,
        },
      });
      logger.warn("[cashfree:webhook] payment failed recorded", {
        service: "booking.service",
        action: "processCashfreeWebhook.paymentFailed",
        orderId,
        reason: errorDescription,
      });
    }
  }

  await db.cashfreeWebhookEvent.update({
    where: { eventId: storedEvent.eventId },
    data: {
      processedAt: new Date(),
    },
  });

  return { duplicated: false };
}
