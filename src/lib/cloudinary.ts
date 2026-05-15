import crypto from "node:crypto";
import { EQUIPMENT_CLOUDINARY_FOLDER } from "../configs/equipment.config";
import { CATEGORY_CLOUDINARY_FOLDER } from "../configs/category.config";

export type CloudinaryUploadResult = {
  publicId: string;
  secureUrl: string;
  bytes: number | null;
  width: number | null;
  height: number | null;
  format: string | null;
};

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function buildCloudinarySignature(params: Record<string, string>) {
  const secret = getRequiredEnv("CLOUDINARY_API_SECRET");
  const signatureBase = Object.entries(params)
    .filter(([, value]) => value.length > 0)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return crypto.createHash("sha1").update(`${signatureBase}${secret}`).digest("hex");
}

function toCloudinaryBlob(buffer: Buffer, mimetype: string) {
  return new Blob([buffer], { type: mimetype });
}

function parseCloudinaryUploadResponse(payload: unknown): CloudinaryUploadResult {
  if (!payload || typeof payload !== "object") {
    throw new Error("Unexpected Cloudinary upload response.");
  }

  const response = payload as Record<string, unknown>;

  if (typeof response.public_id !== "string" || typeof response.secure_url !== "string") {
    throw new Error("Cloudinary upload did not return a valid image payload.");
  }

  return {
    publicId: response.public_id,
    secureUrl: response.secure_url,
    bytes: typeof response.bytes === "number" ? response.bytes : null,
    width: typeof response.width === "number" ? response.width : null,
    height: typeof response.height === "number" ? response.height : null,
    format: typeof response.format === "string" ? response.format : null,
  };
}

function readCloudinaryErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload === "object" && payload !== null) {
    const error = (payload as Record<string, unknown>).error;

    if (typeof error === "string") {
      return error;
    }

    if (typeof error === "object" && error !== null && typeof (error as Record<string, unknown>).message === "string") {
      return String((error as Record<string, unknown>).message);
    }
  }

  return fallback;
}

type CloudinaryUploadFile = Pick<Express.Multer.File, "buffer" | "mimetype" | "originalname">;

async function uploadCloudinaryImage(
  file: CloudinaryUploadFile,
  folder: string
) {
  const cloudName = getRequiredEnv("CLOUDINARY_CLOUD_NAME");
  const apiKey = getRequiredEnv("CLOUDINARY_API_KEY");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = buildCloudinarySignature({
    folder,
    timestamp,
  });

  const formData = new FormData();
  formData.append("file", toCloudinaryBlob(file.buffer, file.mimetype), file.originalname);
  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp);
  formData.append("folder", folder);
  formData.append("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json()) as unknown;

  if (!response.ok) {
    const message = readCloudinaryErrorMessage(payload, "Cloudinary image upload failed.");

    throw new Error(message);
  }

  return parseCloudinaryUploadResponse(payload);
}

export async function uploadEquipmentImage(file: CloudinaryUploadFile) {
  return uploadCloudinaryImage(file, EQUIPMENT_CLOUDINARY_FOLDER);
}

export async function uploadCategoryImage(file: CloudinaryUploadFile) {
  return uploadCloudinaryImage(file, CATEGORY_CLOUDINARY_FOLDER);
}

export async function deleteCloudinaryImage(publicId: string) {
  const cloudName = getRequiredEnv("CLOUDINARY_CLOUD_NAME");
  const apiKey = getRequiredEnv("CLOUDINARY_API_KEY");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = buildCloudinarySignature({
    public_id: publicId,
    timestamp,
  });

  const formData = new FormData();
  formData.append("public_id", publicId);
  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp);
  formData.append("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json()) as unknown;

  if (!response.ok) {
    const message = readCloudinaryErrorMessage(payload, "Cloudinary image delete failed.");

    throw new Error(message);
  }

  return payload;
}

export { buildCloudinarySignature, uploadCloudinaryImage };
