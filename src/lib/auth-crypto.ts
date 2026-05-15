import crypto from "node:crypto";

const OTP_LENGTH = 6;
const PASSWORD_SALT_ROUNDS = 10;

export function generateAuthOtp() {
  return crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

export async function createPasswordHashForAuth(password: string) {
  return Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: PASSWORD_SALT_ROUNDS,
  });
}

export async function validatePassword(password: string, passwordHash: string) {
  return Bun.password.verify(password, passwordHash);
}

export async function createOtpHash(otp: string) {
  return Bun.password.hash(otp, {
    algorithm: "bcrypt",
    cost: PASSWORD_SALT_ROUNDS,
  });
}

export async function validateOtp(otp: string, otpHash: string) {
  return Bun.password.verify(otp, otpHash);
}
