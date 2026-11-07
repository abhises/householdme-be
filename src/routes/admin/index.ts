import { Router } from "express";
import type { Prisma } from "../../generated/prisma/client.js";
import multer from "multer";
import { prisma } from "../../lib/prisma.js";
import { HttpError, notFound, parseBody } from "../../lib/http.js";
import { z } from "zod";
import { lookup } from "node:dns/promises";
import net from "node:net";

/** True for loopback, private, link-local and container-network addresses (blocks SSRF via URL import). */
async function isPrivateHost(host: string) {
  const addrs = net.isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addrs.length) return true;
  return addrs.some((ip) =>
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip) ||
    ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80") || ip.startsWith("::ffff:127.") || ip.startsWith("::ffff:10.") || ip.startsWith("::ffff:192.168."),
  );
}
import { getAllSettings, getSetting, isSettingKey, SETTING_DEFAULTS } from "../../lib/settings.js";
import { makeKey, storage } from "../../storage/index.js";
import { authorSchema, categorySchema, dealSchema, guideSchema, infoPageSchema, productSchema } from "../../schemas/content.js";
import { requireAdmin } from "../../middleware/auth.js";
import { crudRouter } from "./crud.js";
import { postContext, renderDoc, rerenderGuide, sectionsDocSchema } from "../../lib/sections/render.js";

export const adminRouter = Router();

/** ?page= and ?pageSize= for hand-written list routes (same defaults as crudRouter). */
function paging(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(query.pageSize) || 200));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
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

const guideAdminInclude = {
  category: { select: { id: true, name: true, slug: true } },
  author: { select: { id: true, name: true, slug: true } },
  products: { select: { id: true, name: true, slug: true, rank: true, label: true, score: true }, orderBy: { rank: "asc" as const } },
};

// ---- Section-based posts (BrasQ-style editor) ----
const POST_TYPE_ENUM = z.enum(["BUYING_GUIDE", "SINGLE_REVIEW", "COMPARISON", "INFO_ARTICLE"]);

/** Section types for the post editor's "Add section" list (built-ins are synced from code on startup). */
adminRouter.get("/section-types", async (_req, res) => {
  const types = await prisma.sectionType.findMany({ where: { scope: { in: ["any", "post"] } }, orderBy: [{ group: "asc" }, { name: "asc" }] });
  res.json({ types });
});

/** Renders unsaved sections for the editor's live preview, using the post settings from the form. */
adminRouter.post("/guides/preview", async (req, res) => {
  const b = parseBody(
    z.object({
      sections: sectionsDocSchema,
      type: POST_TYPE_ENUM.default("BUYING_GUIDE"),
      slug: z.string().default("preview"),
      title: z.string().default(""),
      intro: z.string().default(""),
      coverImage: z.string().nullish(),
      heroImage: z.string().nullish(),
      modelsTested: z.coerce.number().nullish(),
      testWeeks: z.coerce.number().nullish(),
      updatedLabel: z.string().nullish(),
      publishedLabel: z.string().nullish(),
      categoryId: z.string().nullish(),
      authorId: z.string().nullish(),
      guideId: z.string().nullish(),
    }),
    req.body,
  );
  const [category, author, products] = await Promise.all([
    b.categoryId ? prisma.category.findUnique({ where: { id: b.categoryId } }) : null,
    b.authorId ? prisma.author.findUnique({ where: { id: b.authorId } }) : null,
    b.guideId ? prisma.product.findMany({ where: { guideId: b.guideId }, select: { name: true, label: true, rank: true } }) : [],
  ]);
  const { sections, ...fields } = b;
  const html = await renderDoc(sections, await postContext({ ...fields, title: fields.title || "Untitled", category, author, products, updatedAt: new Date() }));
  res.json({ html });
});

adminRouter.use(
  "/guides",
  crudRouter({
    name: "Guide",
    delegate: prisma.guide,
    schema: guideSchema,
    include: guideAdminInclude,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    searchFields: ["title", "slug", "short"],
    filters: { categoryId: "categoryId", authorId: "authorId", type: "type" },
    boolFilters: { published: "published" },
    // section-based posts: render the stored HTML from the sections after every save
    afterWrite: async (g) => ((await rerenderGuide(g.id)) ? prisma.guide.findUnique({ where: { id: g.id }, include: guideAdminInclude }) : g),
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
  const { page, pageSize, skip, take } = paging(req.query);
  const where = q ? { email: { contains: q, mode: "insensitive" as const } } : undefined;
  const [items, total] = await Promise.all([
    prisma.subscriber.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.subscriber.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
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
  const { page, pageSize, skip, take } = paging(req.query);
  const where = q ? { filename: { contains: q, mode: "insensitive" as const } } : undefined;
  const [items, total] = await Promise.all([
    prisma.media.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.media.count({ where }),
  ]);
  res.json({ items, total, page, pageSize, driver: storage.name });
});

adminRouter.patch("/media/:id", async (req, res) => {
  const { alt } = parseBody(z.object({ alt: z.string().max(500) }), req.body);
  res.json(await prisma.media.update({ where: { id: req.params.id }, data: { alt } }));
});

// Import a remote image into the library (admin only). Only http(s), images, up to 15 MB.
adminRouter.post("/media/import", async (req, res) => {
  const { url } = parseBody(z.object({ url: z.string().url() }), req.body);
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new HttpError(400, "Only http(s) URLs can be imported");
  if (await isPrivateHost(u.hostname)) throw new HttpError(400, "That address is not allowed");
  const r = await fetch(u, { redirect: "error", signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!r || !r.ok) throw new HttpError(400, `Could not download the file${r ? ` (${r.status})` : ""}`);
  const type = (r.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!type.startsWith("image/") || !ALLOWED_MIME.test(type)) throw new HttpError(415, `Not an image (${type || "unknown type"})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 15 * 1024 * 1024) throw new HttpError(413, "Image is larger than 15 MB");
  const ext = type.split("/")[1].replace("jpeg", "jpg").replace("svg+xml", "svg");
  const base = (u.pathname.split("/").pop() || "image").replace(/\.[a-z0-9]+$/i, "") || "image";
  const filename = `${base}.${ext}`;
  const stored = await storage.put({ key: makeKey(filename), body: buf, contentType: type });
  const item = await prisma.media.create({
    data: { key: stored.key, url: stored.url, driver: storage.name, filename, mimeType: type, size: buf.length },
  });
  res.status(201).json({ items: [item] });
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
