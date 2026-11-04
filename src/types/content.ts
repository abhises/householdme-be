// Shapes of the Json columns in prisma/schema.prisma.

export interface QA { q: string; a: string }
export interface Change { date: string; text: string }
export interface KV { k: string; v: string }

export interface GuideFull {
  titles?: Partial<Record<"buying" | "vs" | "vsToc" | "care" | "situations" | "mistakes", string>>;
  summary: string[];
  compare: {
    cols: { product: string; stars: number; reviews: string; was: number | null; highlight: boolean }[];
    /**
     * Cell encoding: "y" = yes, "n" = no, "b<label>:<pct>" = bar (e.g. "b9.1:91"), anything else = text.
     * better: which value wins the row ("high" | "low"), or null for no winner.
     */
    groups: { heading: string; rows: { name: string; cells: string[]; better: "high" | "low" | null }[] }[];
  } | null;
  deep: { product: string; body: string[]; bestFor: string; specs: KV[]; scores: { k: string; v: number }[] }[];
  bars: { heading: string; note: string; rows: { name: string; value: string; pct: number }[] }[];
  buyIntro: string;
  buying: { heading: string; paragraphs: string[]; tip: string }[];
  tiers: { heading: string; text: string; pick: string }[];
  vsHead: string[];
  vsRows: string[][];
  vsNote: string;
  care: { heading: string; text: string }[];
  skip: { name: string; score: string; why: string }[];
  skipNote: string;
  next: { name: string; status: string; text: string }[];
  durable: string[];
  situations: { heading: string; text: string }[];
  specsIntro: string;
  specsExplained: { term: string; text: string }[];
  mistakes: { heading: string; text: string }[];
  verdict: string[];
  glossary: { term: string; definition: string }[];
}

export interface Shop { shop: string; price: number; url: string; note?: string }
