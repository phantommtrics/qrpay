import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ActivityActorKind,
  BillingInterval,
  BusinessMembershipStatus,
  ChartAccountCategory,
  ChartAccountKind,
  InvoiceStatus,
  JournalSourceType,
  ManualRefundReviewStatus,
  PlanCode,
  Prisma,
  SubscriptionStatus,
  UserRole,
} from "@prisma/client";
import multer from "multer";
import { z } from "zod";
import { prisma } from "./lib/prisma.js";
import { allowPublicRestaurantOrder } from "./lib/public-rate-limit.js";
import { isDevSubscriptionInvoicePayAllowed } from "./config/dev-billing.js";
import {
  changePassword,
  createBusinessUser,
  forgotPassword,
  listBusinessUsers,
  loginUser,
  registerBusinessOwner,
} from "./services/auth.service.js";
import { setBusinessMemberStatus } from "./services/membership-status.service.js";
import {
  buildAllBillingLedgerCsv,
  listAllBillingLedgerReport,
  listBusinessBillingLedgerReport,
} from "./services/billing-ledger-report.service.js";
import {
  changeSubscriptionPlan,
  createBusiness,
  formatMoney,
  getBusinessSubscription,
  getBusinessSubscriptionInvoiceDetail,
  listBusinessSubscriptionInvoices,
  listPlans,
  payInvoice,
  renewSubscription,
  startSubscription,
  updatePlanPricing,
} from "./services/subscription.service.js";
import {
  assignCorporateBusinessSettings,
  createCorporateBillingPlan,
  getCorporateEntitlementCatalog,
  listCorporateBusinesses,
  listCorporateBillingPlansForPlatform,
  updateCorporateBillingPlan,
} from "./services/corporate-billing.service.js";
import { createSubscriptionInvoiceCheckout } from "./services/subscription-invoice-checkout.service.js";
import {
  authorizeGuestSubscriptionInvoiceApsCheckout,
  authorizeSubscriptionInvoiceApsCheckout,
  completeGuestSubscriptionInvoiceApsCheckout,
  completeSubscriptionInvoiceApsCheckout,
} from "./services/subscription-aps-wallet-checkout.service.js";
import { processWaveSubscriptionWebhook } from "./services/wave-subscription-webhook.service.js";
import { processYonnaSubscriptionWebhook } from "./services/yonna-subscription-webhook.service.js";
import {
  createPaymentGateway,
  deletePaymentGateway,
  listPaymentGatewaysForPlatform,
  updatePaymentGateway,
} from "./services/payment-gateway.service.js";
import {
  addBusinessPaymentMethod,
  archiveBusinessPaymentMethod,
  listAddableGatewaysForBusiness,
  listBusinessPaymentMethods,
} from "./services/business-payment-method.service.js";
import {
  deleteBusinessGatewayCredential,
  listBusinessGatewayCredentialStatus,
  upsertBusinessGatewayCredential,
} from "./services/business-gateway-credential.service.js";
import {
  clearBusinessApsWalletCustomerAuth,
  clearPlatformApsWalletCustomerAuth,
  listBusinessApsWalletCustomerAuths,
  listPlatformApsWalletCustomerAuths,
} from "./services/aps-wallet-customer-auth.service.js";
import {
  createDiningTable,
  deleteDiningTable,
  listDiningTables,
  updateDiningTable,
} from "./services/dining-table.service.js";
import {
  createMenuCategory,
  deleteMenuCategory,
  listMenuCategoriesFlat,
  updateMenuCategory,
} from "./services/menu-category.service.js";
import {
  createProduct,
  getPublicBusinessMenu,
  getPublicProductById,
  listProductsForBusiness,
  listProductsForBusinessPaged,
  updateProduct,
} from "./services/product.service.js";
import {
  createRestaurantGuestOrder,
  getRestaurantGuestMenuPayload,
  type MenuTreeNode,
} from "./services/restaurant-public.service.js";
import {
  getBusinessNavigationMenu,
  getEffectiveEntitlementSlugs,
  getEntitlementSlugsForBusiness,
} from "./services/entitlement.service.js";
import { getDashboardSummaryForBusiness } from "./services/dashboard-summary.service.js";
import {
  getPlanCatalogGrouped,
  getUserSystemProductIdsForBusiness,
  setUserSystemProductIdsForBusiness,
} from "./services/business-user-access.service.js";
import {
  createSystemProduct,
  createSystemService,
  deleteSystemProduct,
  deleteSystemService,
  getPlanEntitlementsDetail,
  listSystemProducts,
  listSystemServices,
  setPlanEntitlements,
  updateSystemProduct,
  updateSystemService,
} from "./services/system-catalog.service.js";
import {
  clampPage,
  clampPageSize,
  getPlatformBusinessDetail,
  getPlatformInvoiceDetail,
  getPlatformDashboardSummary,
  listPlatformBillingReview,
  listPlatformBusinessesPaginated,
  listPlatformInvoices,
  listPlatformSubscriptions,
  parseDateFilterDayEnd,
  parseDateFilterDayStart,
  patchSubscriptionInvoiceManualRefundReview,
  subscriptionDaysRemaining,
  utcTodayIsoDate,
} from "./services/platform-admin.service.js";
import {
  ACTIVITY_EVENT,
  appendActivityLog,
  listActivityLogsForBusiness,
  listActivityLogsForPlatform,
  listActivityLogsForPlatformTenants,
} from "./services/activity-log.service.js";
import {
  authorizeGuestSalesInvoiceApsWalletCheckout,
  authorizeOrderApsWalletCheckout,
  completeGuestSalesInvoiceApsWalletCheckout,
  completeOrderApsWalletCheckout,
} from "./services/order-aps-wallet-checkout.service.js";
import { listOrderCheckoutWallets } from "./services/order-wallet-checkout.service.js";
import {
  cancelPendingOrder,
  completeCashPayment,
  completeWalletPaymentByPublicToken,
  completeWalletPaymentForOrder,
  createOrder,
  getOrderForBusiness,
  listOrdersForBusiness,
  getPublicPayInfo,
  getReceiptForBusiness,
  isSimulatorPublicPayEnabled,
  listPaymentsForBusiness,
  startWalletPayment,
  verifySimulatorWebhookSecret,
} from "./services/sale.service.js";
import {
  getAccountStatementsReports,
  getGlBalanceReport,
  getProfitLossReport,
  listChartAccountsForReports,
} from "./services/accounting-reports.service.js";
import {
  getPlatformAccountStatementsReports,
  getPlatformGlBalanceReport,
  getPlatformProfitLossReport,
  listPlatformChartAccountsForReports,
} from "./services/platform-accounting-reports.service.js";
import {
  createPlatformChartAccount,
  deletePlatformChartAccount,
  listPlatformChartAccounts,
  updatePlatformChartAccount,
} from "./services/platform-chart-of-accounts.service.js";
import {
  getPlatformJournalEntryForReversalDetail,
  reversePlatformJournalEntry,
} from "./services/platform-journal-reversal.service.js";
import { createPlatformManualJournal, listPlatformJournalEntries } from "./services/platform-journal.service.js";
import { getAccountingSummaryForBusiness } from "./services/accounting-summary.service.js";
import {
  createBusinessContact,
  listBusinessContacts,
} from "./services/business-contact.service.js";
import { createChartOfAccountForBusiness } from "./services/chart-of-accounts.service.js";
import {
  getJournalEntryForReversalDetail,
  listJournalEntriesPaginated,
  utcDayBoundsFromYmd,
  reverseJournalEntry,
} from "./services/journal-reversal.service.js";
import {
  approveMerchantJournalEntry,
  approveMerchantJournalEntryForBusiness,
  cancelMerchantJournalEntry,
  cancelMerchantJournalEntryForBusiness,
  getMerchantJournalEntryForBusiness,
  getMerchantJournalEntryForPlatform,
  listMerchantJournalEntriesForBusiness,
  listMerchantJournalEntriesForPlatform,
} from "./services/merchant-transaction-journal.service.js";
import {
  postManualBankTransfer,
  postManualGeneralJournal,
  postManualMoneyIn,
  postManualMoneyOut,
} from "./services/manual-journal.service.js";
import {
  formatBillApi,
  formatPlatformBillApi,
  formatSalesInvoiceApi,
  formatSalesQuotationApi,
} from "./services/sales-document-api-format.js";
import {
  acceptSalesQuotation,
  createSalesQuotation,
  getSalesQuotationById,
  listSalesQuotations,
  rejectSalesQuotation,
  sendSalesQuotation,
  updateSalesQuotationDraft,
} from "./services/sales-quotation.service.js";
import {
  approveBill,
  createBill,
  getBillById,
  listBills,
  markBillPaid,
  updateBillDraft,
  voidBill,
} from "./services/bill.service.js";
import {
  approveSalesInvoice,
  createSalesInvoice,
  getSalesInvoiceById,
  listSalesInvoices,
  markSalesInvoicePaid,
  updateSalesInvoiceDraft,
  voidSalesInvoice,
} from "./services/sales-invoice.service.js";
import {
  getGuestInvoiceByToken,
  getGuestQuotationByToken,
  guestRespondQuotation,
  listGuestInvoiceWallets,
  startGuestInvoiceWalletCheckout,
} from "./services/sales-public.service.js";
import {
  getGuestPlatformBillPayload,
  renderGuestPlatformBillPdf,
} from "./services/platform-bill-guest-public.service.js";
import {
  getGuestSubscriptionInvoiceByToken,
  listGuestSubscriptionInvoiceWallets,
  renderGuestSubscriptionInvoicePdf,
  startGuestSubscriptionInvoiceWalletCheckout,
} from "./services/subscription-guest-public.service.js";
import {
  approvePlatformBill,
  createPlatformBill,
  createPlatformSupplier,
  getPlatformBillById,
  listPlatformBills,
  listPlatformSuppliers,
  markPlatformBillPaid,
  updatePlatformBillDraft,
  voidPlatformBill,
} from "./services/platform-bill.service.js";
import { renderBillPdfDownload } from "./services/bill-document-pdf.service.js";
import { renderPlatformBillPdfDownload } from "./services/platform-bill-document-pdf.service.js";
import { guestSubscriptionInvoiceUrl } from "./lib/public-guest-urls.js";
import {
  renderSalesInvoicePdfDownload,
  renderSalesQuotationPdfDownload,
} from "./services/sales-document-pdf.service.js";
import {
  OrderStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  type OrderStatusType,
  type PaymentMethodType,
  type PaymentProviderType,
  type PaymentStatusType,
} from "./lib/prisma-sales-enums.js";
import {
  createFunctionGroup,
  createPlatformStaffUser,
  createRoleTemplate,
  deleteFunctionGroup,
  deleteRoleTemplate,
  listFunctionGroups,
  listFunctionGroupsPaginated,
  listPlatformModules,
  listPlatformStaffUsersPaginated,
  listRoleTemplateSummaries,
  listRoleTemplatesPaginated,
  setRoleTemplatePermissions,
  bulkMovePlatformStaffUsers,
  updateFunctionGroup,
  updatePlatformStaffUser,
  updateRoleTemplate,
} from "./services/platform-security.service.js";
import { getPaymentWebhookEndpoints } from "./config/app-public-url.js";
import { env } from "./config/env.js";
import { PLATFORM_MODULE_SLUGS } from "./config/platform-modules.js";
import { HttpError } from "./lib/http-error.js";
import { billingPeriodToUtcRange } from "./utils/billing-ledger-period.js";
import { isCorporateIndustry } from "./utils/corporate-industry.js";
import {
  authenticateToken,
  generateToken,
  optionalAuthenticateToken,
  requirePlatformAccess,
  requirePlatformAccessAny,
  requirePlatformOperator,
} from "./middleware/jwt.js";
import {
  requireAnyEntitlement,
  requireBusinessOwnerOnly,
  requireBusinessOwnerOrPlatform,
  requireEntitlement,
  requireMerchantApiGatewayAccess,
  requireBillingOrMerchantApiOrPlatform,
  requireSubscriptionsBillingOrPlatform,
  requireSubscriptionsInvoicesOrPlatform,
} from "./middleware/auth.js";
import { httpRequestLogger } from "./middleware/http-logger.js";

