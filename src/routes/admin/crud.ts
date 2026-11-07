import { Router } from "express";
import type { ZodObject, ZodRawShape } from "zod";
import { notFound, parseBody } from "../../lib/http.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Delegate = {
  findMany(args?: any): Promise<any[]>;
  findUnique(args: any): Promise<any>;
  create(args: any): Promise<any>;
  update(args: any): Promise<any>;
  delete(args: any): Promise<any>;
  count(args?: any): Promise<number>;
};

interface CrudOptions {
  name: string;
  delegate: Delegate;
  schema: ZodObject<ZodRawShape>;
  /** Prisma `include` for list + detail responses */
  include?: Record<string, unknown>;
  orderBy?: unknown;
  /** Fields matched case-insensitively by ?q= */
  searchFields?: string[];
  /** Extra where filters from query string, e.g. { guideId: "guideId" } */
  filters?: Record<string, string>;
  /** Boolean filters from query string, e.g. { published: "published" } for ?published=true */
  boolFilters?: Record<string, string>;
  /** Runs after create/update; may return a reloaded item (e.g. after deriving stored fields) */
  afterWrite?: (item: any) => Promise<any | void>;
}

/**
 * Standard REST resource:
 *   GET    /        list  (?q=search, ?page=1, ?pageSize=50, plus filters)
 *   GET    /:id     detail
 *   POST   /        create
 *   PUT    /:id     replace (full validated body)
 *   PATCH  /:id     partial update
 *   DELETE /:id     delete
 */
export function crudRouter(opts: CrudOptions) {
  const r = Router();
  const { delegate, schema, include, orderBy = { createdAt: "desc" }, name } = opts;
  const after = async (item: any) => (opts.afterWrite ? ((await opts.afterWrite(item)) ?? item) : item);

  r.get("/", async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize) || 200));
    const where: Record<string, unknown> = {};
    if (q && opts.searchFields?.length) {
      where.OR = opts.searchFields.map((f) => ({ [f]: { contains: q, mode: "insensitive" } }));
    }
    for (const [param, field] of Object.entries(opts.filters ?? {})) {
      const v = req.query[param];
      if (typeof v === "string" && v) where[field] = v;
    }
    for (const [param, field] of Object.entries(opts.boolFilters ?? {})) {
      const v = req.query[param];
      if (v === "true" || v === "false") where[field] = v === "true";
    }
    const [items, total] = await Promise.all([
      // ?sort=updated lists the most recently edited first (admin post list, as in BrasQ)
      delegate.findMany({ where, include, orderBy: req.query.sort === "updated" ? { updatedAt: "desc" } : orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      delegate.count({ where }),
    ]);
    res.json({ items, total, page, pageSize });
  });

  r.get("/:id", async (req, res) => {
    const item = await delegate.findUnique({ where: { id: req.params.id }, include });
    if (!item) throw notFound(name);
    res.json(item);
  });

  r.post("/", async (req, res) => {
    const data = parseBody(schema, req.body);
    const item = await after(await delegate.create({ data, include }));
    res.status(201).json(item);
  });

  r.put("/:id", async (req, res) => {
    const data = parseBody(schema, req.body);
    const item = await after(await delegate.update({ where: { id: req.params.id }, data, include }));
    res.json(item);
  });

  r.patch("/:id", async (req, res) => {
    const data = parseBody(schema.partial(), req.body);
    const item = await after(await delegate.update({ where: { id: req.params.id }, data, include }));
    res.json(item);
  });

  r.delete("/:id", async (req, res) => {
    await delegate.delete({ where: { id: req.params.id } });
    res.status(204).end();
  });

  return r;
}
