import type { Request, Response } from "express";
import { logger } from "../lib/logger.js";
import {
  approveBookingRequest,
  BookingServiceError,
  completeBooking,
  createBookingPaymentOrder,
  createBookingRequest,
  disputeBooking,
  getAdminBookings,
  getOwnerBookings,
  getRenterBookings,
  markDepositRefunded,
  markBookingInProgress,
  markOwnerPayoutPaid,
  rejectBookingRequest,
  verifyCompletedBookingPayment,
} from "../services/booking.service.js";
import type {
  BookingParams,
  CreateBookingInput,
  DisputeBookingInput,
  ManualSettlementInput,
  RejectBookingInput,
  VerifyBookingPaymentInput,
} from "../validators/booking.schema.js";

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

function handleBookingError(res: Response, error: unknown) {
  if (error instanceof BookingServiceError) {
    return sendError(res, error.statusCode, error.message, { code: error.code });
  }

  logger.error("Booking controller error", {
    service: "booking.controller",
    action: "handleBookingError",
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return sendError(res, 500, "Something went wrong.");
}

function getAuthenticatedUserId(req: Request) {
  return req.user?.userId ?? null;
}

function getIdempotencyKey(req: Request) {
  const header = req.headers["x-idempotency-key"];
  return typeof header === "string" ? header.trim() : undefined;
}

function getBookingId(req: Request) {
  const params = req.params as BookingParams;
  return params.bookingId?.trim() || null;
}

export async function createBookingController(req: Request, res: Response) {
  try {
    const renterId = getAuthenticatedUserId(req);

    if (!renterId) {
      return sendError(res, 401, "Unauthorized.");
    }

    const input = req.body as CreateBookingInput;
    const booking = await createBookingRequest(
      renterId,
      input,
      getIdempotencyKey(req),
    );

    return sendSuccess(res, 201, "Booking request created successfully.", booking);
  } catch (error) {
    return handleBookingError(res, error);
  }
}

export async function getMyBookingsController(req: Request, res: Response) {
  try {
    const renterId = getAuthenticatedUserId(req);

    if (!renterId) {
      return sendError(res, 401, "Unauthorized.");
    }

    const bookings = await getRenterBookings(renterId);
    return sendSuccess(res, 200, "Bookings fetched successfully.", bookings);
  } catch (error) {
    return handleBookingError(res, error);
  }
}

export async function getOwnerBookingsController(req: Request, res: Response) {
  try {
    const ownerId = getAuthenticatedUserId(req);

    if (!ownerId) {
      return sendError(res, 401, "Unauthorized.");
    }

    const bookings = await getOwnerBookings(ownerId);
    return sendSuccess(res, 200, "Owner bookings fetched successfully.", bookings);
  } catch (error) {
    return handleBookingError(res, error);
  }
}

export async function getAdminBookingsController(req: Request, res: Response) {
  try {
    const adminId = getAuthenticatedUserId(req);

    if (!adminId) {
      return sendError(res, 401, "Unauthorized.");
    }

    const bookings = await getAdminBookings(adminId);
    return sendSuccess(res, 200, "Admin bookings fetched successfully.", bookings);
  } catch (error) {
    return handleBookingError(res, error);
  }
}

export async function approveBookingController(req: Request, res: Response) {
  try {
    const ownerId = getAuthenticatedUserId(req);
    const bookingId = getBookingId(req);

    if (!ownerId) {
      return sendError(res, 401, "Unauthorized.");
    }

    if (!bookingId) {
      return sendError(res, 400, "Booking id is required.");
    }

    const booking = await approveBookingRequest(ownerId, bookingId);

    return sendSuccess(res, 200, "Booking approved successfully.", booking);
  } catch (error) {
    return handleBookingError(res, error);
  }
}

export async function createBookingPaymentOrderController(req: Request, res: Response) {
  try {
    const renterId = getAuthenticatedUserId(req);
    const bookingId = getBookingId(req);

    if (!renterId) {
      return sendError(res, 401, "Unauthorized.");
    }

    if (!bookingId) {
      return sendError(res, 400, "Booking id is required.");
    }

    const paymentOrder = await createBookingPaymentOrder(
      renterId,
      bookingId,
      getIdempotencyKey(req),
    );

    return sendSuccess(res, 200, "Booking payment order created successfully.", paymentOrder);
  } catch (error) {
    return handleBookingError(res, error);
  }
}

export async function verifyBookingPaymentController(req: Request, res: Response) {
  try {
    const renterId = getAuthenticatedUserId(req);
    const bookingId = getBookingId(req);

    if (!renterId) {
      return sendError(res, 401, "Unauthorized.");
    }

    if (!bookingId) {
      return sendError(res, 400, "Booking id is required.");
    }

    const input = req.body as VerifyBookingPaymentInput;
    const booking = await verifyCompletedBookingPayment(renterId, bookingId, input);

    return sendSuccess(
      res,
      200,
      "Payment verification received. Final confirmation will complete from Cashfree webhook processing.",
      booking,
    );
  } catch (error) {
    return handleBookingError(res, error);
  }
}

export async function rejectBookingController(req: Request, res: Response) {
  try {
    const ownerId = getAuthenticatedUserId(req);
    const bookingId = getBookingId(req);

    if (!ownerId) {
      return sendError(res, 401, "Unauthorized.");
    }

    if (!bookingId) {
      return sendError(res, 400, "Booking id is required.");
    }

    const input = req.body as RejectBookingInput;
    const booking = await rejectBookingRequest(ownerId, bookingId, input);

    return sendSuccess(res, 200, "Booking rejected successfully.", booking);
  } catch (error) {
    return handleBookingError(res, error);
  }
}

export async function startBookingController(req: Request, res: Response) {
  try {
    const ownerId = getAuthenticatedUserId(req);
    const bookingId = getBookingId(req);

    if (!ownerId) {
      return sendError(res, 401, "Unauthorized.");
    }

    if (!bookingId) {
      return sendError(res, 400, "Booking id is required.");
    }

    const booking = await markBookingInProgress(ownerId, bookingId);
    return sendSuccess(res, 200, "Booking marked in progress successfully.", booking);
  } catch (error) {
    return handleBookingError(res, error);
  }
}

export async function completeBookingController(req: Request, res: Response) {
  try {
    const ownerId = getAuthenticatedUserId(req);
    const bookingId = getBookingId(req);

    if (!ownerId) {
      return sendError(res, 401, "Unauthorized.");
    }

    if (!bookingId) {
      return sendError(res, 400, "Booking id is required.");
    }

    const booking = await completeBooking(ownerId, bookingId);
    return sendSuccess(res, 200, "Booking completed successfully.", booking);
  } catch (error) {
    return handleBookingError(res, error);
  }
}

export async function disputeBookingController(req: Request, res: Response) {
  try {
    const ownerId = getAuthenticatedUserId(req);
    const bookingId = getBookingId(req);

    if (!ownerId) {
      return sendError(res, 401, "Unauthorized.");
    }

    if (!bookingId) {
      return sendError(res, 400, "Booking id is required.");
    }

    const input = req.body as DisputeBookingInput;
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const booking = await disputeBooking(ownerId, bookingId, input, files);
    return sendSuccess(res, 200, "Booking dispute opened successfully.", booking);
  } catch (error) {
    return handleBookingError(res, error);
  }
}

export async function markOwnerPayoutPaidController(req: Request, res: Response) {
  try {
    const adminId = getAuthenticatedUserId(req);
    const bookingId = getBookingId(req);

    if (!adminId) {
      return sendError(res, 401, "Unauthorized.");
    }

    if (!bookingId) {
      return sendError(res, 400, "Booking id is required.");
    }

    const input = req.body as ManualSettlementInput;
    const booking = await markOwnerPayoutPaid(adminId, bookingId, input.reference);
    return sendSuccess(res, 200, "Owner payout marked as paid.", booking);
  } catch (error) {
    return handleBookingError(res, error);
  }
}

export async function markDepositRefundedController(req: Request, res: Response) {
  try {
    const adminId = getAuthenticatedUserId(req);
    const bookingId = getBookingId(req);

    if (!adminId) {
      return sendError(res, 401, "Unauthorized.");
    }

    if (!bookingId) {
      return sendError(res, 400, "Booking id is required.");
    }

    const input = req.body as ManualSettlementInput;
    const booking = await markDepositRefunded(adminId, bookingId, input.reference);
    return sendSuccess(res, 200, "Deposit refund marked as completed.", booking);
  } catch (error) {
    return handleBookingError(res, error);
  }
}
