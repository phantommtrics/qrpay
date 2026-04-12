-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'WAVE_GAMBIA';
ALTER TYPE "PaymentProvider" ADD VALUE 'YONNA_WALLET';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "gatewayCode" TEXT;
