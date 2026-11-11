import { z } from "zod";
import { sectionsDocSchema } from "../lib/sections/render.js";

const slug = z
  .string()
  .trim()
  .min(1, "Slug is required")
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes");
const str = z.string().default("");
const optStr = z.string().nullish().transform((v) => (v === "" ? null : (v ?? null)));
const urlOpt = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https?:\/\/\S+$/i.test(v), "Must be a full URL starting with http:// or https://");
const strList = z.array(z.string()).default([]);
const json = z.any();
const jsonList = z.array(z.any()).default([]);

export const categorySchema = z.object({
  slug,
  name: z.string().trim().min(1),
  intro: str,
  sortOrder: z.coerce.number().int().default(0),
});

export const authorSchema = z.object({
  slug,
  name: z.string().trim().min(1),
  role: str,
  short: str,
  bio: str,
  trust: str,
  imageUrl: optStr,
  linkedinUrl: urlOpt,
  youtubeUrl: urlOpt,
  facts: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
  expertise: strList,
  career: z.array(z.object({ year: z.string(), text: z.string() })).default([]),
  onTeam: z.boolean().default(true),
  isTester: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

const qa = z.array(z.object({ q: z.string(), a: z.string() })).default([]);
const changes = z.array(z.object({ date: z.string(), text: z.string() })).default([]);

export const POST_TYPES = ["BUYING_GUIDE", "SINGLE_REVIEW", "COMPARISON", "INFO_ARTICLE"] as const;

/** Top-level paths a post slug may not take, since posts live at /<slug> */
const RESERVED_ROOT = new Set([
  "admin", "api", "uploads", "author", "category", "review", "info", "guide", "deals", "search", "team",
  "newsletter", "how-we-test", "sitemap", "robots", "favicon", "icon", "apple-icon", "_next",
]);

export const guideSchema = z.object({
  slug: slug.refine((s) => !RESERVED_ROOT.has(s), "This slug is reserved by a site page; pick another"),
  type: z.enum(POST_TYPES).default("BUYING_GUIDE"),
  title: z.string().trim().min(1),
  seoTitle: optStr,
  short: z.string().trim().min(1),
  intro: str,
  published: z.boolean().default(true),
  categoryId: z.string().min(1, "Category is required"),
  authorId: z.string().min(1, "Author is required"),
  modelsTested: z.coerce.number().int().min(0).default(0),
  testWeeks: z.coerce.number().int().min(0).default(0),
  updatedLabel: str,
  publishedLabel: str,
  photoNote: str,
  coverImage: optStr,
  heroImage: optStr,
  testImage: optStr,
  forWho: str,
  howTested: str,
  howCaption: optStr,
  bought: optStr,
  criteria: strList,
  tableHead: z.array(z.string()).nullish(),
  tableRows: z.array(z.array(z.string())).nullish(),
  tableNote: optStr,
  faq: qa,
  sources: strList,
  changes,
  full: json.nullish(),
  sortOrder: z.coerce.number().int().default(0),
  // Section / HTML posts (BrasQ-style editor)
  seoDescription: optStr,
  jsonLd: optStr,
  html: str,
  css: str,
  sections: sectionsDocSchema.nullish().transform((v) => v ?? null),
  stickyBar: z
    .object({ name: z.string(), score: z.string().optional(), price: z.string().optional(), shop: z.string().optional(), url: z.string(), image: z.string().optional() })
    .nullish()
    .transform((v) => v ?? null),
  newsletterPopup: z.boolean().default(false),
});

export const productSchema = z.object({
  slug,
  name: z.string().trim().min(1),
  guideId: z.string().min(1, "Guide is required"),
  rank: z.coerce.number().int().min(0).default(0),
  label: str,
  score: z.coerce.number().min(0).max(10).default(0),
  price: z.coerce.number().int().min(0).default(0),
  verdict: str,
  pros: strList,
  cons: strList,
  images: strList,
  subtitle: optStr,
  verdictLong: optStr,
  inUseSince: optStr,
  purchase: optStr,
  readTime: optStr,
  designText: optStr,
  videoUrl: optStr,
  goodFor: strList,
  notFor: strList,
  sources: strList,
  subScores: z.array(z.object({ label: z.string(), value: z.coerce.number() })).default([]),
  shops: z
    .array(z.object({ shop: z.string(), price: z.coerce.number(), url: z.string(), note: z.string().optional() }))
    .default([]),
  priceHistory: z.array(z.object({ month: z.string(), price: z.coerce.number() })).default([]),
  results: jsonList,
  longTerm: changes,
  specs: z.array(z.object({ k: z.string(), v: z.string() })).default([]),
  compareRows: z.array(z.object({ name: z.string(), cells: z.array(z.string()) })).default([]),
  questions: z.array(z.object({ who: z.string(), q: z.string(), a: z.string() })).default([]),
  faq: qa,
  changes,
});

export const dealSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  wasPrice: z.coerce.number().int().min(0),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

export const infoPageSchema = z.object({
  slug,
  title: z.string().trim().min(1),
  lead: str,
  sections: z.array(z.object({ heading: z.string(), body: z.string() })).default([]),
  sortOrder: z.coerce.number().int().default(0),
});

export const subscribeSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  source: z.string().max(60).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
