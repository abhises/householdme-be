import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { syncBuiltins } from "./lib/sections/sync.js";

const app = createApp();
const server = app.listen(env.PORT, () => {
  console.log(`HouseholdMe API listening on http://localhost:${env.PORT} (storage: ${env.STORAGE_DRIVER})`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
syncBuiltins().catch((e) => console.error("Could not sync built-in section types:", e));

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
