// Extracts the content model embedded in the HouseholdMe design file
// (../HouseholdMe/Householdme v2.dc.html) into prisma/seed-data.json.
//
// Usage: node scripts/extract-design.mjs [path-to-design.html]
//
// The design file keeps all of its content inside a `data()` method and its
// stock photo mapping inside `photoLib()`. We evaluate just the component
// class with a stubbed browser environment and serialize the results.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const src = process.argv[2] || path.resolve(root, "../HouseholdMe/Householdme v2.dc.html");
const html = fs.readFileSync(src, "utf8");

const start = html.indexOf("class Component extends DCLogic");
const end = html.indexOf("</script>", start);
if (start < 0 || end < 0) throw new Error("Could not find component script in " + src);
const classSrc = html.slice(start, end).replace("extends DCLogic", "");

const sandbox = {
  window: { innerWidth: 1280, location: { hash: "" } },
  document: {},
  result: null,
};
vm.createContext(sandbox);
vm.runInContext(classSrc + "\nresult = (() => { const c = new Component(); c.props = {}; return { data: c.data(), photos: c.photoLib() }; })();", sandbox);

const { data: D, photos } = sandbox.result;
const LABELS = ["Our pick", "Budget pick", "Upgrade"];

const categories = D.cats.map((c, i) => ({ slug: c.id, name: c.name, intro: c.intro, sortOrder: i }));

const authors = Object.entries(D.authors).map(([slug, a], i) => ({
  slug,
  name: a.name,
  role: a.role,
  short: a.short,
  bio: a.bio,
  trust: a.trust || "",
  facts: (a.facts || []).map(([value, label]) => ({ value, label })),
  expertise: a.expertise || [],
  career: (a.career || []).map(([year, text]) => ({ year, text })),
  imageUrl: photos["author-" + slug]?.src || null,
  sortOrder: i,
}));

const pairs = (arr, a, b) => (arr || []).map((x) => ({ [a]: x[0], [b]: x[1] }));
const triples = (arr, a, b, c) => (arr || []).map((x) => ({ [a]: x[0], [b]: x[1], [c]: x[2] }));

// Turn the design's compact "full guide" arrays into self-describing objects
// that the admin forms can edit field by field.
function normalizeFull(g) {
  const F = g.full;
  if (!F) return null;
  const better = (row) => {
    if (row[2] === undefined) return null;
    return row[2] === 0 || row[2] === 1 || row[0].indexOf("Hair") === 0 ? "low" : "high";
  };
  return {
    titles: {
      buying: "What to look for when buying a stick vacuum",
      vs: "Stick vacuum, canister vacuum or robot?",
      vsToc: "Stick, canister or robot?",
      care: "How to make your stick vacuum last longer",
      situations: "Which stick vacuum fits your situation?",
      mistakes: "Six mistakes that cost you battery life and suction",
    },
    summary: F.summary || [],
    compare: F.compare
      ? {
          cols: F.compare.cols.map((c) => ({
            product: c.pid,
            stars: c.stars,
            reviews: c.reviews,
            was: c.was ?? null,
            highlight: !!c.hl,
          })),
          groups: F.compare.groups.map((gr) => ({
            heading: gr.h,
            rows: gr.rows.map((r) => ({ name: r[0], cells: r[1], better: better(r) })),
          })),
        }
      : null,
    deep: (F.deep || []).map((d) => ({
      product: d.pid,
      body: d.body,
      bestFor: d.bestFor,
      specs: pairs(d.specs, "k", "v"),
      scores: pairs((F.scores || {})[d.pid], "k", "v"),
    })),
    bars: (F.bars || []).map((b) => ({ heading: b.h, note: b.note, rows: triples(b.rows, "name", "value", "pct") })),
    buyIntro: F.buyIntro || "",
    buying: (F.buying || []).map((b) => ({ heading: b.h, paragraphs: b.p, tip: b.tip || "" })),
    tiers: triples(F.tiers, "heading", "text", "pick"),
    vsHead: F.vsHead || [],
    vsRows: F.vsRows || [],
    vsNote: F.vsNote || "",
    care: pairs(F.care, "heading", "text"),
    skip: triples(F.skip, "name", "score", "why"),
    skipNote: F.skipNote || "",
    next: triples(F.next, "name", "status", "text"),
    durable: F.durable || [],
    situations: pairs(F.situations, "heading", "text"),
    specsIntro: F.specsIntro || "",
    specsExplained: pairs(F.specsExplained, "term", "text"),
    mistakes: pairs(F.mistakes, "heading", "text"),
    verdict: F.verdict || [],
    glossary: pairs(F.gloss, "term", "definition"),
  };
}

