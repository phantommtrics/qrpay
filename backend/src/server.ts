import { app } from "./app.js";
import { env } from "./config/env.js";
import { ensurePlatformModulesSeeded } from "./services/platform-module-sync.service.js";

ensurePlatformModulesSeeded()
  .then(() => {
    app.listen(env.PORT, "0.0.0.0", () => {
      console.log(
        `QRPay backend listening on http://localhost:${env.PORT} (all interfaces — use your PC LAN IP from other devices)`,
      );
    });
  })
  .catch((err) => {
    console.error("Failed to sync platform modules from config:", err);
    process.exit(1);
  });
