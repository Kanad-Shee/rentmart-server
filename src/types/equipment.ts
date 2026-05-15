import type { EquipmentStatusValue } from "../configs/equipment.config";
import type { SafeCategory } from "./category";

export type EquipmentImageSummary = {
  id: string;
  url: string;
  position: number;
};

export type EquipmentOwnerSummary = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  address: string;
  phoneVerified: boolean;
  createdAt: Date;
};

export type SafeEquipment = {
  id: string;
  ownerId: string;
  owner: EquipmentOwnerSummary;
  title: string;
  category: SafeCategory;
  price: number;
  deliveryRadius: number;
  address: string;
  normalizedAddress: string;
  latitude: number;
  longitude: number;
  status: EquipmentStatusValue;
  rejectionReason: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  images: EquipmentImageSummary[];
  isWishlisted: boolean;
};
