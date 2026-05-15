DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'BOOKING_REQUEST_RECEIVED'
      AND enumtypid = '"NotificationType"'::regtype
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_REQUEST_RECEIVED';
  END IF;
END $$;
