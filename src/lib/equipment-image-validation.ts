export type ImageFileLike = Pick<Express.Multer.File, "mimetype" | "size">;

export type ImageValidationOptions = {
  minFiles: number;
  maxFiles: number;
  maxBytes: number;
};

export type EquipmentImageValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export function validateImageFiles(files: ImageFileLike[], options: ImageValidationOptions): EquipmentImageValidationResult {
  if (files.length < options.minFiles) {
    return {
      ok: false,
      message: `Please upload at least ${options.minFiles} image${options.minFiles === 1 ? "" : "s"}.`,
    };
  }

  if (files.length > options.maxFiles) {
    return {
      ok: false,
      message: `Please upload no more than ${options.maxFiles} image${options.maxFiles === 1 ? "" : "s"}.`,
    };
  }

  for (const file of files) {
    if (!file.mimetype.startsWith("image/")) {
      return {
        ok: false,
        message: "Only image files are allowed.",
      };
    }

    if (file.size > options.maxBytes) {
      return {
        ok: false,
        message: `Each image must be ${Math.floor(options.maxBytes / 1024)} KB or smaller.`,
      };
    }
  }

  return { ok: true };
}

