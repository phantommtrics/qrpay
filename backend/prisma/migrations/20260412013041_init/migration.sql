-- CreateEnum
CREATE TYPE "PlanCode" AS ENUM ('BASIC', 'PRO', 'BUSINESS_PRO', 'CORPORATE');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PLATFORM_OWNER', 'PLATFORM_ADMIN', 'ADMIN', 'MERCHANT', 'CASHIER', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'VOID');

-- CreateEnum
CREATE TYPE "ManualRefundReviewStatus" AS ENUM ('NONE', 'PENDING_REVIEW', 'APPROVED_FOR_REFUND', 'DECLINED', 'REFUNDED_EXTERNALLY');

-- CreateEnum
CREATE TYPE "BillingLedgerEntryType" AS ENUM ('INVOICE_PAYMENT', 'REFUND', 'ADJUSTMENT', 'WALLET_FEE');

-- CreateEnum
CREATE TYPE "BillingLedgerDirection" AS ENUM ('MONEY_IN', 'MONEY_OUT');

-- CreateEnum
CREATE TYPE "BillingLedgerStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'TWO_YEARS', 'CONTRACT_INFINITE');

-- CreateEnum
CREATE TYPE "StaffCreationNotificationType" AS ENUM ('EXISTING_USER', 'NEW_USER', 'OWNER_SIGNUP', 'PLATFORM_ADMIN_INVITE', 'SUBSCRIPTION_INVOICE', 'SALES_INVOICE_APPROVED', 'PURCHASE_BILL_APPROVED', 'SALES_QUOTATION_SENT', 'SUBSCRIPTION_INVOICE_REFUND_REVIEW', 'SUBSCRIPTION_INVOICE_REFUND_APPROVED');

-- CreateEnum
CREATE TYPE "StaffCreationNotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('QR_WALLET', 'CASH');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('SIMULATOR', 'WAVE_GAMBIA', 'YONNA_WALLET', 'APS_WALLET', 'UPFRONT_PAY');

-- CreateEnum
CREATE TYPE "ChartAccountCategory" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "ChartAccountKind" AS ENUM ('LEDGER', 'BANK');

-- CreateEnum
CREATE TYPE "JournalSourceType" AS ENUM ('CUSTOMER_SALE_PAYMENT', 'CUSTOMER_SALE_WALLET_FEE', 'MANUAL_MONEY_IN', 'MANUAL_MONEY_OUT', 'MANUAL_BANK_TRANSFER', 'SALES_INVOICE_PAYMENT', 'PURCHASE_BILL_PAYMENT', 'MANUAL_GENERAL_JOURNAL', 'MANUAL_JOURNAL_REVERSAL');

-- CreateEnum
CREATE TYPE "PlatformJournalSourceType" AS ENUM ('MANUAL', 'MANUAL_JOURNAL_REVERSAL', 'PURCHASE_BILL_PAYMENT', 'SUBSCRIPTION_INVOICE_PAYMENT', 'SUBSCRIPTION_CHECKOUT_PENDING', 'SUBSCRIPTION_CHECKOUT_SETTLEMENT', 'SUBSCRIPTION_REFUND', 'SUBSCRIPTION_WALLET_FEE');

-- CreateEnum
CREATE TYPE "SalesLedgerEntryType" AS ENUM ('CUSTOMER_SALE', 'WALLET_FEE');

-- CreateEnum
CREATE TYPE "SalesLedgerDirection" AS ENUM ('MONEY_IN', 'MONEY_OUT');

-- CreateEnum
CREATE TYPE "SalesLedgerStatus" AS ENUM ('SUCCEEDED');

