-- Wave reserved checkout fee on merchant GL (independent of WALLET_FEE).
ALTER TYPE "JournalSourceType" ADD VALUE 'CUSTOMER_SALE_SELF_SETTLEMENT_CHECKOUT_FEE';
ALTER TYPE "SalesLedgerEntryType" ADD VALUE 'SELF_SETTLEMENT_CHECKOUT_FEE';
