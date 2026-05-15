export const EQUIPMENT_STATUSES = ["DRAFT", "PENDING_VERIFICATION", "ACTIVE", "REJECTED"] as const;
export type EquipmentStatusValue = (typeof EQUIPMENT_STATUSES)[number];

export const EQUIPMENT_IMAGE_LIMITS = {
  min: 3,
  max: 5,
  maxBytes: 100 * 1024,
} as const;

export const EQUIPMENT_CLOUDINARY_FOLDER = "rentmart/equipment";
