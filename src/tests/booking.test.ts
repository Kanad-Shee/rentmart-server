/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test";
import { validateImageFiles } from "../lib/equipment-image-validation";
import {
  canOwnerCompleteBookingStatus,
  canOwnerDisputeBookingStatus,
  hasBookingWindowEnded,
} from "../lib/booking-state";
import { disputeBookingSchema } from "../validators/booking.schema";

function createMockFile(size: number, mimetype = "image/jpeg"): Express.Multer.File {
  return {
    fieldname: "photos",
    originalname: "evidence.jpg",
    encoding: "7bit",
    mimetype,
    size,
    destination: "",
    filename: "",
    path: "",
    buffer: Buffer.alloc(size),
    stream: null as never,
  };
}

describe("booking helpers", () => {
  it("detects when a booking window has ended", () => {
    const ended = hasBookingWindowEnded(
      new Date("2026-05-17T00:00:00.000Z"),
      new Date("2026-05-18T10:00:00.000Z"),
    );

    const active = hasBookingWindowEnded(
      new Date("2026-05-17T00:00:00.000Z"),
      new Date("2026-05-17T10:00:00.000Z"),
    );

    expect(ended).toBe(true);
    expect(active).toBe(false);
  });

  it("allows completion from in-progress or ended confirmed bookings only", () => {
    const endedConfirmed = canOwnerCompleteBookingStatus(
      "CONFIRMED",
      new Date("2026-05-17T00:00:00.000Z"),
      new Date("2026-05-18T10:00:00.000Z"),
    );
    const activeConfirmed = canOwnerCompleteBookingStatus(
      "CONFIRMED",
      new Date("2026-05-17T00:00:00.000Z"),
      new Date("2026-05-17T10:00:00.000Z"),
    );
    const inProgress = canOwnerCompleteBookingStatus(
      "IN_PROGRESS",
      new Date("2026-05-17T00:00:00.000Z"),
      new Date("2026-05-17T10:00:00.000Z"),
    );
    const cancelled = canOwnerCompleteBookingStatus(
      "CANCELLED",
      new Date("2026-05-17T00:00:00.000Z"),
      new Date("2026-05-18T10:00:00.000Z"),
    );

    expect(endedConfirmed).toBe(true);
    expect(activeConfirmed).toBe(false);
    expect(inProgress).toBe(true);
    expect(cancelled).toBe(false);
  });

  it("allows disputes from in-progress or ended confirmed bookings only", () => {
    const endedConfirmed = canOwnerDisputeBookingStatus(
      "CONFIRMED",
      new Date("2026-05-17T00:00:00.000Z"),
      new Date("2026-05-18T10:00:00.000Z"),
    );
    const activeConfirmed = canOwnerDisputeBookingStatus(
      "CONFIRMED",
      new Date("2026-05-17T00:00:00.000Z"),
      new Date("2026-05-17T10:00:00.000Z"),
    );
    const inProgress = canOwnerDisputeBookingStatus(
      "IN_PROGRESS",
      new Date("2026-05-17T00:00:00.000Z"),
      new Date("2026-05-17T10:00:00.000Z"),
    );
    const completed = canOwnerDisputeBookingStatus(
      "COMPLETED",
      new Date("2026-05-17T00:00:00.000Z"),
      new Date("2026-05-18T10:00:00.000Z"),
    );

    expect(endedConfirmed).toBe(true);
    expect(activeConfirmed).toBe(false);
    expect(inProgress).toBe(true);
    expect(completed).toBe(false);
  });
});

describe("booking dispute validation", () => {
  it("accepts a valid dispute payload", () => {
    const result = disputeBookingSchema.safeParse({
      reason: "The returned machine has visible casing damage near the handle.",
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid dispute image counts and file rules", () => {
    expect(
      validateImageFiles(
        [
          createMockFile(10),
          createMockFile(10),
          createMockFile(10),
          createMockFile(10),
          createMockFile(10),
          createMockFile(10),
        ],
        {
          minFiles: 0,
          maxFiles: 5,
          maxBytes: 100 * 1024,
        },
      ).ok,
    ).toBe(false);

    expect(
      validateImageFiles([createMockFile(101 * 1024)], {
        minFiles: 0,
        maxFiles: 5,
        maxBytes: 100 * 1024,
      }).ok,
    ).toBe(false);

    expect(
      validateImageFiles([createMockFile(10, "application/pdf")], {
        minFiles: 0,
        maxFiles: 5,
        maxBytes: 100 * 1024,
      }).ok,
    ).toBe(false);
  });
});
