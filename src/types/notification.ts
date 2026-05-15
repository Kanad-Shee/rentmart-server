export type NotificationType =
  | "EQUIPMENT_APPROVED"
  | "EQUIPMENT_REJECTED"
  | "ADDRESS_UPDATED"
  | "PASSWORD_UPDATED"
  | "PHONE_VERIFIED"
  | "BOOKING_REQUEST_RECEIVED"
  | "BOOKING_REQUEST_SUBMITTED"
  | "BOOKING_APPROVED"
  | "BOOKING_REJECTED"
  | "BOOKING_PAYMENT_REQUIRED"
  | "BOOKING_PAYMENT_CONFIRMED"
  | "RENTER_PAYMENT_CONFIRMED"
  | "BOOKING_STARTED"
  | "BOOKING_COMPLETED"
  | "BOOKING_CANCELLED"
  | "BOOKING_DISPUTED";

export type SafeNotification = {
  id: string;
  userId: string;
  equipmentId: string | null;
  type: NotificationType;
  title: string;
  message: string;
  actionLabel: string | null;
  actionHref: string | null;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
};
