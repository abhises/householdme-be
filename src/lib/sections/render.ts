import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.js";
import { Prisma as P } from "../../generated/prisma/client.js";
import { prisma } from "../prisma.js";
import { getSetting } from "../settings.js";
import { slugify } from "../slug.js";
import { BUILTIN_BY_KEY } from "./builtins.js";
import { collectRefs, prepareData, type FieldDef, type Ref, type Resolved } from "./fields.js";
import { escapeHtml, renderTemplate } from "./template.js";

/*
 * Section-based posts, ported from the BrasQ post editor. A guide with `sections` is rendered to `html` on save;
 * the public guide page then shows that HTML instead of the classic guide template.
 */

export const sectionItemSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.record(z.string(), z.unknown()).default({}),
  hidden: z.boolean().optional(),
  /** Overrides the type's position: "top" / "bottom" = full width above / below the columns */
  placement: z.enum(["top", "body", "bottom"]).optional(),
  /** Overrides the name in the table of contents; "" keeps the section out of it */
  tocLabel: z.string().optional(),
});
export const sectionsDocSchema = z.object({
  /** "toc": table of contents beside the content; "wide": no table of contents; "raw": no page frame at all */
  layout: z.enum(["toc", "wide", "raw"]).default("toc"),
  /** Extra classes for the page wrapper, e.g. "bq-compare" or "bq-infopost" for those page styles */
  className: z.string().regex(/^[a-z0-9_\- ]*$/i).optional(),
  /** Heading of the table of contents (default "On this page") and whether it ends with a "Back to top" link */
  tocTitle: z.string().optional(),
  backToTop: z.boolean().optional(),
  items: z.array(sectionItemSchema),
});
export type SectionsDoc = z.infer<typeof sectionsDocSchema>;
type TypeRow = { key: string; fields: unknown; template: string; tocLabel: string; placement: string };

export const TYPE_LABEL: Record<string, string> = {
  BUYING_GUIDE: "Buying guide",
  SINGLE_REVIEW: "Review",
  COMPARISON: "Comparison",
  INFO_ARTICLE: "Explained",
};
export const guidePath = (g: { slug: string }) => `/guide/${g.slug}`;
const longDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";

type Person = { slug: string; name: string; role?: string | null; short?: string | null; bio?: string | null; imageUrl?: string | null };
export type GuideForContext = {
  type: string; slug: string; title: string; intro?: string | null; coverImage?: string | null; heroImage?: string | null;
  modelsTested?: number | null; testWeeks?: number | null; updatedLabel?: string | null; publishedLabel?: string | null;
  updatedAt?: Date | null; category?: { slug: string; name: string } | null; author?: Person | null;
  products?: { name: string; label: string; rank: number }[];
};

const person = (a: Person | null | undefined) =>
  a ? { name: a.name, url: `/author/${a.slug}`, avatar: a.imageUrl ?? "", role: a.role ?? "", short: a.short ?? "", bio: a.bio ?? "" } : null;

/** The `post` object available in every template as {{post.title}}, {{post.author.name}} … */
export async function postContext(g: GuideForContext) {
  const site = await getSetting("site");
  const reviewer = site.reviewerSlug ? await prisma.author.findUnique({ where: { slug: site.reviewerSlug } }) : null;
  const top = [...(g.products ?? [])].sort((a, b) => a.rank - b.rank)[0];
  return {
    title: g.title, excerpt: g.intro ?? "", type: g.type, typeLabel: TYPE_LABEL[g.type] ?? g.type, url: guidePath(g),
    coverImage: g.heroImage || g.coverImage || "", testedCount: g.modelsTested || "", testWeeks: g.testWeeks || "",
    topPick: top ? `${top.label}: ${top.name}` : "",
    updated: g.updatedLabel || longDate(g.updatedAt ?? new Date()), published: g.publishedLabel ?? "",
    category: g.category ? { name: g.category.name, url: `/category/${g.category.slug}` } : null,
    author: person(g.author),
    reviewer: person(reviewer),
  };
}

async function loadTypes(keys: string[]) {
  const rows = await prisma.sectionType.findMany({
    where: { key: { in: keys } },
    select: { key: true, fields: true, template: true, tocLabel: true, placement: true },
  });
  return new Map(rows.map((r) => [r.key, r as TypeRow]));
}

async function resolveRefs(refs: Ref): Promise<Resolved> {
  const ids = [...refs.posts], pids = [...refs.products];
  const [guides, products] = await Promise.all([
    ids.length ? prisma.guide.findMany({ where: { OR: [{ id: { in: ids } }, { slug: { in: ids } }] }, include: { category: true } }) : [],
    pids.length ? prisma.product.findMany({ where: { OR: [{ id: { in: pids } }, { slug: { in: pids } }] } }) : [],
  ]);
  const resolved: Resolved = { posts: new Map(), products: new Map() };
  for (const g of guides) {
    const card = {
      id: g.id, title: g.title, excerpt: g.intro, url: guidePath(g), coverImage: g.coverImage ?? g.heroImage ?? "",
      type: g.type, typeLabel: TYPE_LABEL[g.type] ?? g.type, category: g.category?.name ?? "",
    };
    resolved.posts.set(g.id, card);
    resolved.posts.set(g.slug, card);
  }
  for (const p of products) {
    const shops = ((Array.isArray(p.shops) ? p.shops : []) as { shop?: string; url?: string; price?: number }[])
      .map((s) => ({ name: s.shop ?? "", url: s.url ?? "", price: s.price ?? "" }));
    const card = {
      id: p.id, slug: p.slug, name: p.name, score: p.score.toFixed(1), price: p.price,
      priceText: p.price ? "$" + p.price.toLocaleString("en-US") : "", image: p.images[0] ?? "", summary: p.verdict,
      url: `/review/${p.slug}`, shopName: shops[0]?.name ?? "", shopUrl: shops[0]?.url ?? "", shops,
    };
    resolved.products.set(p.id, card);
    resolved.products.set(p.slug, card);
  }
  return resolved;
}