const app = express();
// Behind nginx/PM2 the inbound connection is often HTTP; use X-Forwarded-Proto so
// absolute URLs (e.g. product image uploads) use https:// on the live site.
app.set("trust proxy", 1);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, "../uploads");
const productUploadsDir = path.join(uploadsRoot, "products");
fs.mkdirSync(productUploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, productUploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const safeExt = ext && /^[.][a-z0-9]{1,8}$/.test(ext) ? ext : ".jpg";
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`);
    },
  }),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
      return;
    }
    cb(new HttpError(400, "Only image uploads are allowed."));
  },
});

// Middleware — allowed browser origins and JWT secret come only from environment (see .env.example)
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  }),
);

app.post(
  "/api/webhooks/wave",
  express.raw({ type: "application/json", limit: "512kb" }),
  async (request, response, next) => {
    try {
      const signatureHeader =
        (request.headers["wave-signature"] as string) ||
        (request.headers["Wave-Signature"] as string) ||
        "";
      const raw = Buffer.isBuffer(request.body)
        ? request.body.toString("utf8")
        : String(request.body ?? "");
      await processWaveSubscriptionWebhook(raw, signatureHeader);
      response.status(200).json({ ok: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message === "Invalid signature" ||
        message === "Missing signature or body" ||
        message === "Invalid JSON body"
      ) {
        response.status(400).json({ error: message });
        return;
      }
      if (message === "WAVE_WEBHOOK_SECRET not configured") {
        response.status(500).json({ error: message });
        return;
      }
      console.error("Wave webhook:", error);
      next(error);
    }
  },
);

app.post(
  "/api/webhooks/yonna-forex",
  express.json({ type: "application/json", limit: "512kb" }),
  async (request, response, next) => {
    try {
      const signatureHeader =
        (request.headers["x-yonna-signature"] as string) ||
        (request.headers["X-Yonna-Signature"] as string) ||
        undefined;
      await processYonnaSubscriptionWebhook(request.body, signatureHeader);
      response.status(200).json({ ok: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "Invalid Yonna webhook signature" || message === "Missing appTransactionId or status") {
        response.status(400).json({ error: message });
        return;
      }
      console.error("Yonna Forex webhook:", error);
      next(error);
    }
  },
);

app.use(express.json());
app.use(httpRequestLogger);
app.use("/uploads", express.static(uploadsRoot));

const createBusinessSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  industry: z.string().min(2).optional(),
  ownerName: z.string().min(2),
  ownerEmail: z.string().email(),
});

const registerSchema = z.object({
  ownerName: z.string().min(2),
  ownerEmail: z.string().email(),
  businessName: z.string().min(2),
  slug: z.string().min(2).optional(),
  industry: z.string().min(2).optional(),
  planCode: z.nativeEnum(PlanCode),
  billingInterval: z.nativeEnum(BillingInterval).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  email: z.string().email(),
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const createBusinessUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MERCHANT', 'CASHIER']).default('CASHIER'),
});

const createSubscriptionSchema = z.object({
  planCode: z.nativeEnum(PlanCode),
  billingInterval: z.nativeEnum(BillingInterval).optional(),
});

const createOrderBodySchema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().int().positive(),
      }),
    )
    .min(1),
  /** Staff POS: optional dining table for manual table service orders. */
  diningTableId: z.string().min(1).optional(),
});

const simulatorWebhookBodySchema = z.object({
  publicToken: z.string().min(1),
  externalEventId: z.string().min(1).optional(),
});

const createProductSchema = z
  .object({
    name: z.string().min(1),
    category: z.string().min(1).optional(),
    menuCategoryId: z.string().min(1).optional(),
    description: z.string().optional(),
    price: z.coerce.number().positive(),
    stock: z.coerce.number().int().min(0),
    barcodeValue: z.string().optional(),
    qrUrl: z.string().url().optional(),
    imageUrl: z.string().url().max(2048).optional(),
    imageColor: z.string().optional(),
    imageEmoji: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const hasMenu = Boolean(data.menuCategoryId?.trim());
    const hasCat = Boolean(data.category?.trim());
    if (!hasMenu && !hasCat) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide menuCategoryId for all catalog products, or legacy category text only for old integrations.",
        path: ["category"],
      });
    }
  });

const updateProductSchema = z
  .object({
    name: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    menuCategoryId: z.union([z.string().min(1), z.null()]).optional(),
    description: z.union([z.string(), z.null()]).optional(),
    price: z.coerce.number().positive().optional(),
    stock: z.coerce.number().int().min(0).optional(),
    imageUrl: z.union([z.string().url().max(2048), z.null()]).optional(),
    imageColor: z.string().optional(),
    imageEmoji: z.string().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "At least one field is required." });

const diningTableCreateSchema = z.object({
  label: z.string().min(1),
  publicToken: z.string().min(4).max(64).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  sortOrder: z.coerce.number().int().optional(),
});

const diningTablePatchSchema = z
  .object({
    label: z.string().min(1).optional(),
    publicToken: z.string().min(4).max(64).regex(/^[a-zA-Z0-9_-]+$/).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.coerce.number().int().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "At least one field is required." });

const menuCategoryCreateSchema = z.object({
  name: z.string().min(1),
  parentId: z.union([z.string().min(1), z.null()]).optional(),
  sortOrder: z.coerce.number().int().optional(),
});

const menuCategoryPatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    parentId: z.union([z.string().min(1), z.null()]).optional(),
    sortOrder: z.coerce.number().int().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "At least one field is required." });

const systemServiceBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

const systemProductBodySchema = z.object({
  serviceId: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

const planEntitlementsBodySchema = z.object({
  systemProductIds: z.array(z.string().min(1)),
});

const planPricingBodySchema = z
  .object({
    monthlyPrice: z.coerce.number().positive().max(99_999_999.99).optional(),
    yearlyPrice: z.coerce.number().positive().max(99_999_999.99).optional(),
  })
  .refine((b) => b.monthlyPrice !== undefined || b.yearlyPrice !== undefined, {
    message: "Provide at least one of monthlyPrice or yearlyPrice.",
  });

const corporateBillingPlanBodySchema = z.object({
  name: z.string().min(2),
  monthlyPrice: z.coerce.number().positive().max(99_999_999.99),
  quarterlyPrice: z.coerce.number().min(0).max(99_999_999.99).optional(),
  halfYearlyPrice: z.coerce.number().min(0).max(99_999_999.99).optional(),
  yearlyPrice: z.coerce.number().positive().max(99_999_999.99),
  twoYearPrice: z.coerce.number().min(0).max(99_999_999.99).optional(),
  contractPrice: z.coerce.number().min(0).max(99_999_999.99).optional(),
  sortOrder: z.coerce.number().int().optional(),
});

const corporateBillingPlanPatchSchema = z.object({
  name: z.string().min(2).optional(),
  monthlyPrice: z.coerce.number().positive().max(99_999_999.99).optional(),
  quarterlyPrice: z.coerce.number().min(0).max(99_999_999.99).optional(),
  halfYearlyPrice: z.coerce.number().min(0).max(99_999_999.99).optional(),
  yearlyPrice: z.coerce.number().positive().max(99_999_999.99).optional(),
  twoYearPrice: z.coerce.number().min(0).max(99_999_999.99).optional(),
  contractPrice: z.coerce.number().min(0).max(99_999_999.99).optional(),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

const assignCorporateBusinessBodySchema = z.object({
  corporateBillingPlanId: z.string().min(1),
  billingInterval: z.nativeEnum(BillingInterval),
  corporateEntitlementSystemProductIds: z.array(z.string().min(1)).optional(),
});

const platformSecurityPermissionRowSchema = z.object({
  moduleId: z.string().min(1),
  canView: z.boolean(),
  canCreate: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  canExport: z.boolean(),
});

const platformRoleTemplateBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
});

const platformRoleTemplatePatchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
});

const platformRoleTemplatePermissionsBodySchema = z.object({
  permissions: z.array(platformSecurityPermissionRowSchema),
});

const platformFunctionGroupBodySchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional().nullable(),
    roleTemplateId: z.string().min(1).optional(),
    roleTemplateIds: z.array(z.string().min(1)).optional(),
  })
  .transform((data) => {
    const roleTemplateIds =
      data.roleTemplateIds && data.roleTemplateIds.length > 0
        ? data.roleTemplateIds
        : data.roleTemplateId
          ? [data.roleTemplateId]
          : [];
    return {
      name: data.name,
      description: data.description,
      roleTemplateIds,
    };
  })
  .refine((data) => data.roleTemplateIds.length > 0, {
    message: "At least one role template is required.",
  });

const platformFunctionGroupPatchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  roleTemplateIds: z.array(z.string().min(1)).optional(),
});

const platformStaffUserBodySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  platformFunctionGroupId: z.string().min(1),
});

const platformStaffUserPatchSchema = z.object({
  platformFunctionGroupId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

const platformBulkMoveStaffSchema = z.object({
  fromGroupId: z.string().min(1),
  toGroupId: z.string().min(1),
  userIds: z.array(z.string().min(1)).optional(),
});

const userPlanAccessBodySchema = z.object({
  systemProductIds: z.array(z.string()),
});

const membershipStatusPatchSchema = z.object({
  status: z.nativeEnum(BusinessMembershipStatus),
});

const paymentGatewayPatchSchema = z.object({
  isEnabled: z.boolean().optional(),
  name: z.string().min(1).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  sortOrder: z.coerce.number().int().optional(),
  checkoutAdapter: z.union([z.string().min(1), z.literal(""), z.null()]).optional(),
});

const paymentGatewayCreateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.union([z.string(), z.null()]).optional(),
  sortOrder: z.coerce.number().int().optional(),
  isEnabled: z.boolean().optional(),
  checkoutAdapter: z.union([z.string().min(1), z.literal(""), z.null()]).optional(),
});

const changeSubscriptionPlanBodySchema = z.object({
  planCode: z.nativeEnum(PlanCode),
  billingInterval: z.nativeEnum(BillingInterval).optional(),
});

const subscriptionCheckoutBodySchema = z.object({
  gatewayCode: z.string().min(1),
  restrictPayerMobile: z.string().optional(),
  payerPhone: z.string().optional(),
});

const apsWalletAuthorizeBodySchema = z.object({
  gatewayCode: z.string().min(1),
  payerMobile: z.string().min(1),
});

const apsWalletCompleteBodySchema = z.object({
  gatewayCode: z.string().min(1),
  /** Omit or empty when checkout used stored APS customer authorization (no OTP step). */
  otp: z.string().optional(),
  authState: z.string().min(1),
});

const addBusinessPaymentMethodBodySchema = z.object({
  gatewayCode: z.string().min(1),
  label: z.string().min(1),
  isDefault: z.boolean().optional(),
});

const putBusinessGatewayCredentialBodySchema = z.object({
  gatewayCode: z.string().min(1),
  secrets: z.unknown(),
  replaceSecrets: z.boolean().optional(),
});
const apsWalletCustomerAuthQuerySchema = z.object({
  gatewayCode: z.string().optional(),
  businessId: z.string().optional(),
});

const orderWalletPaymentBodySchema = z.object({
  gatewayCode: z.string().min(1).optional(),
  payerPhone: z.string().optional(),
});

const guestQuotationRespondBodySchema = z.object({
  action: z.enum(["accept", "reject"]),
});

const platformPaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

const platformSubscriptionsQuerySchema = z.object({
  status: z.nativeEnum(SubscriptionStatus).optional(),
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

const platformInvoicesQuerySchema = z.object({
  status: z.nativeEnum(InvoiceStatus).optional(),
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

const billingLedgerReportBaseSchema = z.object({
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  quarter: z.string().regex(/^\d{4}-Q[1-4]$/i).optional(),
  year: z.string().regex(/^\d{4}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** Tag merchant journals posted by platform staff without a business membership (on behalf of the merchant). */
function postedByPlatformUserIdForMerchantJournal(
  user: { id: string; isPlatformOwner?: boolean; role: string },
  hasMembership: boolean,
): string | null {
  if (hasMembership) return null;
  if (user.isPlatformOwner || user.role === UserRole.PLATFORM_ADMIN) {
    return user.id;
  }
  return null;
}

function refineBillingLedgerPeriodExclusive(
  val: z.infer<typeof billingLedgerReportBaseSchema>,
  ctx: z.RefinementCtx,
) {
  const n = [val.month, val.quarter, val.year].filter((x) => x?.trim()).length;
  if (n > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Use only one of month, quarter, or year.",
      path: ["month"],
    });
  }
}

const billingLedgerReportQuerySchema =
  billingLedgerReportBaseSchema.superRefine(refineBillingLedgerPeriodExclusive);

const platformBillingLedgerReportQuerySchema =
  billingLedgerReportBaseSchema.superRefine(refineBillingLedgerPeriodExclusive);

const platformBillingReviewQuerySchema = z.object({
  invoiceStatus: z.nativeEnum(InvoiceStatus).optional(),
  refundReviewStatus: z.nativeEnum(ManualRefundReviewStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const patchManualRefundReviewBodySchema = z.object({
  manualRefundReviewStatus: z.nativeEnum(ManualRefundReviewStatus),
  manualRefundNote: z.string().max(4000).optional().nullable(),
  /** Required when approving a refund (YYYY-MM-DD). */
  refundExpectedBy: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  refundAmountMode: z.enum(["FULL", "PARTIAL"]).optional(),
  refundPartialAmount: z.coerce.number().positive().optional(),
});

const platformBusinessDetailQuerySchema = z.object({
  membershipsPage: z.coerce.number().int().min(1).default(1),
  membershipsPageSize: z.coerce.number().int().min(1).max(100).default(10),
  subscriptionsPage: z.coerce.number().int().min(1).default(1),
  subscriptionsPageSize: z.coerce.number().int().min(1).max(100).default(10),
});

// Platform Owner Routes
app.get(
  "/api/platform/dashboard-summary",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny([
    { moduleSlug: PLATFORM_MODULE_SLUGS.DASHBOARD, action: "view" },
    { moduleSlug: PLATFORM_MODULE_SLUGS.BUSINESSES, action: "view" },
  ]),
  async (_req, res, next) => {
    try {
      const data = await getPlatformDashboardSummary();
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/platform/businesses",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.BUSINESSES, "view"),
  async (req, res, next) => {
  try {
    const query = platformPaginationQuerySchema.parse(req.query);
    const page = clampPage(query.page);
    const pageSize = clampPageSize(query.pageSize);
    const { rows, total } = await listPlatformBusinessesPaginated({ page, pageSize });
    res.json({
      data: rows,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    next(error);
  }
});

app.get(
  "/api/platform/businesses/:businessId",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.BUSINESSES, "view"),
  async (req, res, next) => {
    try {
      const q = platformBusinessDetailQuerySchema.parse(req.query);
      const business = await getPlatformBusinessDetail(req.params.businessId as string, {
        membershipsPage: clampPage(q.membershipsPage),
        membershipsPageSize: clampPageSize(q.membershipsPageSize),
        subscriptionsPage: clampPage(q.subscriptionsPage),
        subscriptionsPageSize: clampPageSize(q.subscriptionsPageSize),
      });
      const { subscriptions, memberships, membershipsTotal, subscriptionsTotal, ...rest } =
        business;
      res.json({
        data: {
          ...rest,
          createdAt: rest.createdAt.toISOString(),
          updatedAt: rest.updatedAt.toISOString(),
          membershipsTotal,
          subscriptionsTotal,
          membershipsPage: clampPage(q.membershipsPage),
          membershipsPageSize: clampPageSize(q.membershipsPageSize),
          subscriptionsPage: clampPage(q.subscriptionsPage),
          subscriptionsPageSize: clampPageSize(q.subscriptionsPageSize),
          memberships: memberships.map((m) => ({
            id: m.id,
            userId: m.userId,
            businessId: m.businessId,
            isOwner: m.isOwner,
            status: m.status,
            createdAt: m.createdAt.toISOString(),
            updatedAt: m.updatedAt.toISOString(),
            user: {
              ...m.user,
              createdAt: m.user.createdAt.toISOString(),
            },
          })),
          subscriptions: subscriptions.map((s) => formatSubscriptionResponse(s)),
          _count: business._count,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/platform/subscriptions",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SUBSCRIPTIONS, "view"),
  async (req, res, next) => {
    try {
      const query = platformSubscriptionsQuerySchema.parse(req.query);
      const fromRaw = query.createdFrom?.trim();
      const toRaw = query.createdTo?.trim();
      let createdFrom = parseDateFilterDayStart(fromRaw);
      let createdTo = parseDateFilterDayEnd(toRaw);
      if (!fromRaw && !toRaw) {
        const t = utcTodayIsoDate();
        createdFrom = parseDateFilterDayStart(t);
        createdTo = parseDateFilterDayEnd(t);
      }
      const page = clampPage(query.page);
      const pageSize = clampPageSize(query.pageSize);
      const { rows, total } = await listPlatformSubscriptions(
        {
          status: query.status,
          createdFrom,
          createdTo,
        },
        { page, pageSize },
      );
      res.json({
        data: rows.map((row) => {
          const { business, ...subWithPlan } = row;
          const formatted = formatSubscriptionResponse(subWithPlan);
          return {
            ...formatted,
            createdAt: row.createdAt.toISOString(),
            startDate: row.startDate.toISOString(),
            currentPeriodStart: row.currentPeriodStart.toISOString(),
            currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
            cancelledAt: row.cancelledAt?.toISOString() ?? null,
            endedAt: row.endedAt?.toISOString() ?? null,
            updatedAt: row.updatedAt.toISOString(),
            business: {
              id: business.id,
              name: business.name,
              slug: business.slug,
              ownerName: business.ownerName,
              ownerEmail: business.ownerEmail,
            },
          };
        }),
        total,
        page,
        pageSize,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/platform/invoices",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.INVOICES, "view"),
  async (req, res, next) => {
  try {
    const query = platformInvoicesQuerySchema.parse(req.query);
    const fromRaw = query.createdFrom?.trim();
    const toRaw = query.createdTo?.trim();
    let createdFrom = parseDateFilterDayStart(fromRaw);
    let createdTo = parseDateFilterDayEnd(toRaw);
    if (!fromRaw && !toRaw) {
      const t = utcTodayIsoDate();
      createdFrom = parseDateFilterDayStart(t);
      createdTo = parseDateFilterDayEnd(t);
    }
    const page = clampPage(query.page);
    const pageSize = clampPageSize(query.pageSize);
    const { rows, total } = await listPlatformInvoices(
      {
        status: query.status,
        createdFrom,
        createdTo,
      },
      { page, pageSize },
    );
    res.json({
      data: rows.map((inv) => ({
        id: inv.id,
        businessId: inv.businessId,
        subscriptionId: inv.subscriptionId,
        planId: inv.planId,
        amount: formatMoney(inv.amount),
        currency: inv.currency,
        status: inv.status,
        billingPeriodStart: inv.billingPeriodStart.toISOString(),
        billingPeriodEnd: inv.billingPeriodEnd.toISOString(),
        dueDate: inv.dueDate.toISOString(),
        paidAt: inv.paidAt?.toISOString() ?? null,
        externalReference: inv.externalReference,
        createdAt: inv.createdAt.toISOString(),
        updatedAt: inv.updatedAt.toISOString(),
        business: {
          id: inv.business.id,
          name: inv.business.name,
          slug: inv.business.slug,
          ownerName: inv.business.ownerName,
          ownerEmail: inv.business.ownerEmail,
        },
        plan: {
          id: inv.plan.id,
          code: inv.plan.code,
          name: inv.plan.name,
          monthlyPrice: formatMoney(inv.plan.monthlyPrice),
          currency: inv.plan.currency,
        },
      })),
      total,
      page,
      pageSize,
    });
  } catch (error) {
    next(error);
  }
});

app.get(
  "/api/platform/invoices/:invoiceId",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.INVOICES, "view"),
  async (req, res, next) => {
    try {
      const inv = await getPlatformInvoiceDetail(req.params.invoiceId as string);
      res.json({
        data: {
          id: inv.id,
          businessId: inv.businessId,
          subscriptionId: inv.subscriptionId,
          planId: inv.planId,
          amount: formatMoney(inv.amount),
          currency: inv.currency,
          status: inv.status,
          billingPeriodStart: inv.billingPeriodStart.toISOString(),
          billingPeriodEnd: inv.billingPeriodEnd.toISOString(),
          dueDate: inv.dueDate.toISOString(),
          paidAt: inv.paidAt?.toISOString() ?? null,
          externalReference: inv.externalReference,
          createdAt: inv.createdAt.toISOString(),
          updatedAt: inv.updatedAt.toISOString(),
          business: {
            id: inv.business.id,
            name: inv.business.name,
            slug: inv.business.slug,
            industry: inv.business.industry,
            ownerName: inv.business.ownerName,
            ownerEmail: inv.business.ownerEmail,
            createdAt: inv.business.createdAt.toISOString(),
          },
          plan: {
            id: inv.plan.id,
            code: inv.plan.code,
            name: inv.plan.name,
            description: inv.plan.description,
            monthlyPrice: formatMoney(inv.plan.monthlyPrice),
            currency: inv.plan.currency,
            staffLimit: inv.plan.staffLimit,
          },
          subscription: {
            id: inv.subscription.id,
            status: inv.subscription.status,
            startDate: inv.subscription.startDate.toISOString(),
            currentPeriodStart: inv.subscription.currentPeriodStart.toISOString(),
            currentPeriodEnd: inv.subscription.currentPeriodEnd?.toISOString() ?? null,
            createdAt: inv.subscription.createdAt.toISOString(),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/platform/billing-review",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.BILLING_REVIEW, "view"),
  async (req, res, next) => {
    try {
      const query = platformBillingReviewQuerySchema.parse(req.query);
      const page = clampPage(query.page);
      const pageSize = clampPageSize(query.pageSize);
      const { rows, total } = await listPlatformBillingReview(
        {
          invoiceStatus: query.invoiceStatus,
          refundReviewStatus: query.refundReviewStatus,
        },
        { page, pageSize },
      );
      res.json({
        data: rows.map((inv) => {
          const ledger = inv.ledgerEntries[0];
          const periodEnd = inv.subscription.currentPeriodEnd;
          return {
            invoice: {
              id: inv.id,
              businessId: inv.businessId,
              subscriptionId: inv.subscriptionId,
              planId: inv.planId,
              amount: formatMoney(inv.amount),
              currency: inv.currency,
              status: inv.status,
              billingPeriodStart: inv.billingPeriodStart.toISOString(),
              billingPeriodEnd: inv.billingPeriodEnd.toISOString(),
              dueDate: inv.dueDate.toISOString(),
              paidAt: inv.paidAt?.toISOString() ?? null,
              externalReference: inv.externalReference,
              createdAt: inv.createdAt.toISOString(),
            },
            business: {
              id: inv.business.id,
              name: inv.business.name,
              slug: inv.business.slug,
              ownerName: inv.business.ownerName,
              ownerEmail: inv.business.ownerEmail,
            },
            plan: {
              id: inv.plan.id,
              code: inv.plan.code,
              name: inv.plan.name,
            },
            subscription: {
              id: inv.subscription.id,
              status: inv.subscription.status,
              contractPerpetual: inv.subscription.contractPerpetual,
              currentPeriodEnd: periodEnd?.toISOString() ?? null,
              daysRemaining: periodEnd ? subscriptionDaysRemaining(periodEnd) : null,
            },
            paymentTransaction: ledger
              ? {
                  id: ledger.id,
                  provider: ledger.provider,
                  amount: formatMoney(ledger.amount),
                  currency: ledger.currency,
                  providerPaymentRef: ledger.providerPaymentRef,
                  succeededAt: ledger.succeededAt?.toISOString() ?? null,
                }
              : null,
            manualRefundReview: {
              status: inv.manualRefundReviewStatus,
              note: inv.manualRefundNote,
              reviewedAt: inv.manualRefundReviewedAt?.toISOString() ?? null,
              reviewedBy: inv.manualRefundReviewedBy
                ? {
                    id: inv.manualRefundReviewedBy.id,
                    name: inv.manualRefundReviewedBy.name,
                    email: inv.manualRefundReviewedBy.email,
                  }
                : null,
              expectedRefundBy: inv.manualRefundExpectedBy?.toISOString() ?? null,
              approvedRefundAmount:
                inv.manualRefundApprovedAmount != null ? formatMoney(inv.manualRefundApprovedAmount) : null,
            },
          };
        }),
        total,
        page,
        pageSize,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.patch(
  "/api/platform/billing-review/invoices/:invoiceId",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.BILLING_REVIEW, "edit"),
  async (req, res, next) => {
    try {
      const body = patchManualRefundReviewBodySchema.parse(req.body ?? {});
      const updated = await patchSubscriptionInvoiceManualRefundReview({
        invoiceId: req.params.invoiceId as string,
        actorUserId: req.user!.id,
        status: body.manualRefundReviewStatus,
        note: body.manualRefundNote,
        refundExpectedBy: body.refundExpectedBy ?? null,
        refundAmountMode: body.refundAmountMode,
        refundPartialAmount: body.refundPartialAmount,
      });
      const ledger = updated.ledgerEntries[0];
      const periodEnd = updated.subscription.currentPeriodEnd;
      res.json({
        data: {
          invoice: {
            id: updated.id,
            status: updated.status,
            manualRefundReviewStatus: updated.manualRefundReviewStatus,
            manualRefundNote: updated.manualRefundNote,
            manualRefundReviewedAt: updated.manualRefundReviewedAt?.toISOString() ?? null,
            manualRefundExpectedBy: updated.manualRefundExpectedBy?.toISOString() ?? null,
            manualRefundApprovedAmount:
              updated.manualRefundApprovedAmount != null
                ? formatMoney(updated.manualRefundApprovedAmount)
                : null,
          },
          subscription: {
            contractPerpetual: updated.subscription.contractPerpetual,
            currentPeriodEnd: periodEnd?.toISOString() ?? null,
            daysRemaining: periodEnd ? subscriptionDaysRemaining(periodEnd) : null,
          },
          paymentTransaction: ledger
            ? {
                id: ledger.id,
                provider: ledger.provider,
                amount: formatMoney(ledger.amount),
                succeededAt: ledger.succeededAt?.toISOString() ?? null,
              }
            : null,
          reviewedBy: updated.manualRefundReviewedBy,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/subscription-invoices",
  authenticateToken,
  requireSubscriptionsInvoicesOrPlatform(),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: req.user!.id, businessId: businessId as string },
      });
      if (!membership && !req.user?.isPlatformOwner && req.user?.role !== "PLATFORM_ADMIN") {
        throw new HttpError(403, "Access denied to this business");
      }
      const query = platformInvoicesQuerySchema.parse(req.query);
      const fromRaw = query.createdFrom?.trim();
      const toRaw = query.createdTo?.trim();
      let createdFrom = parseDateFilterDayStart(fromRaw);
      let createdTo = parseDateFilterDayEnd(toRaw);
      if (!fromRaw && !toRaw) {
        const t = utcTodayIsoDate();
        createdFrom = parseDateFilterDayStart(t);
        createdTo = parseDateFilterDayEnd(t);
      }
      const page = clampPage(query.page);
      const pageSize = clampPageSize(query.pageSize);
      const { rows, total } = await listBusinessSubscriptionInvoices(
        businessId as string,
        {
          status: query.status,
          createdFrom,
          createdTo,
        },
        { page, pageSize },
      );
      res.json({
        data: rows.map((inv) => ({
          id: inv.id,
          businessId: inv.businessId,
          subscriptionId: inv.subscriptionId,
          planId: inv.planId,
          amount: formatMoney(inv.amount),
          currency: inv.currency,
          status: inv.status,
          billingPeriodStart: inv.billingPeriodStart.toISOString(),
          billingPeriodEnd: inv.billingPeriodEnd.toISOString(),
          dueDate: inv.dueDate.toISOString(),
          paidAt: inv.paidAt?.toISOString() ?? null,
          externalReference: inv.externalReference,
          createdAt: inv.createdAt.toISOString(),
          updatedAt: inv.updatedAt.toISOString(),
          plan: {
            id: inv.plan.id,
            code: inv.plan.code,
            name: inv.plan.name,
            monthlyPrice: formatMoney(inv.plan.monthlyPrice),
            currency: inv.plan.currency,
          },
        })),
        total,
        page,
        pageSize,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/billing-ledger-report",
  authenticateToken,
  requireSubscriptionsInvoicesOrPlatform(),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: req.user!.id, businessId: businessId as string },
      });
      if (!membership && !req.user?.isPlatformOwner && req.user?.role !== "PLATFORM_ADMIN") {
        throw new HttpError(403, "Access denied to this business");
      }
      const query = billingLedgerReportQuerySchema.parse(req.query);
      const period = billingPeriodToUtcRange({
        month: query.month,
        quarter: query.quarter,
        year: query.year,
      });
      if (!period) {
        throw new HttpError(
          400,
          "Choose a billing period: month (YYYY-MM), quarter (e.g. 2025-Q1), or year (YYYY).",
        );
      }
      const page = clampPage(query.page);
      const pageSize = clampPageSize(query.pageSize);
      const report = await listBusinessBillingLedgerReport(businessId as string, {
        createdFrom: period.from,
        createdTo: period.to,
        page,
        pageSize,
      });
      res.json({ data: report });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/platform/billing-ledger-report",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny([
    { moduleSlug: PLATFORM_MODULE_SLUGS.BILLING_TRANSACTIONS, action: "view" },
    { moduleSlug: PLATFORM_MODULE_SLUGS.INVOICES, action: "view" },
  ]),
  async (req, res, next) => {
    try {
      const query = platformBillingLedgerReportQuerySchema.parse(req.query);
      const period = billingPeriodToUtcRange({
        month: query.month,
        quarter: query.quarter,
        year: query.year,
      });
      let createdFrom: Date | null = null;
      let createdTo: Date | null = null;
      if (period) {
        createdFrom = period.from;
        createdTo = period.to;
      } else {
        const fromRaw = query.createdFrom?.trim();
        const toRaw = query.createdTo?.trim();
        createdFrom = fromRaw ? parseDateFilterDayStart(fromRaw) ?? null : null;
        createdTo = toRaw ? parseDateFilterDayEnd(toRaw) ?? null : null;
      }
      const page = clampPage(query.page);
      const pageSize = clampPageSize(query.pageSize);
      const report = await listAllBillingLedgerReport({
        createdFrom,
        createdTo,
        page,
        pageSize,
      });
      res.json({ data: report });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/platform/billing-ledger-report/export",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny([
    { moduleSlug: PLATFORM_MODULE_SLUGS.BILLING_TRANSACTIONS, action: "export" },
    { moduleSlug: PLATFORM_MODULE_SLUGS.INVOICES, action: "export" },
  ]),
  async (req, res, next) => {
    try {
      const query = platformBillingLedgerReportQuerySchema.parse(req.query);
      const period = billingPeriodToUtcRange({
        month: query.month,
        quarter: query.quarter,
        year: query.year,
      });
      let createdFrom: Date | null = null;
      let createdTo: Date | null = null;
      if (period) {
        createdFrom = period.from;
        createdTo = period.to;
      } else {
        const fromRaw = query.createdFrom?.trim();
        const toRaw = query.createdTo?.trim();
        createdFrom = fromRaw ? parseDateFilterDayStart(fromRaw) ?? null : null;
        createdTo = toRaw ? parseDateFilterDayEnd(toRaw) ?? null : null;
      }
      const { csv, rowCount, truncated } = await buildAllBillingLedgerCsv({
        createdFrom,
        createdTo,
      });
      const dayStamp = new Date().toISOString().slice(0, 10);
      const filename = `billing-transactions-${dayStamp}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      if (truncated) {
        res.setHeader("X-Export-Truncated", "true");
        res.setHeader("X-Export-Row-Count", String(rowCount));
      }
      res.send(csv);
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/subscription-invoices/:invoiceId",
  authenticateToken,
  requireSubscriptionsInvoicesOrPlatform(),
  async (req, res, next) => {
    try {
      const { businessId, invoiceId } = req.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: req.user!.id, businessId: businessId as string },
      });
      if (!membership && !req.user?.isPlatformOwner && req.user?.role !== "PLATFORM_ADMIN") {
        throw new HttpError(403, "Access denied to this business");
      }
      const inv = await getBusinessSubscriptionInvoiceDetail(businessId as string, invoiceId as string);
      res.json({
        data: {
          id: inv.id,
          businessId: inv.businessId,
          subscriptionId: inv.subscriptionId,
          planId: inv.planId,
          amount: formatMoney(inv.amount),
          currency: inv.currency,
          status: inv.status,
          billingPeriodStart: inv.billingPeriodStart.toISOString(),
          billingPeriodEnd: inv.billingPeriodEnd.toISOString(),
          dueDate: inv.dueDate.toISOString(),
          paidAt: inv.paidAt?.toISOString() ?? null,
          externalReference: inv.externalReference,
          createdAt: inv.createdAt.toISOString(),
          updatedAt: inv.updatedAt.toISOString(),
          business: {
            id: inv.business.id,
            name: inv.business.name,
            slug: inv.business.slug,
            industry: inv.business.industry,
            ownerName: inv.business.ownerName,
            ownerEmail: inv.business.ownerEmail,
            createdAt: inv.business.createdAt.toISOString(),
          },
          plan: {
            id: inv.plan.id,
            code: inv.plan.code,
            name: inv.plan.name,
            description: inv.plan.description,
            monthlyPrice: formatMoney(inv.plan.monthlyPrice),
            currency: inv.plan.currency,
            staffLimit: inv.plan.staffLimit,
          },
          subscription: {
            id: inv.subscription.id,
            status: inv.subscription.status,
            startDate: inv.subscription.startDate.toISOString(),
            currentPeriodStart: inv.subscription.currentPeriodStart.toISOString(),
            currentPeriodEnd: inv.subscription.currentPeriodEnd?.toISOString() ?? null,
            createdAt: inv.subscription.createdAt.toISOString(),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/platform/staff-users",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny([
    { moduleSlug: PLATFORM_MODULE_SLUGS.SECURITY_SYSTEM_USERS, action: "view" },
    { moduleSlug: PLATFORM_MODULE_SLUGS.SECURITY_MOVE_USERS, action: "view" },
  ]),
  async (req, res, next) => {
    try {
      const page = clampPage(Number(req.query.page));
      const pageSize = clampPageSize(Number(req.query.pageSize));
      const fg = req.query.functionGroupId;
      const functionGroupId =
        typeof fg === "string" && fg.trim().length > 0 ? fg.trim() : undefined;
      const { rows, total, page: p, pageSize: ps } = await listPlatformStaffUsersPaginated(
        page,
        pageSize,
        functionGroupId ? { platformFunctionGroupId: functionGroupId } : undefined,
      );
      res.json({
        data: rows.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          isActive: u.isActive,
          mustChangePassword: u.mustChangePassword,
          createdAt: u.createdAt.toISOString(),
          platformFunctionGroupId: u.platformFunctionGroupId,
          platformFunctionGroup: u.platformFunctionGroup,
        })),
        total,
        page: p,
        pageSize: ps,
      });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/system-services",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SYSTEM_CONFIGURATION, "view"),
  async (_req, res) => {
  const rows = await listSystemServices();
  res.json({
    data: rows.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      sortOrder: s.sortOrder,
      productCount: s._count.products,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
  });
});

