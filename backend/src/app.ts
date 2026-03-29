import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BusinessMembershipStatus, PlanCode, Prisma, UserRole } from "@prisma/client";
import multer from "multer";
import { z } from "zod";
import { prisma } from "./lib/prisma.js";
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
  createBusiness,
  formatMoney,
  getBusinessSubscription,
  listPlans,
  payInvoice,
  renewSubscription,
  startSubscription,
} from "./services/subscription.service.js";
import {
  createProduct,
  getPublicBusinessMenu,
  getPublicProductById,
  listProductsForBusiness,
  updateProduct,
} from "./services/product.service.js";
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
import { HttpError } from "./lib/http-error.js";
import { authenticateToken, requirePlatformOwner, generateToken } from "./middleware/jwt.js";
import {
  requireAnyEntitlement,
  requireBusinessOwnerOrPlatform,
  requireEntitlement,
} from "./middleware/auth.js";

const app = express();
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

// Middleware
app.use(cors());
app.use(express.json());
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
  password: z.string().min(6),
  businessName: z.string().min(2),
  slug: z.string().min(2).optional(),
  industry: z.string().min(2).optional(),
  planCode: z.nativeEnum(PlanCode),
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
});

const createProductSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  description: z.string().optional(),
  price: z.coerce.number().positive(),
  stock: z.coerce.number().int().min(0),
  barcodeValue: z.string().optional(),
  qrUrl: z.string().url().optional(),
  imageUrl: z.string().url().max(2048).optional(),
  imageColor: z.string().optional(),
  imageEmoji: z.string().optional(),
});

const updateProductSchema = z
  .object({
    name: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    description: z.union([z.string(), z.null()]).optional(),
    price: z.coerce.number().positive().optional(),
    stock: z.coerce.number().int().min(0).optional(),
    barcodeValue: z.string().optional(),
    qrUrl: z.string().url().optional(),
    imageUrl: z.union([z.string().url().max(2048), z.null()]).optional(),
    imageColor: z.string().optional(),
    imageEmoji: z.string().optional(),
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

const userPlanAccessBodySchema = z.object({
  systemProductIds: z.array(z.string()),
});

const membershipStatusPatchSchema = z.object({
  status: z.nativeEnum(BusinessMembershipStatus),
});

// Platform Owner Routes
app.get("/api/platform/businesses", authenticateToken, requirePlatformOwner, async (req, res) => {
  const businesses = await prisma.business.findMany({
    include: {
      subscriptions: {
        include: { plan: true },
        orderBy: { createdAt: "desc" },
        take: 1
      },
      _count: {
        select: { memberships: true }
      }
    }
  });

  res.json(businesses);
});

app.get("/api/platform/users", authenticateToken, requirePlatformOwner, async (_req, res) => {
  const users = await prisma.user.findMany({
    include: {
      memberships: {
        include: { business: true }
      }
    }
  });

  res.json(users);
});

app.get("/api/platform/system-services", authenticateToken, requirePlatformOwner, async (_req, res) => {
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

app.post("/api/platform/system-services", authenticateToken, requirePlatformOwner, async (req, res, next) => {
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

app.patch("/api/platform/system-services/:serviceId", authenticateToken, requirePlatformOwner, async (req, res, next) => {
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

app.delete("/api/platform/system-services/:serviceId", authenticateToken, requirePlatformOwner, async (req, res, next) => {
  try {
    await deleteSystemService(req.params.serviceId as string);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

app.get("/api/platform/system-products", authenticateToken, requirePlatformOwner, async (req, res, next) => {
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

app.post("/api/platform/system-products", authenticateToken, requirePlatformOwner, async (req, res, next) => {
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

app.patch("/api/platform/system-products/:productId", authenticateToken, requirePlatformOwner, async (req, res, next) => {
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

app.delete("/api/platform/system-products/:productId", authenticateToken, requirePlatformOwner, async (req, res, next) => {
  try {
    await deleteSystemProduct(req.params.productId as string);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

app.get("/api/platform/plans/:planCode/entitlements", authenticateToken, requirePlatformOwner, async (req, res, next) => {
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

app.put("/api/platform/plans/:planCode/entitlements", authenticateToken, requirePlatformOwner, async (req, res, next) => {
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
      category: payload.category,
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
  barcodeType: string;
  barcodeValue: string;
  qrUrl: string;
  imageUrl: string | null;
  imageColor: string;
  imageEmoji: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: product.id,
    businessId: product.businessId,
    name: product.name,
    category: product.category,
    description: product.description,
    price: Number(product.price),
    stock: product.stock,
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

app.post("/api/auth/register", async (request, response, next) => {
  try {
    const payload = registerSchema.parse(request.body);
    const result = await registerBusinessOwner(payload);
    const token = generateToken(result.user);

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
  async (request, response, next) => {
    try {
      const result = await getBusinessSubscription(request.params.businessId);
      const { subscriptions: _subscriptions, ...business } = result.business;

      response.json({
        data: {
          business,
          currentSubscription: result.currentSubscription
            ? formatSubscriptionResponse(result.currentSubscription)
            : null,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/subscription",
  async (request, response, next) => {
    try {
      const payload = createSubscriptionSchema.parse(request.body);
      const result = await startSubscription({
        businessId: request.params.businessId,
        planCode: payload.planCode,
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

app.post("/api/invoices/:invoiceId/pay", async (request, response, next) => {
  try {
    const invoice = await payInvoice(request.params.invoiceId);

    response.json({
      data: formatInvoiceResponse(invoice),
    });
  } catch (error) {
    next(error);
  }
});

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
