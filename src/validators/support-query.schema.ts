import { z } from "zod";
import { paginationQuerySchema } from "./pagination.schema.js";

export const supportQueryTopicSchema = z.enum([
  "GENERAL_INQUIRY",
  "LISTING_HELP",
  "RENTAL_HELP",
  "PAYMENT_HELP",
  "ACCOUNT_HELP",
]);

export const createSupportQuerySchema = z.object({
  topic: supportQueryTopicSchema,
  message: z
    .string({ message: "Message is required." })
    .trim()
    .min(12, "Tell us a bit more about your request.")
    .max(2000, "Message is too long."),
});

export const listSupportQueriesQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100, "Search is too long.").optional(),
  role: z.enum(["ALL", "OWNER", "RENTER"]).optional(),
  topic: z
    .enum(["ALL", "GENERAL_INQUIRY", "LISTING_HELP", "RENTAL_HELP", "PAYMENT_HELP", "ACCOUNT_HELP"])
    .optional(),
});

export type CreateSupportQueryInput = z.infer<typeof createSupportQuerySchema>;
export type ListSupportQueriesQueryInput = z.infer<
  typeof listSupportQueriesQuerySchema
>;
