import type { EquipmentStatusValue } from "../configs/equipment.config.js";
import type { SafeCategory } from "./category.js";

export type EquipmentImageSummary = {
  id: string;
  url: string;
  position: number;
};

export type EquipmentReviewImageSummary = {
  id: string;
  url: string;
  position: number;
};

export type EquipmentReviewSummary = {
  id: string;
  rating: number;
  title: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  renter: {
    id: string;
    fullName: string;
  };
  images: EquipmentReviewImageSummary[];
};

export type EquipmentReviewViewerState = {
  isLoggedIn: boolean;
  canReview: boolean;
  code:
    | "NOT_AUTHENTICATED"
    | "ROLE_NOT_ALLOWED"
    | "BOOKING_NOT_COMPLETED"
    | "CAN_CREATE"
    | "CAN_UPDATE";
  message: string;
  review: EquipmentReviewSummary | null;
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
  description: string | null;
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
  averageRating?: number | null;
  reviewCount?: number;
  reviews?: EquipmentReviewSummary[];
  viewerReviewState?: EquipmentReviewViewerState;
};
