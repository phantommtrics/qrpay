import { app } from "./app.js";
import { env } from "./config/env.js";

app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`QRPay backend listening on http://localhost:${env.PORT} (all interfaces — use your PC LAN IP from other devices)`);
});
