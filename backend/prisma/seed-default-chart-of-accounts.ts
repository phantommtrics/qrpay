import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createMissingDefaultChartAccountsForBusiness } from "../src/services/chart-of-accounts.service.js";

const prisma = new PrismaClient();

async function main() {
  const businesses = await prisma.business.findMany({ select: { id: true, name: true } });
  for (const b of businesses) {
    await createMissingDefaultChartAccountsForBusiness(prisma, b.id);
    console.log(`Default chart of accounts ensured (missing only) for business ${b.id} (${b.name})`);
  }
  console.log(`Done. Processed ${businesses.length} business(es).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
