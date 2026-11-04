import type { CookieOptions, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { cookieSecure, env } from "../config/env.js";
import { HttpError } from "../lib/http.js";

export const SESSION_COOKIE = "hm_admin";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface AdminSession {
  sub: string;
  email: string;
  name: string;
}

declare module "express-serve-static-core" {
  interface Request {
    admin?: AdminSession;
  }
}

export function signSession(s: AdminSession) {
  return jwt.sign(s, env.AUTH_SECRET, { expiresIn: MAX_AGE_SECONDS });
}

export const sessionCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: cookieSecure,
  path: "/",
  maxAge: MAX_AGE_SECONDS * 1000,
};

function readToken(cookie: string | undefined, header: string | undefined) {
  if (cookie) return cookie;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}

/** True when the request carries a valid admin session (used to preview drafts on public routes). */
export function hasAdminSession(req: { cookies?: Record<string, string>; headers: { authorization?: string } }) {
  const token = readToken(req.cookies?.[SESSION_COOKIE], req.headers.authorization);
  if (!token) return false;
  try {
    jwt.verify(token, env.AUTH_SECRET);
    return true;
  } catch {
    return false;
  }
}

/** Requires a valid admin session (cookie set by /api/auth/login, or a Bearer token). */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  const token = readToken(req.cookies?.[SESSION_COOKIE], req.headers.authorization);
  if (!token) return next(new HttpError(401, "Not signed in"));
  try {
    const payload = jwt.verify(token, env.AUTH_SECRET) as AdminSession;
    req.admin = { sub: payload.sub, email: payload.email, name: payload.name };
    next();
  } catch {
    next(new HttpError(401, "Session expired, please sign in again"));
  }
};
