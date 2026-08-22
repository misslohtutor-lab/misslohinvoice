import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email: "admin@missloh.local" } });
  if (!user) throw new Error("admin user missing");
  const token = "test_session_" + crypto.randomUUID().replace(/-/g, "");
  await prisma.session.create({
    data: {
      sessionToken: token,
      userId: user.id,
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24),
    },
  });
  console.log(token);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); process.exit(1); });