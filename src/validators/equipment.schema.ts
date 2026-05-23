import { z } from "zod";
import { paginationQuerySchema } from "./pagination.schema.js";

export const geocodeEquipmentSchema = z.object({
  address: z
    .string({ message: "Address is required." })
    .trim()
    .min(5, "Enter a valid address.")
    .max(200, "Address is too long."),
});

export const addressSuggestionsSchema = z.object({
  input: z
    .string({ message: "Address input is required." })
    .trim()
    .min(2, "Enter at least 2 characters.")
    .max(200, "Address input is too long."),
});

export const placeIdSchema = z.object({
  placeId: z
    .string({ message: "Place id is required." })
    .trim()
    .min(1, "Place id is required."),
});

const equipmentDescriptionSchema = z
  .union([z.string(), z.undefined()])
  .transform((value) => {
    const normalizedValue = value?.trim() ?? "";
    return normalizedValue.length > 0 ? normalizedValue : undefined;
  })
  .refine(
    (value) => value === undefined || value.length <= 2000,
    "Description must be 2000 characters or less.",
  );

export const createEquipmentSchema = z.object({
  title: z
    .string({ message: "Title is required." })
    .trim()
    .min(2, "Enter a valid title.")
    .max(100, "Title is too long."),
  categoryId: z
    .string({ message: "Category is required." })
    .trim()
    .min(1, "Category is required."),
  price: z.coerce.number({ message: "Price is required." }).positive("Price must be greater than zero."),
  deliveryRadius: z
    .coerce.number({ message: "Delivery radius is required." })
    .int("Delivery radius must be a whole number.")
    .positive("Delivery radius must be greater than zero."),
  address: z
    .string({ message: "Address is required." })
    .trim()
    .min(5, "Enter a valid address.")
    .max(200, "Address is too long."),
  description: equipmentDescriptionSchema,
});

export const createDraftEquipmentSchema = createEquipmentSchema;

export const updateOwnerEquipmentSchema = createEquipmentSchema.extend({
  retainedImageIds: z
    .union([
      z.string(),
      z.array(z.string()),
      z.undefined(),
    ])
    .transform((value) => {
      if (value === undefined) {
        return [] as string[];
      }

      return (Array.isArray(value) ? value : [value])
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }),
});

export const rejectEquipmentSchema = z.object({
  reason: z
    .string({ message: "Rejection reason is required." })
    .trim()
    .min(5, "Enter a valid rejection reason.")
    .max(200, "Rejection reason is too long."),
});

export const equipmentIdSchema = z.object({
  id: z.string({ message: "Equipment id is required." }).trim().min(1, "Equipment id is required."),
});

export const ownerEquipmentQuerySchema = paginationQuerySchema.extend({
  tab: z.enum(["live", "pending", "draft"]).optional(),
});

export const pendingEquipmentQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100, "Search is too long.").optional(),
});

const reviewTitleSchema = z
  .string({ message: "Review title is required." })
  .trim()
  .min(2, "Enter a review title.")
  .max(120, "Review title is too long.");

const reviewDescriptionSchema = z
  .string({ message: "Review description is required." })
  .trim()
  .min(10, "Enter at least 10 characters.")
  .max(2000, "Review description must be 2000 characters or less.");

export const createEquipmentReviewSchema = z.object({
  rating: z.coerce
    .number({ message: "Rating is required." })
    .int("Rating must be a whole number.")
    .min(1, "Rating must be at least 1.")
    .max(5, "Rating cannot be more than 5."),
  title: reviewTitleSchema,
  description: reviewDescriptionSchema,
});

export const updateEquipmentReviewSchema = createEquipmentReviewSchema.extend({
  retainedPhotoIds: z
    .union([z.string(), z.array(z.string()), z.undefined()])
    .transform((value) => {
      if (value === undefined) {
        return [] as string[];
      }

      return (Array.isArray(value) ? value : [value])
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }),
});

export type GeocodeEquipmentInput = z.infer<typeof geocodeEquipmentSchema>;
export type AddressSuggestionsInput = z.infer<typeof addressSuggestionsSchema>;
export type PlaceIdInput = z.infer<typeof placeIdSchema>;
export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;
export type CreateDraftEquipmentInput = z.infer<typeof createDraftEquipmentSchema>;
export type UpdateOwnerEquipmentInput = z.infer<typeof updateOwnerEquipmentSchema>;
export type RejectEquipmentInput = z.infer<typeof rejectEquipmentSchema>;
export type OwnerEquipmentQueryInput = z.infer<typeof ownerEquipmentQuerySchema>;
export type PendingEquipmentQueryInput = z.infer<
  typeof pendingEquipmentQuerySchema
>;
export type CreateEquipmentReviewInput = z.infer<typeof createEquipmentReviewSchema>;
export type UpdateEquipmentReviewInput = z.infer<typeof updateEquipmentReviewSchema>;
