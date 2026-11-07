/**
 * Scopes the CSS of a custom section type to that section, so it can't restyle the rest of the site.
 *   .card { … }          ->  .bq-sec--deal .card { … }
 *   :scope { … }         ->  .bq-sec--deal { … }        (style the section wrapper itself)
 *   @media (…) { .x {} } ->  @media (…) { .bq-sec--deal .x {} }
 * @keyframes and @font-face blocks are left as they are.
 */
export function scopeCss(css: string, scope: string): string {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let out = '', i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open < 0) break;
    const head = src.slice(i, open).trim();
    // find the matching close brace
    let depth = 1, j = open + 1;
    while (j < src.length && depth) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; }
    const body = src.slice(open + 1, j - 1);
    if (head.startsWith('@')) {
      if (/^@(media|supports|container|layer)\b/.test(head)) out += `${head}{${scopeCss(body, scope)}}\n`;
      else out += `${head}{${body}}\n`;
    } else if (head) {
      const sel = head.split(',').map((s) => s.trim()).filter(Boolean)
        .map((s) => (s.startsWith(':scope') ? scope + s.slice(6) : s.startsWith('&') ? scope + s.slice(1) : `${scope} ${s}`)).join(', ');
      out += `${sel}{${body.trim()}}\n`;
    }
    i = j;
  }
  return out;
}
