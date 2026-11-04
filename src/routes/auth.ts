import bcrypt from "bcryptjs";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError, parseBody } from "../lib/http.js";
import { loginSchema } from "../schemas/content.js";
import { requireAdmin, SESSION_COOKIE, sessionCookieOptions, signSession } from "../middleware/auth.js";
import { z } from "zod";

export const authRouter = Router();

// Simple in-memory brute-force protection per IP.
const attempts = new Map<string, { n: number; until: number }>();
function checkRate(ip: string) {
  const a = attempts.get(ip);
  if (a && a.until > Date.now() && a.n >= 10) throw new HttpError(429, "Too many attempts, try again in 15 minutes");
}
function fail(ip: string) {
  const a = attempts.get(ip);
  const fresh = !a || a.until < Date.now();
  attempts.set(ip, { n: fresh ? 1 : a!.n + 1, until: fresh ? Date.now() + 15 * 60_000 : a!.until });
}

authRouter.post("/login", async (req, res) => {
  const ip = req.ip ?? "unknown";
  checkRate(ip);
  const { email, password } = parseBody(loginSchema, req.body);
  const user = await prisma.adminUser.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    fail(ip);
    throw new HttpError(401, "Wrong email or password");
  }
  attempts.delete(ip);
  const token = signSession({ sub: user.id, email: user.email, name: user.name });
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions);
  res.json({ user: { id: user.id, email: user.email, name: user.name } });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions, maxAge: undefined });
  res.status(204).end();
});

authRouter.get("/me", requireAdmin, (req, res) => {
  res.json({ user: { id: req.admin!.sub, email: req.admin!.email, name: req.admin!.name } });
});

authRouter.put("/password", requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = parseBody(
    z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8, "Use at least 8 characters") }),
    req.body,
  );
  const user = await prisma.adminUser.findUnique({ where: { id: req.admin!.sub } });
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) throw new HttpError(400, "Current password is wrong");
  await prisma.adminUser.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
  res.status(204).end();
});
