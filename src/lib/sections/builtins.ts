import type { FieldDef } from './fields.js';

/**
 * Built-in section types. They are synced into the SectionType table on startup and are locked in the admin
 * (duplicate one to customise it). Their styling lives in householdme-fe/public/sections.css, so `css` stays empty.
 * Bump `version` whenever a template or field list changes; posts using the type are then re-rendered.
 */
export type Builtin = {
  key: string; name: string; group: string; description: string; version: number;
  fields: FieldDef[]; template: string; sample: Record<string, unknown>;
  tocLabel?: string; placement?: 'top' | 'body' | 'bottom'; scope?: 'any' | 'post' | 'home';
  /** Code-only extra step before rendering (custom types can't have one). */
  prepare?: (data: Record<string, unknown>, post: Record<string, unknown>) => void;
  /** Code-only step that loads live data (latest posts, categories …) when the section is rendered. */
  load?: (data: Record<string, unknown>) => Promise<void>;
};

const AFFILIATE = 'rel="sponsored nofollow" target="_blank"';
const num = (s: unknown) => { const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };

export const BUILTINS: Builtin[] = [
  {
    key: 'post-header', name: 'Header', group: 'Page', version: 2, placement: 'top', scope: 'post',
    description: 'Breadcrumbs, title, intro, author line and lead photo, filled from the post settings.',
    fields: [
      { key: 'style', label: 'Look', type: 'select', options: ['Info', 'Guide'], default: 'Info', help: 'Guide: photo beside the title, as on buying guides. Info: taller photo with a caption.' },
      { key: 'tag', label: 'Tag', type: 'text', help: 'Leave empty to show the post type, e.g. "Buying guide".' },
      { key: 'lead', label: 'Intro', type: 'textarea', help: 'Leave empty to use the excerpt.' },
      { key: 'byline', label: 'Byline', type: 'text', default: 'Written by', placeholder: 'Tested and written by' },
      { key: 'parentName', label: 'Middle breadcrumb', type: 'text', placeholder: 'Robot vacuums', help: 'Optional extra breadcrumb between the category and this page.' },
      { key: 'parentUrl', label: 'Middle breadcrumb link', type: 'link', placeholder: '/robot-vacuums' },
      { key: 'crumb', label: 'Last breadcrumb', type: 'text', help: 'Short name for the breadcrumb, e.g. "Stick vacuums". Defaults to the title.' },
      { key: 'extraLabel', label: 'Extra meta label', type: 'text', placeholder: 'Test period' },
      { key: 'extraValue', label: 'Extra meta value', type: 'text', placeholder: '6 weeks · 22 models' },
      { key: 'showReviewer', label: 'Show "Reviewed by" (the reviewer set in Settings)', type: 'toggle', default: true },
      { key: 'copyLink', label: 'Show "Copy link" button', type: 'toggle', default: false },
      { key: 'image', label: 'Lead photo', type: 'image', help: 'Leave empty to use the cover image.' },
      { key: 'caption', label: 'Photo caption', type: 'text' },
    ],
    prepare: (d, post) => {
      if (!d.image) d.image = post.coverImage ?? '';
      if (!d.lead) d.lead = post.excerpt ?? '';
      d.guideLook = d.style === 'Guide';
      if (!d.tag) d.tag = post.typeLabel;
      if (!d.crumb) d.crumb = post.title;
      if (!d.extraLabel && post.testedCount) { d.extraLabel = 'Test period'; d.extraValue = `${post.testWeeks ? post.testWeeks + ' weeks · ' : ''}${post.testedCount} models`; }
    },
    template: `<nav class="bq-crumbs"><a href="/">Home</a>{{#post.category}}<a href="{{url}}">{{name}}</a>{{/post.category}}{{#parentName}}<a href="{{parentUrl}}">{{parentName}}</a>{{/parentName}}<span>{{crumb}}</span></nav>
<div class="bq-guide-top">
  <header class="bq-guide-head">
    <span class="bq-tag">{{tag}}</span>
    <h1 class="bq-h1">{{post.title}}</h1>
    {{#lead}}<p class="bq-lead">{{lead}}</p>{{/lead}}
    <div class="bq-meta">
      {{#post.author}}<div class="bq-meta__author"><div class="bq-avatar">{{#avatar}}<img src="{{avatar}}" alt="{{name}}">{{/avatar}}</div><div>{{byline}}<br><a href="{{url}}">{{name}}</a></div></div>{{/post.author}}
      {{#showReviewer}}{{#post.reviewer}}<div>Reviewed by<br><a href="{{url}}">{{name}}</a>{{#role}}, {{role}}{{/role}}</div>{{/post.reviewer}}{{/showReviewer}}
      <div>Updated<br><strong>{{post.updated}}</strong></div>
      {{#extraLabel}}<div>{{extraLabel}}<br><strong>{{extraValue}}</strong></div>{{/extraLabel}}
    </div>
    <div class="bq-disclosure-row"><p class="bq-disclosure">We choose products independently. We may earn a commission through links on this page; your price stays the same. <a href="/how-we-make-money">Affiliate policy</a></p>{{#copyLink}}<button type="button" class="bq-btn-outline-sm" data-bq-copy>Copy link</button>{{/copyLink}}</div>
  </header>
  {{#image}}{{#guideLook}}<div class="bq-photo bq-guide-hero"><img src="{{image}}" alt="{{post.title}}"></div>{{/guideLook}}{{^guideLook}}<figure class="bq-hero-fig"><div class="bq-photo"><img src="{{image}}" alt="{{post.title}}"></div>{{#caption}}<figcaption>{{caption}}</figcaption>{{/caption}}</figure>{{/guideLook}}{{/image}}
</div>`,
    sample: { extraLabel: 'Test period', extraValue: '4 weeks · 9 models', showReviewer: true },
  },
  {
    key: 'short-answer', name: 'The short answer', group: 'Summaries', version: 1, tocLabel: '{{heading}}',
    description: 'Numbered summary box in yellow. Rich text, so product names can link to reviews.',
    fields: [
      { key: 'heading', label: 'Heading', type: 'text', default: 'The short answer' },
      { key: 'items', label: 'Points', type: 'list', itemLabel: '{{text}}', fields: [{ key: 'text', label: 'Point', type: 'richtext', required: true }] },
    ],
    template: `<div class="bq-summary"><h2 class="bq-h2 bq-h2--sm">{{heading}}</h2><ol>{{#items}}<li><span>{{{text}}}</span></li>{{/items}}</ol></div>`,
    sample: { heading: 'The short answer', items: [
      { text: 'Best pick for most people: the <a href="/review/eyevac-pro">EyeVac Pro</a>. A 1,400-watt motor, a 4.8-liter bin and infrared sensors make it the strongest EyeVac.' },
      { text: 'Best budget pick: the <a href="/review/keenhot">Keenhot Touchless Vacuum</a>. Small, 4.3 pounds, HEPA filter and a 2-year replacement warranty.' },
      { text: 'Best for salons: the <a href="/review/jrl-fastsweep">JRL FASTSWEEP</a>. A 6.8-liter bin and two power levels for a full day of hair clippings.' },
    ] },
  },
  {
    key: 'picks', name: 'Our picks at a glance', group: 'Products', version: 2, tocLabel: '{{heading}}',
    description: 'Pick cards with photo, label, test score, text and an orange "Check price" button.',
    fields: [
      { key: 'heading', label: 'Heading', type: 'text', default: 'Our picks at a glance' },
      { key: 'picks', label: 'Picks', type: 'list', itemLabel: '{{label}} · {{name}}', fields: [
        { key: 'label', label: 'Label', type: 'text', placeholder: 'Our pick' },
        { key: 'product', label: 'Product', type: 'product', help: 'Fills name, score, photo, text and shop link from the product catalog. Anything you type below overrides it.',
          fill: { name: 'name', score: 'score', image: 'image', text: 'summary', shopUrl: 'shopUrl', shopName: 'shopName', reviewUrl: 'url' } },
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'score', label: 'Test score', type: 'number' },
        { key: 'text', label: 'Why we picked it', type: 'richtext' },
        { key: 'image', label: 'Photo', type: 'image' },
        { key: 'shopName', label: 'Shop', type: 'text', placeholder: 'Amazon' },
        { key: 'shopUrl', label: 'Shop link', type: 'link', help: 'Gets rel="sponsored nofollow" automatically.' },
        { key: 'reviewUrl', label: 'Review link', type: 'link', placeholder: '/review/…' },
      ] },
      { key: 'reviewLinkText', label: 'Review link text', type: 'text', default: 'Read the full review', help: 'Shown under each card that has a review link. Leave empty to hide.' },
      { key: 'note', label: 'Note under the cards', type: 'text', default: 'Prices change often. Click through to see the current price.' },
    ],
    prepare: (d) => { for (const p of (d.picks as Record<string, unknown>[]) ?? []) if (!p.shopName) p.shopName = 'Amazon'; },
    template: `<section class="bq-section"><h2 class="bq-h2">{{heading}}</h2>
{{#picks}}<div class="bq-pick">
  {{#reviewUrl}}<a class="bq-photo bq-pick__media" href="{{reviewUrl}}">{{#image}}<img src="{{image}}" alt="{{name}}" loading="lazy">{{/image}}</a>{{/reviewUrl}}{{^reviewUrl}}<div class="bq-photo bq-pick__media">{{#image}}<img src="{{image}}" alt="{{name}}" loading="lazy">{{/image}}</div>{{/reviewUrl}}
  <div class="bq-pick__body">
    <div class="bq-pick__top">{{#label}}<span class="bq-tag bq-tag--dark bq-tag--sm">{{label}}</span>{{/label}}{{#score}}<span class="bq-score">Test score <strong>{{score}}</strong></span>{{/score}}</div>
    <h3 class="bq-pick__name">{{#reviewUrl}}<a href="{{reviewUrl}}">{{name}}</a>{{/reviewUrl}}{{^reviewUrl}}{{name}}{{/reviewUrl}}</h3>
    <div class="bq-pick__text bq-rich">{{{text}}}</div>
    {{#shopUrl}}<div class="bq-shops"><a class="bq-shop" href="{{shopUrl}}" ${AFFILIATE}>Check price on {{shopName}}</a></div>{{/shopUrl}}
    {{#reviewUrl}}{{#reviewLinkText}}<a class="bq-link-strong" href="{{reviewUrl}}">{{reviewLinkText}}</a>{{/reviewLinkText}}{{/reviewUrl}}
  </div>
</div>{{/picks}}
{{#note}}<p class="bq-note">{{note}}</p>{{/note}}</section>`,
    sample: { heading: 'Our picks at a glance', note: 'Prices change often. Click through to see the current price on Amazon.', picks: [
      { label: 'Our pick', name: 'EyeVac Pro Touchless Vacuum', score: '8.9', text: 'The most powerful EyeVac: a 1,400-watt motor, a 4.8-liter bin and infrared sensors that switch it on when you sweep debris toward it.', shopName: 'Amazon', shopUrl: 'https://www.amazon.com/s?k=EyeVac+Pro' },
      { label: 'Budget pick', name: 'Keenhot Touchless Vacuum Automatic Dustpan', score: '8.4', text: 'Compact and light at 4.3 pounds, with a HEPA filter and a 24-month replacement warranty for about half the price of an EyeVac.', shopName: 'Amazon', shopUrl: 'https://www.amazon.com/s?k=Keenhot+Touchless+Vacuum' },
    ] },
  },
  {
    key: 'text', name: 'Text section', group: 'Text', version: 1, tocLabel: '{{heading}}',
    description: 'Heading, text and an optional photo with caption.',
    fields: [
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'body', label: 'Text', type: 'richtext', help: 'Leave an empty line between paragraphs.' },
      { key: 'image', label: 'Photo', type: 'image' },
      { key: 'caption', label: 'Photo caption', type: 'text' },
    ],
    template: `<section class="bq-section">{{#heading}}<h2 class="bq-h2">{{heading}}</h2>{{/heading}}<div class="bq-rich">{{{body}}}</div>{{#image}}<div class="bq-photo bq-photo--169"><img src="{{image}}" alt="{{caption}}" loading="lazy"></div>{{#caption}}<p class="bq-caption">{{caption}}</p>{{/caption}}{{/image}}</section>`,
    sample: { heading: 'How we tested', body: 'Each vacuum ran in our salon-style test room for four weeks.\n\nWe swept a fixed mix of hair, cereal and fine sand toward the inlet and weighed what it collected.' },
  },
  {
    key: 'table', name: 'Table', group: 'Data', version: 2, tocLabel: '{{heading}}',
    description: 'Data table with a dark header row. Mark the best value in a row with *.',
    fields: [
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'intro', label: 'Intro', type: 'richtext' },
      { key: 'head', label: 'Column headings', type: 'cells', placeholder: 'Model | Pickup | Bin | Score', help: 'Separate columns with |' },
      { key: 'rows', label: 'Rows', type: 'list', itemLabel: '{{cells}}', fields: [{ key: 'cells', label: 'Cells', type: 'cells', placeholder: 'EyeVac Pro | 96%* | 4.8 L | 8.9*', help: 'Separate with |. End a value with * to highlight it as best.' }] },
      { key: 'note', label: 'Note under the table', type: 'text' },
      { key: 'mono', label: 'Numbers in a monospaced font', type: 'toggle', default: false },
    ],
    template: `<section class="bq-section">{{#heading}}<h2 class="bq-h2">{{heading}}</h2>{{/heading}}{{#intro}}<div class="bq-rich">{{{intro}}}</div>{{/intro}}
<div class="bq-table-wrap"><table class="bq-table{{#mono}} bq-table--mono{{/mono}}">
  <thead><tr>{{#head}}<th>{{value}}</th>{{/head}}</tr></thead>
  <tbody>{{#rows}}<tr>{{#cells}}<td{{#best}} class="bq-win"{{/best}}>{{value}}</td>{{/cells}}</tr>{{/rows}}</tbody>
</table></div>{{#note}}<p class="bq-note">{{note}}</p>{{/note}}</section>`,
    sample: { heading: 'Test results compared', head: 'Model | Pickup | Bin | Score', rows: [{ cells: 'EyeVac Pro | 96%* | 4.8 L | 8.9*' }, { cells: 'Keenhot | 92% | 2.5 L | 8.4' }, { cells: 'JRL FASTSWEEP | 94% | 6.8 L* | 8.1' }], note: 'Pickup: share of 50 g test debris collected, average of three runs.' },
  },
  {
    key: 'head-to-head', name: 'Head to head', group: 'Data', version: 1, tocLabel: '{{heading}}',
    description: 'Products as columns, tests as rows. The best value per row is marked and a "Rows won" total is added.',
    fields: [
      { key: 'heading', label: 'Heading', type: 'text', default: 'Head to head' },
      { key: 'intro', label: 'Intro', type: 'richtext' },
      { key: 'products', label: 'Products (columns)', type: 'list', itemLabel: '{{name}}', fields: [
        { key: 'product', label: 'Product', type: 'product', fill: { name: 'name', url: 'url' } },
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'url', label: 'Link', type: 'link' },
      ] },
      { key: 'rows', label: 'Tests (rows)', type: 'list', itemLabel: '{{label}}', fields: [
        { key: 'label', label: 'Test', type: 'text' },
        { key: 'unit', label: 'Unit / note', type: 'text', placeholder: '% collected' },
        { key: 'values', label: 'Values', type: 'cells', help: 'One value per product, separated with |' },
        { key: 'better', label: 'Best value is', type: 'select', options: ['Higher', 'Lower', 'No winner'], default: 'Higher' },
      ] },
      { key: 'showTally', label: 'Show "Rows won"', type: 'toggle', default: true },
    ],
    prepare: (d) => {
      const products = (d.products as Record<string, unknown>[]) ?? [];
      const wins = products.map(() => 0);
      for (const row of (d.rows as Record<string, unknown>[]) ?? []) {
        const vals = (row.values as { value: string; best: boolean }[]) ?? [];
        const marked = vals.some((v) => v.best);
        if (!marked && row.better !== 'No winner') {
          const nums = vals.map((v) => num(v.value));
          if (nums.length > 1 && nums.every((n) => !isNaN(n))) {
            const target = row.better === 'Lower' ? Math.min(...nums) : Math.max(...nums);
            if (!nums.every((n) => n === target)) nums.forEach((n, i) => { vals[i].best = n === target; });
          }
        }
        vals.forEach((v, i) => { if (v.best && i < wins.length) wins[i]++; });
      }
      products.forEach((p, i) => { p.wins = wins[i]; });
    },
    template: `<section class="bq-section"><h2 class="bq-h2">{{heading}}</h2>{{#intro}}<div class="bq-rich">{{{intro}}}</div>{{/intro}}
<div class="bq-table-wrap"><table class="bq-h2h">
  <thead><tr><th>Test</th>{{#products}}<th>{{#url}}<a href="{{url}}">{{name}}</a>{{/url}}{{^url}}{{name}}{{/url}}</th>{{/products}}</tr></thead>
  <tbody>
{{#rows}}    <tr><th>{{label}}{{#unit}}<span>{{unit}}</span>{{/unit}}</th>{{#values}}{{#best}}<td class="bq-win">{{value}} <span class="bq-win__mark">✓ Best</span></td>{{/best}}{{^best}}<td>{{value}}</td>{{/best}}{{/values}}</tr>
{{/rows}}{{#showTally}}    <tr class="bq-h2h__tally"><th>Rows won</th>{{#products}}<td>{{wins}}</td>{{/products}}</tr>{{/showTally}}
  </tbody>
</table></div></section>`,
    sample: { heading: 'Head to head', showTally: true, products: [{ name: 'Robomop P7', url: '/review/robomop-p7' }, { name: 'Robomop P9 Ultra', url: '/review/robomop-p9-ultra' }],
      rows: [{ label: 'Price', unit: 'lowest at time of writing', values: '$499 | $899', better: 'Lower' }, { label: 'Pet hair', unit: '% collected', values: '94% | 92%', better: 'Higher' }, { label: 'Got stuck', unit: 'times in 20 runs', values: '2 | 1', better: 'Lower' }] },
  },
  {
    key: 'stats', name: 'Stats strip', group: 'Summaries', version: 1,
    description: 'Three or four big numbers with a short label each.',
    fields: [{ key: 'items', label: 'Numbers', type: 'list', itemLabel: '{{value}} {{label}}', fields: [{ key: 'value', label: 'Number', type: 'text' }, { key: 'label', label: 'Label', type: 'text' }] }],
    template: `<div class="bq-stats">{{#items}}<div><strong>{{value}}</strong><span>{{label}}</span></div>{{/items}}</div>`,
    sample: { items: [{ value: '800', label: 'charge cycles per vacuum in our test' }, { value: '14 mo', label: 'of continuous testing' }, { value: '75%', label: 'runtime left after 500 cycles' }] },
  },
  {
    key: 'steps', name: 'Numbered steps', group: 'How-to', version: 1, tocLabel: '{{heading}}',
    description: 'Steps with large numbers, plain or with a title per step, and an optional time / difficulty / tools strip.',
    fields: [
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'style', label: 'Style', type: 'select', options: ['Titled', 'Plain'], default: 'Titled' },
      { key: 'time', label: 'Time', type: 'text', placeholder: '5 to 10 minutes' },
      { key: 'difficulty', label: 'Difficulty', type: 'text', placeholder: 'easy' },
      { key: 'tools', label: 'Tools', type: 'text' },
      { key: 'intro', label: 'Intro', type: 'richtext' },
      { key: 'steps', label: 'Steps', type: 'list', itemLabel: '{{title}}', fields: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'text', label: 'Text', type: 'richtext' }] },
    ],
    prepare: (d) => { d.titled = d.style !== 'Plain'; },
    template: `<section class="bq-section">{{#heading}}<h2 class="bq-h2">{{heading}}</h2>{{/heading}}
{{#time}}<div class="bq-howto-meta"><span><strong>Time:</strong> {{time}}</span>{{#difficulty}}<span><strong>Difficulty:</strong> {{difficulty}}</span>{{/difficulty}}{{#tools}}<span><strong>Tools:</strong> {{tools}}</span>{{/tools}}</div>{{/time}}
{{#intro}}<div class="bq-rich">{{{intro}}}</div>{{/intro}}
{{#titled}}<ol class="bq-nsteps bq-nsteps--titled">{{#steps}}<li><div><strong>{{title}}</strong><div class="bq-rich">{{{text}}}</div></div></li>{{/steps}}</ol>{{/titled}}{{^titled}}<ol class="bq-nsteps">{{#steps}}<li><span>{{#title}}<strong>{{title}}</strong> {{/title}}{{{text}}}</span></li>{{/steps}}</ol>{{/titled}}
</section>`,
    sample: { heading: 'How to empty a touchless vacuum', style: 'Titled', time: '2 minutes', difficulty: 'easy', steps: [{ title: 'Switch it off', text: 'Unplug it so the sensor can’t start the motor.' }, { title: 'Pull out the bin', text: 'Lift the handle and slide the bin forward.' }] },
  },
  {
    key: 'verdict', name: 'Verdict', group: 'Summaries', version: 1, tocLabel: '{{label}}',
    description: 'Dark box with the final recommendation and one buy button.',
    fields: [
      { key: 'label', label: 'Label', type: 'text', default: 'Our verdict' },
      { key: 'text', label: 'Verdict', type: 'richtext' },
      { key: 'buttonText', label: 'Button text', type: 'text', placeholder: 'EyeVac Pro: $149 at Amazon' },
      { key: 'buttonUrl', label: 'Button link', type: 'link' },
      { key: 'linkText', label: 'Second link text', type: 'text' },
      { key: 'linkUrl', label: 'Second link', type: 'link' },
    ],
    template: `<section class="bq-verdict bq-verdict--dark"><span class="bq-eyebrow">{{label}}</span><div class="bq-rich">{{{text}}}</div>{{#buttonUrl}}<div class="bq-verdict__actions"><a class="bq-btn bq-btn--buy" href="{{buttonUrl}}" ${AFFILIATE}>{{buttonText}}</a>{{#linkUrl}}<a href="{{linkUrl}}">{{linkText}}</a>{{/linkUrl}}</div>{{/buttonUrl}}</section>`,
    sample: { label: 'Our verdict', text: 'Buy the EyeVac Pro unless you cut hair all day; then the JRL FASTSWEEP’s bigger bin is worth it.', buttonText: 'EyeVac Pro: $149 at Amazon', buttonUrl: 'https://www.amazon.com/s?k=EyeVac+Pro', linkText: 'See all vacuums we tested', linkUrl: '/category/cleaning' },
  },
  {
    key: 'faq', name: 'FAQ', group: 'Engagement', version: 1, tocLabel: '{{heading}}',
    description: 'Questions and answers that open and close.',
    fields: [
      { key: 'heading', label: 'Heading', type: 'text', default: 'Frequently asked questions' },
      { key: 'items', label: 'Questions', type: 'list', itemLabel: '{{q}}', fields: [{ key: 'q', label: 'Question', type: 'text', required: true }, { key: 'a', label: 'Answer', type: 'richtext' }] },
    ],
    template: `<section class="bq-faq"><h2 class="bq-h2">{{heading}}</h2>{{#items}}<details><summary>{{q}}</summary><div class="bq-rich">{{{a}}}</div></details>{{/items}}</section>`,
    sample: { heading: 'Frequently asked questions', items: [{ q: 'Do touchless vacuums work on carpet?', a: 'No. They sit against a wall and take what you sweep toward them on hard floors.' }, { q: 'How loud are they?', a: 'Between 68 and 76 dB in our test, about as loud as a hair dryer for a few seconds.' }] },
  },
  {
    key: 'author-box', name: 'Author box', group: 'Trust', version: 2,
    description: 'Photo, name and bio of the post author. Optionally replace the bio for this post.',
    fields: [
      { key: 'style', label: 'Look', type: 'select', options: ['Plain', 'Box'], default: 'Plain' },
      { key: 'label', label: 'Label', type: 'text', default: 'About the author' },
      { key: 'customBio', label: 'Bio for this post', type: 'richtext', help: 'Leave empty to use the author’s bio.' },
    ],
    prepare: (d) => { d.box = d.style === 'Box'; },
    template: `{{#box}}{{#post.author}}<section class="bq-authorbox"><div class="bq-avatar">{{#avatar}}<img src="{{avatar}}" alt="{{name}}" loading="lazy">{{/avatar}}</div><div><div class="bq-eyebrow" style="color:var(--muted);letter-spacing:0.1em">{{label}}</div><strong>{{name}}</strong>{{#customBio}}<div class="bq-rich">{{{customBio}}}</div>{{/customBio}}{{^customBio}}<p>{{bio}}</p>{{/customBio}}<a class="bq-link-strong" href="{{url}}">Profile and all articles</a></div></section>{{/post.author}}{{/box}}{{^box}}{{#post.author}}<section class="bq-about"><div class="bq-avatar">{{#avatar}}<img src="{{avatar}}" alt="{{name}}" loading="lazy">{{/avatar}}</div><div><span class="bq-eyebrow">{{label}}</span><a class="bq-about__name" href="{{url}}">{{name}}</a>{{#customBio}}<div class="bq-rich">{{{customBio}}}</div>{{/customBio}}{{^customBio}}<p>{{bio}}</p>{{/customBio}}</div></section>{{/post.author}}{{/box}}`,
    sample: { label: 'About the author' },
  },
  {
    key: 'sources', name: 'Sources and update history', group: 'Trust', version: 2,
    description: 'Dated update history and a list of sources.',
    fields: [
      { key: 'changes', label: 'Update history', type: 'list', itemLabel: '{{date}} {{text}}', fields: [{ key: 'date', label: 'Date', type: 'text', placeholder: 'Oct 14, 2026' }, { key: 'text', label: 'What changed', type: 'text' }] },
      { key: 'sources', label: 'Sources', type: 'list', itemLabel: '{{text}}', fields: [{ key: 'text', label: 'Source', type: 'text' }] },
      { key: 'style', label: 'Look', type: 'select', options: ['List', 'Two columns'], default: 'List' },
    ],
    prepare: (d) => { d.columns = d.style === 'Two columns'; },
    template: `{{#columns}}<section class="bq-sources"><div><strong class="bq-eyebrow bq-eyebrow--ink">Sources</strong><ul>{{#sources}}<li>{{text}}</li>{{/sources}}</ul></div><div><strong class="bq-eyebrow bq-eyebrow--ink">Changelog</strong><ul class="bq-changelog">{{#changes}}<li><time>{{date}}</time><span>{{text}}</span></li>{{/changes}}</ul></div></section>{{/columns}}{{^columns}}{{#changes}}{{#@first}}<div class="bq-history bq-history--dated"><strong>Update history</strong><ul>{{/@first}}<li><time>{{date}}</time><span>{{text}}</span></li>{{#@last}}</ul></div>{{/@last}}{{/changes}}
{{#sources}}{{#@first}}<div class="bq-history"><strong>Sources</strong><ul>{{/@first}}<li>{{text}}</li>{{#@last}}</ul></div>{{/@last}}{{/sources}}{{/columns}}`,
    sample: { changes: [{ date: 'Oct 14, 2026', text: 'Prices checked and results updated.' }, { date: 'Mar 2, 2026', text: 'First published.' }], sources: [{ text: 'HouseholdMe test protocol (2026)' }, { text: 'Manufacturer manuals and spec sheets' }] },
  },
  {
    key: 'keep-reading', name: 'Keep reading', group: 'Engagement', version: 1, placement: 'bottom',
    description: 'Three post cards, full width under the article.',
    fields: [
      { key: 'heading', label: 'Heading', type: 'text', default: 'Keep reading' },
      { key: 'posts', label: 'Posts', type: 'list', itemLabel: '{{post}}', fields: [{ key: 'post', label: 'Post', type: 'post' }] },
    ],
    template: `<section class="bq-keep"><h2 class="bq-h2 bq-h2--rule" style="font-size:36px">{{heading}}</h2><div class="bq-keep__grid">{{#posts}}{{#post}}<a href="{{url}}"><div class="bq-photo">{{#coverImage}}<img src="{{coverImage}}" alt="" loading="lazy">{{/coverImage}}</div><span class="bq-eyebrow">{{typeLabel}}</span><strong>{{title}}</strong></a>{{/post}}{{/posts}}</div></section>`,
    sample: { heading: 'Keep reading', posts: [] },
  },
  {
    key: 'custom-html', name: 'Custom HTML', group: 'Other', version: 2, tocLabel: '{{tocTitle}}',
    description: 'Any HTML, using the bq-* classes. Existing HTML posts become one of these.',
    fields: [
      { key: 'html', label: 'HTML', type: 'code' },
      { key: 'tocTitle', label: 'Name in the table of contents', type: 'text', help: 'Leave empty to keep it out of the table of contents.' },
    ],
    template: `{{{html}}}`,
    sample: { html: '<section class="bq-section"><h2 class="bq-h2">Any HTML</h2><p class="bq-p">Use the bq-* classes from the content guide.</p></section>' },
  },
];


export const BUILTIN_BY_KEY = new Map(BUILTINS.map((b) => [b.key, b]));
