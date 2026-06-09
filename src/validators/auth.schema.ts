import { z } from "zod";
import { paginationQuerySchema } from "./pagination.schema.js";

function sanitizePhoneInput(phone: string) {
  return phone.trim().replace(/[\s()-]/g, "");
}

function normalizePhoneInput(phone: string) {
  const sanitized = sanitizePhoneInput(phone);

  if (sanitized.startsWith("+")) {
    return `+${sanitized.slice(1).replace(/\D/g, "")}`;
  }

  if (sanitized.startsWith("00")) {
    return `+${sanitized.slice(2).replace(/\D/g, "")}`;
  }

  const digits = sanitized.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return `+91${digits.slice(1)}`;
  }

  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }

  return sanitized;
}

const phoneNumberSchema = z
  .string({ message: "Phone number is required." })
  .trim()
  .transform(normalizePhoneInput)
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, "Enter a valid mobile number."));

const passwordSchema = z
  .string({ message: "Password is required." })
  .min(8, "Password must be at least 8 characters.")
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/,
    "Password must include at least one uppercase letter, one lowercase letter, one number, and one special character.",
  );

const fullNameSchema = z
  .string({ message: "Full name is required." })
  .trim()
  .transform((value) => value.replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(2, "Enter your full name.")
      .max(50, "Full name is too long.")
      .regex(
        /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/,
        "Full name can only contain letters, spaces, apostrophes, and hyphens.",
      ),
  );

export const signUpSchema = z
  .object({
    role: z.enum(["owner", "renter"]),
    fullName: fullNameSchema,
    email: z
      .string({ message: "Email is required." })
      .trim()
      .email("Enter a valid email address."),
    address: z
      .string({ message: "Business address is required." })
      .trim()
      .min(2, "Enter a valid business address.")
      .max(80, "Business address is too long."),
    password: passwordSchema,
    confirmPassword: z
      .string({ message: "Confirm your password." })
      .min(8, "Password must be at least 8 characters."),
  })
  .superRefine((values, ctx) => {
    if (values.password !== values.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  });

export const signInSchema = z.object({
  email: z
    .string({ message: "Email is required." })
    .trim()
    .email("Enter a valid email address."),
  password: passwordSchema,
  rememberMe: z.boolean().optional(),
});

export const verifyOtpSchema = z.object({
  email: z
    .string({ message: "Email is required." })
    .trim()
    .email("Enter a valid email address."),
  otp: z
    .string({ message: "OTP is required." })
    .trim()
    .length(6, "OTP must be 6 digits."),
});

export const resendOtpSchema = z.object({
  email: z
    .string({ message: "Email is required." })
    .trim()
    .email("Enter a valid email address."),
});

export const startPhoneVerificationSchema = z.object({
  phone: phoneNumberSchema,
});

export const verifyPhoneSchema = z.object({
  phone: phoneNumberSchema,
  code: z
    .string({ message: "Verification code is required." })
    .trim()
    .min(4, "Verification code is too short.")
    .max(10, "Verification code is too long."),
});

export const updateProfileSchema = z.object({
  address: z
    .string({ message: "Address is required." })
    .trim()
    .min(2, "Enter a valid address.")
    .max(120, "Address is too long."),
});

export const updatePasswordSchema = z
  .object({
    currentPassword: z
      .string({ message: "Current password is required." })
      .min(8, "Password must be at least 8 characters."),
    newPassword: passwordSchema,
    confirmNewPassword: z
      .string({ message: "Confirm your new password." })
      .min(8, "Password must be at least 8 characters."),
  })
  .superRefine((values, ctx) => {
    if (values.newPassword !== values.confirmNewPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmNewPassword"],
        message: "Passwords do not match.",
      });
    }

    if (values.currentPassword === values.newPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newPassword"],
        message: "New password must be different from the current password.",
      });
    }
  });

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100, "Search is too long.").optional(),
  role: z.enum(["ALL", "ADMIN", "OWNER", "RENTER"]).optional(),
  verification: z.enum(["ALL", "VERIFIED", "ACTION_REQUIRED"]).optional(),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;
export type StartPhoneVerificationInput = z.infer<typeof startPhoneVerificationSchema>;
export type VerifyPhoneInput = z.infer<typeof verifyPhoneSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
export type ListUsersQueryInput = z.infer<typeof listUsersQuerySchema>;
