import { z } from 'zod';
import { cleanRichText, markOutboundLinks } from './sanitize.js';

export const FIELD_TYPES = ['text', 'textarea', 'richtext', 'number', 'image', 'link', 'select', 'toggle', 'list', 'post', 'product', 'cells', 'code'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export type FieldDef = {
  key: string; label: string; type: FieldType;
  required?: boolean; help?: string; placeholder?: string; default?: unknown;
  /** select: the choices */
  options?: string[];
  /** list: the fields of one item */
  fields?: FieldDef[];
  /** product: copy these product values into empty sibling fields, e.g. { name: "name", image: "image" } */
  fill?: Record<string, string>;
  /** list: label of one item in the form, a template like "{{label}} · {{name}}" */
  itemLabel?: string;
};

export const fieldDefSchema: z.ZodType<FieldDef> = z.lazy(() => z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Field keys use letters, digits and _ and start with a letter'),
  label: z.string().min(1),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().optional(),
  help: z.string().optional(),
  placeholder: z.string().optional(),
  default: z.unknown().optional(),
  options: z.array(z.string()).optional(),
  fields: z.array(fieldDefSchema).optional(),
  fill: z.record(z.string(), z.string()).optional(),
  itemLabel: z.string().optional(),
}));
export const fieldListSchema = z.array(fieldDefSchema).superRefine((list, ctx) => {
  const seen = new Set<string>();
  list.forEach((f, i) => { if (seen.has(f.key)) ctx.addIssue({ code: 'custom', message: `Duplicate field key "${f.key}"`, path: [i, 'key'] }); seen.add(f.key); });
});

export type Ref = { posts: Set<string>; products: Set<string> };
export type Resolved = { posts: Map<string, Record<string, unknown>>; products: Map<string, Record<string, unknown>> };

/** Collects the post and product ids/slugs used by the data, so they can be loaded in one query each. */
export function collectRefs(fields: FieldDef[], data: unknown, refs: Ref) {
  const d = (data ?? {}) as Record<string, unknown>;
  for (const f of fields) {
    const v = d[f.key];
    if (f.type === 'post' && typeof v === 'string' && v) refs.posts.add(v);
    if (f.type === 'product' && typeof v === 'string' && v) refs.products.add(v);
    if (f.type === 'list' && Array.isArray(v)) v.forEach((item) => collectRefs(f.fields ?? [], item, refs));
  }
}

/** "96%* | 4.8 L | 8.9" -> [{ value: "96%", best: true }, …]. A trailing * marks the best value in a row. */
export function splitCells(s: unknown) {
  return String(s ?? '').split('|').map((c) => c.trim()).filter((c, i, a) => c !== '' || i < a.length - 1)
    .map((c) => ({ value: c.replace(/\*$/, '').trim(), best: /\*$/.test(c) }));
}

/** Plain text with blank lines becomes paragraphs; text that already has block HTML is left as it is. */
function paragraphs(html: string) {
  if (/<(p|ul|ol|h[1-6]|div|table|blockquote|section)\b/i.test(html) || !/\n\s*\n/.test(html)) return html.trim();
  return html.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean).map((x) => `<p>${x.replace(/\n/g, '<br>')}</p>`).join('');
}

/** Turns stored form values into template data: defaults, clean rich text, cells, resolved references. */
export function prepareData(fields: FieldDef[], data: unknown, resolved: Resolved): Record<string, unknown> {
  const d = (data ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    let v = d[f.key];
    if ((v === undefined || v === null || v === '') && f.default !== undefined) v = f.default;
    switch (f.type) {
      case 'richtext': out[f.key] = markOutboundLinks(paragraphs(cleanRichText(String(v ?? '')))); break;
      case 'toggle': out[f.key] = v === true || v === 'true'; break;
      case 'number': out[f.key] = v === undefined || v === null || v === '' ? '' : String(v); break;
      case 'cells': out[f.key] = splitCells(v); break;
      case 'list': out[f.key] = Array.isArray(v) ? v.map((item) => prepareData(f.fields ?? [], item, resolved)) : []; break;
      case 'post': out[f.key] = (typeof v === 'string' && resolved.posts.get(v)) || null; break;
      case 'product': out[f.key] = (typeof v === 'string' && resolved.products.get(v)) || null; break;
      default: out[f.key] = v ?? '';
    }
  }
  // product fields fill empty siblings ("name shown" falls back to the catalog name, etc.)
  for (const f of fields) {
    const p = out[f.key] as Record<string, unknown> | null;
    if (f.type !== 'product' || !p || !f.fill) continue;
    for (const [target, source] of Object.entries(f.fill)) {
      if (out[target] === '' || out[target] === undefined || out[target] === null) out[target] = p[source] ?? '';
    }
  }
  return out;
}

/** Sample values for a new section, built from the fields' defaults. */
export function emptyData(fields: FieldDef[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.default !== undefined) out[f.key] = f.default;
    else if (f.type === 'list') out[f.key] = [emptyData(f.fields ?? [])];
    else if (f.type === 'toggle') out[f.key] = false;
    else out[f.key] = '';
  }
  return out;
}
