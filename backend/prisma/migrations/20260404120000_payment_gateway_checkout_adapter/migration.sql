-- Optional integration for online checkout (e.g. wave_gambia). NULL = manual / no redirect checkout.
ALTER TABLE "PaymentGateway" ADD COLUMN "checkoutAdapter" TEXT;

UPDATE "PaymentGateway" SET "checkoutAdapter" = 'wave_gambia' WHERE "code" = 'wave_gambia';
