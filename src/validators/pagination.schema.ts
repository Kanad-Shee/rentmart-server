import { z } from "zod";

export const paginationQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("Page must be a whole number.")
    .min(1, "Page must be at least 1.")
    .optional()
    .default(1),
  pageSize: z.coerce
    .number()
    .int("Page size must be a whole number.")
    .min(1, "Page size must be at least 1.")
    .max(100, "Page size cannot be more than 100.")
    .optional()
    .default(10),
});

export type PaginationQueryInput = z.infer<typeof paginationQuerySchema>;
