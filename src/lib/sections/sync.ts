import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../prisma.js";
import { BUILTINS } from "./builtins.js";
import { guidesUsing, rerenderGuide } from "./render.js";

/** JSON with sorted keys: the database stores JSON objects with its own key order. */
const stable = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(stable).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`
      : JSON.stringify(v);

/** Creates or updates the built-in section types; re-renders guides whose built-in type changed. */
export async function syncBuiltins() {
  const changed: string[] = [];
  for (const b of BUILTINS) {
    const data = {
      name: b.name, group: b.group, description: b.description, fields: b.fields as unknown as Prisma.InputJsonValue,
      template: b.template, css: "", sample: b.sample as Prisma.InputJsonValue, tocLabel: b.tocLabel ?? "",
      placement: b.placement ?? "body", scope: b.scope ?? "any", builtIn: true, version: b.version,
    };
    const row = await prisma.sectionType.findUnique({ where: { key: b.key } });
    if (!row) {
      await prisma.sectionType.create({ data: { key: b.key, ...data } });
      continue;
    }
    if (!row.builtIn) continue; // an admin-made type with the same key wins
    if (row.version !== b.version || row.template !== b.template || stable(row.fields) !== stable(b.fields) || row.tocLabel !== (b.tocLabel ?? "")) {
      await prisma.sectionType.update({ where: { key: b.key }, data });
      changed.push(b.key);
    }
  }
  if (changed.length) {
    const guides = await guidesUsing(changed);
    for (const g of guides) await rerenderGuide(g.id);
    console.log(`Section types updated: ${changed.join(", ")} · ${guides.length} posts re-rendered`);
  }
}
