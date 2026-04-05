import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BillingInterval,
  BusinessMembershipStatus,
  ChartAccountCategory,
  ChartAccountKind,
  InvoiceStatus,
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
import { createSubscriptionInvoiceCheckout } from "./services/subscription-invoice-checkout.service.js";
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
import { getAccountingSummaryForBusiness } from "./services/accounting-summary.service.js";
import { createChartOfAccountForBusiness } from "./services/chart-of-accounts.service.js";
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
  requireBusinessOwnerOrPlatform,
  requireEntitlement,
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
        message: "Provide category (retail/wholesale/pharmacy) or menuCategoryId (restaurant).",
        path: ["category"],
      });
    }
  });

const updateProductSchema = z
  .object({
    name: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    menuCategoryId: z.string().min(1).optional(),
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

const orderWalletPaymentBodySchema = z.object({
  gatewayCode: z.string().min(1).optional(),
  payerPhone: z.string().optional(),
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
            currentPeriodEnd: row.currentPeriodEnd.toISOString(),
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
            currentPeriodEnd: inv.subscription.currentPeriodEnd.toISOString(),
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
              currentPeriodEnd: periodEnd.toISOString(),
              daysRemaining: subscriptionDaysRemaining(periodEnd),
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
            currentPeriodEnd: periodEnd.toISOString(),
            daysRemaining: subscriptionDaysRemaining(periodEnd),
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
            currentPeriodEnd: inv.subscription.currentPeriodEnd.toISOString(),
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

    const products = await listProductsForBusiness(businessId as string);
    res.json({
      data: products.map(formatProductResponse),
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
      menuCategoryId: payload.menuCategoryId,
      description: payload.description,
      price: payload.price,
      stock: payload.stock,
      barcodeValue: payload.barcodeValue,
      qrUrl: payload.qrUrl,
      imageUrl: payload.imageUrl,
      imageColor: payload.imageColor,
      imageEmoji: payload.imageEmoji,
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
  requireEntitlement("products.delete"),
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

function formatSubscriptionResponse(
  subscription: {
    id: string;
    status: string;
    startDate: Date;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
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
  orderId: string;
  publicCode: string;
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
  order?: { id: string; publicCode: string };
}) {
  return {
    id: p.id,
    orderId: p.orderId,
    orderPublicCode: p.order?.publicCode ?? null,
    publicCode: p.publicCode,
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
      const { subscriptions: _subscriptions, ...business } = result.business;

      response.json({
        data: {
          business,
          currentSubscription: result.currentSubscription
            ? formatSubscriptionResponse(result.currentSubscription)
            : null,
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
      const updated = await changeSubscriptionPlan({
        businessId,
        planCode: body.planCode,
        billingInterval: body.billingInterval,
      });
      response.json({
        data: {
          currentSubscription: formatSubscriptionResponse(updated),
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
  requireEntitlement("merchant.api"),
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
  requireEntitlement("merchant.api"),
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
  requireEntitlement("merchant.api"),
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
    response.json({
      data: {
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

app.post("/api/public/pay/:publicToken/simulate", async (request, response, next) => {
  try {
    if (!isSimulatorPublicPayEnabled()) {
      throw new HttpError(403, "Public pay simulation is disabled.");
    }
    const result = await completeWalletPaymentByPublicToken(request.params.publicToken as string, {
      externalEventId: `sim-public-${Date.now()}`,
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

      const result = await completeCashPayment(orderId as string, businessId as string);

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

      const result = await completeWalletPaymentForOrder(orderId as string, businessId as string);

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
  "/api/businesses/:businessId/accounting/summary",
  authenticateToken,
  requireAnyEntitlement(["accounting.view", "accounting.chart.view"]),
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
