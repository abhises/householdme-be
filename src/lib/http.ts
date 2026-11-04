import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError, type ZodType } from "zod";
import { Prisma } from "../generated/prisma/client.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new HttpError(404, `${what} not found`);

/** Parse and validate a request body; throws a 400 with field errors on failure. */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const res = schema.safeParse(body);
  if (!res.success) throw new HttpError(400, "Validation failed", formatZod(res.error));
  return res.data;
}

function formatZod(err: ZodError) {
  return err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: formatZod(err) });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      // Prisma 7 driver adapters report the columns under meta.driverAdapterError
      const meta = err.meta as { target?: string[] | string; driverAdapterError?: { cause?: { constraint?: { fields?: string[] } } } } | undefined;
      const fields = meta?.target ?? meta?.driverAdapterError?.cause?.constraint?.fields;
      const what = fields ? (Array.isArray(fields) ? fields.join(", ") : fields).replace(/"/g, "") : "slug";
      res.status(409).json({ error: `Another record already uses this ${what}` });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({ error: "Record not found" });
      return;
    }
    if (err.code === "P2003") {
      res.status(409).json({ error: "This record is still referenced by other content" });
      return;
    }
  }
  if (err?.type === "entity.too.large" || err?.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "Payload too large" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
