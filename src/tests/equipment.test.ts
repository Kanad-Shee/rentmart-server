/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test";
import { validateImageFiles } from "../lib/equipment-image-validation.js";
import {
  adminEquipmentReviewSummaryQuerySchema,
  createEquipmentReviewSchema,
  createEquipmentSchema,
  generateListingDescriptionSchema,
  geocodeEquipmentSchema,
  rejectEquipmentSchema,
  updateReviewSummaryVisibilitySchema,
  updateEquipmentReviewSchema,
} from "../validators/equipment.schema.js";

const validEquipmentPayload = {
  title: "Excavator 320",
  description: "Reliable site-ready excavator with a clean service history and bucket included.",
  categoryId: "cat_01",
  price: 25000,
  deliveryRadius: 20,
  address: "12 Industrial Road, Pune",
};

const validReviewPayload = {
  rating: 5,
  title: "Excellent machine",
  description: "The excavator arrived on time, worked smoothly, and handled the full job site load without issues.",
};

function createMockFile(size: number, mimetype = "image/jpeg"): Express.Multer.File {
  return {
    fieldname: "images",
    originalname: "image.jpg",
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

describe("equipment schemas", () => {
  it("accepts a valid equipment payload", () => {
    const result = createEquipmentSchema.safeParse(validEquipmentPayload);

    expect(result.success).toBe(true);
  });

  it("treats a blank equipment description as optional", () => {
    const result = createEquipmentSchema.safeParse({
      ...validEquipmentPayload,
      description: "   ",
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.description).toBeUndefined();
    }
  });

  it("accepts a valid geocode payload", () => {
    const result = geocodeEquipmentSchema.safeParse({
      address: "12 Industrial Road, Pune",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a valid rejection payload", () => {
    const result = rejectEquipmentSchema.safeParse({
      reason: "Images do not match the submitted machine.",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a valid equipment review payload", () => {
    const result = createEquipmentReviewSchema.safeParse(validReviewPayload);

    expect(result.success).toBe(true);
  });

  it("accepts a valid listing description generation payload", () => {
    const result = generateListingDescriptionSchema.safeParse({
      title: "Excavator 320",
      description: "Strong machine for earthmoving and trench work.",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a valid admin review summary query payload", () => {
    const result = adminEquipmentReviewSummaryQuerySchema.safeParse({
      page: 2,
      pageSize: 20,
      search: "excavator",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a valid review summary visibility payload", () => {
    const result = updateReviewSummaryVisibilitySchema.safeParse({
      visible: false,
    });

    expect(result.success).toBe(true);
  });

  it("accepts a valid review update payload with retained photos", () => {
    const result = updateEquipmentReviewSchema.safeParse({
      ...validReviewPayload,
      retainedPhotoIds: ["photo_1", "photo_2"],
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.retainedPhotoIds).toEqual(["photo_1", "photo_2"]);
    }
  });

  it("rejects ratings outside the 1 to 5 range", () => {
    expect(
      createEquipmentReviewSchema.safeParse({
        ...validReviewPayload,
        rating: 0,
      }).success
    ).toBe(false);

    expect(
      createEquipmentReviewSchema.safeParse({
        ...validReviewPayload,
        rating: 6,
      }).success
    ).toBe(false);
  });

  it("rejects review descriptions longer than 2000 characters", () => {
    const result = createEquipmentReviewSchema.safeParse({
      ...validReviewPayload,
      description: "a".repeat(2001),
    });

    expect(result.success).toBe(false);
  });

  it("rejects equipment descriptions longer than 2000 characters", () => {
    const result = createEquipmentSchema.safeParse({
      ...validEquipmentPayload,
      description: "a".repeat(2001),
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid equipment image counts and size rules", () => {
    expect(
      validateImageFiles([createMockFile(10), createMockFile(10)], {
        minFiles: 3,
        maxFiles: 5,
        maxBytes: 100 * 1024,
      }).ok
    ).toBe(false);
    expect(
      validateImageFiles(
        [createMockFile(10), createMockFile(10), createMockFile(10), createMockFile(10), createMockFile(10), createMockFile(10)],
        {
          minFiles: 3,
          maxFiles: 5,
          maxBytes: 100 * 1024,
        }
      ).ok
    ).toBe(false);
    expect(
      validateImageFiles([createMockFile(101 * 1024), createMockFile(10), createMockFile(10)], {
        minFiles: 3,
        maxFiles: 5,
        maxBytes: 100 * 1024,
      }).ok
    ).toBe(false);
    expect(
      validateImageFiles([createMockFile(10, "application/pdf"), createMockFile(10), createMockFile(10)], {
        minFiles: 3,
        maxFiles: 5,
        maxBytes: 100 * 1024,
      }).ok
    ).toBe(false);
  });

  it("rejects invalid review image counts and size rules", () => {
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
        }
      ).ok
    ).toBe(false);

    expect(
      validateImageFiles([createMockFile(101 * 1024)], {
        minFiles: 0,
        maxFiles: 5,
        maxBytes: 100 * 1024,
      }).ok
    ).toBe(false);
  });
});
