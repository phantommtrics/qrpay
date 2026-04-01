-- Add public-facing reference codes for sales records
ALTER TABLE "Order" ADD COLUMN "publicCode" TEXT;
ALTER TABLE "Payment" ADD COLUMN "publicCode" TEXT;
ALTER TABLE "Receipt" ADD COLUMN "publicCode" TEXT;

WITH business_codes AS (
  SELECT
    b."id",
    RPAD(LEFT(REGEXP_REPLACE(UPPER(b."name"), '[^A-Z0-9]', '', 'g'), 3), 3, 'X') AS prefix
  FROM "Business" b
),
order_codes AS (
  SELECT
    o."id",
    bc.prefix,
    ROW_NUMBER() OVER (PARTITION BY o."businessId" ORDER BY o."createdAt", o."id") AS seq
  FROM "Order" o
  JOIN business_codes bc ON bc."id" = o."businessId"
)
UPDATE "Order" o
SET "publicCode" = order_codes.prefix || '-ORD-' || LPAD(order_codes.seq::TEXT, 5, '0')
FROM order_codes
WHERE order_codes."id" = o."id";

WITH business_codes AS (
  SELECT
    b."id",
    RPAD(LEFT(REGEXP_REPLACE(UPPER(b."name"), '[^A-Z0-9]', '', 'g'), 3), 3, 'X') AS prefix
  FROM "Business" b
),
payment_codes AS (
  SELECT
    p."id",
    bc.prefix,
    ROW_NUMBER() OVER (PARTITION BY p."businessId" ORDER BY p."createdAt", p."id") AS seq
  FROM "Payment" p
  JOIN business_codes bc ON bc."id" = p."businessId"
)
UPDATE "Payment" p
SET "publicCode" = payment_codes.prefix || '-PAY-' || LPAD(payment_codes.seq::TEXT, 5, '0')
FROM payment_codes
WHERE payment_codes."id" = p."id";

WITH business_codes AS (
  SELECT
    b."id",
    RPAD(LEFT(REGEXP_REPLACE(UPPER(b."name"), '[^A-Z0-9]', '', 'g'), 3), 3, 'X') AS prefix
  FROM "Business" b
),
receipt_codes AS (
  SELECT
    r."id",
    bc.prefix,
    ROW_NUMBER() OVER (PARTITION BY r."businessId" ORDER BY r."receiptNumber", r."id") AS seq
  FROM "Receipt" r
  JOIN business_codes bc ON bc."id" = r."businessId"
)
UPDATE "Receipt" r
SET "publicCode" = receipt_codes.prefix || '-RCT-' || LPAD(receipt_codes.seq::TEXT, 5, '0')
FROM receipt_codes
WHERE receipt_codes."id" = r."id";

ALTER TABLE "Order" ALTER COLUMN "publicCode" SET NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "publicCode" SET NOT NULL;
ALTER TABLE "Receipt" ALTER COLUMN "publicCode" SET NOT NULL;

CREATE UNIQUE INDEX "Order_businessId_publicCode_key" ON "Order"("businessId", "publicCode");
CREATE UNIQUE INDEX "Payment_businessId_publicCode_key" ON "Payment"("businessId", "publicCode");
CREATE UNIQUE INDEX "Receipt_businessId_publicCode_key" ON "Receipt"("businessId", "publicCode");
