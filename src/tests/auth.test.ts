/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test";
import {
  createOtpHash,
  createPasswordHashForAuth,
  generateAuthOtp,
  validateOtp,
  validatePassword,
} from "../lib/auth-crypto";
import { validateRequest } from "../middlewares/validate.middleware";
import {
  listUsersQuerySchema,
  resendOtpSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
  updateProfileSchema,
  verifyOtpSchema,
} from "../validators/auth.schema";

const validSignUpPayload = {
  role: "owner",
  fullName: "Aman Kumar",
  email: "aman@example.com",
  address: "12 Industrial Road",
  password: "password123",
  confirmPassword: "password123",
};

describe("auth schemas", () => {
  it("accepts valid sign up data", () => {
    const result = signUpSchema.safeParse(validSignUpPayload);

    expect(result.success).toBe(true);
  });

  it("rejects mismatched sign up passwords", () => {
    const result = signUpSchema.safeParse({
      ...validSignUpPayload,
      confirmPassword: "password321",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.confirmPassword?.[0]).toBe("Passwords do not match.");
    }
  });

  it("accepts valid sign in data", () => {
    const result = signInSchema.safeParse({
      email: "aman@example.com",
      password: "password123",
      rememberMe: true,
    });

    expect(result.success).toBe(true);
  });

  it("accepts valid otp payloads", () => {
    expect(
      verifyOtpSchema.safeParse({
        email: "aman@example.com",
        otp: "123456",
      }).success
    ).toBe(true);

    expect(
      resendOtpSchema.safeParse({
        email: "aman@example.com",
      }).success
    ).toBe(true);
  });

  it("accepts a valid profile update payload", () => {
    const result = updateProfileSchema.safeParse({
      address: "45 Market Yard, Pune",
    });

    expect(result.success).toBe(true);
  });

  it("accepts valid admin user query filters", () => {
    const result = listUsersQuerySchema.safeParse({
      search: "aman",
      role: "OWNER",
      verification: "VERIFIED",
    });

    expect(result.success).toBe(true);
  });

  it("rejects mismatched password updates", () => {
    const result = updatePasswordSchema.safeParse({
      currentPassword: "password123",
      newPassword: "newpassword123",
      confirmNewPassword: "differentpassword123",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.confirmNewPassword?.[0]).toBe(
        "Passwords do not match."
      );
    }
  });
});

describe("auth helpers", () => {
  it("generates a 6 digit otp", () => {
    const otp = generateAuthOtp();

    expect(otp).toMatch(/^\d{6}$/);
  });

  it("hashes and validates passwords", async () => {
    const hash = await createPasswordHashForAuth("password123");

    expect(await validatePassword("password123", hash)).toBe(true);
    expect(await validatePassword("wrong-password", hash)).toBe(false);
  });

  it("hashes and validates otp values", async () => {
    const hash = await createOtpHash("123456");

    expect(await validateOtp("123456", hash)).toBe(true);
    expect(await validateOtp("654321", hash)).toBe(false);
  });
});

describe("validateRequest middleware", () => {
  it("passes through valid request bodies", () => {
    let nextCalled = false;

    const middleware = validateRequest(signInSchema);
    const req = {
      body: {
        email: "aman@example.com",
        password: "password123",
        rememberMe: false,
      },
    } as never;

    const res = {
      status: () => res,
      json: () => res,
    } as never;

    middleware(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });

  it("returns validation errors for invalid request bodies", () => {
    let statusCode = 0;
    let responseBody: unknown;
    let nextCalled = false;

    const middleware = validateRequest(signUpSchema);
    const req = {
      body: {
        role: "owner",
        fullName: "A",
        email: "not-an-email",
        address: "x",
        password: "123",
        confirmPassword: "456",
      },
    } as never;

    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: unknown) {
        responseBody = payload;
        return this;
      },
    } as never;

    middleware(req, res, () => {
      nextCalled = true;
    });

    expect(statusCode).toBe(400);
    expect(nextCalled).toBe(false);
    expect(responseBody).toMatchObject({
      success: false,
      message: "Validation failed.",
    });
  });
});
