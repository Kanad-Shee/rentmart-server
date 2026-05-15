/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test";
import { validateImageFiles } from "../lib/equipment-image-validation";
import { createCategorySchema } from "../validators/category.schema";

function createMockFile(size: number, mimetype = "image/jpeg"): Express.Multer.File {
  return {
    fieldname: "image",
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

describe("category schemas", () => {
  it("accepts a valid category payload", () => {
    const result = createCategorySchema.safeParse({
      title: "Excavator",
      description: "Heavy digging equipment for excavation and earthmoving work.",
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid category image uploads", () => {
    expect(
      validateImageFiles([], {
        minFiles: 1,
        maxFiles: 1,
        maxBytes: 100 * 1024,
      }).ok
    ).toBe(false);

    expect(
      validateImageFiles([createMockFile(101 * 1024)], {
        minFiles: 1,
        maxFiles: 1,
        maxBytes: 100 * 1024,
      }).ok
    ).toBe(false);
  });
});
