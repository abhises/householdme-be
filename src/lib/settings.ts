import { prisma } from "./prisma.js";

/** Default values for every settings key. Stored values are shallow-merged on top. */
export const SETTING_DEFAULTS = {
  site: {
    disclosureBar: true,
    newsletterPopup: "scroll" as "scroll" | "timer" | "direct" | "off",
    stickyBuyBar: true,
    reviewerSlug: "ryan",
    pricesCheckedLabel: "September 30, 2026",
    footerAbout: "Independent buying guides, tested in a real home. Published by HouseholdMe Media LLC, Columbus, Ohio.",
    copyright: "© 2026 HouseholdMe Media LLC",
    newsletterImage: null as string | null,
  },
  home: {
    heroGuideSlug: "stick-vacuums",
    heroIntro: "For six weeks we vacuumed up cat hair, sand and oatmeal with 22 stick vacuums. Three models stood out.",
    heroSecondaryProductSlug: "vorta-s9",
    guideSlugs: ["robot-vacuums", "air-fryers", "mattresses", "coffee-makers", "dehumidifiers", "lawn-mowers"],
    trustFacts: [
      { value: "1,240", label: "products tested since 2019" },
      { value: "5", label: "staff testers and editors, all named" },
      { value: "0", label: "paid placements in our guides" },
      { value: "4× a year", label: "we re-check every buying guide" },
    ],
    testTitle: "Tested in an ordinary American home",
    testText:
      "No lab, just a house in Columbus, Ohio, with hardwood floors, shag carpet, a staircase and a cat. We buy most products ourselves, use them for weeks and publish our measurements.",
  },
  method: {
    title: "How we test, and how we make our money",
    lead: "HouseholdMe was founded in 2019 by journalist Ryan Mitchell. We want you to know what to buy in five minutes, and to be able to check why we say so.",
    image: null as string | null,
    steps: [
      { n: "01", title: "We buy it ourselves", text: "We buy most products in stores, just like you." },
      { n: "02", title: "We use it for weeks", text: "Every product becomes part of daily life in our test house." },
      { n: "03", title: "We measure", text: "Fixed test protocols per category, so results are comparable." },
      { n: "04", title: "We keep testing", text: "We keep using our picks longer to spot wear and failures." },
    ],
    weightsIntro: "Every category has a fixed weighting scheme that we set and publish in advance. Below is the scheme for vacuums.",
    weights: [
      { label: "Cleaning performance", pct: 40 },
      { label: "Battery & runtime", pct: 20 },
      { label: "Ease of use", pct: 20 },
      { label: "Noise", pct: 10 },
      { label: "Maintenance", pct: 10 },
    ],
    principles: [
      { title: "How we make money", text: "When you click a store button and buy something, that retailer pays us a small commission. We don’t run manufacturer ads.", href: "/info/money" },
      { title: "Editorial and business kept separate", text: "Testers don’t know how much commission a retailer pays. The editorial team decides which retailers we show, based on price and service.", href: "/info/guidelines" },
      { title: "Fixing mistakes", text: "If something is wrong, we correct it within two business days and note it at the bottom of the article.", href: "/info/corrections" },
    ],
  },
};

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type Settings = { [K in SettingKey]: (typeof SETTING_DEFAULTS)[K] };
export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];

export const isSettingKey = (k: string): k is SettingKey => k in SETTING_DEFAULTS;

export async function getSetting<K extends SettingKey>(key: K): Promise<Settings[K]> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return { ...SETTING_DEFAULTS[key], ...((row?.value as object) ?? {}) } as Settings[K];
}

export async function getAllSettings(): Promise<Settings> {
  const rows = await prisma.setting.findMany();
  const out = {} as Record<string, unknown>;
  for (const k of SETTING_KEYS) {
    const row = rows.find((r) => r.key === k);
    out[k] = { ...SETTING_DEFAULTS[k], ...((row?.value as object) ?? {}) };
  }
  return out as Settings;
}
