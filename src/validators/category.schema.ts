import { z } from "zod";

export const createCategorySchema = z.object({
  title: z
    .string({ message: "Title is required." })
    .trim()
    .min(2, "Enter a valid title.")
    .max(60, "Title is too long."),
  description: z
    .string({ message: "Description is required." })
    .trim()
    .min(10, "Enter a valid description.")
    .max(1000, "Description is too long."),
});

export const updateCategorySchema = createCategorySchema;

export const categoryIdSchema = z.object({
  id: z
    .string({ message: "Category id is required." })
    .trim()
    .min(1, "Category id is required."),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
