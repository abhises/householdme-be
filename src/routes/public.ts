import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { notFound, parseBody } from "../lib/http.js";
import { getAllSettings, getSetting } from "../lib/settings.js";
import { subscribeSchema } from "../schemas/content.js";
import { hasAdminSession } from "../middleware/auth.js";
import { z } from "zod";

/**
 * Read-only API used by the public website. Responses contain only published content.
 */
export const publicRouter = Router();

const authorCard = { select: { slug: true, name: true, role: true, short: true, imageUrl: true } } as const;
const guideCardInclude = {
  category: { select: { slug: true, name: true } },
  author: { select: { slug: true, name: true, role: true, imageUrl: true } },
  products: { select: { slug: true, name: true, rank: true }, orderBy: { rank: "asc" as const }, take: 1 },
};
const published = { published: true };

// Layout data: navigation categories, footer, global switches.
publicRouter.get("/layout", async (_req, res) => {
  const [categories, infoPages, site] = await Promise.all([
    prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { slug: true, name: true, _count: { select: { guides: { where: published } } } },
    }),
    prisma.infoPage.findMany({ orderBy: { sortOrder: "asc" }, select: { slug: true, title: true } }),
    getSetting("site"),
  ]);
  res.json({ categories, infoPages, site });
});

publicRouter.get("/home", async (_req, res) => {
  const settings = await getAllSettings();
  const { home } = settings;
  const [hero, guides, categories, testers, secondary] = await Promise.all([
    prisma.guide.findFirst({ where: { slug: home.heroGuideSlug, ...published }, include: guideCardInclude }),
    prisma.guide.findMany({ where: { slug: { in: home.guideSlugs }, ...published }, include: guideCardInclude }),
    prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { slug: true, name: true, _count: { select: { guides: { where: published } } } },
    }),
    prisma.author.findMany({ where: { isTester: true }, orderBy: { sortOrder: "asc" }, ...authorCard }),
    home.heroSecondaryProductSlug
      ? prisma.product.findUnique({ where: { slug: home.heroSecondaryProductSlug }, select: { slug: true, name: true } })
      : null,
  ]);
  // Keep the order configured in settings
  const ordered = home.guideSlugs.map((s) => guides.find((g) => g.slug === s)).filter(Boolean);
  res.json({ home, steps: settings.method.steps, hero, heroSecondary: secondary, guides: ordered, categories, testers });
});

publicRouter.get("/categories/:slug", async (req, res) => {
  const category = await prisma.category.findUnique({
    where: { slug: req.params.slug },
    include: { guides: { where: published, include: guideCardInclude, orderBy: { sortOrder: "asc" } } },
  });
  if (!category) throw notFound("Category");
  const others = await prisma.category.findMany({
    where: { id: { not: category.id } },
    orderBy: { sortOrder: "asc" },
    select: { slug: true, name: true },
  });
  const authorSlugs = [...new Set(category.guides.map((g) => g.author.slug))];
  const authors = await prisma.author.findMany({ where: { slug: { in: authorSlugs } }, ...authorCard });
  res.json({ category, authors, others });
});

publicRouter.get("/guides/:slug", async (req, res) => {
  // Signed-in admins can preview drafts (?preview=1 on the site)
  const draftOk = req.query.preview === "1" && hasAdminSession(req);
  const guide = await prisma.guide.findFirst({
    where: { slug: req.params.slug, ...(draftOk ? {} : published) },
    include: {
      category: { select: { slug: true, name: true } },
      author: true,
      products: { orderBy: { rank: "asc" } },
    },
  });
  if (!guide) throw notFound("Guide");
  const site = await getSetting("site");
  const [reviewer, related, compareProducts] = await Promise.all([
    prisma.author.findUnique({ where: { slug: site.reviewerSlug }, ...authorCard }),
    prisma.guide.findMany({ where: { id: { not: guide.id }, ...published }, include: guideCardInclude, orderBy: { sortOrder: "asc" } }),
    // The long-form compare table/deep dives may reference products by slug
    prisma.product.findMany({ where: { guideId: guide.id } }),
  ]);
  related.sort((a, b) => Number(b.category.slug === guide.category.slug) - Number(a.category.slug === guide.category.slug));
  res.json({ guide, reviewer, related: related.slice(0, 3), compareProducts, site });
});

publicRouter.get("/products/:slug", async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { slug: req.params.slug },
    include: {
      guide: {
        include: {
          category: { select: { slug: true, name: true } },
          author: true,
          products: { orderBy: { rank: "asc" } },
        },
      },
    },
  });
  const draftOk = req.query.preview === "1" && hasAdminSession(req);
  if (!product || (!product.guide.published && !draftOk)) throw notFound("Product");
  const site = await getSetting("site");
  const [reviewer, sameCat, otherCat] = await Promise.all([
    prisma.author.findUnique({ where: { slug: site.reviewerSlug }, ...authorCard }),
    prisma.guide.findMany({
      where: { id: { not: product.guideId }, categoryId: product.guide.categoryId, ...published },
      select: { slug: true, title: true },
      take: 2,
    }),
    prisma.guide.findMany({
      where: { categoryId: { not: product.guide.categoryId }, ...published },
      select: { slug: true, title: true },
      orderBy: { sortOrder: "asc" },
      take: 2,
    }),
  ]);
  res.json({ product, reviewer, related: [...sameCat, ...otherCat].slice(0, 2), site });
});