-- CreateEnum
CREATE TYPE "ActivityActorKind" AS ENUM ('USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "BusinessMembershipStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "SalesQuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SalesInvoiceStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "BusinessPaymentMethodStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ApsWalletCustomerAuthMerchantScope" AS ENUM ('BUSINESS_MERCHANT', 'PLATFORM_SUBSCRIPTION');

-- CreateTable
CREATE TABLE "CorporateBillingPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyPrice" DECIMAL(10,2) NOT NULL,
    "quarterlyPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "halfYearlyPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "yearlyPrice" DECIMAL(10,2) NOT NULL,
    "twoYearPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "contractPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'GMD',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorporateBillingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "industry" TEXT,
    "ownerName" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "corporateBillingPlanId" TEXT,
    "corporateBillingInterval" "BillingInterval",
    "corporateEntitlementSystemProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentGateway" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "checkoutAdapter" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentGateway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessApsWalletCustomerAuth" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "customerMobileNormalized" TEXT NOT NULL,
    "merchantScope" "ApsWalletCustomerAuthMerchantScope" NOT NULL DEFAULT 'BUSINESS_MERCHANT',
    "iv" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessApsWalletCustomerAuth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessPaymentMethod" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "metadata" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "BusinessPaymentMethodStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessGatewayCredential" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "iv" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessGatewayCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessContact" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChartOfAccount" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "ChartAccountCategory" NOT NULL,
    "kind" "ChartAccountKind" NOT NULL DEFAULT 'LEDGER',
    "bankAccountNumber" TEXT,
    "bankName" TEXT,
    "bankDetails" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChartOfAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "memo" TEXT,
    "sourceType" "JournalSourceType",
    "sourceId" TEXT,
    "reference" TEXT,
    "contactId" TEXT,
    "reversesJournalEntryId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "journalApprovalExempt" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedByPlatformUserId" TEXT,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "chartOfAccountId" TEXT NOT NULL,
    "debitAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "quantity" DECIMAL(18,6),
    "unitLabel" TEXT,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesQuotation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL,
    "status" "SalesQuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "validUntil" TIMESTAMP(3),
    "reference" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GMD',
    "guestToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesQuotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesQuotationLine" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "chartOfAccountId" TEXT NOT NULL,
    "narration" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitLabel" TEXT,
    "unitAmount" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SalesQuotationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInvoice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "sourceQuotationId" TEXT,
    "publicCode" TEXT NOT NULL,
    "status" "SalesInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "reference" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GMD',
    "guestToken" TEXT,
    "settlementChartAccountId" TEXT,
    "journalEntryId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "chartOfAccountId" TEXT NOT NULL,
    "narration" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitLabel" TEXT,
    "unitAmount" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SalesInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "reference" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GMD',
    "settlementChartAccountId" TEXT,
    "journalEntryId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillLine" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "chartOfAccountId" TEXT NOT NULL,
    "narration" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitLabel" TEXT,
    "unitAmount" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BillLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformChartOfAccount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "ChartAccountCategory" NOT NULL,
    "kind" "ChartAccountKind" NOT NULL DEFAULT 'LEDGER',
    "bankAccountNumber" TEXT,
    "bankName" TEXT,
    "bankDetails" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformChartOfAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformJournalEntry" (
    "id" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "memo" TEXT,
    "sourceType" "PlatformJournalSourceType",
    "sourceId" TEXT,
    "reference" TEXT,
    "reversesPlatformJournalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformJournalLine" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "chartOfAccountId" TEXT NOT NULL,
    "debitAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "quantity" DECIMAL(18,6),
    "unitLabel" TEXT,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "PlatformJournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSupplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformBill" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL,
    "guestToken" TEXT,
    "status" "BillStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "reference" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GMD',
    "settlementChartAccountId" TEXT,
    "platformJournalEntryId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformBillLine" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "chartOfAccountId" TEXT NOT NULL,
    "narration" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitLabel" TEXT,
    "unitAmount" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlatformBillLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesLedgerEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orderId" TEXT,
    "paymentId" TEXT,
    "journalEntryId" TEXT NOT NULL,
    "type" "SalesLedgerEntryType" NOT NULL,
    "direction" "SalesLedgerDirection" NOT NULL,
    "status" "SalesLedgerStatus" NOT NULL DEFAULT 'SUCCEEDED',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GMD',
    "provider" TEXT NOT NULL,
    "providerPaymentRef" TEXT,
    "metadata" JSONB,
    "succeededAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuCategory" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiningTable" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiningTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "reservedStock" INTEGER NOT NULL DEFAULT 0,
    "barcodeType" TEXT NOT NULL DEFAULT 'CODE128',
    "barcodeValue" TEXT NOT NULL,
    "qrUrl" TEXT NOT NULL,
    "imageUrl" TEXT,
    "imageColor" TEXT NOT NULL DEFAULT 'bg-slate-100',
    "imageEmoji" TEXT NOT NULL DEFAULT '',
    "menuCategoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MERCHANT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "passwordResetIssuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "platformFunctionGroupId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformModule" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformRoleTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformRoleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformRoleTemplatePermission" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "canExport" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PlatformRoleTemplatePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformFunctionGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "roleTemplateId" TEXT NOT NULL,

    CONSTRAINT "PlatformFunctionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "status" "BusinessMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemService" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemProduct" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "navPath" TEXT,
    "navLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessUserSystemProduct" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "systemProductId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessUserSystemProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanSystemProduct" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "systemProductId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanSystemProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "code" "PlanCode" NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyPrice" DECIMAL(10,2) NOT NULL,
    "yearlyPrice" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GMD',
    "description" TEXT NOT NULL,
    "staffLimit" INTEGER NOT NULL,
    "outletLimit" INTEGER NOT NULL,
    "productLimit" INTEGER NOT NULL,
    "featureFlags" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "billingInterval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "contractPerpetual" BOOLEAN NOT NULL DEFAULT false,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionInvoice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GMD',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "billingPeriodStart" TIMESTAMP(3) NOT NULL,
    "billingPeriodEnd" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "externalReference" TEXT,
    "checkoutSessionId" TEXT,
    "checkoutProvider" TEXT,
    "guestToken" TEXT,
    "manualRefundReviewStatus" "ManualRefundReviewStatus" NOT NULL DEFAULT 'NONE',
    "manualRefundNote" TEXT,
    "manualRefundReviewedAt" TIMESTAMP(3),
    "manualRefundReviewedByUserId" TEXT,
    "manualRefundExpectedBy" TIMESTAMP(3),
    "manualRefundApprovedAmount" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingLedgerEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "subscriptionInvoiceId" TEXT,
    "type" "BillingLedgerEntryType" NOT NULL,
    "direction" "BillingLedgerDirection" NOT NULL,
    "status" "BillingLedgerStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GMD',
    "provider" TEXT NOT NULL,
    "providerCheckoutSessionId" TEXT,
    "providerPaymentRef" TEXT,
    "idempotencyKey" TEXT,
    "metadata" JSONB,
    "succeededAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staffCreationNotificationLogs" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "userId" TEXT,
    "recipientName" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "staffRole" "UserRole" NOT NULL,
    "notificationType" "StaffCreationNotificationType" NOT NULL,
    "deliveryStatus" "StaffCreationNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'resend',
    "subject" TEXT NOT NULL,
    "htmlBody" TEXT,
    "textBody" TEXT,
    "resendEmailId" TEXT,
    "failureReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staffCreationNotificationLogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "subtotal" DECIMAL(10,2) NOT NULL,
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GMD',
    "createdByUserId" TEXT,
    "diningTableId" TEXT,
    "tableLabelSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "lineTotal" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orderId" TEXT,
    "salesInvoiceId" TEXT,
    "billId" TEXT,
    "publicCode" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'SIMULATOR',
    "gatewayCode" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GMD',
    "providerRef" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "recordedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "actorUserId" TEXT,
    "actorKind" "ActivityActorKind" NOT NULL DEFAULT 'USER',
    "eventType" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL,
    "receiptNumber" INTEGER NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GMD',
    "linesSnapshot" JSONB NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'SIMULATOR',
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEventLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentGateway_code_key" ON "PaymentGateway"("code");

-- CreateIndex
CREATE INDEX "BusinessApsWalletCustomerAuth_businessId_idx" ON "BusinessApsWalletCustomerAuth"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessApsWalletCustomerAuth_businessId_gatewayId_customer_key" ON "BusinessApsWalletCustomerAuth"("businessId", "gatewayId", "customerMobileNormalized", "merchantScope");

-- CreateIndex
CREATE INDEX "BusinessPaymentMethod_businessId_status_idx" ON "BusinessPaymentMethod"("businessId", "status");

-- CreateIndex
CREATE INDEX "BusinessPaymentMethod_gatewayId_idx" ON "BusinessPaymentMethod"("gatewayId");

-- CreateIndex
CREATE INDEX "BusinessGatewayCredential_businessId_idx" ON "BusinessGatewayCredential"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessGatewayCredential_businessId_gatewayId_key" ON "BusinessGatewayCredential"("businessId", "gatewayId");

-- CreateIndex
CREATE INDEX "BusinessContact_businessId_idx" ON "BusinessContact"("businessId");

-- CreateIndex
CREATE INDEX "BusinessContact_businessId_name_idx" ON "BusinessContact"("businessId", "name");

-- CreateIndex
CREATE INDEX "ChartOfAccount_businessId_idx" ON "ChartOfAccount"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "ChartOfAccount_businessId_code_key" ON "ChartOfAccount"("businessId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversesJournalEntryId_key" ON "JournalEntry"("reversesJournalEntryId");

-- CreateIndex
CREATE INDEX "JournalEntry_businessId_postedAt_idx" ON "JournalEntry"("businessId", "postedAt");

-- CreateIndex
CREATE INDEX "JournalEntry_businessId_sourceType_sourceId_idx" ON "JournalEntry"("businessId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "JournalEntry_contactId_idx" ON "JournalEntry"("contactId");

-- CreateIndex
CREATE INDEX "JournalEntry_approvedAt_idx" ON "JournalEntry"("approvedAt");

-- CreateIndex
CREATE INDEX "JournalEntry_cancelledAt_idx" ON "JournalEntry"("cancelledAt");

-- CreateIndex
CREATE INDEX "JournalEntry_postedByPlatformUserId_idx" ON "JournalEntry"("postedByPlatformUserId");

-- CreateIndex
CREATE INDEX "JournalLine_journalEntryId_idx" ON "JournalLine"("journalEntryId");

-- CreateIndex
CREATE INDEX "JournalLine_chartOfAccountId_idx" ON "JournalLine"("chartOfAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesQuotation_guestToken_key" ON "SalesQuotation"("guestToken");

-- CreateIndex
CREATE INDEX "SalesQuotation_businessId_status_idx" ON "SalesQuotation"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SalesQuotation_businessId_publicCode_key" ON "SalesQuotation"("businessId", "publicCode");

-- CreateIndex
CREATE INDEX "SalesQuotationLine_quotationId_idx" ON "SalesQuotationLine"("quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_sourceQuotationId_key" ON "SalesInvoice"("sourceQuotationId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_guestToken_key" ON "SalesInvoice"("guestToken");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_journalEntryId_key" ON "SalesInvoice"("journalEntryId");

-- CreateIndex
CREATE INDEX "SalesInvoice_businessId_status_idx" ON "SalesInvoice"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_businessId_publicCode_key" ON "SalesInvoice"("businessId", "publicCode");

-- CreateIndex
CREATE INDEX "SalesInvoiceLine_invoiceId_idx" ON "SalesInvoiceLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_journalEntryId_key" ON "Bill"("journalEntryId");

-- CreateIndex
CREATE INDEX "Bill_businessId_status_idx" ON "Bill"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_businessId_publicCode_key" ON "Bill"("businessId", "publicCode");

-- CreateIndex
CREATE INDEX "BillLine_billId_idx" ON "BillLine"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformChartOfAccount_code_key" ON "PlatformChartOfAccount"("code");

-- CreateIndex
CREATE INDEX "PlatformChartOfAccount_category_idx" ON "PlatformChartOfAccount"("category");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformJournalEntry_reversesPlatformJournalEntryId_key" ON "PlatformJournalEntry"("reversesPlatformJournalEntryId");

-- CreateIndex
CREATE INDEX "PlatformJournalEntry_postedAt_idx" ON "PlatformJournalEntry"("postedAt");

-- CreateIndex
CREATE INDEX "PlatformJournalEntry_sourceType_sourceId_idx" ON "PlatformJournalEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "PlatformJournalLine_journalEntryId_idx" ON "PlatformJournalLine"("journalEntryId");

-- CreateIndex
CREATE INDEX "PlatformJournalLine_chartOfAccountId_idx" ON "PlatformJournalLine"("chartOfAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformBill_publicCode_key" ON "PlatformBill"("publicCode");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformBill_guestToken_key" ON "PlatformBill"("guestToken");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformBill_platformJournalEntryId_key" ON "PlatformBill"("platformJournalEntryId");

-- CreateIndex
CREATE INDEX "PlatformBill_supplierId_status_idx" ON "PlatformBill"("supplierId", "status");

-- CreateIndex
CREATE INDEX "PlatformBillLine_billId_idx" ON "PlatformBillLine"("billId");

-- CreateIndex
CREATE INDEX "SalesLedgerEntry_businessId_createdAt_idx" ON "SalesLedgerEntry"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "SalesLedgerEntry_orderId_idx" ON "SalesLedgerEntry"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesLedgerEntry_paymentId_type_key" ON "SalesLedgerEntry"("paymentId", "type");

-- CreateIndex
CREATE INDEX "MenuCategory_businessId_parentId_idx" ON "MenuCategory"("businessId", "parentId");

-- CreateIndex
CREATE INDEX "DiningTable_businessId_idx" ON "DiningTable"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "DiningTable_businessId_publicToken_key" ON "DiningTable"("businessId", "publicToken");

-- CreateIndex
CREATE INDEX "Product_businessId_idx" ON "Product"("businessId");

-- CreateIndex
CREATE INDEX "Product_menuCategoryId_idx" ON "Product"("menuCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_businessId_barcodeValue_key" ON "Product"("businessId", "barcodeValue");

-- CreateIndex
CREATE UNIQUE INDEX "Product_businessId_qrUrl_key" ON "Product"("businessId", "qrUrl");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_platformFunctionGroupId_idx" ON "User"("platformFunctionGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformModule_slug_key" ON "PlatformModule"("slug");

-- CreateIndex
CREATE INDEX "PlatformRoleTemplatePermission_moduleId_idx" ON "PlatformRoleTemplatePermission"("moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformRoleTemplatePermission_templateId_moduleId_key" ON "PlatformRoleTemplatePermission"("templateId", "moduleId");

-- CreateIndex
CREATE INDEX "PlatformFunctionGroup_roleTemplateId_idx" ON "PlatformFunctionGroup"("roleTemplateId");

-- CreateIndex
CREATE INDEX "BusinessMembership_businessId_idx" ON "BusinessMembership"("businessId");

-- CreateIndex
CREATE INDEX "BusinessMembership_userId_idx" ON "BusinessMembership"("userId");

-- CreateIndex
CREATE INDEX "BusinessMembership_businessId_status_idx" ON "BusinessMembership"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessMembership_userId_businessId_key" ON "BusinessMembership"("userId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemProduct_slug_key" ON "SystemProduct"("slug");

-- CreateIndex
CREATE INDEX "SystemProduct_serviceId_idx" ON "SystemProduct"("serviceId");

-- CreateIndex
CREATE INDEX "BusinessUserSystemProduct_businessId_userId_idx" ON "BusinessUserSystemProduct"("businessId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessUserSystemProduct_businessId_userId_systemProductId_key" ON "BusinessUserSystemProduct"("businessId", "userId", "systemProductId");

-- CreateIndex
CREATE INDEX "PlanSystemProduct_planId_idx" ON "PlanSystemProduct"("planId");

-- CreateIndex
CREATE INDEX "PlanSystemProduct_systemProductId_idx" ON "PlanSystemProduct"("systemProductId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanSystemProduct_planId_systemProductId_key" ON "PlanSystemProduct"("planId", "systemProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE INDEX "Subscription_businessId_status_idx" ON "Subscription"("businessId", "status");

-- CreateIndex
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionInvoice_externalReference_key" ON "SubscriptionInvoice"("externalReference");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionInvoice_guestToken_key" ON "SubscriptionInvoice"("guestToken");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_businessId_status_idx" ON "SubscriptionInvoice"("businessId", "status");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_subscriptionId_idx" ON "SubscriptionInvoice"("subscriptionId");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_checkoutSessionId_idx" ON "SubscriptionInvoice"("checkoutSessionId");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_manualRefundReviewStatus_idx" ON "SubscriptionInvoice"("manualRefundReviewStatus");

-- CreateIndex
CREATE UNIQUE INDEX "BillingLedgerEntry_idempotencyKey_key" ON "BillingLedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BillingLedgerEntry_businessId_createdAt_idx" ON "BillingLedgerEntry"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingLedgerEntry_subscriptionInvoiceId_idx" ON "BillingLedgerEntry"("subscriptionInvoiceId");

-- CreateIndex
CREATE INDEX "BillingLedgerEntry_subscriptionId_idx" ON "BillingLedgerEntry"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingLedgerEntry_providerCheckoutSessionId_type_key" ON "BillingLedgerEntry"("providerCheckoutSessionId", "type");

-- CreateIndex
CREATE INDEX "staffCreationNotificationLogs_businessId_idx" ON "staffCreationNotificationLogs"("businessId");

-- CreateIndex
CREATE INDEX "staffCreationNotificationLogs_userId_idx" ON "staffCreationNotificationLogs"("userId");

-- CreateIndex
CREATE INDEX "staffCreationNotificationLogs_createdAt_idx" ON "staffCreationNotificationLogs"("createdAt");

-- CreateIndex
CREATE INDEX "Order_businessId_status_idx" ON "Order"("businessId", "status");

-- CreateIndex
CREATE INDEX "Order_businessId_createdAt_idx" ON "Order"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_diningTableId_idx" ON "Order"("diningTableId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_businessId_publicCode_key" ON "Order"("businessId", "publicCode");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_salesInvoiceId_key" ON "Payment"("salesInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_billId_key" ON "Payment"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerRef_key" ON "Payment"("providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_publicToken_key" ON "Payment"("publicToken");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_businessId_status_idx" ON "Payment"("businessId", "status");

-- CreateIndex
CREATE INDEX "Payment_publicToken_idx" ON "Payment"("publicToken");

-- CreateIndex
CREATE INDEX "Payment_recordedByUserId_idx" ON "Payment"("recordedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_businessId_publicCode_key" ON "Payment"("businessId", "publicCode");

-- CreateIndex
CREATE INDEX "ActivityLog_businessId_createdAt_idx" ON "ActivityLog"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_orderId_key" ON "Receipt"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_businessId_receiptNumber_key" ON "Receipt"("businessId", "receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_businessId_publicCode_key" ON "Receipt"("businessId", "publicCode");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEventLog_provider_eventKey_key" ON "WebhookEventLog"("provider", "eventKey");

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_corporateBillingPlanId_fkey" FOREIGN KEY ("corporateBillingPlanId") REFERENCES "CorporateBillingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessApsWalletCustomerAuth" ADD CONSTRAINT "BusinessApsWalletCustomerAuth_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessApsWalletCustomerAuth" ADD CONSTRAINT "BusinessApsWalletCustomerAuth_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "PaymentGateway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessPaymentMethod" ADD CONSTRAINT "BusinessPaymentMethod_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessPaymentMethod" ADD CONSTRAINT "BusinessPaymentMethod_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "PaymentGateway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessGatewayCredential" ADD CONSTRAINT "BusinessGatewayCredential_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessGatewayCredential" ADD CONSTRAINT "BusinessGatewayCredential_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "PaymentGateway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessContact" ADD CONSTRAINT "BusinessContact_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "BusinessContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_postedByPlatformUserId_fkey" FOREIGN KEY ("postedByPlatformUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversesJournalEntryId_fkey" FOREIGN KEY ("reversesJournalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_chartOfAccountId_fkey" FOREIGN KEY ("chartOfAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuotation" ADD CONSTRAINT "SalesQuotation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuotation" ADD CONSTRAINT "SalesQuotation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "BusinessContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuotationLine" ADD CONSTRAINT "SalesQuotationLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "SalesQuotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuotationLine" ADD CONSTRAINT "SalesQuotationLine_chartOfAccountId_fkey" FOREIGN KEY ("chartOfAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "BusinessContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_sourceQuotationId_fkey" FOREIGN KEY ("sourceQuotationId") REFERENCES "SalesQuotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_settlementChartAccountId_fkey" FOREIGN KEY ("settlementChartAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_chartOfAccountId_fkey" FOREIGN KEY ("chartOfAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "BusinessContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_settlementChartAccountId_fkey" FOREIGN KEY ("settlementChartAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillLine" ADD CONSTRAINT "BillLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillLine" ADD CONSTRAINT "BillLine_chartOfAccountId_fkey" FOREIGN KEY ("chartOfAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformJournalEntry" ADD CONSTRAINT "PlatformJournalEntry_reversesPlatformJournalEntryId_fkey" FOREIGN KEY ("reversesPlatformJournalEntryId") REFERENCES "PlatformJournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformJournalLine" ADD CONSTRAINT "PlatformJournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "PlatformJournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformJournalLine" ADD CONSTRAINT "PlatformJournalLine_chartOfAccountId_fkey" FOREIGN KEY ("chartOfAccountId") REFERENCES "PlatformChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBill" ADD CONSTRAINT "PlatformBill_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "PlatformSupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBill" ADD CONSTRAINT "PlatformBill_settlementChartAccountId_fkey" FOREIGN KEY ("settlementChartAccountId") REFERENCES "PlatformChartOfAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBill" ADD CONSTRAINT "PlatformBill_platformJournalEntryId_fkey" FOREIGN KEY ("platformJournalEntryId") REFERENCES "PlatformJournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBillLine" ADD CONSTRAINT "PlatformBillLine_billId_fkey" FOREIGN KEY ("billId") REFERENCES "PlatformBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBillLine" ADD CONSTRAINT "PlatformBillLine_chartOfAccountId_fkey" FOREIGN KEY ("chartOfAccountId") REFERENCES "PlatformChartOfAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesLedgerEntry" ADD CONSTRAINT "SalesLedgerEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesLedgerEntry" ADD CONSTRAINT "SalesLedgerEntry_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesLedgerEntry" ADD CONSTRAINT "SalesLedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesLedgerEntry" ADD CONSTRAINT "SalesLedgerEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MenuCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_menuCategoryId_fkey" FOREIGN KEY ("menuCategoryId") REFERENCES "MenuCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_platformFunctionGroupId_fkey" FOREIGN KEY ("platformFunctionGroupId") REFERENCES "PlatformFunctionGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformRoleTemplatePermission" ADD CONSTRAINT "PlatformRoleTemplatePermission_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PlatformRoleTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformRoleTemplatePermission" ADD CONSTRAINT "PlatformRoleTemplatePermission_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "PlatformModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformFunctionGroup" ADD CONSTRAINT "PlatformFunctionGroup_roleTemplateId_fkey" FOREIGN KEY ("roleTemplateId") REFERENCES "PlatformRoleTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessMembership" ADD CONSTRAINT "BusinessMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessMembership" ADD CONSTRAINT "BusinessMembership_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemProduct" ADD CONSTRAINT "SystemProduct_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "SystemService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessUserSystemProduct" ADD CONSTRAINT "BusinessUserSystemProduct_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessUserSystemProduct" ADD CONSTRAINT "BusinessUserSystemProduct_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessUserSystemProduct" ADD CONSTRAINT "BusinessUserSystemProduct_systemProductId_fkey" FOREIGN KEY ("systemProductId") REFERENCES "SystemProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanSystemProduct" ADD CONSTRAINT "PlanSystemProduct_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanSystemProduct" ADD CONSTRAINT "PlanSystemProduct_systemProductId_fkey" FOREIGN KEY ("systemProductId") REFERENCES "SystemProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_manualRefundReviewedByUserId_fkey" FOREIGN KEY ("manualRefundReviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingLedgerEntry" ADD CONSTRAINT "BillingLedgerEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingLedgerEntry" ADD CONSTRAINT "BillingLedgerEntry_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingLedgerEntry" ADD CONSTRAINT "BillingLedgerEntry_subscriptionInvoiceId_fkey" FOREIGN KEY ("subscriptionInvoiceId") REFERENCES "SubscriptionInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staffCreationNotificationLogs" ADD CONSTRAINT "staffCreationNotificationLogs_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staffCreationNotificationLogs" ADD CONSTRAINT "staffCreationNotificationLogs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_diningTableId_fkey" FOREIGN KEY ("diningTableId") REFERENCES "DiningTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
