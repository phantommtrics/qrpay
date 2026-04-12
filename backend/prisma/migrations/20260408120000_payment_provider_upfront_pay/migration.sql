-- Counter / POS cash: distinct from wallet simulator.
-- Idempotent: safe if UPFRONT_PAY was added outside Prisma migrate (manual SQL / drift).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'PaymentProvider'
      AND e.enumlabel = 'UPFRONT_PAY'
  ) THEN
    ALTER TYPE "PaymentProvider" ADD VALUE 'UPFRONT_PAY';
  END IF;
END $$;
