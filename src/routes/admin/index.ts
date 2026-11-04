import { Router } from "express";
import type { Prisma } from "../../generated/prisma/client.js";
import multer from "multer";
import { prisma } from "../../lib/prisma.js";
import { HttpError, notFound } from "../../lib/http.js";
import { getAllSettings, getSetting, isSettingKey, SETTING_DEFAULTS } from "../../lib/settings.js";
import { makeKey, storage } from "../../storage/index.js";
import { authorSchema, categorySchema, dealSchema, guideSchema, infoPageSchema, productSchema } from "../../schemas/content.js";
import { requireAdmin } from "../../middleware/auth.js";
import { crudRouter } from "./crud.js";

export const adminRouter = Router();
adminRouter.use(requireAdmin);

// ---- Dashboard ----
adminRouter.get("/stats", async (_req, res) => {
  const [guides, products, categories, authors, deals, subscribers, media, infoPages, recentGuides, recentSubscribers] =
    await Promise.all([
      prisma.guide.count(),
      prisma.product.count(),
      prisma.category.count(),
      prisma.author.count(),
      prisma.deal.count({ where: { active: true } }),
      prisma.subscriber.count(),
      prisma.media.count(),
      prisma.infoPage.count(),
      prisma.guide.findMany({ orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, title: true, slug: true, updatedAt: true } }),
      prisma.subscriber.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    ]);
  res.json({
    counts: { guides, products, categories, authors, deals, subscribers, media, infoPages },
    recentGuides,
    recentSubscribers,
    storage: storage.name,
  });
});

// ---- Content resources ----
adminRouter.use(
  "/categories",
  crudRouter({
    name: "Category",
    delegate: prisma.category,
    schema: categorySchema,
    include: { _count: { select: { guides: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    searchFields: ["name", "slug"],
  }),
);

adminRouter.use(
  "/authors",
  crudRouter({
    name: "Author",
    delegate: prisma.author,
    schema: authorSchema,
    include: { _count: { select: { guides: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    searchFields: ["name", "slug", "role"],
  }),
);

adminRouter.use(
  "/guides",
  crudRouter({
    name: "Guide",
    delegate: prisma.guide,
    schema: guideSchema,
    include: {
      category: { select: { id: true, name: true, slug: true } },
      author: { select: { id: true, name: true, slug: true } },
      products: { select: { id: true, name: true, slug: true, rank: true, label: true, score: true }, orderBy: { rank: "asc" } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    searchFields: ["title", "slug", "short"],
    filters: { categoryId: "categoryId", authorId: "authorId" },
  }),
);

adminRouter.use(
  "/products",
  crudRouter({
    name: "Product",
    delegate: prisma.product,
    schema: productSchema,
    include: { guide: { select: { id: true, title: true, slug: true, short: true } } },
    orderBy: [{ guideId: "asc" }, { rank: "asc" }],
    searchFields: ["name", "slug"],
    filters: { guideId: "guideId" },
  }),
);

adminRouter.use(
  "/deals",
  crudRouter({
    name: "Deal",
    delegate: prisma.deal,
    schema: dealSchema,
    include: { product: { select: { id: true, name: true, slug: true, price: true } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  }),
);

adminRouter.use(
  "/info-pages",
  crudRouter({
    name: "Info page",
    delegate: prisma.infoPage,
    schema: infoPageSchema,
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    searchFields: ["title", "slug"],
  }),
);

// ---- Subscribers ----
adminRouter.get("/subscribers", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const items = await prisma.subscriber.findMany({
    where: q ? { email: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: { createdAt: "desc" },
  });
  res.json({ items, total: items.length });
});

adminRouter.get("/subscribers/export.csv", async (_req, res) => {
  const items = await prisma.subscriber.findMany({ orderBy: { createdAt: "desc" } });
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = ["email,source,created_at", ...items.map((s) => [esc(s.email), esc(s.source ?? ""), s.createdAt.toISOString()].join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="subscribers.csv"');
  res.send(csv);
});

adminRouter.delete("/subscribers/:id", async (req, res) => {
  await prisma.subscriber.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// ---- Settings ----
adminRouter.get("/settings", async (_req, res) => {
  res.json({ values: await getAllSettings(), defaults: SETTING_DEFAULTS });
});

adminRouter.put("/settings/:key", async (req, res) => {
  const { key } = req.params;
  if (!isSettingKey(key)) throw new HttpError(404, `Unknown setting "${key}"`);
  if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) {
    throw new HttpError(400, "Setting value must be an object");
  }
  // Only keep keys we know about, so typos don't accumulate in the database.
  const allowed = Object.keys(SETTING_DEFAULTS[key]);
  const value = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k))) as Prisma.InputJsonObject;
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  res.json(await getSetting(key));
});

// ---- Media library ----
const ALLOWED_MIME = /^(image\/(png|jpe?g|webp|gif|avif|svg\+xml)|video\/(mp4|webm)|application\/pdf)$/;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.test(file.mimetype)) cb(null, true);
    else cb(new HttpError(415, `File type ${file.mimetype} is not allowed`));
  },
});

adminRouter.get("/media", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const items = await prisma.media.findMany({
    where: q ? { filename: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: { createdAt: "desc" },
  });
  res.json({ items, total: items.length, driver: storage.name });
});

adminRouter.post("/media", upload.array("files", 20), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw new HttpError(400, 'Send one or more files in the "files" field');
  const created = [];
  for (const f of files) {
    const stored = await storage.put({ key: makeKey(f.originalname), body: f.buffer, contentType: f.mimetype });
    created.push(
      await prisma.media.create({
        data: { key: stored.key, url: stored.url, driver: storage.name, filename: f.originalname, mimeType: f.mimetype, size: f.size },
      }),
    );
  }
  res.status(201).json({ items: created });
});

adminRouter.delete("/media/:id", async (req, res) => {
  const m = await prisma.media.findUnique({ where: { id: req.params.id } });
  if (!m) throw notFound("Media");
  if (m.driver === storage.name) await storage.delete(m.key);
  await prisma.media.delete({ where: { id: m.id } });
  res.status(204).end();
});
