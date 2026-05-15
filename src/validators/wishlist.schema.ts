import { z } from "zod";

export const wishlistEquipmentParamsSchema = z.object({
  equipmentId: z
    .string({ message: "Equipment id is required." })
    .trim()
    .min(1, "Equipment id is required."),
});

export type WishlistEquipmentParams = z.infer<
  typeof wishlistEquipmentParamsSchema
>;
