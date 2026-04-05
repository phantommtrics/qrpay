-- Wallet fee % for POS/order QR is stored in encrypted BusinessGatewayCredential secrets, not on Business.
ALTER TABLE "Business" DROP COLUMN IF EXISTS "posWaveCustomerWalletFeeRate";
ALTER TABLE "Business" DROP COLUMN IF EXISTS "posYonnaCustomerWalletFeeRate";
