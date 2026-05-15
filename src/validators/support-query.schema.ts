import { z } from "zod";

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

export type CreateSupportQueryInput = z.infer<typeof createSupportQuerySchema>;
