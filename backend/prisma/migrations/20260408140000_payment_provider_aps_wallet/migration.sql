-- APS Money Wallet for merchant order / invoice QR payments (platform env).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'PaymentProvider'
      AND e.enumlabel = 'APS_WALLET'
  ) THEN
    ALTER TYPE "PaymentProvider" ADD VALUE 'APS_WALLET';
  END IF;
END $$;