export type RenderedSection = { id: string; type: string; anchor: string; placement: string; html: string; toc: string };

/** Renders each section on its own (also used by the admin preview). */
export async function renderItems(items: SectionsDoc["items"], post: Record<string, unknown>): Promise<RenderedSection[]> {
  const visible = items.filter((s) => !s.hidden);
  const types = await loadTypes([...new Set(visible.map((s) => s.type))]);
  const refs: Ref = { posts: new Set(), products: new Set() };
  for (const s of visible) {
    const t = types.get(s.type);
    if (t) collectRefs(t.fields as FieldDef[], s.data, refs);
  }
  const resolved = await resolveRefs(refs);
  const used = new Set<string>();
  const out: RenderedSection[] = [];
  for (const s of visible) {
    const t = types.get(s.type);
    if (!t) {
      out.push({ id: s.id, type: s.type, anchor: "", placement: "body", html: `<!-- unknown section type "${escapeHtml(s.type)}" -->`, toc: "" });
      continue;
    }
    const data = prepareData(t.fields as FieldDef[], s.data, resolved);
    const builtin = BUILTIN_BY_KEY.get(s.type);
    builtin?.prepare?.(data, post);
    try {
      await builtin?.load?.(data);
    } catch (e) {
      console.error(`Section "${s.type}" could not load its data`, e);
    }
    let toc = "";
    try {
      toc = s.tocLabel !== undefined ? s.tocLabel.trim() : t.tocLabel ? renderTemplate(t.tocLabel, data, { post }).replace(/<[^>]+>/g, "").trim() : "";
    } catch {
      /* bad label: leave out of TOC */
    }
    let anchor = slugify(toc || s.type) || "s";
    if (used.has(anchor)) anchor = `${anchor}-${s.id.slice(-4)}`;
    used.add(anchor);
    let html: string;
    try {
      html = renderTemplate(t.template, data, { post, section: { id: s.id, anchor } });
    } catch (e) {
      html = `<!-- section "${escapeHtml(s.type)}" failed: ${escapeHtml((e as Error).message)} -->`;
    }
    out.push({ id: s.id, type: s.type, anchor, placement: s.placement ?? t.placement, html, toc });
  }
  return out;
}

const wrap = (s: RenderedSection) => `<div class="bq-sec bq-sec--${s.type}" id="${s.anchor}" data-section="${escapeHtml(s.id)}">${s.html}</div>`;

/** Full page HTML for a section-based post. */
export async function renderDoc(doc: SectionsDoc, post: Record<string, unknown>) {
  const parts = await renderItems(doc.items, post);
  if (doc.layout === "raw") return parts.map(wrap).join("\n");
  const top = parts.filter((p) => p.placement === "top").map(wrap).join("\n");
  const body = parts.filter((p) => p.placement !== "top" && p.placement !== "bottom").map(wrap).join("\n");
  const bottom = parts.filter((p) => p.placement === "bottom").map(wrap).join("\n");
  const tocItems = parts.filter((p) => p.toc && p.placement !== "top" && p.placement !== "bottom");
  const cls = doc.className ? ` ${doc.className.trim()}` : "";
  if (doc.layout === "wide" || tocItems.length < 2) {
    return `<article class="bq-article bq-sections bq-sections--wide${cls}">\n${top}\n<div class="bq-content bq-content--wide">\n${body}\n</div>\n${bottom}\n</article>`;
  }
  const tocTitle = doc.tocTitle?.trim() || "On this page";
  const links = tocItems.map((p) => `<a href="#${p.anchor}">${escapeHtml(p.toc)}</a>`).join("\n    ");
  return `<article class="bq-article bq-sections${cls}">
${top}
<div class="bq-layout">
  <aside class="bq-toc" data-bq-spy>
    <div class="bq-toc__title">${escapeHtml(tocTitle)}</div>
    ${links}${doc.backToTop === false ? "" : '\n    <a class="bq-toc__top" href="#">Back to top ↑</a>'}
  </aside>
  <div class="bq-content">
<details class="bq-toc-mobile"><summary>${escapeHtml(tocTitle)}</summary><nav>${tocItems.map((p) => `<a href="#${p.anchor}">${escapeHtml(p.toc)}</a>`).join("")}</nav></details>
${body}
  </div>
</div>
${bottom}
</article>`;
}

const guideInclude = {
  category: { select: { slug: true, name: true } },
  author: true,
  products: { select: { name: true, label: true, rank: true } },
} satisfies Prisma.GuideInclude;

/** Re-renders the stored HTML of one section-based guide. Returns false for plain HTML / classic guides. */
export async function rerenderGuide(id: string) {
  const g = await prisma.guide.findUnique({ where: { id }, include: guideInclude });
  if (!g || !g.sections) return false;
  const doc = sectionsDocSchema.parse(g.sections);
  const html = await renderDoc(doc, await postContext(g));
  if (html !== g.html) await prisma.guide.update({ where: { id }, data: { html, updatedAt: g.updatedAt } });
  return true;
}

/** Section-based guides that use one of the given section types. */
export async function guidesUsing(keys: string[]) {
  const rows = await prisma.guide.findMany({ where: { NOT: { sections: { equals: P.AnyNull } } }, select: { id: true, title: true, sections: true } });
  return rows.filter((r) => ((r.sections as SectionsDoc | null)?.items ?? []).some((s) => keys.includes(s.type)));
}
