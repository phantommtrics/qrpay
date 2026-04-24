import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { ensureDefaultPlatformChartAccounts } from "./services/platform-chart-of-accounts.service.js";
import { ensurePlatformModulesSeeded } from "./services/platform-module-sync.service.js";
import { syncSystemCatalogAndPlanEntitlements } from "./services/system-catalog-sync.service.js";
import { startPartnerOutboundWebhookWorker } from "./services/internal-partner-webhook-queue.service.js";
import { runSubscriptionRenewalInvoiceSweepOnce } from "./services/subscription.service.js";

ensurePlatformModulesSeeded()
  .then(() => syncSystemCatalogAndPlanEntitlements())
  .then(() => ensureDefaultPlatformChartAccounts(prisma))
  .then(() => {
    app.listen(env.PORT, "0.0.0.0", () => {
      console.log(
        `DPay backend listening on http://localhost:${env.PORT} (all interfaces — use your PC LAN IP from other devices)`,
      );
      startPartnerOutboundWebhookWorker();
      const sweepMs = Math.max(
        60_000,
        Number(process.env.SUBSCRIPTION_RENEWAL_SWEEP_MS ?? `${6 * 60 * 60 * 1000}`) || 6 * 60 * 60 * 1000,
      );
      void runSubscriptionRenewalInvoiceSweepOnce().catch((err) =>
        console.error("[subscription-renewal-sweep]", err),
      );
      setInterval(() => {
        void runSubscriptionRenewalInvoiceSweepOnce().catch((err) =>
          console.error("[subscription-renewal-sweep]", err),
        );
      }, sweepMs);
    });
  })
  .catch((err) => {
    console.error("Failed to sync platform modules from config:", err);
    process.exit(1);
  });
