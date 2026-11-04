// Seeds the database with the content from the HouseholdMe design
// (prisma/seed-data.json, produced by `npm run extract:design`) and creates the admin user.
// Safe to re-run: records are upserted by slug.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const data = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "seed-data.json"), "utf8"));

async function main() {
  const email = (process.env.ADMIN_EMAIL || "admin@householdme.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "admin12345";
  await prisma.adminUser.upsert({
    where: { email },
    create: { email, name: "Admin", passwordHash: await bcrypt.hash(password, 12) },
    update: {},
  });

  const catIds: Record<string, string> = {};
  for (const c of data.categories) {
    const row = await prisma.category.upsert({ where: { slug: c.slug }, create: c, update: c });
    catIds[c.slug] = row.id;
  }

  const authorIds: Record<string, string> = {};
  for (const a of data.authors) {
    const fields = { ...a, onTeam: true, isTester: a.slug !== "ryan" };
    const row = await prisma.author.upsert({ where: { slug: a.slug }, create: fields, update: fields });
    authorIds[a.slug] = row.id;
  }

  for (const g of data.guides) {
    const { picks, category, author, ...rest } = g;
    const fields = { ...rest, categoryId: catIds[category], authorId: authorIds[author] };
    const guide = await prisma.guide.upsert({ where: { slug: g.slug }, create: fields, update: fields });
    for (const p of picks as any[]) {
      const pf = { ...p, guideId: guide.id };
      await prisma.product.upsert({ where: { slug: p.slug }, create: pf, update: pf });
    }
  }

  for (const i of data.info) {
    await prisma.infoPage.upsert({ where: { slug: i.slug }, create: i, update: i });
  }

  if ((await prisma.deal.count()) === 0) {
    let order = 0;
    for (const d of data.deals) {
      const product = await prisma.product.findUnique({ where: { slug: d.product } });
      if (product) await prisma.deal.create({ data: { productId: product.id, wasPrice: d.wasPrice, sortOrder: order++ } });
    }
  }

  // Images from the design for the "how we test" page and the newsletter popup
  const existing = await prisma.setting.findMany({ where: { key: { in: ["method", "site"] } } });
  if (!existing.find((s) => s.key === "method") && data.testHouseImage) {
    await prisma.setting.create({ data: { key: "method", value: { image: data.testHouseImage } } });
  }
  if (!existing.find((s) => s.key === "site") && data.newsletterImage) {
    await prisma.setting.create({ data: { key: "site", value: { newsletterImage: data.newsletterImage } } });
  }

  const counts = await Promise.all([prisma.category.count(), prisma.author.count(), prisma.guide.count(), prisma.product.count(), prisma.deal.count()]);
  console.log(`Seeded: ${counts[0]} categories, ${counts[1]} authors, ${counts[2]} guides, ${counts[3]} products, ${counts[4]} deals`);
  console.log(`Admin login: ${email} / ${process.env.ADMIN_PASSWORD ? "(ADMIN_PASSWORD from .env)" : password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
