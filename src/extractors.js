/**
 * DOM-level employee extraction strategies.
 *
 * Each extractor receives a Cheerio `$` object and the page URL, and returns
 * an array of { name, jobTitle, email? } objects it found.
 *
 * We try multiple strategies because company websites are wildly inconsistent.
 */

import { extractEmails, looksLikeJobTitle, looksLikeName } from './utils.js';

/**
 * @typedef {Object} RawEmployee
 * @property {string}  name
 * @property {string}  jobTitle
 * @property {string|null} email
 */

// ──────────────────────────────────────────────
// Strategy 1 — Structured cards (most common pattern)
// ──────────────────────────────────────────────
// Looks for repeating card-like containers that each hold a name heading
// and a role/title element.

const CARD_SELECTORS = [
    '.team-member', '.team-card', '.member-card', '.staff-card',
    '.person-card', '.employee-card', '.people-card', '.bio-card',
    '.team-block', '.member-block', '.person-block',
    '[class*="team-member"]', '[class*="team_member"]',
    '[class*="teamMember"]', '[class*="person-card"]',
    '[class*="staff"]', '[class*="employee"]',
    '.leadership-card', '.executive-card',
    'article.team', 'article.member', 'article.person',
];

/**
 * Strategy: look for well-known CSS-class card containers.
 * @param {import('cheerio').CheerioAPI} $
 * @returns {RawEmployee[]}
 */
export function extractFromCards($) {
    /** @type {RawEmployee[]} */
    const results = [];

    for (const selector of CARD_SELECTORS) {
        const cards = $(selector);
        if (cards.length === 0) continue;

        cards.each((_i, card) => {
            const $card = $(card);
            const cardText = $card.text();

            // Try to find name from headings or strong tags
            const nameEl = $card.find('h2, h3, h4, h5, strong, .name, .person-name, [class*="name"]').first();
            const name = cleanText(nameEl.text());

            // Try to find job title
            const titleEl = $card.find('p, span, .title, .role, .position, .job-title, [class*="title"], [class*="role"], [class*="position"]');
            let jobTitle = '';
            titleEl.each((_j, el) => {
                const t = cleanText($(el).text());
                if (t && looksLikeJobTitle(t) && t !== name) {
                    jobTitle = t;
                    return false; // break
                }
            });

            // Try to find email in the card
            const emails = extractEmails(cardText);
            const hrefEmails = [];
            $card.find('a[href^="mailto:"]').each((_j, a) => {
                const mailto = $(a).attr('href');
                if (mailto) {
                    const email = mailto.replace('mailto:', '').split('?')[0].trim();
                    if (email) hrefEmails.push(email);
                }
            });

            const allEmails = [...new Set([...hrefEmails, ...emails])];

            if (looksLikeName(name)) {
                results.push({
                    name,
                    jobTitle: jobTitle || '',
                    email: allEmails[0] || null,
                });
            }
        });
    }

    return results;
}

// ──────────────────────────────────────────────
// Strategy 2 — Heading + sibling text
// ──────────────────────────────────────────────
// Many simpler sites list people as <h3>Name</h3><p>Title</p>.

/**
 * Strategy: pair heading elements with their next sibling paragraphs/spans.
 * @param {import('cheerio').CheerioAPI} $
 * @returns {RawEmployee[]}
 */
export function extractFromHeadings($) {
    /** @type {RawEmployee[]} */
    const results = [];

    $('h2, h3, h4, h5').each((_i, heading) => {
        const name = cleanText($(heading).text());
        if (!looksLikeName(name)) return;

        // Look at the next 1-3 siblings for a job title
        let jobTitle = '';
        let email = null;
        let sibling = $(heading).next();

        for (let s = 0; s < 3 && sibling.length; s++) {
            const text = cleanText(sibling.text());
            if (!jobTitle && looksLikeJobTitle(text)) {
                jobTitle = text;
            }
            // Check mailto links
            const mailto = sibling.find('a[href^="mailto:"]').first().attr('href');
            if (mailto && !email) {
                email = mailto.replace('mailto:', '').split('?')[0].trim();
            }
            // Check raw text for emails
            if (!email) {
                const emails = extractEmails(sibling.text());
                if (emails.length > 0) email = emails[0];
            }
            sibling = sibling.next();
        }

        results.push({ name, jobTitle, email });
    });

    return results;
}

// ──────────────────────────────────────────────
// Strategy 3 — List items (ul/ol with employee entries)
// ──────────────────────────────────────────────

/**
 * Strategy: scan list items for "Name — Title" or "Name, Title" patterns.
 * @param {import('cheerio').CheerioAPI} $
 * @returns {RawEmployee[]}
 */
