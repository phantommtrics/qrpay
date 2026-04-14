ALTER TABLE "BusinessApsWalletCustomerAuth"
ADD COLUMN "lastUnlinkAttemptAt" TIMESTAMP(3),
ADD COLUMN "lastUnlinkSucceededAt" TIMESTAMP(3),
ADD COLUMN "lastUnlinkError" TEXT;
