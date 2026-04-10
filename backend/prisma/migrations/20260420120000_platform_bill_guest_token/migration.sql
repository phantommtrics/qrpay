-- Guest portal link for platform purchase bills (supplier email, no login).
ALTER TABLE "PlatformBill" ADD COLUMN "guestToken" TEXT;

CREATE UNIQUE INDEX "PlatformBill_guestToken_key" ON "PlatformBill"("guestToken");
