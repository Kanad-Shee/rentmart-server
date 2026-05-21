import type { BookingStatus } from "../generated/prisma/client";

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function createLocalMidnight(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid booking date provided.");
  }

  return date;
}

export function hasBookingWindowEnded(endDate: Date, now = new Date()) {
  const end = createLocalMidnight(formatDateOnly(endDate));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return today > end;
}

export function canOwnerCompleteBookingStatus(
  status: BookingStatus,
  endDate: Date,
  now = new Date(),
) {
  return status === "IN_PROGRESS" || (status === "CONFIRMED" && hasBookingWindowEnded(endDate, now));
}

export function canOwnerDisputeBookingStatus(
  status: BookingStatus,
  endDate: Date,
  now = new Date(),
) {
  return status === "IN_PROGRESS" || (status === "CONFIRMED" && hasBookingWindowEnded(endDate, now));
}