export function extractFromLists($) {
    /** @type {RawEmployee[]} */
    const results = [];

    $('li').each((_i, li) => {
        const text = cleanText($(li).text());
        if (!text || text.length > 200) return;

        // Try "Name — Title" or "Name - Title" or "Name | Title" or "Name, Title"
        const separators = [' — ', ' – ', ' - ', ' | ', ', '];
        for (const sep of separators) {
            if (!text.includes(sep)) continue;
            const parts = text.split(sep);
            if (parts.length < 2) continue;
            const namePart = parts[0].trim();
            const titlePart = parts.slice(1).join(sep).trim();
            if (looksLikeName(namePart) && looksLikeJobTitle(titlePart)) {
                const emails = extractEmails($(li).html() || '');
                const mailto = $(li).find('a[href^="mailto:"]').first().attr('href');
                const email = mailto
                    ? mailto.replace('mailto:', '').split('?')[0].trim()
                    : emails[0] || null;

                results.push({ name: namePart, jobTitle: titlePart, email });
                return; // next li
            }
        }
    });

    return results;
}

// ──────────────────────────────────────────────
// Strategy 4 — Schema.org / JSON-LD structured data
// ──────────────────────────────────────────────

/**
 * Strategy: parse JSON-LD scripts for Person or Organization.employee data.
 * @param {import('cheerio').CheerioAPI} $
 * @returns {RawEmployee[]}
 */
export function extractFromJsonLd($) {
    /** @type {RawEmployee[]} */
    const results = [];

    $('script[type="application/ld+json"]').each((_i, script) => {
        try {
            const data = JSON.parse($(script).html() || '{}');
            const items = Array.isArray(data) ? data : [data];

            for (const item of items) {
                // Direct Person type
                if (item['@type'] === 'Person') {
                    addPersonFromSchema(item, results);
                }
                // Organization with employees/members
                if (item.employee) {
                    const employees = Array.isArray(item.employee) ? item.employee : [item.employee];
                    for (const emp of employees) addPersonFromSchema(emp, results);
                }
                if (item.member) {
                    const members = Array.isArray(item.member) ? item.member : [item.member];
                    for (const mem of members) addPersonFromSchema(mem, results);
                }
            }
        } catch {
            // Invalid JSON — skip
        }
    });

    return results;
}

/**
 * Helper to extract person info from a schema.org Person-like object.
 * @param {Record<string, unknown>} person
 * @param {RawEmployee[]} results
 */
function addPersonFromSchema(person, results) {
    const name = typeof person.name === 'string' ? person.name.trim() : '';
    const jobTitle = typeof person.jobTitle === 'string' ? person.jobTitle.trim() : '';
    const email = typeof person.email === 'string' ? person.email.replace('mailto:', '').trim() : null;

    if (name) {
        results.push({ name, jobTitle, email });
    }
}

// ──────────────────────────────────────────────
// Strategy 5 — Mailto link scan (fallback)
// ──────────────────────────────────────────────

/**
 * Strategy: collect all mailto: links and attempt to infer a name from surrounding text.
 * @param {import('cheerio').CheerioAPI} $
 * @returns {RawEmployee[]}
 */
export function extractFromMailtoLinks($) {
    /** @type {RawEmployee[]} */
    const results = [];
    const seen = new Set();

    $('a[href^="mailto:"]').each((_i, a) => {
        const href = $(a).attr('href') || '';
        const email = href.replace('mailto:', '').split('?')[0].trim().toLowerCase();
        if (!email || seen.has(email)) return;
        seen.add(email);

        // Walk up to find surrounding name/title context
        const parent = $(a).closest('div, li, td, section, article, p');
        const parentText = parent.length ? parent.text() : '';

        // Try to find a name in the parent container
        let name = '';
        const nameEl = parent.find('h2, h3, h4, h5, strong, .name, [class*="name"]').first();
        if (nameEl.length) {
            const candidate = cleanText(nameEl.text());
            if (looksLikeName(candidate)) name = candidate;
        }

        // Try the link text itself
        if (!name) {
            const linkText = cleanText($(a).text());
            if (looksLikeName(linkText)) name = linkText;
        }

        // Try to find a title
        let jobTitle = '';
        const titleEl = parent.find('.title, .role, .position, [class*="title"], [class*="role"]').first();
        if (titleEl.length) {
            const candidate = cleanText(titleEl.text());
            if (looksLikeJobTitle(candidate)) jobTitle = candidate;
        }

        const inferredName = name || inferNameFromEmail(email);
        // Only include if we have a real person name
        if (looksLikeName(inferredName)) {
            results.push({ name: inferredName, jobTitle, email });
        }
    });

    return results;
}

/**
 * Try to infer a human-readable name from an email address.
 * e.g. "jane.doe@acme.com" → "Jane Doe"
 * @param {string} email
 * @returns {string}
 */
function inferNameFromEmail(email) {
    const local = email.split('@')[0];
    if (!local) return '';
    // Split on dots, hyphens, underscores
    const parts = local.split(/[.\-_]/).filter(Boolean);
    if (parts.length < 2) return '';
    return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
}

// ──────────────────────────────────────────────
// Helper
// ──────────────────────────────────────────────

/**
 * Normalize whitespace and trim a text string.
 * @param {string} text
 * @returns {string}
 */
function cleanText(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
}
