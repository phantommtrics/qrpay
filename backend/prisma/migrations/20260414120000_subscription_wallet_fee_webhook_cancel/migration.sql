-- Subscription billing: Wave wallet fee rows + platform GL source
ALTER TYPE "BillingLedgerEntryType" ADD VALUE 'WALLET_FEE';
ALTER TYPE "PlatformJournalSourceType" ADD VALUE 'SUBSCRIPTION_WALLET_FEE';