app.post(
  "/api/platform/system-services",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SYSTEM_CONFIGURATION, "create"),
  async (req, res, next) => {
  try {
    const body = systemServiceBodySchema.parse(req.body);
    const created = await createSystemService(body);
    res.status(201).json({
      data: {
        id: created.id,
        name: created.name,
        description: created.description,
        sortOrder: created.sortOrder,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    next(e);
  }
});

app.patch(
  "/api/platform/system-services/:serviceId",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SYSTEM_CONFIGURATION, "edit"),
  async (req, res, next) => {
  try {
    const body = systemServiceBodySchema.partial().parse(req.body);
    const updated = await updateSystemService(req.params.serviceId as string, body);
    res.json({
      data: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        sortOrder: updated.sortOrder,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    next(e);
  }
});

app.delete(
  "/api/platform/system-services/:serviceId",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SYSTEM_CONFIGURATION, "delete"),
  async (req, res, next) => {
  try {
    await deleteSystemService(req.params.serviceId as string);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

app.get(
  "/api/platform/system-products",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SYSTEM_CONFIGURATION, "view"),
  async (req, res, next) => {
  try {
    const serviceId = typeof req.query.serviceId === "string" ? req.query.serviceId : undefined;
    const rows = await listSystemProducts(serviceId);
    res.json({
      data: rows.map((p) => ({
        id: p.id,
        serviceId: p.serviceId,
        serviceName: p.service.name,
        name: p.name,
        slug: p.slug,
        description: p.description,
        sortOrder: p.sortOrder,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
    });
  } catch (e) {
    next(e);
  }
});

app.post(
  "/api/platform/system-products",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SYSTEM_CONFIGURATION, "create"),
  async (req, res, next) => {
  try {
    const body = systemProductBodySchema.parse(req.body);
    const created = await createSystemProduct(body);
    res.status(201).json({
      data: {
        id: created.id,
        serviceId: created.serviceId,
        name: created.name,
        slug: created.slug,
        description: created.description,
        sortOrder: created.sortOrder,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    next(e);
  }
});

app.patch(
  "/api/platform/system-products/:productId",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SYSTEM_CONFIGURATION, "edit"),
  async (req, res, next) => {
  try {
    const body = systemProductBodySchema.partial().omit({ serviceId: true }).extend({
      serviceId: z.string().min(1).optional(),
    }).parse(req.body);
    const updated = await updateSystemProduct(req.params.productId as string, body);
    res.json({
      data: {
        id: updated.id,
        serviceId: updated.serviceId,
        name: updated.name,
        slug: updated.slug,
        description: updated.description,
        sortOrder: updated.sortOrder,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    next(e);
  }
});

app.delete(
  "/api/platform/system-products/:productId",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SYSTEM_CONFIGURATION, "delete"),
  async (req, res, next) => {
  try {
    await deleteSystemProduct(req.params.productId as string);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

app.get(
  "/api/platform/plans/:planCode/entitlements",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SYSTEM_CONFIGURATION, "view"),
  async (req, res, next) => {
  try {
    const planCode = z.nativeEnum(PlanCode).parse(req.params.planCode);
    const plan = await getPlanEntitlementsDetail(planCode);
    res.json({
      data: {
        planId: plan.id,
        planCode: plan.code,
        planName: plan.name,
        systemProductIds: plan.planSystemProducts.map((l) => l.systemProductId),
        items: plan.planSystemProducts.map((l) => ({
          id: l.systemProduct.id,
          serviceId: l.systemProduct.serviceId,
          serviceName: l.systemProduct.service.name,
          name: l.systemProduct.name,
          slug: l.systemProduct.slug,
        })),
      },
    });
  } catch (e) {
    next(e);
  }
});

app.put(
  "/api/platform/plans/:planCode/entitlements",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SYSTEM_CONFIGURATION, "edit"),
  async (req, res, next) => {
  try {
    const planCode = z.nativeEnum(PlanCode).parse(req.params.planCode);
    const body = planEntitlementsBodySchema.parse(req.body);
    const plan = await setPlanEntitlements(planCode, body.systemProductIds);
    res.json({
      data: {
        planId: plan.id,
        planCode: plan.code,
        planName: plan.name,
        systemProductIds: plan.planSystemProducts.map((l) => l.systemProductId),
        items: plan.planSystemProducts.map((l) => ({
          id: l.systemProduct.id,
          serviceId: l.systemProduct.serviceId,
          serviceName: l.systemProduct.service.name,
          name: l.systemProduct.name,
          slug: l.systemProduct.slug,
        })),
      },
    });
  } catch (e) {
    next(e);
  }
});

app.patch(
  "/api/platform/plans/:planCode/pricing",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.BILLING, "edit"),
  async (req, res, next) => {
    try {
      const planCode = z.nativeEnum(PlanCode).parse(req.params.planCode);
      const body = planPricingBodySchema.parse(req.body);
      const updated = await updatePlanPricing(planCode, {
        monthlyPrice: body.monthlyPrice,
        yearlyPrice: body.yearlyPrice,
      });
      res.json({
        data: {
          id: updated.id,
          code: updated.code,
          name: updated.name,
          monthlyPrice: formatMoney(updated.monthlyPrice),
          yearlyPrice: formatMoney(updated.yearlyPrice),
          description: updated.description,
          staffLimit: updated.staffLimit,
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/corporate-billing-plans",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.BILLING, "view"),
  async (_req, res, next) => {
    try {
      const rows = await listCorporateBillingPlansForPlatform();
      res.json({
        data: rows.map((r) => ({
          id: r.id,
          name: r.name,
          monthlyPrice: formatMoney(r.monthlyPrice),
          quarterlyPrice: formatMoney(r.quarterlyPrice),
          halfYearlyPrice: formatMoney(r.halfYearlyPrice),
          yearlyPrice: formatMoney(r.yearlyPrice),
          twoYearPrice: formatMoney(r.twoYearPrice),
          contractPrice: formatMoney(r.contractPrice),
          currency: r.currency,
          sortOrder: r.sortOrder,
          isActive: r.isActive,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/platform/corporate-billing-plans",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.BILLING, "edit"),
  async (req, res, next) => {
    try {
      const body = corporateBillingPlanBodySchema.parse(req.body);
      const created = await createCorporateBillingPlan(body);
      res.status(201).json({
        data: {
          id: created.id,
          name: created.name,
          monthlyPrice: formatMoney(created.monthlyPrice),
          quarterlyPrice: formatMoney(created.quarterlyPrice),
          halfYearlyPrice: formatMoney(created.halfYearlyPrice),
          yearlyPrice: formatMoney(created.yearlyPrice),
          twoYearPrice: formatMoney(created.twoYearPrice),
          contractPrice: formatMoney(created.contractPrice),
          currency: created.currency,
          sortOrder: created.sortOrder,
          isActive: created.isActive,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.patch(
  "/api/platform/corporate-billing-plans/:planId",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.BILLING, "edit"),
  async (req, res, next) => {
    try {
      const body = corporateBillingPlanPatchSchema.parse(req.body);
      const updated = await updateCorporateBillingPlan(req.params.planId as string, body);
      res.json({
        data: {
          id: updated.id,
          name: updated.name,
          monthlyPrice: formatMoney(updated.monthlyPrice),
          quarterlyPrice: formatMoney(updated.quarterlyPrice),
          halfYearlyPrice: formatMoney(updated.halfYearlyPrice),
          yearlyPrice: formatMoney(updated.yearlyPrice),
          twoYearPrice: formatMoney(updated.twoYearPrice),
          contractPrice: formatMoney(updated.contractPrice),
          currency: updated.currency,
          sortOrder: updated.sortOrder,
          isActive: updated.isActive,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/corporate-businesses",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.BUSINESSES, "view"),
  async (_req, res, next) => {
    try {
      const rows = await listCorporateBusinesses();
      res.json({
        data: rows.map((b) => {
          const sub = b.subscriptions[0];
          return {
            id: b.id,
            name: b.name,
            slug: b.slug,
            industry: b.industry,
            ownerName: b.ownerName,
            ownerEmail: b.ownerEmail,
            createdAt: b.createdAt.toISOString(),
            corporateBillingPlanId: b.corporateBillingPlanId,
            corporateBillingInterval: b.corporateBillingInterval,
            corporateEntitlementSystemProductIds: b.corporateEntitlementSystemProductIds,
            corporateBillingPlan: b.corporateBillingPlan
              ? {
                  id: b.corporateBillingPlan.id,
                  name: b.corporateBillingPlan.name,
                  monthlyPrice: formatMoney(b.corporateBillingPlan.monthlyPrice),
                  yearlyPrice: formatMoney(b.corporateBillingPlan.yearlyPrice),
                  currency: b.corporateBillingPlan.currency,
                }
              : null,
            currentSubscription: sub
              ? {
                  id: sub.id,
                  status: sub.status,
                  billingInterval: sub.billingInterval,
                  planCode: sub.plan.code,
                  planName: sub.plan.name,
                }
              : null,
          };
        }),
      });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/corporate/entitlement-catalog",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.BUSINESSES, "view"),
  async (_req, res, next) => {
    try {
      const data = await getCorporateEntitlementCatalog();
      res.json({ data });
    } catch (e) {
      next(e);
    }
  },
);

app.patch(
  "/api/platform/corporate-businesses/:businessId",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.BUSINESSES, "edit"),
  async (req, res, next) => {
    try {
      const body = assignCorporateBusinessBodySchema.parse(req.body);
      const result = await assignCorporateBusinessSettings({
        businessId: req.params.businessId as string,
        ...body,
      });
      res.json({
        data: {
          subscriptionId: result.subscription.id,
          invoiceId: result.invoice.id,
          invoiceAmount: formatMoney(result.invoice.amount),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/payment-gateways",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.PAYMENT_GATEWAYS, "view"),
  async (_req, res, next) => {
    try {
      const rows = await listPaymentGatewaysForPlatform();
      res.json({
        data: rows.map((g) => ({
          id: g.id,
          code: g.code,
          name: g.name,
          description: g.description,
          isEnabled: g.isEnabled,
          sortOrder: g.sortOrder,
          checkoutAdapter: g.checkoutAdapter,
          createdAt: g.createdAt.toISOString(),
          updatedAt: g.updatedAt.toISOString(),
        })),
      });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/aps-wallet/customer-auths",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.PAYMENT_GATEWAYS, "view"),
  async (req, res, next) => {
    try {
      const q = apsWalletCustomerAuthQuerySchema.parse(req.query ?? {});
      const data = await listPlatformApsWalletCustomerAuths({
        businessId: q.businessId,
        gatewayCode: q.gatewayCode,
      });
      res.json({ data });
    } catch (e) {
      next(e);
    }
  },
);

app.delete(
  "/api/platform/aps-wallet/customer-auths/:authId",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.PAYMENT_GATEWAYS, "edit"),
  async (req, res, next) => {
    try {
      await clearPlatformApsWalletCustomerAuth(req.params.authId as string);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/platform/payment-gateways",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.PAYMENT_GATEWAYS, "create"),
  async (req, res, next) => {
    try {
      const body = paymentGatewayCreateSchema.parse(req.body);
      const checkoutAdapter =
        body.checkoutAdapter === undefined || body.checkoutAdapter === null || body.checkoutAdapter === ""
          ? null
          : body.checkoutAdapter.trim();
      const created = await createPaymentGateway({
        code: body.code,
        name: body.name,
        description: body.description ?? undefined,
        sortOrder: body.sortOrder,
        isEnabled: body.isEnabled,
        checkoutAdapter,
      });
      res.status(201).json({
        data: {
          id: created.id,
          code: created.code,
          name: created.name,
          description: created.description,
          isEnabled: created.isEnabled,
          sortOrder: created.sortOrder,
          checkoutAdapter: created.checkoutAdapter,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.patch(
  "/api/platform/payment-gateways/:gatewayId",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.PAYMENT_GATEWAYS, "edit"),
  async (req, res, next) => {
    try {
      const body = paymentGatewayPatchSchema.parse(req.body);
      const updated = await updatePaymentGateway(req.params.gatewayId as string, body);
      res.json({
        data: {
          id: updated.id,
          code: updated.code,
          name: updated.name,
          description: updated.description,
          isEnabled: updated.isEnabled,
          sortOrder: updated.sortOrder,
          checkoutAdapter: updated.checkoutAdapter,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.delete(
  "/api/platform/payment-gateways/:gatewayId",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.PAYMENT_GATEWAYS, "delete"),
  async (req, res, next) => {
    try {
      await deletePaymentGateway(req.params.gatewayId as string);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  },
);

const platformManualJournalBodySchema = z.object({
  postedAt: z.string().trim().min(1),
  memo: z.string().trim().max(4000).optional().nullable(),
  reference: z.string().trim().max(200).optional().nullable(),
  lines: z
    .array(
      z.object({
        chartOfAccountId: z.string().min(1),
        debit: z.number().nonnegative(),
        credit: z.number().nonnegative(),
        description: z.string().trim().max(4000).optional().nullable(),
      }),
    )
    .min(2),
});

const platformChartAccountCreateBodySchema = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  category: z.nativeEnum(ChartAccountCategory),
  description: z.string().trim().max(4000).optional().nullable(),
});

const platformChartAccountPatchBodySchema = z
  .object({
    code: z.string().trim().min(1).max(64).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    category: z.nativeEnum(ChartAccountCategory).optional(),
    description: z.string().trim().max(4000).optional().nullable(),
  })
  .refine(
    (o) =>
      o.code !== undefined ||
      o.name !== undefined ||
      o.category !== undefined ||
      o.description !== undefined,
    { message: "At least one field is required." },
  );

/** Legacy template: only `platform.accounting` — grant full finance access. */
const platformFinanceLegacyViewGate = {
  moduleSlug: PLATFORM_MODULE_SLUGS.ACCOUNTING,
  action: "view" as const,
};

const platformFinanceLegacyCreateGate = {
  moduleSlug: PLATFORM_MODULE_SLUGS.ACCOUNTING,
  action: "create" as const,
};

const platformJournalListGates = [
  platformFinanceLegacyViewGate,
  { moduleSlug: PLATFORM_MODULE_SLUGS.ACCOUNTING_JOURNALS_POST, action: "view" as const },
];

const platformManualJournalPostGates = [
  platformFinanceLegacyCreateGate,
  { moduleSlug: PLATFORM_MODULE_SLUGS.ACCOUNTING_JOURNALS_POST, action: "create" as const },
];

const platformJournalReversalPostGates = [
  platformFinanceLegacyCreateGate,
  { moduleSlug: PLATFORM_MODULE_SLUGS.ACCOUNTING_JOURNALS_REVERSAL, action: "create" as const },
];

const platformMerchantTransactionJournalViewGates = [
  platformFinanceLegacyViewGate,
  { moduleSlug: PLATFORM_MODULE_SLUGS.ACCOUNTING_TRANSACTION_JOURNAL, action: "view" as const },
];

const platformMerchantTransactionJournalApproveGates = [
  platformFinanceLegacyCreateGate,
  { moduleSlug: PLATFORM_MODULE_SLUGS.ACCOUNTING_TRANSACTION_JOURNAL, action: "edit" as const },
];

const platformPurchaseBillsViewGates = [
  platformFinanceLegacyViewGate,
  { moduleSlug: PLATFORM_MODULE_SLUGS.PURCHASE_BILLS, action: "view" as const },
];

const platformPurchaseBillsCreateGates = [
  platformFinanceLegacyCreateGate,
  { moduleSlug: PLATFORM_MODULE_SLUGS.PURCHASE_BILLS, action: "create" as const },
];

const platformPurchaseBillsEditGates = [
  platformFinanceLegacyCreateGate,
  { moduleSlug: PLATFORM_MODULE_SLUGS.PURCHASE_BILLS, action: "edit" as const },
];

const platformActivityLogGates = [
  platformFinanceLegacyViewGate,
  { moduleSlug: PLATFORM_MODULE_SLUGS.ACTIVITY_LOG, action: "view" as const },
  { moduleSlug: PLATFORM_MODULE_SLUGS.PURCHASE_BILLS, action: "view" as const },
];

app.get(
  "/api/platform/accounting/chart-of-accounts",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny([
    platformFinanceLegacyViewGate,
    { moduleSlug: PLATFORM_MODULE_SLUGS.ACCOUNTING_CHART, action: "view" },
  ]),
  async (_req, res, next) => {
    try {
      const rows = await listPlatformChartAccounts();
      res.json({
        data: rows.map((a) => ({
          id: a.id,
          code: a.code,
          name: a.name,
          description: a.description,
          category: a.category,
          kind: a.kind,
          isSystem: a.isSystem,
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
        })),
      });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/platform/accounting/chart-of-accounts",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny([
    platformFinanceLegacyViewGate,
    { moduleSlug: PLATFORM_MODULE_SLUGS.ACCOUNTING_CHART, action: "create" },
  ]),
  async (req, res, next) => {
    try {
      const body = platformChartAccountCreateBodySchema.parse(req.body);
      const row = await createPlatformChartAccount({
        code: body.code,
        name: body.name,
        category: body.category,
        description: body.description ?? null,
      });
      res.status(201).json({
        data: {
          id: row.id,
          code: row.code,
          name: row.name,
          description: row.description,
          category: row.category,
          kind: row.kind,
          isSystem: row.isSystem,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.patch(
  "/api/platform/accounting/chart-of-accounts/:accountId",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny([
    platformFinanceLegacyViewGate,
    { moduleSlug: PLATFORM_MODULE_SLUGS.ACCOUNTING_CHART, action: "edit" },
  ]),
  async (req, res, next) => {
    try {
      const body = platformChartAccountPatchBodySchema.parse(req.body);
      const row = await updatePlatformChartAccount(req.params.accountId as string, {
        code: body.code,
        name: body.name,
        category: body.category,
        description: body.description,
      });
      res.json({
        data: {
          id: row.id,
          code: row.code,
          name: row.name,
          description: row.description,
          category: row.category,
          kind: row.kind,
          isSystem: row.isSystem,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.delete(
  "/api/platform/accounting/chart-of-accounts/:accountId",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny([
    platformFinanceLegacyViewGate,
    { moduleSlug: PLATFORM_MODULE_SLUGS.ACCOUNTING_CHART, action: "delete" },
  ]),
  async (req, res, next) => {
    try {
      await deletePlatformChartAccount(req.params.accountId as string);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/accounting/accounts-for-reports",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny([
    platformFinanceLegacyViewGate,
    { moduleSlug: PLATFORM_MODULE_SLUGS.ACCOUNTING_CHART, action: "view" },
    { moduleSlug: PLATFORM_MODULE_SLUGS.ACCOUNTING_REPORTS_GL, action: "view" },
    { moduleSlug: PLATFORM_MODULE_SLUGS.ACCOUNTING_REPORTS_PNL, action: "view" },
    { moduleSlug: PLATFORM_MODULE_SLUGS.ACCOUNTING_REPORTS_STATEMENT, action: "view" },
  ]),
  async (_req, res, next) => {
    try {
      const data = await listPlatformChartAccountsForReports();
      res.json({ data });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/accounting/journal-entries",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny(platformJournalListGates),
  async (req, res, next) => {
    try {
      const page = clampPage(Number(req.query.page));
      const pageSize = clampPageSize(Number(req.query.pageSize));
      const scopeRaw = typeof req.query.scope === "string" ? req.query.scope.trim().toLowerCase() : "";
      const scope =
        scopeRaw === "operator" ? ("operator" as const) : ("all" as const);
      const from =
        typeof req.query.from === "string" && req.query.from.trim() ? req.query.from.trim() : undefined;
      const to =
        typeof req.query.to === "string" && req.query.to.trim() ? req.query.to.trim() : undefined;
      const result = await listPlatformJournalEntries({ page, pageSize, scope, from, to });
      res.json({
        data: result.rows.map((e) => ({
          id: e.id,
          postedAt: e.postedAt.toISOString(),
          memo: e.memo,
          reference: e.reference,
          sourceType: e.sourceType,
          sourceId: e.sourceId,
          reversesPlatformJournalEntryId: e.reversesPlatformJournalEntryId,
          hasReversal: Boolean(e.reversedByPlatformEntry),
          billPayment: e.billFromPayment
            ? { id: e.billFromPayment.id, publicCode: e.billFromPayment.publicCode }
            : null,
          createdAt: e.createdAt.toISOString(),
          lines: e.lines.map((ln) => ({
            id: ln.id,
            chartOfAccountId: ln.chartOfAccountId,
            code: ln.chartOfAccount.code,
            name: ln.chartOfAccount.name,
            category: ln.chartOfAccount.category,
            debit: Number(ln.debitAmount),
            credit: Number(ln.creditAmount),
            description: ln.description,
          })),
        })),
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/accounting/journal-entries/:journalEntryId/reversal-preview",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny(platformJournalListGates),
  async (req, res, next) => {
    try {
      const data = await getPlatformJournalEntryForReversalDetail(req.params.journalEntryId as string);
      res.json({ data });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/platform/accounting/journal-entries/manual",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny(platformManualJournalPostGates),
  async (req, res, next) => {
    try {
      const body = platformManualJournalBodySchema.parse(req.body);
      const created = await createPlatformManualJournal(body);
      if (req.user?.id) {
        await appendActivityLog(prisma, {
          businessId: null,
          actorUserId: req.user.id,
          actorKind: ActivityActorKind.USER,
          eventType: ACTIVITY_EVENT.PLATFORM_JOURNAL_MANUAL_POSTED,
          resourceType: "platform_journal_entry",
          resourceId: created.id,
        });
      }
      res.status(201).json({
        data: {
          id: created.id,
          postedAt: created.postedAt.toISOString(),
          memo: created.memo,
          reference: created.reference,
          sourceType: created.sourceType,
          lines: created.lines.map((ln) => ({
            id: ln.id,
            chartOfAccountId: ln.chartOfAccountId,
            debit: Number(ln.debitAmount),
            credit: Number(ln.creditAmount),
            description: ln.description,
          })),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/platform/accounting/journal-entries/:journalEntryId/reverse",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny(platformJournalReversalPostGates),
  async (req, res, next) => {
    try {
      const body = platformJournalReverseBodySchema.parse(req.body);
      const reversal = await reversePlatformJournalEntry(req.params.journalEntryId as string, body);
      if (req.user?.id) {
        await appendActivityLog(prisma, {
          businessId: null,
          actorUserId: req.user.id,
          actorKind: ActivityActorKind.USER,
          eventType: ACTIVITY_EVENT.PLATFORM_JOURNAL_REVERSED,
          resourceType: "platform_journal_entry",
          resourceId: reversal.id,
          metadata: { reversesJournalId: req.params.journalEntryId },
        });
      }
      res.status(201).json({
        data: {
          id: reversal.id,
          postedAt: reversal.postedAt.toISOString(),
          memo: reversal.memo,
          reference: reversal.reference,
          sourceType: reversal.sourceType,
          reversesPlatformJournalEntryId: reversal.reversesPlatformJournalEntryId,
          lines: reversal.lines.map((ln) => ({
            id: ln.id,
            chartOfAccountId: ln.chartOfAccountId,
            code: ln.chartOfAccount.code,
            name: ln.chartOfAccount.name,
            debit: Number(ln.debitAmount),
            credit: Number(ln.creditAmount),
            description: ln.description,
          })),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/accounting/reports/gl-balance",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny([
    platformFinanceLegacyViewGate,
    { moduleSlug: PLATFORM_MODULE_SLUGS.ACCOUNTING_REPORTS_GL, action: "view" },
  ]),
  async (req, res, next) => {
    try {
      const asOf =
        typeof req.query.asOf === "string" && req.query.asOf.trim()
          ? req.query.asOf.trim()
          : "";
      if (!asOf) {
        throw new HttpError(400, "Query parameter asOf (YYYY-MM-DD) is required.");
      }
      const data = await getPlatformGlBalanceReport(asOf);
      res.json({ data });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/accounting/reports/profit-loss",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny([
    platformFinanceLegacyViewGate,
    { moduleSlug: PLATFORM_MODULE_SLUGS.ACCOUNTING_REPORTS_PNL, action: "view" },
  ]),
  async (req, res, next) => {
    try {
      const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
      const to = typeof req.query.to === "string" ? req.query.to.trim() : "";
      if (!from || !to) {
        throw new HttpError(400, "Query parameters from and to (YYYY-MM-DD) are required.");
      }
      const data = await getPlatformProfitLossReport(from, to);
      res.json({ data });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/accounting/reports/account-statement",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny([
    platformFinanceLegacyViewGate,
    { moduleSlug: PLATFORM_MODULE_SLUGS.ACCOUNTING_REPORTS_STATEMENT, action: "view" },
  ]),
  async (req, res, next) => {
    try {
      const idsRaw =
        typeof req.query.chartOfAccountIds === "string"
          ? req.query.chartOfAccountIds
          : typeof req.query.chartOfAccountId === "string"
            ? req.query.chartOfAccountId
            : "";
      const chartOfAccountIds = idsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
      const to = typeof req.query.to === "string" ? req.query.to.trim() : "";
      if (chartOfAccountIds.length === 0 || !from || !to) {
        throw new HttpError(
          400,
          "Query parameters chartOfAccountId or chartOfAccountIds (comma-separated), from, and to (YYYY-MM-DD) are required.",
        );
      }
      const data = await getPlatformAccountStatementsReports(chartOfAccountIds, from, to);
      res.json({ data });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/accounting/merchant-journal-entries",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny(platformMerchantTransactionJournalViewGates),
  async (req, res, next) => {
    try {
      const page = clampPage(Number(req.query.page ?? 1));
      const pageSize = clampPageSize(Number(req.query.pageSize ?? 20));
      const businessId =
        typeof req.query.businessId === "string" && req.query.businessId.trim()
          ? req.query.businessId.trim()
          : undefined;
      const from =
        typeof req.query.from === "string" && req.query.from.trim() ? req.query.from.trim() : undefined;
      const to =
        typeof req.query.to === "string" && req.query.to.trim() ? req.query.to.trim() : undefined;
      const ledgerScopeRaw =
        typeof req.query.ledgerScope === "string" ? req.query.ledgerScope.trim().toLowerCase() : "";
      const ledgerScope =
        ledgerScopeRaw === "business" || ledgerScopeRaw === "operator" || ledgerScopeRaw === "all"
          ? ledgerScopeRaw
          : undefined;
      const result = await listMerchantJournalEntriesForPlatform({
        page,
        pageSize,
        businessId,
        from,
        to,
        ledgerScope,
      });
      res.json({
        data: result.rows.map((e) => ({
          id: e.id,
          businessId: e.businessId,
          businessName: e.business.name,
          postedAt: e.postedAt.toISOString(),
          memo: e.memo,
          reference: e.reference,
          sourceType: e.sourceType,
          sourceId: e.sourceId,
          journalApprovalExempt: e.journalApprovalExempt,
          approvedAt: e.approvedAt?.toISOString() ?? null,
          approvedBy: e.approvedBy
            ? { id: e.approvedBy.id, name: e.approvedBy.name, email: e.approvedBy.email }
            : null,
          cancelledAt: e.cancelledAt?.toISOString() ?? null,
          cancelledBy: e.cancelledBy
            ? { id: e.cancelledBy.id, name: e.cancelledBy.name, email: e.cancelledBy.email }
            : null,
          reversesJournalEntryId: e.reversesJournalEntryId,
          postedByPlatformUserId: e.postedByPlatformUserId,
          postedByPlatformUser: e.postedByPlatformUser
            ? {
                id: e.postedByPlatformUser.id,
                name: e.postedByPlatformUser.name,
                email: e.postedByPlatformUser.email,
              }
            : null,
          createdAt: e.createdAt.toISOString(),
        })),
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/accounting/merchant-journal-entries/:journalEntryId",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny(platformMerchantTransactionJournalViewGates),
  async (req, res, next) => {
    try {
      const row = await getMerchantJournalEntryForPlatform(req.params.journalEntryId as string);
      res.json({
        data: {
          id: row.id,
          businessId: row.businessId,
          businessName: row.business.name,
          postedAt: row.postedAt.toISOString(),
          memo: row.memo,
          reference: row.reference,
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          contactId: row.contactId,
          journalApprovalExempt: row.journalApprovalExempt,
          approvedAt: row.approvedAt?.toISOString() ?? null,
          approvedBy: row.approvedBy
            ? { id: row.approvedBy.id, name: row.approvedBy.name, email: row.approvedBy.email }
            : null,
          cancelledAt: row.cancelledAt?.toISOString() ?? null,
          cancelledBy: row.cancelledBy
            ? { id: row.cancelledBy.id, name: row.cancelledBy.name, email: row.cancelledBy.email }
            : null,
          reversesJournalEntryId: row.reversesJournalEntryId,
          postedByPlatformUserId: row.postedByPlatformUserId,
          postedByPlatformUser: row.postedByPlatformUser
            ? {
                id: row.postedByPlatformUser.id,
                name: row.postedByPlatformUser.name,
                email: row.postedByPlatformUser.email,
              }
            : null,
          createdAt: row.createdAt.toISOString(),
          lines: row.lines.map((ln) => ({
            id: ln.id,
            chartOfAccountId: ln.chartOfAccountId,
            code: ln.chartOfAccount.code,
            name: ln.chartOfAccount.name,
            category: ln.chartOfAccount.category,
            debit: Number(ln.debitAmount),
            credit: Number(ln.creditAmount),
            description: ln.description,
          })),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/platform/accounting/merchant-journal-entries/:journalEntryId/approve",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny(platformMerchantTransactionJournalApproveGates),
  async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new HttpError(401, "Unauthorized.");
      }
      const row = await approveMerchantJournalEntry(req.params.journalEntryId as string, userId);
      res.json({
        data: {
          id: row.id,
          businessId: row.businessId,
          businessName: row.business.name,
          postedAt: row.postedAt.toISOString(),
          memo: row.memo,
          reference: row.reference,
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          journalApprovalExempt: row.journalApprovalExempt,
          approvedAt: row.approvedAt?.toISOString() ?? null,
          approvedBy: row.approvedBy
            ? { id: row.approvedBy.id, name: row.approvedBy.name, email: row.approvedBy.email }
            : null,
          cancelledAt: row.cancelledAt?.toISOString() ?? null,
          cancelledBy: row.cancelledBy
            ? { id: row.cancelledBy.id, name: row.cancelledBy.name, email: row.cancelledBy.email }
            : null,
          postedByPlatformUserId: row.postedByPlatformUserId,
          postedByPlatformUser: row.postedByPlatformUser
            ? {
                id: row.postedByPlatformUser.id,
                name: row.postedByPlatformUser.name,
                email: row.postedByPlatformUser.email,
              }
            : null,
          lines: row.lines.map((ln) => ({
            id: ln.id,
            chartOfAccountId: ln.chartOfAccountId,
            code: ln.chartOfAccount.code,
            name: ln.chartOfAccount.name,
            category: ln.chartOfAccount.category,
            debit: Number(ln.debitAmount),
            credit: Number(ln.creditAmount),
            description: ln.description,
          })),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/platform/accounting/merchant-journal-entries/:journalEntryId/cancel",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny(platformMerchantTransactionJournalApproveGates),
  async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new HttpError(401, "Unauthorized.");
      }
      const row = await cancelMerchantJournalEntry(req.params.journalEntryId as string, userId);
      res.json({
        data: {
          id: row.id,
          businessId: row.businessId,
          businessName: row.business.name,
          postedAt: row.postedAt.toISOString(),
          memo: row.memo,
          reference: row.reference,
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          contactId: row.contactId,
          journalApprovalExempt: row.journalApprovalExempt,
          approvedAt: row.approvedAt?.toISOString() ?? null,
          approvedBy: row.approvedBy
            ? { id: row.approvedBy.id, name: row.approvedBy.name, email: row.approvedBy.email }
            : null,
          cancelledAt: row.cancelledAt?.toISOString() ?? null,
          cancelledBy: row.cancelledBy
            ? { id: row.cancelledBy.id, name: row.cancelledBy.name, email: row.cancelledBy.email }
            : null,
          reversesJournalEntryId: row.reversesJournalEntryId,
          createdAt: row.createdAt.toISOString(),
          postedByPlatformUserId: row.postedByPlatformUserId,
          postedByPlatformUser: row.postedByPlatformUser
            ? {
                id: row.postedByPlatformUser.id,
                name: row.postedByPlatformUser.name,
                email: row.postedByPlatformUser.email,
              }
            : null,
          lines: row.lines.map((ln) => ({
            id: ln.id,
            chartOfAccountId: ln.chartOfAccountId,
            code: ln.chartOfAccount.code,
            name: ln.chartOfAccount.name,
            category: ln.chartOfAccount.category,
            debit: Number(ln.debitAmount),
            credit: Number(ln.creditAmount),
            description: ln.description,
          })),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/activity-log",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny(platformActivityLogGates),
  async (req, res, next) => {
    try {
      const page = clampPage(Number(req.query.page ?? 1));
      const pageSize = clampPageSize(Number(req.query.pageSize ?? 50));
      const eventType = typeof req.query.eventType === "string" ? req.query.eventType.trim() : "";
      const actorKindRaw =
        typeof req.query.actorKind === "string" ? req.query.actorKind.trim().toLowerCase() : "";
      let actorKind: ActivityActorKind | null = null;
      if (actorKindRaw === "user") {
        actorKind = ActivityActorKind.USER;
      } else if (actorKindRaw === "system") {
        actorKind = ActivityActorKind.SYSTEM;
      }
      const result = await listActivityLogsForPlatform({
        page,
        pageSize,
        eventType: eventType || undefined,
        actorKind,
      });
      res.json({
        data: {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          logs: result.logs.map((row) => ({
            id: row.id,
            eventType: row.eventType,
            resourceType: row.resourceType,
            resourceId: row.resourceId,
            actorKind: row.actorKind === "USER" ? "user" : "system",
            actor: row.actorUser
              ? { id: row.actorUser.id, name: row.actorUser.name, email: row.actorUser.email }
              : null,
            metadata: row.metadata,
            createdAt: row.createdAt.toISOString(),
          })),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/tenant-activity-log",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny(platformActivityLogGates),
  async (req, res, next) => {
    try {
      const page = clampPage(Number(req.query.page ?? 1));
      const pageSize = clampPageSize(Number(req.query.pageSize ?? 50));
      const eventType = typeof req.query.eventType === "string" ? req.query.eventType.trim() : "";
      const actorKindRaw =
        typeof req.query.actorKind === "string" ? req.query.actorKind.trim().toLowerCase() : "";
      let actorKind: ActivityActorKind | null = null;
      if (actorKindRaw === "user") {
        actorKind = ActivityActorKind.USER;
      } else if (actorKindRaw === "system") {
        actorKind = ActivityActorKind.SYSTEM;
      }

      const fromRaw = typeof req.query.from === "string" ? req.query.from.trim() : "";
      const toRaw = typeof req.query.to === "string" ? req.query.to.trim() : "";
      let from: Date | null = null;
      let to: Date | null = null;
      if (fromRaw) {
        from = new Date(fromRaw);
        if (Number.isNaN(from.getTime())) {
          res.status(400).json({ error: "Invalid `from` datetime" });
          return;
        }
      }
      if (toRaw) {
        to = new Date(toRaw);
        if (Number.isNaN(to.getTime())) {
          res.status(400).json({ error: "Invalid `to` datetime" });
          return;
        }
      }
      if (!from || !to) {
        res.status(400).json({ error: "`from` and `to` ISO datetimes are required" });
        return;
      }
      if (from.getTime() > to.getTime()) {
        res.status(400).json({ error: "`from` must be before or equal to `to`" });
        return;
      }

      const businessId =
        typeof req.query.businessId === "string" ? req.query.businessId.trim() : "";
      const businessNameContains =
        typeof req.query.businessName === "string" ? req.query.businessName.trim() : "";

      const result = await listActivityLogsForPlatformTenants({
        page,
        pageSize,
        eventType: eventType || undefined,
        actorKind,
        from: from ?? undefined,
        to: to ?? undefined,
        businessId: businessId || undefined,
        businessNameContains: businessNameContains || undefined,
      });
      res.json({
        data: {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          logs: result.logs.map((row) => ({
            id: row.id,
            business: row.business
              ? { id: row.business.id, name: row.business.name }
              : { id: row.businessId!, name: "—" },
            eventType: row.eventType,
            resourceType: row.resourceType,
            resourceId: row.resourceId,
            actorKind: row.actorKind === "USER" ? "user" : "system",
            actor: row.actorUser
              ? { id: row.actorUser.id, name: row.actorUser.name, email: row.actorUser.email }
              : null,
            metadata: row.metadata,
            createdAt: row.createdAt.toISOString(),
          })),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/suppliers",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny(platformPurchaseBillsViewGates),
  async (_req, res, next) => {
    try {
      const rows = await listPlatformSuppliers();
      res.json({
        data: rows.map((s) => ({
          id: s.id,
          name: s.name,
          email: s.email,
          phone: s.phone,
          createdAt: s.createdAt.toISOString(),
        })),
      });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/platform/suppliers",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny(platformPurchaseBillsCreateGates),
  async (req, res, next) => {
    try {
      const body = platformSupplierCreateBodySchema.parse(req.body);
      const row = await createPlatformSupplier(body);
      res.status(201).json({
        data: {
          id: row.id,
          name: row.name,
          email: row.email,
          phone: row.phone,
          createdAt: row.createdAt.toISOString(),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/bills",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny(platformPurchaseBillsViewGates),
  async (_req, res, next) => {
    try {
      const rows = await listPlatformBills();
      res.json({ data: rows.map((r) => formatPlatformBillApi(r)) });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/platform/bills",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny(platformPurchaseBillsCreateGates),
  async (req, res, next) => {
    try {
      const body = platformBillCreateBodySchema.parse(req.body);
      const row = await createPlatformBill({
        supplierId: body.supplierId,
        issueDate: parsePostedAt(body.issueDate),
        dueDate: parseOptionalIsoDate(body.dueDate),
        reference: body.reference ?? null,
        currency: body.currency ?? undefined,
        lines: mapSalesLineInputs(body.lines),
      });
      res.status(201).json({ data: formatPlatformBillApi(row) });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/bills/:billId",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny(platformPurchaseBillsViewGates),
  async (req, res, next) => {
    try {
      const row = await getPlatformBillById(req.params.billId as string);
      res.json({ data: formatPlatformBillApi(row) });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/bills/:billId/pdf",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny(platformPurchaseBillsViewGates),
  async (req, res, next) => {
    try {
      const { buffer, filename } = await renderPlatformBillPdfDownload(req.params.billId as string);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  },
);

app.patch(
  "/api/platform/bills/:billId",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny(platformPurchaseBillsEditGates),
  async (req, res, next) => {
    try {
      const body = platformBillPatchBodySchema.parse(req.body);
      const row = await updatePlatformBillDraft(req.params.billId as string, {
        ...(body.supplierId ? { supplierId: body.supplierId } : {}),
        ...(body.issueDate ? { issueDate: parsePostedAt(body.issueDate) } : {}),
        ...(body.dueDate !== undefined ? { dueDate: parseOptionalIsoDate(body.dueDate) } : {}),
        ...(body.reference !== undefined ? { reference: body.reference ?? null } : {}),
        ...(body.currency !== undefined ? { currency: body.currency ?? undefined } : {}),
        ...(body.lines ? { lines: mapSalesLineInputs(body.lines) } : {}),
      });
      res.json({ data: formatPlatformBillApi(row) });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/platform/bills/:billId/approve",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny(platformPurchaseBillsEditGates),
  async (req, res, next) => {
    try {
      const row = await approvePlatformBill(req.params.billId as string);
      res.json({ data: formatPlatformBillApi(row) });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/platform/bills/:billId/mark-paid",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny(platformPurchaseBillsEditGates),
  async (req, res, next) => {
    try {
      const body = billMarkPaidBodySchema.parse(req.body);
      const row = await markPlatformBillPaid(req.params.billId as string, {
        settlementChartAccountId: body.settlementChartAccountId,
        postedAt: parsePostedAt(body.postedAt),
      });
      if (req.user?.id) {
        await appendActivityLog(prisma, {
          businessId: null,
          actorUserId: req.user.id,
          actorKind: ActivityActorKind.USER,
          eventType: ACTIVITY_EVENT.PLATFORM_BILL_PAID,
          resourceType: "platform_bill",
          resourceId: row.id,
          metadata: { publicCode: row.publicCode, journalEntryId: row.platformJournalEntryId },
        });
      }
      res.json({ data: formatPlatformBillApi(row) });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/platform/bills/:billId/void",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny(platformPurchaseBillsEditGates),
  async (req, res, next) => {
    try {
      const row = await voidPlatformBill(req.params.billId as string);
      res.json({ data: formatPlatformBillApi(row) });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/security/modules",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SECURITY_ROLES, "view"),
  async (_req, res, next) => {
    try {
      const rows = await listPlatformModules();
      res.json({
        data: rows.map((m) => ({
          id: m.id,
          slug: m.slug,
          label: m.label,
          sortOrder: m.sortOrder,
        })),
      });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/security/role-templates",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SECURITY_ROLES, "view"),
  async (req, res, next) => {
    try {
      const page = clampPage(Number(req.query.page));
      const pageSize = clampPageSize(Number(req.query.pageSize));
      const { rows, total, page: p, pageSize: ps } = await listRoleTemplatesPaginated(page, pageSize);
      res.json({
        data: rows.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
          assignedFunctionGroupCount: t._count.functionGroups,
          permissions: t.permissions.map((perm) => ({
            id: perm.id,
            moduleId: perm.moduleId,
            moduleSlug: perm.module.slug,
            moduleLabel: perm.module.label,
            canView: perm.canView,
            canCreate: perm.canCreate,
            canEdit: perm.canEdit,
            canDelete: perm.canDelete,
            canExport: perm.canExport,
          })),
        })),
        total,
        page: p,
        pageSize: ps,
      });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/security/role-templates/summary",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SECURITY_FUNCTION_GROUPS, "view"),
  async (_req, res, next) => {
    try {
      const rows = await listRoleTemplateSummaries();
      res.json({ data: rows });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/platform/security/role-templates",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SECURITY_ROLES, "create"),
  async (req, res, next) => {
    try {
      const body = platformRoleTemplateBodySchema.parse(req.body);
      const created = await createRoleTemplate(body);
      res.status(201).json({
        data: {
          id: created.id,
          name: created.name,
          description: created.description,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.patch(
  "/api/platform/security/role-templates/:templateId",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SECURITY_ROLES, "edit"),
  async (req, res, next) => {
    try {
      const body = platformRoleTemplatePatchSchema.parse(req.body);
      const updated = await updateRoleTemplate(req.params.templateId as string, body);
      res.json({
        data: {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.put(
  "/api/platform/security/role-templates/:templateId/permissions",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SECURITY_ROLES, "edit"),
  async (req, res, next) => {
    try {
      const body = platformRoleTemplatePermissionsBodySchema.parse(req.body);
      const updated = await setRoleTemplatePermissions(
        req.params.templateId as string,
        body.permissions,
      );
      res.json({
        data: {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          permissions: updated.permissions.map((p) => ({
            id: p.id,
            moduleId: p.moduleId,
            moduleSlug: p.module.slug,
            moduleLabel: p.module.label,
            canView: p.canView,
            canCreate: p.canCreate,
            canEdit: p.canEdit,
            canDelete: p.canDelete,
            canExport: p.canExport,
          })),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.delete(
  "/api/platform/security/role-templates/:templateId",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SECURITY_ROLES, "delete"),
  async (req, res, next) => {
    try {
      await deleteRoleTemplate(req.params.templateId as string);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/security/function-groups/all",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny([
    { moduleSlug: PLATFORM_MODULE_SLUGS.SECURITY_FUNCTION_GROUPS, action: "view" },
    { moduleSlug: PLATFORM_MODULE_SLUGS.SECURITY_MOVE_USERS, action: "view" },
  ]),
  async (_req, res, next) => {
    try {
      const rows = await listFunctionGroups();
      res.json({
        data: rows.map((g) => ({
          id: g.id,
          name: g.name,
          description: g.description,
          createdAt: g.createdAt.toISOString(),
          updatedAt: g.updatedAt.toISOString(),
          roleTemplates: g.roleTemplate ? [g.roleTemplate] : [],
          userCount: g._count.users,
        })),
      });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/platform/security/function-groups",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SECURITY_FUNCTION_GROUPS, "view"),
  async (req, res, next) => {
    try {
      const page = clampPage(Number(req.query.page));
      const pageSize = clampPageSize(Number(req.query.pageSize));
      const { rows, total, page: p, pageSize: ps } = await listFunctionGroupsPaginated(page, pageSize);
      res.json({
        data: rows.map((g) => ({
          id: g.id,
          name: g.name,
          description: g.description,
          createdAt: g.createdAt.toISOString(),
          updatedAt: g.updatedAt.toISOString(),
          roleTemplates: g.roleTemplate ? [g.roleTemplate] : [],
          userCount: g._count.users,
        })),
        total,
        page: p,
        pageSize: ps,
      });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/platform/security/function-groups",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SECURITY_FUNCTION_GROUPS, "create"),
  async (req, res, next) => {
    try {
      const body = platformFunctionGroupBodySchema.parse(req.body);
      const created = await createFunctionGroup(body);
      res.status(201).json({
        data: {
          id: created.id,
          name: created.name,
          description: created.description,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.patch(
  "/api/platform/security/function-groups/:groupId",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SECURITY_FUNCTION_GROUPS, "edit"),
  async (req, res, next) => {
    try {
      const body = platformFunctionGroupPatchSchema.parse(req.body);
      const updated = await updateFunctionGroup(req.params.groupId as string, body);
      res.json({
        data: {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
          roleTemplates: updated.roleTemplate ? [updated.roleTemplate] : [],
          userCount: updated._count.users,
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.delete(
  "/api/platform/security/function-groups/:groupId",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SECURITY_FUNCTION_GROUPS, "delete"),
  async (req, res, next) => {
    try {
      await deleteFunctionGroup(req.params.groupId as string);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/platform/security/staff-users/bulk-move",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccessAny([
    { moduleSlug: PLATFORM_MODULE_SLUGS.SECURITY_MOVE_USERS, action: "edit" },
    { moduleSlug: PLATFORM_MODULE_SLUGS.SECURITY_SYSTEM_USERS, action: "edit" },
  ]),
  async (req, res, next) => {
    try {
      const body = platformBulkMoveStaffSchema.parse(req.body);
      const result = await bulkMovePlatformStaffUsers({
        fromGroupId: body.fromGroupId,
        toGroupId: body.toGroupId,
        userIds: body.userIds,
      });
      res.json({ data: result });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/platform/security/staff-users",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SECURITY_SYSTEM_USERS, "create"),
  async (req, res, next) => {
    try {
      const body = platformStaffUserBodySchema.parse(req.body);
      const user = await createPlatformStaffUser(body);
      res.status(201).json({
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          isActive: user.isActive,
          mustChangePassword: user.mustChangePassword,
          createdAt: user.createdAt.toISOString(),
          platformFunctionGroupId: user.platformFunctionGroupId,
          platformFunctionGroup: user.platformFunctionGroup,
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.patch(
  "/api/platform/security/staff-users/:userId",
  authenticateToken,
  requirePlatformOperator,
  requirePlatformAccess(PLATFORM_MODULE_SLUGS.SECURITY_SYSTEM_USERS, "edit"),
  async (req, res, next) => {
    try {
      const body = platformStaffUserPatchSchema.parse(req.body);
      const user = await updatePlatformStaffUser(req.params.userId as string, body);
      res.json({
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          isActive: user.isActive,
          mustChangePassword: user.mustChangePassword,
          createdAt: user.createdAt.toISOString(),
          platformFunctionGroupId: user.platformFunctionGroupId,
          platformFunctionGroup: user.platformFunctionGroup,
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

// Business Management Routes (with permission checks)
app.get(
  "/api/businesses/:businessId/users",
  authenticateToken,
  requireBusinessOwnerOrPlatform(),
  async (req, res) => {
  const { businessId } = req.params;

  const users = await listBusinessUsers(businessId as string);
  res.json({
    data: users.map(formatUserResponse),
  });
});

app.post(
  "/api/businesses/:businessId/users",
  authenticateToken,
  requireBusinessOwnerOrPlatform(),
  async (req, res) => {
  const { businessId } = req.params;
  const validatedData = createBusinessUserSchema.parse(req.body);

  const result = await createBusinessUser({
    businessId: businessId as string,
    ...validatedData,
  });

  await appendActivityLog(prisma, {
    businessId: businessId as string,
    actorUserId: req.user!.id,
    actorKind: ActivityActorKind.USER,
    eventType: ACTIVITY_EVENT.STAFF_USER_INVITED,
    resourceType: "user",
    resourceId: result.user.id,
    metadata: {
      email: result.user.email,
      name: result.user.name,
      role: validatedData.role,
      inviteType: result.inviteType,
    },
  });

  res.status(201).json({
    data: {
      user: formatUserResponse(result.user),
      inviteType: result.inviteType,
    },
  });
});

app.patch(
  "/api/businesses/:businessId/members/:targetUserId/membership-status",
  authenticateToken,
  requireBusinessOwnerOrPlatform(),
  requireEntitlement("status.change.view"),
  async (req, res, next) => {
    try {
      const { businessId, targetUserId } = req.params;
      const body = membershipStatusPatchSchema.parse(req.body);
      await setBusinessMemberStatus(
        businessId as string,
        targetUserId as string,
        body.status,
      );

      await appendActivityLog(prisma, {
        businessId: businessId as string,
        actorUserId: req.user!.id,
        actorKind: ActivityActorKind.USER,
        eventType: ACTIVITY_EVENT.STAFF_MEMBERSHIP_STATUS_CHANGED,
        resourceType: "membership",
        resourceId: targetUserId as string,
        metadata: {
          targetUserId: targetUserId as string,
          status: body.status,
        },
      });

      res.json({ data: { status: body.status } });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/businesses/:businessId/products",
  authenticateToken,
  requireEntitlement("products.view"),
  async (req, res) => {
    const { businessId } = req.params;

    const membership = await prisma.businessMembership.findFirst({
      where: {
        userId: req.user!.id,
        businessId: businessId as string,
      },
    });

    if (!membership && !req.user?.isPlatformOwner) {
      throw new HttpError(403, "Access denied to this business");
    }

    const limitRaw = req.query.limit;
    if (limitRaw === undefined || limitRaw === "") {
      const products = await listProductsForBusiness(businessId as string);
      res.json({
        data: products.map(formatProductResponse),
      });
      return;
    }

    const parsedLimit = Number(limitRaw);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(100, Math.max(1, Math.floor(parsedLimit)))
      : 20;
    const parsedOffset = Number(req.query.offset ?? 0);
    const offset = Number.isFinite(parsedOffset) ? Math.max(0, Math.floor(parsedOffset)) : 0;
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const menuCategoryId =
      typeof req.query.menuCategoryId === "string" && req.query.menuCategoryId.length > 0
        ? req.query.menuCategoryId
        : undefined;

    const { items, hasMore } = await listProductsForBusinessPaged(businessId as string, {
      limit,
      offset,
      q,
      menuCategoryId,
    });
    res.json({
      data: items.map(formatProductResponse),
      meta: { hasMore, limit, offset },
    });
  },
);

app.post(
  "/api/businesses/:businessId/products/upload-image",
  authenticateToken,
  requireAnyEntitlement(["products.create", "products.edit"]),
  upload.single("image"),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: req.user!.id,
          businessId: businessId as string,
        },
      });

      if (!membership && !req.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }

      if (!req.file) {
        throw new HttpError(400, "Image file is required.");
      }

      const imageUrl = `${req.protocol}://${req.get("host")}/uploads/products/${req.file.filename}`;
      res.status(201).json({
        data: {
          imageUrl,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/products",
  authenticateToken,
  requireEntitlement("products.create"),
  async (req, res) => {
    const { businessId } = req.params;
    const payload = createProductSchema.parse(req.body);

    const membership = await prisma.businessMembership.findFirst({
      where: {
        userId: req.user!.id,
        businessId: businessId as string,
      },
    });

    if (!membership && !req.user?.isPlatformOwner) {
      throw new HttpError(403, "Access denied to this business");
    }

    const product = await createProduct({
      businessId: businessId as string,
      name: payload.name,
      category: payload.category ?? "",
      menuCategoryId: payload.menuCategoryId ?? null,
      description: payload.description,
      price: payload.price,
      stock: payload.stock,
      barcodeValue: payload.barcodeValue,
      qrUrl: payload.qrUrl,
      imageUrl: payload.imageUrl,
      imageColor: payload.imageColor,
      imageEmoji: payload.imageEmoji,
    });

    await appendActivityLog(prisma, {
      businessId: businessId as string,
      actorUserId: req.user!.id,
      actorKind: ActivityActorKind.USER,
      eventType: ACTIVITY_EVENT.PRODUCT_CREATED,
      resourceType: "product",
      resourceId: product.id,
      metadata: {
        name: product.name,
        category: product.category,
        price: Number(product.price),
        stock: product.stock,
      },
    });

    res.status(201).json({
      data: formatProductResponse(product),
    });
  },
);

app.patch(
  "/api/businesses/:businessId/products/:productId",
  authenticateToken,
  requireEntitlement("products.edit"),
  async (req, res, next) => {
    try {
      const { businessId, productId } = req.params;
      const body = updateProductSchema.parse(req.body);

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: req.user!.id,
          businessId: businessId as string,
        },
      });

      if (!membership && !req.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }

      const product = await updateProduct({
        businessId: businessId as string,
        productId: productId as string,
        ...body,
      });

      const updatedFields = Object.keys(body).filter(
        (k) => (body as Record<string, unknown>)[k] !== undefined,
      );
      await appendActivityLog(prisma, {
        businessId: businessId as string,
        actorUserId: req.user!.id,
        actorKind: ActivityActorKind.USER,
        eventType: ACTIVITY_EVENT.PRODUCT_UPDATED,
        resourceType: "product",
        resourceId: product.id,
        metadata: {
          name: product.name,
          updatedFields,
        },
      });

      res.json({
        data: formatProductResponse(product),
      });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/businesses/:businessId/dining-tables",
  authenticateToken,
  requireEntitlement("products.view"),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: req.user!.id, businessId: businessId as string },
      });
      if (!membership && !req.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const tables = await listDiningTables(businessId as string);
      res.json({
        data: tables.map((t) => ({
          id: t.id,
          label: t.label,
          publicToken: t.publicToken,
          isActive: t.isActive,
          sortOrder: t.sortOrder,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        })),
      });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/businesses/:businessId/dining-tables",
  authenticateToken,
  requireEntitlement("products.create"),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const body = diningTableCreateSchema.parse(req.body);
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: req.user!.id, businessId: businessId as string },
      });
      if (!membership && !req.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const created = await createDiningTable({
        businessId: businessId as string,
        label: body.label,
        publicToken: body.publicToken,
        sortOrder: body.sortOrder,
      });
      res.status(201).json({
        data: {
          id: created.id,
          label: created.label,
          publicToken: created.publicToken,
          isActive: created.isActive,
          sortOrder: created.sortOrder,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.patch(
  "/api/businesses/:businessId/dining-tables/:tableId",
  authenticateToken,
  requireEntitlement("products.edit"),
  async (req, res, next) => {
    try {
      const { businessId, tableId } = req.params;
      const body = diningTablePatchSchema.parse(req.body);
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: req.user!.id, businessId: businessId as string },
      });
      if (!membership && !req.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const updated = await updateDiningTable({
        businessId: businessId as string,
        tableId: tableId as string,
        ...body,
      });
      res.json({
        data: {
          id: updated.id,
          label: updated.label,
          publicToken: updated.publicToken,
          isActive: updated.isActive,
          sortOrder: updated.sortOrder,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.delete(
  "/api/businesses/:businessId/dining-tables/:tableId",
  authenticateToken,
  requireEntitlement("products.delete"),
  async (req, res, next) => {
    try {
      const { businessId, tableId } = req.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: req.user!.id, businessId: businessId as string },
      });
      if (!membership && !req.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      await deleteDiningTable(businessId as string, tableId as string);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/businesses/:businessId/menu-categories",
  authenticateToken,
  requireEntitlement("products.view"),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: req.user!.id, businessId: businessId as string },
      });
      if (!membership && !req.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const rows = await listMenuCategoriesFlat(businessId as string);
      res.json({
        data: rows.map((c) => ({
          id: c.id,
          name: c.name,
          parentId: c.parentId,
          sortOrder: c.sortOrder,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        })),
      });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/businesses/:businessId/menu-categories",
  authenticateToken,
  requireEntitlement("products.create"),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const body = menuCategoryCreateSchema.parse(req.body);
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: req.user!.id, businessId: businessId as string },
      });
      if (!membership && !req.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const created = await createMenuCategory({
        businessId: businessId as string,
        name: body.name,
        parentId: body.parentId === undefined ? undefined : body.parentId,
        sortOrder: body.sortOrder,
      });
      res.status(201).json({
        data: {
          id: created.id,
          name: created.name,
          parentId: created.parentId,
          sortOrder: created.sortOrder,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.patch(
  "/api/businesses/:businessId/menu-categories/:categoryId",
  authenticateToken,
  requireEntitlement("products.edit"),
  async (req, res, next) => {
    try {
      const { businessId, categoryId } = req.params;
      const body = menuCategoryPatchSchema.parse(req.body);
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: req.user!.id, businessId: businessId as string },
      });
      if (!membership && !req.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const updated = await updateMenuCategory({
        businessId: businessId as string,
        categoryId: categoryId as string,
        name: body.name,
        parentId: body.parentId,
        sortOrder: body.sortOrder,
      });
      res.json({
        data: {
          id: updated.id,
          name: updated.name,
          parentId: updated.parentId,
          sortOrder: updated.sortOrder,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.delete(
  "/api/businesses/:businessId/menu-categories/:categoryId",
  authenticateToken,
  /** Same gate as POST menu-categories: editing the tree is part of menu setup, not product SKU delete. */
  requireEntitlement("products.create"),
  async (req, res, next) => {
    try {
      const { businessId, categoryId } = req.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: req.user!.id, businessId: businessId as string },
      });
      if (!membership && !req.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      await deleteMenuCategory(businessId as string, categoryId as string);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  },
);

app.get("/api/public/products/:productId", async (req, res, next) => {
  try {
    const product = await getPublicProductById(req.params.productId as string);
    res.json({
      data: {
        id: product.id,
        name: product.name,
        category: product.category,
        price: formatMoney(product.price),
        imageUrl: product.imageUrl,
        business: {
          id: product.business.id,
          name: product.business.name,
          slug: product.business.slug,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/public/businesses/:businessId/products", async (req, res, next) => {
  try {
    const { business, products } = await getPublicBusinessMenu(req.params.businessId as string);
    res.json({
      data: {
        business: {
          id: business.id,
          name: business.name,
          slug: business.slug,
        },
        products: products.map(formatProductResponse),
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get(
  "/api/public/restaurant/:businessSlug/t/:tableToken",
  async (req, res, next) => {
    try {
      const payload = await getRestaurantGuestMenuPayload(
        req.params.businessSlug as string,
        req.params.tableToken as string,
      );
      res.json({
        data: {
          business: {
            id: payload.business.id,
            name: payload.business.name,
            slug: payload.business.slug,
          },
          table: {
            id: payload.table.id,
            label: payload.table.label,
            publicToken: payload.table.publicToken,
          },
          menu: {
            categories: payload.menu.categories.map(serializeRestaurantMenuNode),
            uncategorizedProducts: payload.menu.uncategorizedProducts.map(formatProductResponse),
          },
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/public/restaurant/:businessSlug/t/:tableToken/orders",
  async (req, res, next) => {
    try {
      const forwarded = req.headers["x-forwarded-for"];
      const rawIp =
        typeof forwarded === "string"
          ? forwarded.split(",")[0]?.trim()
          : Array.isArray(forwarded)
            ? forwarded[0]
            : req.socket.remoteAddress ?? "unknown";
      const ip = rawIp || "unknown";
      const rlKey = `${ip}:${req.params.businessSlug}:${req.params.tableToken}`;
      if (!allowPublicRestaurantOrder(rlKey)) {
        throw new HttpError(429, "Too many orders from this device. Try again in a minute.");
      }
      const body = createOrderBodySchema.parse(req.body);
      const order = await createRestaurantGuestOrder({
        businessSlug: req.params.businessSlug as string,
        tableToken: req.params.tableToken as string,
        lines: body.lines,
      });
      res.status(201).json({
        data: formatSaleOrder(order),
      });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/businesses/:businessId/entitlements",
  authenticateToken,
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: req.user!.id, businessId: businessId as string },
      });
      if (!membership && !req.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const slugs =
        membership || !req.user?.isPlatformOwner
          ? await getEffectiveEntitlementSlugs(req.user!.id, businessId as string)
          : await getEntitlementSlugsForBusiness(businessId as string);
      res.json({ data: { slugs } });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/dashboard/summary",
  authenticateToken,
  requireEntitlement("dashboard.view"),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: req.user!.id, businessId: businessId as string },
      });
      if (!membership && !req.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const summary = await getDashboardSummaryForBusiness(businessId as string);
      res.json({ data: summary });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/navigation-menu",
  authenticateToken,
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: req.user!.id, businessId: businessId as string },
      });
      if (!membership && !req.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      if (req.user?.isPlatformOwner && !membership) {
        res.json({ data: { services: [] } });
        return;
      }
      const services = await getBusinessNavigationMenu(req.user!.id, businessId as string);
      res.json({ data: { services } });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/plan-catalog",
  authenticateToken,
  requireBusinessOwnerOrPlatform(),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const services = await getPlanCatalogGrouped(businessId as string);
      res.json({ data: { services } });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/users/:targetUserId/plan-access",
  authenticateToken,
  requireBusinessOwnerOrPlatform(),
  async (req, res, next) => {
    try {
      const { businessId, targetUserId } = req.params;
      const targetMembership = await prisma.businessMembership.findFirst({
        where: { userId: targetUserId as string, businessId: businessId as string },
      });
      if (!targetMembership) {
        throw new HttpError(404, "User is not a member of this business.");
      }
      const systemProductIds = await getUserSystemProductIdsForBusiness(
        businessId as string,
        targetUserId as string,
      );
      res.json({
        data: {
          systemProductIds,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.put(
  "/api/businesses/:businessId/users/:targetUserId/plan-access",
  authenticateToken,
  requireBusinessOwnerOrPlatform(),
  async (req, res, next) => {
    try {
      const { businessId, targetUserId } = req.params;
      const targetMembership = await prisma.businessMembership.findFirst({
        where: { userId: targetUserId as string, businessId: businessId as string },
      });
      if (!targetMembership) {
        throw new HttpError(404, "User is not a member of this business.");
      }
      if (targetMembership.isOwner) {
        throw new HttpError(
          400,
          "The business owner always has full plan access; per-user assignments do not apply.",
        );
      }
      const body = userPlanAccessBodySchema.parse(req.body);
      await setUserSystemProductIdsForBusiness(
        businessId as string,
        targetUserId as string,
        body.systemProductIds,
      );
      const systemProductIds = await getUserSystemProductIdsForBusiness(
        businessId as string,
        targetUserId as string,
      );
      res.json({
        data: {
          systemProductIds,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

function formatCorporateBillingSnapshot(
  business: {
    industry: string | null;
    corporateBillingPlanId: string | null;
    corporateBillingInterval: BillingInterval | null;
    corporateBillingPlan: {
      id: string;
      name: string;
      monthlyPrice: Prisma.Decimal;
      quarterlyPrice: Prisma.Decimal;
      halfYearlyPrice: Prisma.Decimal;
      yearlyPrice: Prisma.Decimal;
      twoYearPrice: Prisma.Decimal;
      contractPrice: Prisma.Decimal;
      currency: string;
    } | null;
  },
):
  | {
      templateId: string | null;
      templateName: string | null;
      billingInterval: BillingInterval | null;
      currency: string;
      prices: {
        monthly: string;
        quarterly: string;
        halfYearly: string;
        yearly: string;
        twoYears: string;
        contract: string;
      } | null;
    }
  | null {
  if (!isCorporateIndustry(business.industry)) {
    return null;
  }
  const cp = business.corporateBillingPlan;
  if (!cp) {
    return {
      templateId: business.corporateBillingPlanId,
      templateName: null,
      billingInterval: business.corporateBillingInterval,
      currency: "GMD",
      prices: null,
    };
  }
  return {
    templateId: business.corporateBillingPlanId,
    templateName: cp.name,
    billingInterval: business.corporateBillingInterval,
    currency: cp.currency,
    prices: {
      monthly: formatMoney(cp.monthlyPrice),
      quarterly: formatMoney(cp.quarterlyPrice),
      halfYearly: formatMoney(cp.halfYearlyPrice),
      yearly: formatMoney(cp.yearlyPrice),
      twoYears: formatMoney(cp.twoYearPrice),
      contract: formatMoney(cp.contractPrice),
    },
  };
}

function formatSubscriptionResponse(
  subscription: {
    id: string;
    status: string;
    startDate: Date;
    currentPeriodStart: Date;
    currentPeriodEnd: Date | null;
    billingInterval: BillingInterval;
    contractPerpetual: boolean;
    cancelAtPeriodEnd: boolean;
    cancelledAt: Date | null;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    plan: {
      id: string;
      code: PlanCode;
      name: string;
      monthlyPrice: Prisma.Decimal;
      yearlyPrice: Prisma.Decimal;
      currency: string;
      description: string;
      staffLimit: number;
      outletLimit: number;
      productLimit: number;
      featureFlags: Prisma.JsonValue;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    };
    invoices?: Array<{
      id: string;
      amount: Prisma.Decimal;
      currency: string;
      status: string;
      billingPeriodStart: Date;
      billingPeriodEnd: Date;
      dueDate: Date;
      paidAt: Date | null;
      externalReference: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
  },
) {
  return {
    ...subscription,
    plan: {
      ...subscription.plan,
      monthlyPrice: formatMoney(subscription.plan.monthlyPrice),
      yearlyPrice: formatMoney(subscription.plan.yearlyPrice),
    },
    invoices: subscription.invoices?.map((invoice) => ({
      ...invoice,
      amount: formatMoney(invoice.amount),
    })),
  };
}

function formatInvoiceResponse(invoice: {
  id: string;
  amount: Prisma.Decimal;
  currency: string;
  status: string;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  dueDate: Date;
  paidAt: Date | null;
  externalReference: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...invoice,
    amount: formatMoney(invoice.amount),
  };
}

function formatUserResponse(user: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  isOwner?: boolean;
  membershipStatus?: BusinessMembershipStatus;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role.toLowerCase() as Lowercase<UserRole>,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
    isOwner: user.isOwner,
    ...(user.membershipStatus !== undefined ? { membershipStatus: user.membershipStatus } : {}),
  };
}

function formatProductResponse(product: {
  id: string;
  businessId: string;
  name: string;
  category: string;
  description: string | null;
  price: Prisma.Decimal;
  stock: number;
  reservedStock?: number;
  barcodeType: string;
  barcodeValue: string;
  qrUrl: string;
  imageUrl: string | null;
  imageColor: string;
  imageEmoji: string;
  menuCategoryId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const reserved = product.reservedStock ?? 0;
  const availableStock = Math.max(0, product.stock - reserved);
  return {
    id: product.id,
    businessId: product.businessId,
    name: product.name,
    category: product.category,
    menuCategoryId: product.menuCategoryId ?? null,
    description: product.description,
    price: Number(product.price),
    stock: product.stock,
    reservedStock: reserved,
    availableStock,
    barcodeType: product.barcodeType,
    barcodeValue: product.barcodeValue,
    qrUrl: product.qrUrl,
    imageUrl: product.imageUrl,
    imageColor: product.imageColor,
    imageEmoji: product.imageEmoji,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function serializeRestaurantMenuNode(node: MenuTreeNode): {
  id: string;
  name: string;
  sortOrder: number;
  children: ReturnType<typeof serializeRestaurantMenuNode>[];
  products: ReturnType<typeof formatProductResponse>[];
} {
  return {
    id: node.id,
    name: node.name,
    sortOrder: node.sortOrder,
    children: node.children.map(serializeRestaurantMenuNode),
    products: node.products.map(formatProductResponse),
  };
}

function mapPaymentStatusToApi(
  status: PaymentStatusType,
): "pending" | "completed" | "failed" {
  switch (status) {
    case PaymentStatus.COMPLETED:
      return "completed";
    case PaymentStatus.PENDING:
      return "pending";
    case PaymentStatus.FAILED:
    case PaymentStatus.CANCELLED:
      return "failed";
    default:
      return "pending";
  }
}

function formatSalePaymentRow(p: {
  id: string;
  orderId: string | null;
  salesInvoiceId?: string | null;
  publicCode: string;
  publicToken: string;
  businessId: string;
  method: PaymentMethodType;
  status: PaymentStatusType;
  amount: Prisma.Decimal;
  currency: string;
  provider: PaymentProviderType;
  providerRef: string;
  gatewayCode?: string | null;
  createdAt: Date;
  completedAt: Date | null;
  order?: { id: string; publicCode: string } | null;
  salesInvoice?: { id: string; publicCode: string } | null;
  recordedBy?: { id: string; name: string; email: string } | null;
}) {
  return {
    id: p.id,
    orderId: p.orderId,
    salesInvoiceId: p.salesInvoiceId ?? null,
    salesInvoicePublicCode: p.salesInvoice?.publicCode ?? null,
    orderPublicCode: p.order?.publicCode ?? null,
    publicCode: p.publicCode,
    publicToken: p.publicToken,
    businessId: p.businessId,
    amount: Number(p.amount),
    currency: p.currency,
    status: mapPaymentStatusToApi(p.status),
    reference: p.publicCode,
    providerReference: p.providerRef,
    method: p.method === PaymentMethod.QR_WALLET ? "qr_wallet" : "cash",
    provider:
      p.provider === PaymentProvider.SIMULATOR
        ? "simulator"
        : p.provider === PaymentProvider.UPFRONT_PAY
          ? "upfront pay"
          : String(p.provider).toLowerCase(),
    gatewayCode: p.gatewayCode ?? null,
    createdAt: p.createdAt.toISOString(),
    completedAt: p.completedAt?.toISOString() ?? null,
    recordedBy: p.recordedBy
      ? { id: p.recordedBy.id, name: p.recordedBy.name, email: p.recordedBy.email }
      : null,
  };
}

function formatSaleOrder(order: {
  id: string;
  businessId: string;
  publicCode: string;
  status: OrderStatusType;
  subtotal: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  total: Prisma.Decimal;
  currency: string;
  createdAt: Date;
  diningTableId?: string | null;
  tableLabelSnapshot?: string | null;
  diningTable?: { label: string } | null;
  lines: Array<{
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
  }>;
  payments?: Array<Parameters<typeof formatSalePaymentRow>[0]>;
  receipt?: { id: string; publicCode: string; receiptNumber: number } | null;
}) {
  const tableLabel =
    order.tableLabelSnapshot?.trim() ||
    order.diningTable?.label?.trim() ||
    null;
  return {
    id: order.id,
    businessId: order.businessId,
    publicCode: order.publicCode,
    status: order.status.toLowerCase(),
    subtotal: Number(order.subtotal),
    taxAmount: Number(order.taxAmount),
    total: Number(order.total),
    currency: order.currency,
    createdAt: order.createdAt.toISOString(),
    diningTableId: order.diningTableId ?? null,
    tableLabel,
    lines: order.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      productName: line.productName,
      quantity: line.quantity,
      unitPrice: Number(line.unitPrice),
      lineTotal: Number(line.lineTotal),
    })),
    payments: order.payments?.map(formatSalePaymentRow),
    receipt: order.receipt
      ? {
          id: order.receipt.id,
          publicCode: order.receipt.publicCode,
          receiptNumber: order.receipt.receiptNumber,
        }
      : null,
  };
}

function formatReceiptDetail(receipt: {
  id: string;
  publicCode: string;
  receiptNumber: number;
  total: Prisma.Decimal;
  currency: string;
  linesSnapshot: Prisma.JsonValue;
  paymentMethod: string;
  provider: string;
  providerRef: string | null;
  createdAt: Date;
  business: { name: string };
  order: {
    lines: Array<{
      productName: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }>;
  };
}) {
  return {
    id: receipt.id,
    publicCode: receipt.publicCode,
    receiptNumber: receipt.receiptNumber,
    businessName: receipt.business.name,
    total: Number(receipt.total),
    currency: receipt.currency,
    lines: receipt.linesSnapshot,
    linesFromOrder: receipt.order.lines.map((line) => ({
      productName: line.productName,
      quantity: line.quantity,
      unitPrice: Number(line.unitPrice),
      lineTotal: Number(line.lineTotal),
    })),
    paymentMethod: receipt.paymentMethod,
    provider: receipt.provider === "UPFRONT_PAY" ? "upfront pay" : receipt.provider,
    providerRef: receipt.providerRef,
    createdAt: receipt.createdAt.toISOString(),
  };
}

function formatAccessibleBusinessResponse(entry: {
  business: {
    id: string;
    name: string;
    slug: string;
    industry: string | null;
    ownerName: string;
    ownerEmail: string;
    createdAt: Date;
    updatedAt: Date;
    subscriptions?: unknown[];
  };
  currentSubscription: Parameters<typeof formatSubscriptionResponse>[0] | null;
  isOwner: boolean;
  membershipStatus: BusinessMembershipStatus;
}) {
  const { subscriptions: _subscriptions, ...business } = entry.business;

  return {
    business,
    currentSubscription: entry.currentSubscription
      ? formatSubscriptionResponse(entry.currentSubscription)
      : null,
    isOwner: entry.isOwner,
    membershipStatus: entry.membershipStatus,
  };
}

async function accessibleBusinessesWithEntitlements(
  userId: string,
  entries: Array<{
    business: {
      id: string;
      name: string;
      slug: string;
      industry: string | null;
      ownerName: string;
      ownerEmail: string;
      createdAt: Date;
      updatedAt: Date;
      subscriptions?: unknown[];
    };
    currentSubscription: Parameters<typeof formatSubscriptionResponse>[0] | null;
    isOwner: boolean;
    membershipStatus: BusinessMembershipStatus;
  }>,
) {
  return Promise.all(
    entries.map(async (entry) => ({
      ...formatAccessibleBusinessResponse(entry),
      entitlements: await getEffectiveEntitlementSlugs(userId, entry.business.id),
    })),
  );
}

app.post("/api/auth/register", optionalAuthenticateToken, async (request, response, next) => {
  try {
    const payload = registerSchema.parse(request.body);
    const result = await registerBusinessOwner({
      ownerName: payload.ownerName,
      ownerEmail: payload.ownerEmail,
      businessName: payload.businessName,
      slug: payload.slug,
      industry: payload.industry,
      planCode: payload.planCode,
      billingInterval: payload.billingInterval,
      authenticatedUserId: request.user?.id,
    });
    const token = request.user?.id ? generateToken(result.user) : null;

    response.status(201).json({
      data: {
        user: {
          ...formatUserResponse(result.user),
        },
        token,
        business: result.business,
        subscription: formatSubscriptionResponse(result.subscription),
        invoice: formatInvoiceResponse(result.invoice),
        accessibleBusinesses: await accessibleBusinessesWithEntitlements(
          result.user.id,
          result.accessibleBusinesses,
        ),
        activeBusinessId: result.activeBusinessId,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (request, response, next) => {
  try {
    const payload = loginSchema.parse(request.body);
    const result = await loginUser(payload);
    const token = generateToken(result.user);

    response.json({
      data: {
        user: {
          ...formatUserResponse(result.user),
          ...(result.platformPermissions !== undefined
            ? { platformPermissions: result.platformPermissions }
            : {}),
        },
        token,
        accessibleBusinesses: await accessibleBusinessesWithEntitlements(
          result.user.id,
          result.accessibleBusinesses,
        ),
        activeBusinessId: result.activeBusinessId,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/change-password", async (request, response, next) => {
  try {
    const payload = changePasswordSchema.parse(request.body);
    const user = await changePassword(payload);

    response.json({
      data: {
        user: formatUserResponse(user),
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/forgot-password", async (request, response, next) => {
  try {
    const payload = forgotPasswordSchema.parse(request.body);
    const result = await forgotPassword(payload);

    response.json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "qrpay-backend",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/plans", async (_request, response, next) => {
  try {
    const plans = await listPlans();

    response.json({
      data: plans.map((plan) => ({
        ...plan,
        monthlyPrice: formatMoney(plan.monthlyPrice),
        yearlyPrice: formatMoney(plan.yearlyPrice),
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/businesses", async (request, response, next) => {
  try {
    const payload = createBusinessSchema.parse(request.body);
    const business = await createBusiness(payload);

    response.status(201).json({ data: business });
  } catch (error) {
    next(error);
  }
});

app.get(
  "/api/businesses/:businessId/subscription",
  authenticateToken,
  async (request, response, next) => {
    try {
      const businessId = request.params.businessId as string;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId },
      });
      if (
        !membership &&
        !request.user?.isPlatformOwner &&
        request.user?.role !== "PLATFORM_ADMIN"
      ) {
        throw new HttpError(403, "Access denied to this business");
      }
      const result = await getBusinessSubscription(businessId);
      const corporateBilling = formatCorporateBillingSnapshot(result.business);
      const {
        subscriptions: _subscriptions,
        corporateBillingPlan: _corporateBillingPlan,
        ...business
      } = result.business;

      response.json({
        data: {
          business,
          currentSubscription: result.currentSubscription
            ? formatSubscriptionResponse(result.currentSubscription)
            : null,
          corporateBilling,
          devSubscriptionInvoicePayAllowed: isDevSubscriptionInvoicePayAllowed(),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/subscription",
  authenticateToken,
  requireBusinessOwnerOrPlatform(),
  async (request, response, next) => {
    try {
      const payload = createSubscriptionSchema.parse(request.body);
      const result = await startSubscription({
        businessId: request.params.businessId as string,
        planCode: payload.planCode,
        billingInterval: payload.billingInterval,
      });

      response.status(201).json({
        data: {
          subscription: formatSubscriptionResponse(result.subscription),
          invoice: formatInvoiceResponse(result.invoice),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.patch(
  "/api/businesses/:businessId/subscription",
  authenticateToken,
  requireBusinessOwnerOrPlatform(),
  requireSubscriptionsBillingOrPlatform(),
  async (request, response, next) => {
    try {
      const businessId = request.params.businessId as string;
      const body = changeSubscriptionPlanBodySchema.parse(request.body);
      const { subscription: updated, issuedInvoice } = await changeSubscriptionPlan({
        businessId,
        planCode: body.planCode,
        billingInterval: body.billingInterval,
      });
      const guestToken = issuedInvoice.guestToken?.trim() ?? null;
      response.json({
        data: {
          currentSubscription: formatSubscriptionResponse(updated),
          pendingInvoice: {
            ...formatInvoiceResponse(issuedInvoice),
            guestPayUrl: guestToken ? guestSubscriptionInvoiceUrl(guestToken) : null,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/payment-gateways",
  authenticateToken,
  requireBillingOrMerchantApiOrPlatform(),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: req.user!.id, businessId: businessId as string },
      });
      if (!membership && !req.user?.isPlatformOwner && req.user?.role !== "PLATFORM_ADMIN") {
        throw new HttpError(403, "Access denied to this business");
      }
      const rows = await listAddableGatewaysForBusiness();
      res.json({
        data: rows.map((g) => ({
          id: g.id,
          code: g.code,
          name: g.name,
          description: g.description,
          sortOrder: g.sortOrder,
          checkoutAdapter: g.checkoutAdapter,
        })),
      });
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/businesses/:businessId/payment-methods",
  authenticateToken,
  requireSubscriptionsBillingOrPlatform(),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: req.user!.id, businessId: businessId as string },
      });
      if (!membership && !req.user?.isPlatformOwner && req.user?.role !== "PLATFORM_ADMIN") {
        throw new HttpError(403, "Access denied to this business");
      }
      const rows = await listBusinessPaymentMethods(businessId as string);
      res.json({
        data: rows.map((m) => ({
          id: m.id,
          label: m.label,
          isDefault: m.isDefault,
          status: m.status,
          createdAt: m.createdAt.toISOString(),
          gateway: {
            id: m.gateway.id,
            code: m.gateway.code,
            name: m.gateway.name,
          },
          metadata: m.metadata,
        })),
      });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/businesses/:businessId/payment-methods",
  authenticateToken,
  requireBusinessOwnerOrPlatform(),
  requireSubscriptionsBillingOrPlatform(),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const body = addBusinessPaymentMethodBodySchema.parse(req.body);
      const created = await addBusinessPaymentMethod({
        businessId: businessId as string,
        gatewayCode: body.gatewayCode,
        label: body.label,
        isDefault: body.isDefault,
      });
      res.status(201).json({
        data: {
          id: created.id,
          label: created.label,
          isDefault: created.isDefault,
          status: created.status,
          createdAt: created.createdAt.toISOString(),
          gateway: {
            id: created.gateway.id,
            code: created.gateway.code,
            name: created.gateway.name,
          },
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.delete(
  "/api/businesses/:businessId/payment-methods/:methodId",
  authenticateToken,
  requireBusinessOwnerOrPlatform(),
  requireSubscriptionsBillingOrPlatform(),
  async (req, res, next) => {
    try {
      const { businessId, methodId } = req.params;
      await archiveBusinessPaymentMethod(businessId as string, methodId as string);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/businesses/:businessId/gateway-credentials",
  authenticateToken,
  requireBusinessOwnerOrPlatform(),
  requireMerchantApiGatewayAccess({ readonly: true }),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const credentialStatus = await listBusinessGatewayCredentialStatus(businessId as string);
      res.json({
        data: {
          credentialStatus,
          webhookEndpoints: getPaymentWebhookEndpoints(),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

app.put(
  "/api/businesses/:businessId/gateway-credentials",
  authenticateToken,
  requireBusinessOwnerOrPlatform(),
  requireMerchantApiGatewayAccess({ readonly: false }),
  async (req, res, next) => {
    try {
      const { businessId } = req.params;
      const body = putBusinessGatewayCredentialBodySchema.parse(req.body);
      await upsertBusinessGatewayCredential({
        businessId: businessId as string,
        gatewayCode: body.gatewayCode,
        secrets: body.secrets,
        replaceSecrets: body.replaceSecrets,
      });
      res.json({ data: { ok: true } });
    } catch (e) {
      next(e);
    }
  },
);

app.delete(
  "/api/businesses/:businessId/gateway-credentials/:gatewayCode",
  authenticateToken,
  requireBusinessOwnerOrPlatform(),
  requireMerchantApiGatewayAccess({ readonly: false }),
  async (req, res, next) => {
    try {
      const { businessId, gatewayCode } = req.params;
      await deleteBusinessGatewayCredential(businessId as string, gatewayCode as string);
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  },
);

app.get(
  "/api/businesses/:businessId/aps-wallet/customer-auths",
  authenticateToken,
  requireBusinessOwnerOrPlatform(),
  requireMerchantApiGatewayAccess({ readonly: true }),
  async (req, res, next) => {
    try {
      const data = await listBusinessApsWalletCustomerAuths(req.params.businessId as string);
      res.json({ data });
    } catch (e) {
      next(e);
    }
  },
);

app.delete(
  "/api/businesses/:businessId/aps-wallet/customer-auths/:authId",
  authenticateToken,
  requireBusinessOwnerOrPlatform(),
  requireMerchantApiGatewayAccess({ readonly: false }),
  async (req, res, next) => {
    try {
      await clearBusinessApsWalletCustomerAuth(
        req.params.businessId as string,
        req.params.authId as string,
      );
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/businesses/:businessId/invoices/:invoiceId/checkout",
  authenticateToken,
  requireBusinessOwnerOrPlatform(),
  requireSubscriptionsBillingOrPlatform(),
  async (req, res, next) => {
    try {
      const { businessId, invoiceId } = req.params;
      const body = subscriptionCheckoutBodySchema.parse(req.body ?? {});
      const data = await createSubscriptionInvoiceCheckout({
        gatewayCode: body.gatewayCode,
        invoiceId: invoiceId as string,
        businessId: businessId as string,
        userId: req.user!.id,
        restrictPayerMobile: body.restrictPayerMobile,
        payerPhone: body.payerPhone,
        req,
      });
      res.json({ data });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/businesses/:businessId/invoices/:invoiceId/checkout/aps-wallet/authorize",
  authenticateToken,
  requireBusinessOwnerOrPlatform(),
  requireSubscriptionsBillingOrPlatform(),
  async (req, res, next) => {
    try {
      const { businessId, invoiceId } = req.params;
      const body = apsWalletAuthorizeBodySchema.parse(req.body ?? {});
      const data = await authorizeSubscriptionInvoiceApsCheckout({
        invoiceId: invoiceId as string,
        businessId: businessId as string,
        userId: req.user!.id,
        gatewayCode: body.gatewayCode,
        payerMobile: body.payerMobile,
        req,
      });
      res.json({ data });
    } catch (e) {
      next(e);
    }
  },
);

app.post(
  "/api/businesses/:businessId/invoices/:invoiceId/checkout/aps-wallet/complete",
  authenticateToken,
  requireBusinessOwnerOrPlatform(),
  requireSubscriptionsBillingOrPlatform(),
  async (req, res, next) => {
    try {
      const { businessId, invoiceId } = req.params;
      const body = apsWalletCompleteBodySchema.parse(req.body ?? {});
      const data = await completeSubscriptionInvoiceApsCheckout({
        invoiceId: invoiceId as string,
        businessId: businessId as string,
        userId: req.user!.id,
        gatewayCode: body.gatewayCode,
        otp: body.otp,
        authState: body.authState,
        req,
      });
      res.json({ data });
    } catch (e) {
      next(e);
    }
  },
);

app.post("/api/subscriptions/:subscriptionId/renew", async (request, response, next) => {
  try {
    const result = await renewSubscription(request.params.subscriptionId);

    response.json({
      data: {
        subscription: formatSubscriptionResponse(result.subscription),
        invoice: formatInvoiceResponse(result.invoice),
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/public/pay/:publicToken", async (request, response, next) => {
  try {
    const info = await getPublicPayInfo(request.params.publicToken as string);
    if (info.kind === "sales_invoice") {
      response.json({
        data: {
          kind: "sales_invoice" as const,
          businessName: info.businessName,
          amount: info.amount,
          currency: info.currency,
          invoiceStatus: info.invoiceStatus.toLowerCase(),
          invoiceCode: info.invoiceCode,
          paymentStatus: info.paymentStatus.toLowerCase(),
          method: info.method.toLowerCase(),
        },
      });
      return;
    }
    response.json({
      data: {
        kind: "order" as const,
        businessName: info.businessName,
        amount: info.amount,
        currency: info.currency,
        orderStatus: info.orderStatus.toLowerCase(),
        paymentStatus: info.paymentStatus.toLowerCase(),
        method: info.method.toLowerCase(),
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/public/guest/quotation/:guestToken", async (request, response, next) => {
  try {
    const data = await getGuestQuotationByToken(request.params.guestToken as string);
    response.json({ data });
  } catch (error) {
    next(error);
  }
});

app.post("/api/public/guest/quotation/:guestToken/respond", async (request, response, next) => {
  try {
    const body = guestQuotationRespondBodySchema.parse(request.body ?? {});
    const data = await guestRespondQuotation(request.params.guestToken as string, body.action);
    response.json({ data });
  } catch (error) {
    next(error);
  }
});

app.get("/api/public/guest/invoice/:guestToken", async (request, response, next) => {
  try {
    const data = await getGuestInvoiceByToken(request.params.guestToken as string);
    response.json({ data });
  } catch (error) {
    next(error);
  }
});

app.get("/api/public/guest/invoice/:guestToken/wallets", async (request, response, next) => {
  try {
    const wallets = await listGuestInvoiceWallets(request.params.guestToken as string);
    response.json({ data: { wallets } });
  } catch (error) {
    next(error);
  }
});

app.post("/api/public/guest/invoice/:guestToken/payments/wallet", async (request, response, next) => {
  try {
    const body = orderWalletPaymentBodySchema.parse(request.body ?? {});
    const gatewayCode = body.gatewayCode?.trim();
    if (!gatewayCode) {
      throw new HttpError(400, "gatewayCode is required.");
    }
    const result = await startGuestInvoiceWalletCheckout(
      request.params.guestToken as string,
      { gatewayCode, payerPhone: body.payerPhone },
      request,
    );
    response.json({
      data: {
        payment: formatSalePaymentRow({
          ...result.payment,
          salesInvoice: {
            id: result.payment.salesInvoiceId!,
            publicCode: result.invoicePublicCode,
          },
        }),
        qrPayload: result.qrPayload,
        launchUrl: result.launchUrl,
        paymentHtml: result.paymentHtml,
        checkoutAdapter: result.checkoutAdapter,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/public/guest/invoice/:guestToken/payments/aps-wallet/authorize",
  async (request, response, next) => {
    try {
      const body = apsWalletAuthorizeBodySchema.parse(request.body ?? {});
      const data = await authorizeGuestSalesInvoiceApsWalletCheckout({
        guestToken: request.params.guestToken as string,
        gatewayCode: body.gatewayCode,
        payerMobile: body.payerMobile,
        req: request,
      });
      response.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/public/guest/invoice/:guestToken/payments/aps-wallet/complete",
  async (request, response, next) => {
    try {
      const body = apsWalletCompleteBodySchema.parse(request.body ?? {});
      const data = await completeGuestSalesInvoiceApsWalletCheckout({
        guestToken: request.params.guestToken as string,
        gatewayCode: body.gatewayCode,
        otp: body.otp,
        authState: body.authState,
        req: request,
      });
      response.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

app.get("/api/public/guest/platform-bill/:guestToken", async (request, response, next) => {
  try {
    const data = await getGuestPlatformBillPayload(request.params.guestToken as string);
    response.json({ data });
  } catch (error) {
    next(error);
  }
});

app.get("/api/public/guest/platform-bill/:guestToken/pdf", async (request, response, next) => {
  try {
    const { buffer, filename } = await renderGuestPlatformBillPdf(request.params.guestToken as string);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `inline; filename="${filename.replace(/"/g, "")}"`);
    response.send(buffer);
  } catch (error) {
    next(error);
  }
});

app.get("/api/public/guest/subscription-invoice/:guestToken", async (request, response, next) => {
  try {
    const data = await getGuestSubscriptionInvoiceByToken(request.params.guestToken as string);
    response.json({ data });
  } catch (error) {
    next(error);
  }
});

app.get("/api/public/guest/subscription-invoice/:guestToken/pdf", async (request, response, next) => {
  try {
    const { buffer, filename } = await renderGuestSubscriptionInvoicePdf(
      request.params.guestToken as string,
    );
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `inline; filename="${filename.replace(/"/g, "")}"`);
    response.send(buffer);
  } catch (error) {
    next(error);
  }
});

app.get(
  "/api/public/guest/subscription-invoice/:guestToken/wallets",
  async (request, response, next) => {
    try {
      const wallets = await listGuestSubscriptionInvoiceWallets(request.params.guestToken as string);
      response.json({ data: { wallets } });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/public/guest/subscription-invoice/:guestToken/payments/wallet",
  async (request, response, next) => {
    try {
      const body = orderWalletPaymentBodySchema.parse(request.body ?? {});
      const gatewayCode = body.gatewayCode?.trim();
      if (!gatewayCode) {
        throw new HttpError(400, "gatewayCode is required.");
      }
      const result = await startGuestSubscriptionInvoiceWalletCheckout(
        request.params.guestToken as string,
        { gatewayCode, payerPhone: body.payerPhone },
        request,
      );
      response.json({
        data: {
          sessionId: result.sessionId,
          launchUrl: result.launchUrl,
          paymentHtml: result.paymentHtml ?? null,
          amount: result.amount,
          currency: result.currency,
          gatewayCode: result.gatewayCode,
          paymentStatus: result.paymentStatus,
          checkoutStatus: result.checkoutStatus,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/public/guest/subscription-invoice/:guestToken/payments/aps-wallet/authorize",
  async (request, response, next) => {
    try {
      const body = apsWalletAuthorizeBodySchema.parse(request.body ?? {});
      const data = await authorizeGuestSubscriptionInvoiceApsCheckout({
        guestToken: request.params.guestToken as string,
        gatewayCode: body.gatewayCode,
        payerMobile: body.payerMobile,
        req: request,
      });
      response.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/public/guest/subscription-invoice/:guestToken/payments/aps-wallet/complete",
  async (request, response, next) => {
    try {
      const body = apsWalletCompleteBodySchema.parse(request.body ?? {});
      const data = await completeGuestSubscriptionInvoiceApsCheckout({
        guestToken: request.params.guestToken as string,
        gatewayCode: body.gatewayCode,
        otp: body.otp,
        authState: body.authState,
        req: request,
      });
      response.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

app.post("/api/public/pay/:publicToken/simulate", async (request, response, next) => {
  try {
    if (!isSimulatorPublicPayEnabled()) {
      throw new HttpError(403, "Public pay simulation is disabled.");
    }
    const result = await completeWalletPaymentByPublicToken(request.params.publicToken as string, {
      externalEventId: `sim-public-${Date.now()}`,
      settlementSource: "public_pay_simulate",
    });
    response.json({ data: result });
  } catch (error) {
    next(error);
  }
});

app.post("/api/webhooks/payments/simulator", async (request, response, next) => {
  try {
    const headerSecret = request.headers["x-simulator-secret"];
    const secret =
      typeof headerSecret === "string"
        ? headerSecret
        : Array.isArray(headerSecret)
          ? headerSecret[0]
          : undefined;
    if (!verifySimulatorWebhookSecret(secret)) {
      throw new HttpError(401, "Invalid simulator webhook secret.");
    }
    const body = simulatorWebhookBodySchema.parse(request.body);
    const result = await completeWalletPaymentByPublicToken(body.publicToken, {
      externalEventId: body.externalEventId ?? `wh-${Date.now()}`,
    });
    response.json({ data: result });
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/businesses/:businessId/orders",
  authenticateToken,
  requireEntitlement("pos.access"),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;
      const body = createOrderBodySchema.parse(request.body);

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }

      let diningTableId: string | null = null;
      let tableLabelSnapshot: string | null = null;
      const tableIdRaw = body.diningTableId?.trim();
      if (tableIdRaw) {
        const table = await prisma.diningTable.findFirst({
          where: {
            id: tableIdRaw,
            businessId: businessId as string,
            isActive: true,
          },
        });
        if (!table) {
          throw new HttpError(400, "Dining table not found or inactive.");
        }
        diningTableId = table.id;
        tableLabelSnapshot = table.label;
      }

      const order = await createOrder({
        businessId: businessId as string,
        userId: request.user!.id,
        lines: body.lines,
        diningTableId,
        tableLabelSnapshot,
      });

      response.status(201).json({
        data: formatSaleOrder(order),
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/orders",
  authenticateToken,
  requireAnyEntitlement(["orders.view", "pos.access"]),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (
        !membership &&
        !request.user?.isPlatformOwner &&
        request.user?.role !== "PLATFORM_ADMIN"
      ) {
        throw new HttpError(403, "Access denied to this business");
      }

      const page = clampPage(Number(request.query.page ?? 1));
      const pageSize = clampPageSize(Number(request.query.pageSize ?? 20));
      const q = typeof request.query.q === "string" ? request.query.q : "";
      const statusRaw = typeof request.query.status === "string" ? request.query.status : "all";
      const status =
        statusRaw === "all" ||
        statusRaw === "pending_payment" ||
        statusRaw === "paid" ||
        statusRaw === "cancelled"
          ? statusRaw
          : "all";

      const result = await listOrdersForBusiness(businessId as string, {
        page,
        pageSize,
        search: q,
        status,
      });
      response.json({
        data: {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          orders: result.orders.map((o) => formatSaleOrder(o)),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/orders/checkout-wallets",
  authenticateToken,
  requireAnyEntitlement(["pos.access", "orders.manage"]),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (
        !membership &&
        !request.user?.isPlatformOwner &&
        request.user?.role !== "PLATFORM_ADMIN"
      ) {
        throw new HttpError(403, "Access denied to this business");
      }

      const wallets = await listOrderCheckoutWallets(businessId as string);
      response.json({ data: { wallets } });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/orders/:orderId",
  authenticateToken,
  requireAnyEntitlement(["orders.view", "pos.access"]),
  async (request, response, next) => {
    try {
      const { businessId, orderId } = request.params;

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (
        !membership &&
        !request.user?.isPlatformOwner &&
        request.user?.role !== "PLATFORM_ADMIN"
      ) {
        throw new HttpError(403, "Access denied to this business");
      }

      const order = await getOrderForBusiness(orderId as string, businessId as string);
      if (!order) {
        throw new HttpError(404, "Order not found.");
      }

      response.json({
        data: formatSaleOrder({
          ...order,
          receipt: order.receipt,
        }),
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/orders/:orderId/cancel",
  authenticateToken,
  requireEntitlement("pos.access"),
  async (request, response, next) => {
    try {
      const { businessId, orderId } = request.params;

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }

      await cancelPendingOrder(orderId as string, businessId as string);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/orders/:orderId/payments/wallet",
  authenticateToken,
  requireAnyEntitlement(["pos.access", "orders.manage"]),
  async (request, response, next) => {
    try {
      const { businessId, orderId } = request.params;

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (
        !membership &&
        !request.user?.isPlatformOwner &&
        request.user?.role !== "PLATFORM_ADMIN"
      ) {
        throw new HttpError(403, "Access denied to this business");
      }

      const body = orderWalletPaymentBodySchema.parse(request.body ?? {});
      const result = await startWalletPayment(
        orderId as string,
        businessId as string,
        {
          gatewayCode: body.gatewayCode,
          payerPhone: body.payerPhone,
          recordedByUserId: request.user!.id,
        },
        request,
      );

      response.json({
        data: {
          payment: formatSalePaymentRow(result.payment),
          qrPayload: result.qrPayload,
          launchUrl: result.launchUrl,
          paymentHtml: result.paymentHtml,
          checkoutAdapter: result.checkoutAdapter,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/orders/:orderId/payments/aps-wallet/authorize",
  authenticateToken,
  requireAnyEntitlement(["pos.access", "orders.manage"]),
  async (request, response, next) => {
    try {
      const { businessId, orderId } = request.params;

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (
        !membership &&
        !request.user?.isPlatformOwner &&
        request.user?.role !== "PLATFORM_ADMIN"
      ) {
        throw new HttpError(403, "Access denied to this business");
      }

      const body = apsWalletAuthorizeBodySchema.parse(request.body ?? {});
      const data = await authorizeOrderApsWalletCheckout({
        orderId: orderId as string,
        businessId: businessId as string,
        gatewayCode: body.gatewayCode,
        payerMobile: body.payerMobile,
        recordedByUserId: request.user!.id,
        req: request,
      });
      response.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/orders/:orderId/payments/aps-wallet/complete",
  authenticateToken,
  requireAnyEntitlement(["pos.access", "orders.manage"]),
  async (request, response, next) => {
    try {
      const { businessId, orderId } = request.params;

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (
        !membership &&
        !request.user?.isPlatformOwner &&
        request.user?.role !== "PLATFORM_ADMIN"
      ) {
        throw new HttpError(403, "Access denied to this business");
      }

      const body = apsWalletCompleteBodySchema.parse(request.body ?? {});
      const data = await completeOrderApsWalletCheckout({
        orderId: orderId as string,
        businessId: businessId as string,
        gatewayCode: body.gatewayCode,
        otp: body.otp,
        authState: body.authState,
        req: request,
      });
      response.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/orders/:orderId/payments/cash",
  authenticateToken,
  requireAnyEntitlement(["pos.access", "orders.manage"]),
  async (request, response, next) => {
    try {
      const { businessId, orderId } = request.params;

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (
        !membership &&
        !request.user?.isPlatformOwner &&
        request.user?.role !== "PLATFORM_ADMIN"
      ) {
        throw new HttpError(403, "Access denied to this business");
      }

      const result = await completeCashPayment(
        orderId as string,
        businessId as string,
        request.user!.id,
      );

      response.json({
        data: {
          payment: formatSalePaymentRow(result.payment),
          receipt: {
            id: result.receipt.id,
            publicCode: result.receipt.publicCode,
            receiptNumber: result.receipt.receiptNumber,
            total: Number(result.receipt.total),
            currency: result.receipt.currency,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/orders/:orderId/payments/wallet/simulate",
  authenticateToken,
  requireAnyEntitlement(["pos.access", "orders.manage"]),
  async (request, response, next) => {
    try {
      const { businessId, orderId } = request.params;

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (
        !membership &&
        !request.user?.isPlatformOwner &&
        request.user?.role !== "PLATFORM_ADMIN"
      ) {
        throw new HttpError(403, "Access denied to this business");
      }

      const result = await completeWalletPaymentForOrder(
        orderId as string,
        businessId as string,
        request.user!.id,
      );

      response.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/payments",
  authenticateToken,
  requireEntitlement("payments.view"),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;
      const page = clampPage(Number(request.query.page ?? 1));
      const pageSize = clampPageSize(Number(request.query.pageSize ?? 20));

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }

      const result = await listPaymentsForBusiness(businessId as string, { page, pageSize });

      response.json({
        data: {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          summary: result.summary,
          payments: result.payments.map((p: (typeof result.payments)[number]) =>
            formatSalePaymentRow({
              ...p,
              completedAt: p.completedAt,
            }),
          ),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/activity-log",
  authenticateToken,
  requireAnyEntitlement(["activity.log"]),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;
      const page = clampPage(Number(request.query.page ?? 1));
      const pageSize = clampPageSize(Number(request.query.pageSize ?? 50));
      const eventType =
        typeof request.query.eventType === "string" ? request.query.eventType.trim() : "";
      const actorKindRaw =
        typeof request.query.actorKind === "string" ? request.query.actorKind.trim().toLowerCase() : "";
      let actorKind: ActivityActorKind | null = null;
      if (actorKindRaw === "user") {
        actorKind = ActivityActorKind.USER;
      } else if (actorKindRaw === "system") {
        actorKind = ActivityActorKind.SYSTEM;
      }

      const result = await listActivityLogsForBusiness(businessId as string, {
        page,
        pageSize,
        eventType: eventType || undefined,
        actorKind,
      });

      response.json({
        data: {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          logs: result.logs.map((row) => ({
            id: row.id,
            eventType: row.eventType,
            resourceType: row.resourceType,
            resourceId: row.resourceId,
            actorKind: row.actorKind === "USER" ? "user" : "system",
            actor: row.actorUser
              ? { id: row.actorUser.id, name: row.actorUser.name, email: row.actorUser.email }
              : null,
            metadata: row.metadata,
            createdAt: row.createdAt.toISOString(),
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/accounting/summary",
  authenticateToken,
  requireAnyEntitlement([
    "accounting.view",
    "accounting.chart.view",
    "sales.quotation",
    "sales.invoice",
    "sales.bill",
  ]),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }

      const data = await getAccountingSummaryForBusiness(businessId as string);
      response.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/accounting/accounts-for-reports",
  authenticateToken,
  requireAnyEntitlement([
    "accounting.reports.gl",
    "accounting.reports.pnl",
    "accounting.reports.statement",
  ]),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }

      const rows = await listChartAccountsForReports(businessId as string);
      response.json({ data: rows });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/accounting/reports/gl-balance",
  authenticateToken,
  requireEntitlement("accounting.reports.gl"),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;
      const asOf =
        typeof request.query.asOf === "string" && request.query.asOf.trim()
          ? request.query.asOf.trim()
          : new Date().toISOString().slice(0, 10);

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }

      const data = await getGlBalanceReport(businessId as string, asOf);
      response.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/accounting/reports/profit-loss",
  authenticateToken,
  requireEntitlement("accounting.reports.pnl"),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;
      const from = typeof request.query.from === "string" ? request.query.from.trim() : "";
      const to = typeof request.query.to === "string" ? request.query.to.trim() : "";
      if (!from || !to) {
        throw new HttpError(400, "Query parameters from and to (YYYY-MM-DD) are required.");
      }

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }

      const data = await getProfitLossReport(businessId as string, from, to);
      response.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/accounting/reports/account-statement",
  authenticateToken,
  requireEntitlement("accounting.reports.statement"),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;
      const idsRaw =
        typeof request.query.chartOfAccountIds === "string"
          ? request.query.chartOfAccountIds
          : typeof request.query.chartOfAccountId === "string"
            ? request.query.chartOfAccountId
            : "";
      const chartOfAccountIds = idsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const from = typeof request.query.from === "string" ? request.query.from.trim() : "";
      const to = typeof request.query.to === "string" ? request.query.to.trim() : "";
      if (chartOfAccountIds.length === 0 || !from || !to) {
        throw new HttpError(
          400,
          "Query parameters chartOfAccountId or chartOfAccountIds (comma-separated), from, and to (YYYY-MM-DD) are required.",
        );
      }

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }

      const data = await getAccountStatementsReports(
        businessId as string,
        chartOfAccountIds,
        from,
        to,
      );
      response.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/accounting/transaction-journals",
  authenticateToken,
  requireEntitlement("accounting.transaction_journal"),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }

      const page = clampPage(Number(request.query.page ?? 1));
      const pageSize = clampPageSize(Number(request.query.pageSize ?? 20));
      const from =
        typeof request.query.from === "string" && request.query.from.trim()
          ? request.query.from.trim()
          : undefined;
      const to =
        typeof request.query.to === "string" && request.query.to.trim()
          ? request.query.to.trim()
          : undefined;

      const result = await listMerchantJournalEntriesForBusiness(businessId as string, {
        page,
        pageSize,
        from,
        to,
      });

      response.json({
        data: result.rows.map((e) => ({
          id: e.id,
          businessId: e.businessId,
          businessName: e.business.name,
          postedAt: e.postedAt.toISOString(),
          memo: e.memo,
          reference: e.reference,
          sourceType: e.sourceType,
          sourceId: e.sourceId,
          journalApprovalExempt: e.journalApprovalExempt,
          approvedAt: e.approvedAt?.toISOString() ?? null,
          approvedBy: e.approvedBy
            ? { id: e.approvedBy.id, name: e.approvedBy.name, email: e.approvedBy.email }
            : null,
          cancelledAt: e.cancelledAt?.toISOString() ?? null,
          cancelledBy: e.cancelledBy
            ? { id: e.cancelledBy.id, name: e.cancelledBy.name, email: e.cancelledBy.email }
            : null,
          reversesJournalEntryId: e.reversesJournalEntryId,
          createdAt: e.createdAt.toISOString(),
        })),
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/accounting/transaction-journals/:journalEntryId",
  authenticateToken,
  requireEntitlement("accounting.transaction_journal"),
  async (request, response, next) => {
    try {
      const { businessId, journalEntryId } = request.params;

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }

      const row = await getMerchantJournalEntryForBusiness(
        businessId as string,
        journalEntryId as string,
      );
      response.json({
        data: {
          id: row.id,
          businessId: row.businessId,
          businessName: row.business.name,
          postedAt: row.postedAt.toISOString(),
          memo: row.memo,
          reference: row.reference,
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          contactId: row.contactId,
          journalApprovalExempt: row.journalApprovalExempt,
          approvedAt: row.approvedAt?.toISOString() ?? null,
          approvedBy: row.approvedBy
            ? { id: row.approvedBy.id, name: row.approvedBy.name, email: row.approvedBy.email }
            : null,
          cancelledAt: row.cancelledAt?.toISOString() ?? null,
          cancelledBy: row.cancelledBy
            ? { id: row.cancelledBy.id, name: row.cancelledBy.name, email: row.cancelledBy.email }
            : null,
          reversesJournalEntryId: row.reversesJournalEntryId,
          createdAt: row.createdAt.toISOString(),
          lines: row.lines.map((ln) => ({
            id: ln.id,
            chartOfAccountId: ln.chartOfAccountId,
            code: ln.chartOfAccount.code,
            name: ln.chartOfAccount.name,
            category: ln.chartOfAccount.category,
            debit: Number(ln.debitAmount),
            credit: Number(ln.creditAmount),
            description: ln.description,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/accounting/transaction-journals/:journalEntryId/approve",
  authenticateToken,
  requireEntitlement("accounting.transaction_journal"),
  async (request, response, next) => {
    try {
      const { businessId, journalEntryId } = request.params;
      const userId = request.user?.id;
      if (!userId) {
        throw new HttpError(401, "Unauthorized.");
      }

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }

      const row = await approveMerchantJournalEntryForBusiness(
        businessId as string,
        journalEntryId as string,
        userId,
      );
      response.json({
        data: {
          id: row.id,
          businessId: row.businessId,
          businessName: row.business.name,
          postedAt: row.postedAt.toISOString(),
          memo: row.memo,
          reference: row.reference,
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          journalApprovalExempt: row.journalApprovalExempt,
          approvedAt: row.approvedAt?.toISOString() ?? null,
          approvedBy: row.approvedBy
            ? { id: row.approvedBy.id, name: row.approvedBy.name, email: row.approvedBy.email }
            : null,
          cancelledAt: row.cancelledAt?.toISOString() ?? null,
          cancelledBy: row.cancelledBy
            ? { id: row.cancelledBy.id, name: row.cancelledBy.name, email: row.cancelledBy.email }
            : null,
          lines: row.lines.map((ln) => ({
            id: ln.id,
            chartOfAccountId: ln.chartOfAccountId,
            code: ln.chartOfAccount.code,
            name: ln.chartOfAccount.name,
            category: ln.chartOfAccount.category,
            debit: Number(ln.debitAmount),
            credit: Number(ln.creditAmount),
            description: ln.description,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/accounting/transaction-journals/:journalEntryId/cancel",
  authenticateToken,
  requireEntitlement("accounting.transaction_journal"),
  async (request, response, next) => {
    try {
      const { businessId, journalEntryId } = request.params;
      const userId = request.user?.id;
      if (!userId) {
        throw new HttpError(401, "Unauthorized.");
      }

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }

      const row = await cancelMerchantJournalEntryForBusiness(
        businessId as string,
        journalEntryId as string,
        userId,
      );
      response.json({
        data: {
          id: row.id,
          businessId: row.businessId,
          businessName: row.business.name,
          postedAt: row.postedAt.toISOString(),
          memo: row.memo,
          reference: row.reference,
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          contactId: row.contactId,
          journalApprovalExempt: row.journalApprovalExempt,
          approvedAt: row.approvedAt?.toISOString() ?? null,
          approvedBy: row.approvedBy
            ? { id: row.approvedBy.id, name: row.approvedBy.name, email: row.approvedBy.email }
            : null,
          cancelledAt: row.cancelledAt?.toISOString() ?? null,
          cancelledBy: row.cancelledBy
            ? { id: row.cancelledBy.id, name: row.cancelledBy.name, email: row.cancelledBy.email }
            : null,
          reversesJournalEntryId: row.reversesJournalEntryId,
          createdAt: row.createdAt.toISOString(),
          lines: row.lines.map((ln) => ({
            id: ln.id,
            chartOfAccountId: ln.chartOfAccountId,
            code: ln.chartOfAccount.code,
            name: ln.chartOfAccount.name,
            category: ln.chartOfAccount.category,
            debit: Number(ln.debitAmount),
            credit: Number(ln.creditAmount),
            description: ln.description,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

const createChartAccountBodySchema = z
  .object({
    kind: z.nativeEnum(ChartAccountKind).optional().default(ChartAccountKind.LEDGER),
    code: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(200),
    category: z.nativeEnum(ChartAccountCategory),
    description: z.string().trim().max(4000).optional().nullable(),
    bankAccountNumber: z.string().trim().max(64).optional().nullable(),
    bankName: z.string().trim().max(200).optional().nullable(),
    bankDetails: z.string().trim().max(4000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === ChartAccountKind.BANK) {
      if (!data.bankName?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Bank name is required for bank accounts.",
          path: ["bankName"],
        });
      }
      if (!data.bankAccountNumber?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Account number is required for bank accounts.",
          path: ["bankAccountNumber"],
        });
      }
    }
  });

app.post(
  "/api/businesses/:businessId/chart-of-accounts",
  authenticateToken,
  requireAnyEntitlement(["accounting.view", "accounting.chart.view"]),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;
      const body = createChartAccountBodySchema.parse(request.body);

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }

      const row = await createChartOfAccountForBusiness(businessId as string, {
        code: body.code,
        name: body.name,
        category: body.category,
        description: body.description ?? null,
        kind: body.kind,
        bankAccountNumber: body.bankAccountNumber ?? null,
        bankName: body.bankName ?? null,
        bankDetails: body.bankDetails ?? null,
      });

      response.status(201).json({
        data: {
          id: row.id,
          code: row.code,
          name: row.name,
          description: row.description,
          category: row.category,
          kind: row.kind,
          bankAccountNumber: row.bankAccountNumber,
          bankName: row.bankName,
          bankDetails: row.bankDetails,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

const manualJournalLineSchema = z.object({
  chartOfAccountId: z.string().min(1),
  narration: z.string().max(4000).optional().nullable(),
  quantity: z.coerce.number().positive(),
  unitLabel: z.string().trim().max(64).optional().nullable(),
  unitAmount: z.coerce.number().min(0),
  taxAmount: z.coerce.number().min(0).optional().default(0),
});

const manualMoneyInBodySchema = z.object({
  contactId: z.string().optional().nullable(),
  newContactName: z.string().trim().max(200).optional().nullable(),
  newContactEmail: z.string().trim().max(320).optional().nullable(),
  newContactPhone: z.string().trim().max(64).optional().nullable(),
  postedAt: z.string().min(1),
  reference: z.string().trim().max(200).optional().nullable(),
  settlementChartAccountId: z.string().min(1),
  lines: z.array(manualJournalLineSchema).min(1),
});

const manualMoneyOutBodySchema = manualMoneyInBodySchema;

const manualBankTransferBodySchema = z.object({
  fromChartAccountId: z.string().min(1),
  toChartAccountId: z.string().min(1),
  amount: z.coerce.number().positive(),
  postedAt: z.string().min(1),
  reference: z.string().trim().max(200).optional().nullable(),
});

const manualGeneralJournalLineSchema = z.object({
  chartOfAccountId: z.string().min(1),
  description: z.string().trim().max(4000).optional().nullable(),
  debit: z.coerce.number().min(0),
  credit: z.coerce.number().min(0),
});

const manualGeneralJournalBodySchema = z.object({
  contactId: z.string().optional().nullable(),
  newContactName: z.string().trim().max(200).optional().nullable(),
  newContactEmail: z.string().trim().max(320).optional().nullable(),
  newContactPhone: z.string().trim().max(64).optional().nullable(),
  postedAt: z.string().min(1),
  reference: z.string().trim().max(200).optional().nullable(),
  memo: z.string().trim().max(4000).optional().nullable(),
  lines: z.array(manualGeneralJournalLineSchema).min(2),
});

const journalReverseBodySchema = z.object({
  postedAt: z.string().min(1),
  memo: z.string().trim().max(2000).optional().nullable(),
});

function parsePostedAt(raw: string): Date {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new HttpError(400, "Invalid posted date.");
  }
  return d;
}

function parseOptionalIsoDate(raw: string | null | undefined): Date | null {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return null;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new HttpError(400, "Invalid date.");
  }
  return d;
}

const salesQuotationCreateBodySchema = z.object({
  contactId: z.string().min(1),
  reference: z.string().trim().max(200).optional().nullable(),
  validUntil: z.string().optional().nullable(),
  currency: z.string().trim().max(8).optional().nullable(),
  lines: z.array(manualJournalLineSchema).min(1),
});

const salesQuotationPatchBodySchema = salesQuotationCreateBodySchema.partial();

const salesInvoiceCreateBodySchema = z.object({
  contactId: z.string().min(1),
  issueDate: z.string().min(1),
  dueDate: z.string().optional().nullable(),
  reference: z.string().trim().max(200).optional().nullable(),
  currency: z.string().trim().max(8).optional().nullable(),
  /** Bank/cash asset for recording wallet / online invoice proceeds when paid. */
  settlementChartAccountId: z.string().trim().min(1).optional().nullable(),
  lines: z.array(manualJournalLineSchema).min(1),
});

const salesInvoicePatchBodySchema = salesInvoiceCreateBodySchema.partial();

const salesInvoiceMarkPaidBodySchema = z.object({
  settlementChartAccountId: z.string().min(1),
  postedAt: z.string().min(1),
});

const billCreateBodySchema = z.object({
  contactId: z.string().min(1),
  issueDate: z.string().min(1),
  dueDate: z.string().optional().nullable(),
  reference: z.string().trim().max(200).optional().nullable(),
  currency: z.string().trim().max(8).optional().nullable(),
  lines: z.array(manualJournalLineSchema).min(1),
});

const billPatchBodySchema = billCreateBodySchema.partial();

const platformBillCreateBodySchema = z.object({
  supplierId: z.string().min(1),
  issueDate: z.string().min(1),
  dueDate: z.string().optional().nullable(),
  reference: z.string().trim().max(200).optional().nullable(),
  currency: z.string().trim().max(8).optional().nullable(),
  lines: z.array(manualJournalLineSchema).min(1),
});

const platformBillPatchBodySchema = platformBillCreateBodySchema.partial();

const platformSupplierCreateBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(64).optional().nullable(),
});

const platformJournalReverseBodySchema = z.object({
  postedAt: z.string().trim().min(1),
  memo: z.string().trim().max(4000).optional().nullable(),
});

const billMarkPaidBodySchema = z.object({
  settlementChartAccountId: z.string().min(1),
  postedAt: z.string().min(1),
});

function mapSalesLineInputs(lines: z.infer<typeof manualJournalLineSchema>[]) {
  return lines.map((l) => ({
    chartOfAccountId: l.chartOfAccountId,
    narration: (l.narration ?? "").trim(),
    quantity: l.quantity,
    unitLabel: l.unitLabel,
    unitAmount: l.unitAmount,
    taxAmount: l.taxAmount ?? 0,
  }));
}

/** Contacts: journals, sales docs, dedicated Contacts screen, or org admins. */
const CONTACTS_ENTITLEMENTS = [
  "accounting.view",
  "sales.quotation",
  "sales.invoice",
  "sales.bill",
  "contacts.manage",
  "organization.manage",
] as const;

app.get(
  "/api/businesses/:businessId/contacts",
  authenticateToken,
  requireAnyEntitlement([...CONTACTS_ENTITLEMENTS]),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;
      const q = typeof request.query.q === "string" ? request.query.q : undefined;

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }

      const rows = await listBusinessContacts(businessId as string, q);
      response.json({
        data: rows.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/contacts",
  authenticateToken,
  requireAnyEntitlement([...CONTACTS_ENTITLEMENTS]),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;
      const body = z
        .object({
          name: z.string().trim().min(1).max(200),
          email: z.string().trim().max(320).optional().nullable(),
          phone: z.string().trim().max(64).optional().nullable(),
        })
        .parse(request.body);

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }

      const row = await createBusinessContact(businessId as string, body);
      response.status(201).json({
        data: {
          id: row.id,
          name: row.name,
          email: row.email,
          phone: row.phone,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/journals/money-in",
  authenticateToken,
  requireEntitlement("accounting.view"),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;
      const body = manualMoneyInBodySchema.parse(request.body);

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (!membership && !request.user?.isPlatformOwner && request.user?.role !== UserRole.PLATFORM_ADMIN) {
        throw new HttpError(403, "Access denied to this business");
      }

      const postedByPlatformUserId = postedByPlatformUserIdForMerchantJournal(request.user!, Boolean(membership));

      const entry = await postManualMoneyIn(businessId as string, {
        contactId: body.contactId ?? null,
        newContactName: body.newContactName ?? null,
        newContactEmail: body.newContactEmail ?? null,
        newContactPhone: body.newContactPhone ?? null,
        postedAt: parsePostedAt(body.postedAt),
        reference: body.reference ?? null,
        settlementChartAccountId: body.settlementChartAccountId,
        postedByPlatformUserId,
        lines: body.lines.map((l) => ({
          chartOfAccountId: l.chartOfAccountId,
          narration: l.narration ?? "",
          quantity: l.quantity,
          unitLabel: l.unitLabel ?? null,
          unitAmount: l.unitAmount,
          taxAmount: l.taxAmount ?? 0,
        })),
      });

      response.status(201).json({
        data: {
          journalEntryId: entry.id,
          postedAt: entry.postedAt.toISOString(),
          memo: entry.memo,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/journals/money-out",
  authenticateToken,
  requireEntitlement("accounting.view"),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;
      const body = manualMoneyOutBodySchema.parse(request.body);

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (!membership && !request.user?.isPlatformOwner && request.user?.role !== UserRole.PLATFORM_ADMIN) {
        throw new HttpError(403, "Access denied to this business");
      }

      const postedByPlatformUserId = postedByPlatformUserIdForMerchantJournal(request.user!, Boolean(membership));

      const entry = await postManualMoneyOut(businessId as string, {
        contactId: body.contactId ?? null,
        newContactName: body.newContactName ?? null,
        newContactEmail: body.newContactEmail ?? null,
        newContactPhone: body.newContactPhone ?? null,
        postedAt: parsePostedAt(body.postedAt),
        reference: body.reference ?? null,
        settlementChartAccountId: body.settlementChartAccountId,
        postedByPlatformUserId,
        lines: body.lines.map((l) => ({
          chartOfAccountId: l.chartOfAccountId,
          narration: l.narration ?? "",
          quantity: l.quantity,
          unitLabel: l.unitLabel ?? null,
          unitAmount: l.unitAmount,
          taxAmount: l.taxAmount ?? 0,
        })),
      });

      response.status(201).json({
        data: {
          journalEntryId: entry.id,
          postedAt: entry.postedAt.toISOString(),
          memo: entry.memo,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/journals/bank-transfer",
  authenticateToken,
  requireEntitlement("accounting.view"),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;
      const body = manualBankTransferBodySchema.parse(request.body);

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (!membership && !request.user?.isPlatformOwner && request.user?.role !== UserRole.PLATFORM_ADMIN) {
        throw new HttpError(403, "Access denied to this business");
      }

      const postedByPlatformUserId = postedByPlatformUserIdForMerchantJournal(request.user!, Boolean(membership));

      const entry = await postManualBankTransfer(businessId as string, {
        fromChartAccountId: body.fromChartAccountId,
        toChartAccountId: body.toChartAccountId,
        amount: body.amount,
        postedAt: parsePostedAt(body.postedAt),
        reference: body.reference ?? null,
        postedByPlatformUserId,
      });

      response.status(201).json({
        data: {
          journalEntryId: entry.id,
          postedAt: entry.postedAt.toISOString(),
          memo: entry.memo,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/journals/general",
  authenticateToken,
  requireEntitlement("accounting.journals.general"),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;
      const body = manualGeneralJournalBodySchema.parse(request.body);

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (!membership && !request.user?.isPlatformOwner && request.user?.role !== UserRole.PLATFORM_ADMIN) {
        throw new HttpError(403, "Access denied to this business");
      }

      const postedByPlatformUserId = postedByPlatformUserIdForMerchantJournal(request.user!, Boolean(membership));

      const entry = await postManualGeneralJournal(businessId as string, {
        contactId: body.contactId ?? null,
        newContactName: body.newContactName ?? null,
        newContactEmail: body.newContactEmail ?? null,
        newContactPhone: body.newContactPhone ?? null,
        postedAt: parsePostedAt(body.postedAt),
        reference: body.reference ?? null,
        memo: body.memo ?? null,
        postedByPlatformUserId,
        lines: body.lines.map((l) => ({
          chartOfAccountId: l.chartOfAccountId,
          description: l.description ?? null,
          debit: l.debit,
          credit: l.credit,
        })),
      });

      response.status(201).json({
        data: {
          journalEntryId: entry.id,
          postedAt: entry.postedAt.toISOString(),
          memo: entry.memo,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/journal-entries",
  authenticateToken,
  requireEntitlement("accounting.journals.reversal"),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }

      const pageRaw = request.query.page;
      const page =
        typeof pageRaw === "string" && pageRaw.trim() !== ""
          ? Number.parseInt(pageRaw, 10)
          : 1;
      const pageSizeRaw = request.query.pageSize;
      const pageSize =
        typeof pageSizeRaw === "string" && pageSizeRaw.trim() !== ""
          ? Number.parseInt(pageSizeRaw, 10)
          : 20;

      let startDate: Date | null = null;
      let endDate: Date | null = null;
      const startStr = typeof request.query.startDate === "string" ? request.query.startDate.trim() : "";
      const endStr = typeof request.query.endDate === "string" ? request.query.endDate.trim() : "";
      if (startStr) {
        startDate = utcDayBoundsFromYmd(startStr).start;
      }
      if (endStr) {
        endDate = utcDayBoundsFromYmd(endStr).end;
      }
      if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
        throw new HttpError(400, "Start date must be on or before end date.");
      }

      const stRaw = typeof request.query.sourceType === "string" ? request.query.sourceType.trim() : "";
      let sourceType: (typeof JournalSourceType)[keyof typeof JournalSourceType] | null = null;
      if (stRaw) {
        const allowed = Object.values(JournalSourceType) as string[];
        if (!allowed.includes(stRaw)) {
          throw new HttpError(400, "Invalid journal source type.");
        }
        sourceType = stRaw as (typeof JournalSourceType)[keyof typeof JournalSourceType];
      }

      const result = await listJournalEntriesPaginated(businessId as string, {
        page: Number.isFinite(page) ? page : 1,
        pageSize: Number.isFinite(pageSize) ? pageSize : 20,
        startDate,
        endDate,
        sourceType: sourceType ?? undefined,
      });

      response.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/journal-entries/:journalEntryId",
  authenticateToken,
  requireEntitlement("accounting.journals.reversal"),
  async (request, response, next) => {
    try {
      const { businessId, journalEntryId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner && request.user?.role !== UserRole.PLATFORM_ADMIN) {
        throw new HttpError(403, "Access denied to this business");
      }
      const detail = await getJournalEntryForReversalDetail(businessId as string, journalEntryId as string);
      response.json({ data: detail });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/journal-entries/:journalEntryId/reverse",
  authenticateToken,
  requireEntitlement("accounting.journals.reversal"),
  async (request, response, next) => {
    try {
      const { businessId, journalEntryId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner && request.user?.role !== UserRole.PLATFORM_ADMIN) {
        throw new HttpError(403, "Access denied to this business");
      }
      const body = journalReverseBodySchema.parse(request.body);
      const reversal = await reverseJournalEntry(businessId as string, journalEntryId as string, {
        postedAt: parsePostedAt(body.postedAt),
        memo: body.memo ?? null,
      });
      response.status(201).json({
        data: {
          journalEntryId: reversal.id,
          postedAt: reversal.postedAt.toISOString(),
          memo: reversal.memo,
          reversesJournalEntryId: journalEntryId as string,
          lineCount: reversal.lines.length,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/sales-quotations",
  authenticateToken,
  requireEntitlement("sales.quotation"),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const rows = await listSalesQuotations(businessId as string);
      response.json({ data: rows.map(formatSalesQuotationApi) });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/sales-quotations",
  authenticateToken,
  requireEntitlement("sales.quotation"),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const body = salesQuotationCreateBodySchema.parse(request.body);
      const row = await createSalesQuotation(businessId as string, {
        contactId: body.contactId,
        reference: body.reference ?? null,
        validUntil: parseOptionalIsoDate(body.validUntil),
        currency: body.currency ?? undefined,
        lines: mapSalesLineInputs(body.lines),
      });
      response.status(201).json({ data: formatSalesQuotationApi(row) });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/sales-quotations/:quotationId",
  authenticateToken,
  requireEntitlement("sales.quotation"),
  async (request, response, next) => {
    try {
      const { businessId, quotationId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const row = await getSalesQuotationById(businessId as string, quotationId as string);
      response.json({ data: formatSalesQuotationApi(row) });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/sales-quotations/:quotationId/pdf",
  authenticateToken,
  requireEntitlement("sales.quotation"),
  async (request, response, next) => {
    try {
      const { businessId, quotationId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const { buffer, filename } = await renderSalesQuotationPdfDownload(
        businessId as string,
        quotationId as string,
      );
      response.setHeader("Content-Type", "application/pdf");
      response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      response.send(buffer);
    } catch (error) {
      next(error);
    }
  },
);

app.patch(
  "/api/businesses/:businessId/sales-quotations/:quotationId",
  authenticateToken,
  requireEntitlement("sales.quotation"),
  async (request, response, next) => {
    try {
      const { businessId, quotationId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const body = salesQuotationPatchBodySchema.parse(request.body);
      const row = await updateSalesQuotationDraft(businessId as string, quotationId as string, {
        ...(body.contactId !== undefined ? { contactId: body.contactId } : {}),
        ...(body.reference !== undefined ? { reference: body.reference } : {}),
        ...(body.validUntil !== undefined ? { validUntil: parseOptionalIsoDate(body.validUntil) } : {}),
        ...(body.currency !== undefined ? { currency: body.currency ?? undefined } : {}),
        ...(body.lines !== undefined ? { lines: mapSalesLineInputs(body.lines) } : {}),
      });
      response.json({ data: formatSalesQuotationApi(row) });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/sales-quotations/:quotationId/send",
  authenticateToken,
  requireEntitlement("sales.quotation"),
  async (request, response, next) => {
    try {
      const { businessId, quotationId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const row = await sendSalesQuotation(businessId as string, quotationId as string);
      response.json({ data: formatSalesQuotationApi(row) });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/sales-quotations/:quotationId/accept",
  authenticateToken,
  requireEntitlement("sales.quotation"),
  async (request, response, next) => {
    try {
      const { businessId, quotationId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const row = await acceptSalesQuotation(businessId as string, quotationId as string);
      response.status(201).json({ data: formatSalesInvoiceApi(row) });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/sales-quotations/:quotationId/reject",
  authenticateToken,
  requireEntitlement("sales.quotation"),
  async (request, response, next) => {
    try {
      const { businessId, quotationId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const row = await rejectSalesQuotation(businessId as string, quotationId as string);
      response.json({ data: formatSalesQuotationApi(row) });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/sales-invoices",
  authenticateToken,
  requireEntitlement("sales.invoice"),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const rows = await listSalesInvoices(businessId as string);
      response.json({ data: rows.map((r) => formatSalesInvoiceApi(r)) });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/sales-invoices",
  authenticateToken,
  requireEntitlement("sales.invoice"),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const body = salesInvoiceCreateBodySchema.parse(request.body);
      const row = await createSalesInvoice(businessId as string, {
        contactId: body.contactId,
        issueDate: parsePostedAt(body.issueDate),
        dueDate: parseOptionalIsoDate(body.dueDate),
        reference: body.reference ?? null,
        currency: body.currency ?? undefined,
        settlementChartAccountId: body.settlementChartAccountId ?? undefined,
        lines: mapSalesLineInputs(body.lines),
      });
      response.status(201).json({ data: formatSalesInvoiceApi(row) });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/sales-invoices/:invoiceId",
  authenticateToken,
  requireEntitlement("sales.invoice"),
  async (request, response, next) => {
    try {
      const { businessId, invoiceId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const row = await getSalesInvoiceById(businessId as string, invoiceId as string);
      response.json({ data: formatSalesInvoiceApi(row) });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/sales-invoices/:invoiceId/pdf",
  authenticateToken,
  requireEntitlement("sales.invoice"),
  async (request, response, next) => {
    try {
      const { businessId, invoiceId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const { buffer, filename } = await renderSalesInvoicePdfDownload(
        businessId as string,
        invoiceId as string,
      );
      response.setHeader("Content-Type", "application/pdf");
      response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      response.send(buffer);
    } catch (error) {
      next(error);
    }
  },
);

app.patch(
  "/api/businesses/:businessId/sales-invoices/:invoiceId",
  authenticateToken,
  requireEntitlement("sales.invoice"),
  async (request, response, next) => {
    try {
      const { businessId, invoiceId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const body = salesInvoicePatchBodySchema.parse(request.body);
      const row = await updateSalesInvoiceDraft(businessId as string, invoiceId as string, {
        ...(body.contactId !== undefined ? { contactId: body.contactId } : {}),
        ...(body.issueDate !== undefined ? { issueDate: parsePostedAt(body.issueDate) } : {}),
        ...(body.dueDate !== undefined ? { dueDate: parseOptionalIsoDate(body.dueDate) } : {}),
        ...(body.reference !== undefined ? { reference: body.reference } : {}),
        ...(body.currency !== undefined ? { currency: body.currency ?? undefined } : {}),
        ...(body.settlementChartAccountId !== undefined
          ? { settlementChartAccountId: body.settlementChartAccountId }
          : {}),
        ...(body.lines !== undefined ? { lines: mapSalesLineInputs(body.lines) } : {}),
      });
      response.json({ data: formatSalesInvoiceApi(row) });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/sales-invoices/:invoiceId/approve",
  authenticateToken,
  requireEntitlement("sales.invoice"),
  async (request, response, next) => {
    try {
      const { businessId, invoiceId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const row = await approveSalesInvoice(businessId as string, invoiceId as string);
      response.json({ data: formatSalesInvoiceApi(row) });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/sales-invoices/:invoiceId/mark-paid",
  authenticateToken,
  requireEntitlement("sales.invoice"),
  async (request, response, next) => {
    try {
      const { businessId, invoiceId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const body = salesInvoiceMarkPaidBodySchema.parse(request.body);
      const row = await markSalesInvoicePaid(businessId as string, invoiceId as string, {
        settlementChartAccountId: body.settlementChartAccountId,
        postedAt: parsePostedAt(body.postedAt),
      });
      response.json({ data: formatSalesInvoiceApi(row) });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/sales-invoices/:invoiceId/void",
  authenticateToken,
  requireEntitlement("sales.invoice"),
  async (request, response, next) => {
    try {
      const { businessId, invoiceId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const row = await voidSalesInvoice(businessId as string, invoiceId as string);
      response.json({ data: formatSalesInvoiceApi(row) });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/bills",
  authenticateToken,
  requireEntitlement("sales.bill"),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const rows = await listBills(businessId as string);
      response.json({ data: rows.map((r) => formatBillApi(r)) });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/bills",
  authenticateToken,
  requireEntitlement("sales.bill"),
  async (request, response, next) => {
    try {
      const { businessId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const body = billCreateBodySchema.parse(request.body);
      const row = await createBill(businessId as string, {
        contactId: body.contactId,
        issueDate: parsePostedAt(body.issueDate),
        dueDate: parseOptionalIsoDate(body.dueDate),
        reference: body.reference ?? null,
        currency: body.currency ?? undefined,
        lines: mapSalesLineInputs(body.lines),
      });
      response.status(201).json({ data: formatBillApi(row) });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/bills/:billId",
  authenticateToken,
  requireEntitlement("sales.bill"),
  async (request, response, next) => {
    try {
      const { businessId, billId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const row = await getBillById(businessId as string, billId as string);
      response.json({ data: formatBillApi(row) });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/bills/:billId/pdf",
  authenticateToken,
  requireEntitlement("sales.bill"),
  async (request, response, next) => {
    try {
      const { businessId, billId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const { buffer, filename } = await renderBillPdfDownload(businessId as string, billId as string);
      response.setHeader("Content-Type", "application/pdf");
      response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      response.send(buffer);
    } catch (error) {
      next(error);
    }
  },
);

app.patch(
  "/api/businesses/:businessId/bills/:billId",
  authenticateToken,
  requireEntitlement("sales.bill"),
  async (request, response, next) => {
    try {
      const { businessId, billId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const body = billPatchBodySchema.parse(request.body);
      const row = await updateBillDraft(businessId as string, billId as string, {
        ...(body.contactId !== undefined ? { contactId: body.contactId } : {}),
        ...(body.issueDate !== undefined ? { issueDate: parsePostedAt(body.issueDate) } : {}),
        ...(body.dueDate !== undefined ? { dueDate: parseOptionalIsoDate(body.dueDate) } : {}),
        ...(body.reference !== undefined ? { reference: body.reference } : {}),
        ...(body.currency !== undefined ? { currency: body.currency ?? undefined } : {}),
        ...(body.lines !== undefined ? { lines: mapSalesLineInputs(body.lines) } : {}),
      });
      response.json({ data: formatBillApi(row) });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/bills/:billId/approve",
  authenticateToken,
  requireEntitlement("sales.bill"),
  async (request, response, next) => {
    try {
      const { businessId, billId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const row = await approveBill(businessId as string, billId as string);
      response.json({ data: formatBillApi(row) });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/bills/:billId/mark-paid",
  authenticateToken,
  requireEntitlement("sales.bill"),
  async (request, response, next) => {
    try {
      const { businessId, billId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const body = billMarkPaidBodySchema.parse(request.body);
      const row = await markBillPaid(businessId as string, billId as string, {
        settlementChartAccountId: body.settlementChartAccountId,
        postedAt: parsePostedAt(body.postedAt),
      });
      response.json({ data: formatBillApi(row) });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/bills/:billId/void",
  authenticateToken,
  requireEntitlement("sales.bill"),
  async (request, response, next) => {
    try {
      const { businessId, billId } = request.params;
      const membership = await prisma.businessMembership.findFirst({
        where: { userId: request.user!.id, businessId: businessId as string },
      });
      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }
      const row = await voidBill(businessId as string, billId as string);
      response.json({ data: formatBillApi(row) });
    } catch (error) {
      next(error);
    }
  },
);

app.get(
  "/api/businesses/:businessId/receipts/:receiptId",
  authenticateToken,
  requireEntitlement("payments.view"),
  async (request, response, next) => {
    try {
      const { businessId, receiptId } = request.params;

      const membership = await prisma.businessMembership.findFirst({
        where: {
          userId: request.user!.id,
          businessId: businessId as string,
        },
      });

      if (!membership && !request.user?.isPlatformOwner) {
        throw new HttpError(403, "Access denied to this business");
      }

      const receipt = await getReceiptForBusiness(receiptId as string, businessId as string);

      response.json({
        data: formatReceiptDetail(receipt),
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/invoices/:invoiceId/pay",
  authenticateToken,
  requireSubscriptionsBillingOrPlatform(),
  requireBusinessOwnerOrPlatform(),
  async (request, response, next) => {
    try {
      const { businessId, invoiceId } = request.params;
      const invoiceRow = await prisma.subscriptionInvoice.findFirst({
        where: { id: invoiceId as string, businessId: businessId as string },
      });
      if (!invoiceRow) {
        throw new HttpError(404, "Invoice not found.");
      }
      if (!isDevSubscriptionInvoicePayAllowed()) {
        throw new HttpError(403, "Simulated invoice pay is not enabled on this server.");
      }
      const invoice = await payInvoice(invoiceId as string);
      response.json({
        data: formatInvoiceResponse(invoice),
      });
    } catch (error) {
      next(error);
    }
  },
);

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof z.ZodError) {
      return response.status(400).json({
        error: "Validation failed.",
        details: error.issues,
      });
    }

    if (error instanceof HttpError) {
      return response.status(error.statusCode).json({
        error: error.message,
      });
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return response.status(400).json({
          error: "Image is too large. Maximum size is 5MB.",
        });
      }
      return response.status(400).json({
        error: "Invalid upload request.",
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return response.status(409).json({
        error: "Database constraint error.",
        code: error.code,
      });
    }

    console.error(error);
    return response.status(500).json({
      error: "Internal server error.",
    });
  },
);

export { app };
