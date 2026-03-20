import cors from "cors";
import express from "express";
import { PlanCode, Prisma } from "@prisma/client";
import { z } from "zod";
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
  ownerName: z.string().min(2),
  ownerEmail: z.string().email(),
});

const createSubscriptionSchema = z.object({
  planCode: z.nativeEnum(PlanCode),
});

const app = express();

app.use(cors());
app.use(express.json());

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
            ? {
                ...result.currentSubscription,
                plan: {
                  ...result.currentSubscription.plan,
                  monthlyPrice: formatMoney(
                    result.currentSubscription.plan.monthlyPrice,
                  ),
                },
                invoices: result.currentSubscription.invoices.map((invoice) => ({
                  ...invoice,
                  amount: formatMoney(invoice.amount),
                })),
              }
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
          subscription: {
            ...result.subscription,
            plan: {
              ...result.subscription.plan,
              monthlyPrice: formatMoney(result.subscription.plan.monthlyPrice),
            },
          },
          invoice: {
            ...result.invoice,
            amount: formatMoney(result.invoice.amount),
          },
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
        subscription: {
          ...result.subscription,
          plan: {
            ...result.subscription.plan,
            monthlyPrice: formatMoney(result.subscription.plan.monthlyPrice),
          },
        },
        invoice: {
          ...result.invoice,
          amount: formatMoney(result.invoice.amount),
        },
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
      data: {
        ...invoice,
        amount: formatMoney(invoice.amount),
      },
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
