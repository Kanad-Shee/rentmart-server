import { z } from "zod";

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

export type GeocodeEquipmentInput = z.infer<typeof geocodeEquipmentSchema>;
export type AddressSuggestionsInput = z.infer<typeof addressSuggestionsSchema>;
export type PlaceIdInput = z.infer<typeof placeIdSchema>;
export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;
export type CreateDraftEquipmentInput = z.infer<typeof createDraftEquipmentSchema>;
export type UpdateOwnerEquipmentInput = z.infer<typeof updateOwnerEquipmentSchema>;
export type RejectEquipmentInput = z.infer<typeof rejectEquipmentSchema>;
