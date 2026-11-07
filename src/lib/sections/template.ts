/**
 * A small, logic-free template language for section types (Mustache-like).
 *
 *   {{field}}            value, HTML-escaped          {{post.title}}  dotted paths
 *   {{{field}}}          value as HTML (rich text)
 *   {{#list}}…{{/list}}  repeat for each item; for an object/true value render once
 *   {{^field}}…{{/field}} render only when the value is empty / false / []
 *   {{.}}                the current item (lists of plain strings)
 *   {{@index}} {{@number}} {{@n}} {{@first}} {{@last}}   inside a list: 0-based, 1-based, "01", booleans
 *   {{! comment }}
 */

type Node =
  | { t: 'text'; v: string }
  | { t: 'var'; path: string; raw: boolean }
  | { t: 'section'; path: string; inverted: boolean; children: Node[] };

const TAG = /\{\{(\{?)\s*([#^/!]?)\s*([^}]*?)\s*\}?\}\}/g;

export class TemplateError extends Error {}

function parse(src: string): Node[] {
  const root: Node[] = [];
  const stack: { path: string; nodes: Node[] }[] = [{ path: '', nodes: root }];
  let last = 0;
  for (const m of src.matchAll(TAG)) {
    const [whole, brace, sigil, name] = m;
    const top = stack[stack.length - 1];
    if (m.index! > last) top.nodes.push({ t: 'text', v: src.slice(last, m.index) });
    last = m.index! + whole.length;
    if (sigil === '!') continue;
    if (sigil === '#' || sigil === '^') {
      const node: Node = { t: 'section', path: name, inverted: sigil === '^', children: [] };
      top.nodes.push(node);
      stack.push({ path: name, nodes: node.children });
    } else if (sigil === '/') {
      if (stack.length === 1 || top.path !== name) throw new TemplateError(`Unexpected {{/${name}}}${stack.length > 1 ? `, expected {{/${top.path}}}` : ''}`);
      stack.pop();
    } else {
      top.nodes.push({ t: 'var', path: name, raw: brace === '{' });
    }
  }
  if (stack.length > 1) throw new TemplateError(`{{#${stack[stack.length - 1].path}}} is never closed`);
  if (last < src.length) root.push({ t: 'text', v: src.slice(last) });
  return root;
}

const cache = new Map<string, Node[]>();
function compiled(src: string) {
  let ast = cache.get(src);
  if (!ast) { ast = parse(src); if (cache.size > 500) cache.clear(); cache.set(src, ast); }
  return ast;
}

/** Throws a TemplateError with a readable message when the template is malformed. */
export function checkTemplate(src: string) { parse(src); }

export const escapeHtml = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function lookup(stack: unknown[], path: string): unknown {
  if (path === '.') return stack[stack.length - 1];
  const [head, ...rest] = path.split('.');
  for (let i = stack.length - 1; i >= 0; i--) {
    const ctx = stack[i];
    if (ctx && typeof ctx === 'object' && head in (ctx as object)) {
      let v: unknown = (ctx as Record<string, unknown>)[head];
      for (const k of rest) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined;
      return v;
    }
  }
  return undefined;
}

const empty = (v: unknown) => v === undefined || v === null || v === false || v === '' || (Array.isArray(v) && v.length === 0);

function run(nodes: Node[], stack: unknown[]): string {
  let out = '';
  for (const n of nodes) {
    if (n.t === 'text') out += n.v;
    else if (n.t === 'var') {
      const v = lookup(stack, n.path);
      const s = v === undefined || v === null || typeof v === 'object' ? '' : String(v);
      out += n.raw ? s : escapeHtml(s);
    } else {
      const v = lookup(stack, n.path);
      if (n.inverted) { if (empty(v)) out += run(n.children, stack); continue; }
      if (empty(v)) continue;
      if (Array.isArray(v)) {
        v.forEach((item, i) => {
          const meta = { '@index': i, '@number': i + 1, '@n': String(i + 1).padStart(2, '0'), '@first': i === 0, '@last': i === v.length - 1 };
          out += run(n.children, [...stack, meta, item]);
        });
      } else if (typeof v === 'object') out += run(n.children, [...stack, v]);
      else out += run(n.children, stack);
    }
  }
  return out;
}

export function renderTemplate(src: string, data: unknown, globals: Record<string, unknown> = {}) {
  return run(compiled(src), [globals, data]);
}