publicRouter.post("/products/:slug/feedback", async (req, res) => {
  const { helpful } = parseBody(z.object({ helpful: z.boolean() }), req.body);
  await prisma.product.update({
    where: { slug: req.params.slug },
    data: helpful ? { helpfulYes: { increment: 1 } } : { helpfulNo: { increment: 1 } },
  });
  res.status(204).end();
});

publicRouter.get("/authors/:slug", async (req, res) => {
  const author = await prisma.author.findUnique({ where: { slug: req.params.slug } });
  if (!author) throw notFound("Author");
  const site = await getSetting("site");
  const isReviewer = author.slug === site.reviewerSlug;
  const guides = await prisma.guide.findMany({
    where: isReviewer ? published : { authorId: author.id, ...published },
    include: { products: { orderBy: { rank: "asc" }, take: 1, select: { slug: true, name: true, images: true } } },
    orderBy: { sortOrder: "asc" },
  });
  res.json({ author, guides, isReviewer });
});

publicRouter.get("/team", async (_req, res) => {
  const team = await prisma.author.findMany({ where: { onTeam: true }, orderBy: { sortOrder: "asc" }, ...authorCard });
  res.json({ team });
});

publicRouter.get("/method", async (_req, res) => {
  const [method, team] = await Promise.all([
    getSetting("method"),
    prisma.author.findMany({ where: { onTeam: true }, orderBy: { sortOrder: "asc" }, ...authorCard }),
  ]);
  res.json({ method, team });
});

publicRouter.get("/info/:slug", async (req, res) => {
  const page = await prisma.infoPage.findUnique({ where: { slug: req.params.slug } });
  if (!page) throw notFound("Page");
  const links = await prisma.infoPage.findMany({ orderBy: { sortOrder: "asc" }, select: { slug: true, title: true } });
  res.json({ page, links });
});

publicRouter.get("/deals", async (_req, res) => {
  const [deals, site] = await Promise.all([
    prisma.deal.findMany({
      where: { active: true, product: { guide: published } },
      orderBy: { sortOrder: "asc" },
      include: { product: { include: { guide: { select: { slug: true, short: true } } } } },
    }),
    getSetting("site"),
  ]);
  res.json({ deals, site });
});

// Every public URL slug, used by the site's sitemap.xml. Only published content is listed.
publicRouter.get("/sitemap", async (_req, res) => {
  const [categories, guides, products, authors, infoPages] = await Promise.all([
    prisma.category.findMany({
      where: { guides: { some: published } },
      orderBy: { sortOrder: "asc" },
      select: { slug: true, updatedAt: true },
    }),
    prisma.guide.findMany({ where: published, orderBy: { sortOrder: "asc" }, select: { slug: true, updatedAt: true } }),
    prisma.product.findMany({ where: { guide: published }, orderBy: { rank: "asc" }, select: { slug: true, updatedAt: true } }),
    prisma.author.findMany({ orderBy: { sortOrder: "asc" }, select: { slug: true, updatedAt: true } }),
    prisma.infoPage.findMany({ orderBy: { sortOrder: "asc" }, select: { slug: true, updatedAt: true } }),
  ]);
  res.json({ categories, guides, products, authors, infoPages });
});

publicRouter.get("/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const like = { contains: q, mode: "insensitive" as const };
  if (!q) {
    const guides = await prisma.guide.findMany({ where: published, include: guideCardInclude, orderBy: { sortOrder: "asc" } });
    res.json({ q, results: guides.map((g) => ({ type: "Buying guide", title: g.title, meta: `${g.category.name} · ${g.modelsTested} models tested`, href: `/${g.slug}` })) });
    return;
  }
  const [guides, products, authors, categories] = await Promise.all([
    prisma.guide.findMany({ where: { ...published, OR: [{ title: like }, { short: like }, { intro: like }] }, include: guideCardInclude }),
    prisma.product.findMany({ where: { guide: published, OR: [{ name: like }, { verdict: like }] }, include: { guide: { select: { title: true } } } }),
    prisma.author.findMany({ where: { OR: [{ name: like }, { role: like }] } }),
    prisma.category.findMany({ where: { OR: [{ name: like }, { intro: like }] } }),
  ]);
  res.json({
    q,
    results: [
      ...guides.map((g) => ({ type: "Buying guide", title: g.title, meta: `${g.category.name} · ${g.modelsTested} models tested`, href: `/${g.slug}` })),
      ...products.map((p) => ({ type: "Review", title: `${p.name} review`, meta: `${p.label} in ${p.guide.title.toLowerCase()} · ${p.score.toFixed(1)}`, href: `/review/${p.slug}` })),
      ...authors.map((a) => ({ type: "Editorial team", title: a.name, meta: a.role, href: `/author/${a.slug}` })),
      ...categories.map((c) => ({ type: "Category", title: c.name, meta: c.intro, href: `/category/${c.slug}` })),
    ],
  });
});

publicRouter.post("/subscribe", async (req, res) => {
  const { email, source } = parseBody(subscribeSchema, req.body);
  await prisma.subscriber.upsert({ where: { email }, create: { email, source }, update: {} });
  res.status(201).json({ ok: true });
});
