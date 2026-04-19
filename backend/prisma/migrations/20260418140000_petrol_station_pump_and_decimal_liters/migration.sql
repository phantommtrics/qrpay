-- Petrol station: record pump per sale; order lines use liter quantities (fractional).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "pumpLabel" TEXT;

ALTER TABLE "OrderLine" ALTER COLUMN "quantity" TYPE DECIMAL(18,6) USING ("quantity"::decimal);
