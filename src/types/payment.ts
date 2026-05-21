export type AdminWebhookEvent = {
  id: string;
  eventId: string;
  eventType: string;
  entityId: string | null;
  processedAt: string | null;
  createdAt: string;
  payload: unknown;
  linkedOrderId: string | null;
  linkedPaymentId: string | null;
  linkedBooking: {
    id: string;
    equipmentTitle: string;
    ownerName: string;
    renterName: string;
  } | null;
  status: "processed" | "unprocessed" | "unmatched";
};