const OFFS = [0.3, -0.1, 0.1, -0.5];
const HIST = [1.12, 1.1, 1.06, 1.08, 1.03, 1];
const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"];
const round1 = (n) => Math.round(n * 10) / 10;

const guides = D.G.map((g, i) => ({
  slug: g.id,
  category: g.cat,
  author: g.author,
  short: g.short,
  title: g.title,
  seoTitle: g.full?.seoTitle || null,
  intro: g.intro,
  photoNote: g.ph,
  modelsTested: g.count,
  testWeeks: g.weeks,
  updatedLabel: g.updated,
  publishedLabel: g.published,
  forWho: g.forWho,
  howTested: g.howTested,
  howCaption: g.howCaption || null,
  bought: g.bought || null,
  criteria: g.criteria || [],
  tableHead: g.head || null,
  tableRows: g.rows || null,
  tableNote: g.tableNote || null,
  faq: pairs(g.faq, "q", "a"),
  sources: g.sources || [],
  changes: pairs(g.changes, "date", "text"),
  full: normalizeFull(g),
  coverImage: photos["guide-" + g.id]?.src || null,
  heroImage: photos["guide-hero-" + g.id]?.src || null,
  testImage: photos["guide-test-" + g.id]?.src || null,
  sortOrder: i,
  picks: g.picks.map((p, rank) => {
    const slug = D.slug(p[0]);
    const prod = D.products[slug];
    const images = [0, 1, 2, 3]
      .map((k) => photos["product-" + slug + (k ? "-" + k : "")]?.src)
      .filter(Boolean);
    const x = (prod && prod.x) || {};
    const score = p[1];
    const price = p[2];
    return {
      slug,
      rank,
      label: LABELS[rank],
      name: p[0],
      score,
      price,
      verdict: p[3],
      pros: p[4] || [],
      cons: p[5] || [],
      images,
      subtitle: x.subtitle || null,
      verdictLong: x.verdictLong || null,
      inUseSince: x.since || null,
      purchase: x.bought || null,
      readTime: x.readTime || null,
      designText: x.designText || null,
      goodFor: x.forWho || [],
      notFor: x.notFor || [],
      results: (x.results || []).map((r) => ({ label: r.label, value: r.v, average: r.avg, pct: parseInt(r.pct), averagePct: parseInt(r.avgPct) })),
      longTerm: pairs((x.longterm || []).map((l) => [l.d, l.t]), "date", "text"),
      specs: x.specs || [],
      compareRows: x.compareRows || [],
      questions: x.qa || [],
      faq: pairs(x.faq, "q", "a"),
      sources: x.sources || [],
      changes: pairs(x.changes, "date", "text"),
      subScores: (g.criteria || []).map((label, i) => ({ label, value: round1(Math.min(10, Math.max(0, score + OFFS[i]))) })),
      shops: [{ shop: "Amazon", price, url: "https://www.amazon.com/s?k=" + slug, note: "Free 2-day shipping with Prime" }],
      priceHistory: MONTHS.map((month, i) => ({ month, price: Math.round(price * HIST[i]) })),
    };
  }),
}));

const info = Object.entries(D.info).map(([slug, x], i) => ({
  slug,
  title: x.title,
  lead: x.lead,
  sections: x.sections.map(([heading, body]) => ({ heading, body })),
  sortOrder: i,
}));

const deals = D.deals.map(([product, wasPrice]) => ({ product, wasPrice }));

const out = { categories, authors, guides, info, deals, testHouseImage: photos["testhuis"]?.src || null, newsletterImage: photos["nl-popup"]?.src || null };
const outPath = path.resolve(root, "prisma/seed-data.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(
  `Wrote ${outPath}: ${categories.length} categories, ${authors.length} authors, ${guides.length} guides, ` +
    `${guides.reduce((n, g) => n + g.picks.length, 0)} products, ${info.length} info pages, ${deals.length} deals`,
);
