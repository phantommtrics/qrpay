-- Platform GL source types for subscription checkout lifecycle + refunds
ALTER TYPE "PlatformJournalSourceType" ADD VALUE 'SUBSCRIPTION_CHECKOUT_PENDING';
ALTER TYPE "PlatformJournalSourceType" ADD VALUE 'SUBSCRIPTION_CHECKOUT_SETTLEMENT';
ALTER TYPE "PlatformJournalSourceType" ADD VALUE 'SUBSCRIPTION_REFUND';
