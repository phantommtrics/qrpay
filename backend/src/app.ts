import cors from "cors";
import express from "express";
import { PlanCode, Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import {
  createBusinessUser,
  listBusinessUsers,
  loginUser,
  registerBusinessOwner,
} from "./services/auth.service.js";
import {
  createBusiness,
  formatMoney,
  getBusinessSubscription,
  listPlans,
  payInvoice,
  renewSubscription,
  startSubscription,
} from "./services/subscription.service.js";
import { HttpError } from "./lib/http-error.js";

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

const createSubscriptionSchema = z.object({
  planCode: z.nativeEnum(PlanCode),
});

const createBusinessUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum([UserRole.MERCHANT, UserRole.CASHIER]),
});

const app = express();

app.use(cors());
app.use(express.json());

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
  createdAt: Date;
}) {
  return {
    ...user,
    role: user.role.toLowerCase() as Lowercase<UserRole>,
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
}) {
  const { subscriptions: _subscriptions, ...business } = entry.business;

  return {
    business,
    currentSubscription: entry.currentSubscription
      ? formatSubscriptionResponse(entry.currentSubscription)
      : null,
    isOwner: entry.isOwner,
  };
}

app.post("/api/auth/register", async (request, response, next) => {
  try {
    const payload = registerSchema.parse(request.body);
    const result = await registerBusinessOwner(payload);

    response.status(201).json({
      data: {
        user: {
          ...formatUserResponse(result.user),
        },
        business: result.business,
        subscription: formatSubscriptionResponse(result.subscription),
        invoice: formatInvoiceResponse(result.invoice),
        accessibleBusinesses: result.accessibleBusinesses.map(
          formatAccessibleBusinessResponse,
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

    response.json({
      data: {
        user: {
          ...formatUserResponse(result.user),
        },
        accessibleBusinesses: result.accessibleBusinesses.map(
          formatAccessibleBusinessResponse,
        ),
        activeBusinessId: result.activeBusinessId,
      },
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
  "/api/businesses/:businessId/users",
  async (request, response, next) => {
    try {
      const users = await listBusinessUsers(request.params.businessId);

      response.json({
        data: users.map(formatUserResponse),
      });
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/api/businesses/:businessId/users",
  async (request, response, next) => {
    try {
      const payload = createBusinessUserSchema.parse(request.body);
      const user = await createBusinessUser({
        businessId: request.params.businessId,
        ...payload,
      });

      response.status(201).json({
        data: formatUserResponse(user),
      });
    } catch (error) {
      next(error);
    }
  },
);

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
