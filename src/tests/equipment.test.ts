/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test";
import { validateImageFiles } from "../lib/equipment-image-validation";
import {
  createEquipmentSchema,
  geocodeEquipmentSchema,
  rejectEquipmentSchema,
} from "../validators/equipment.schema";

const validEquipmentPayload = {
  title: "Excavator 320",
  categoryId: "cat_01",
  price: 25000,
  deliveryRadius: 20,
  address: "12 Industrial Road, Pune",
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
});
