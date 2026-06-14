/**
 * Crawlee router — defines how each crawled page is processed.
 *
 * Two labels:
 *   DEFAULT  — discover team-page links on the homepage/landing page
 *   TEAM     — extract employee data from a team/about page
 */

import { createCheerioRouter } from 'crawlee';
import { Actor } from 'apify';
import {
    extractFromCards,
    extractFromHeadings,
    extractFromLists,
    extractFromJsonLd,
    extractFromMailtoLinks,
} from './extractors.js';
import {
    scoreTeamLink,
    extractEmails,
    guessEmails,
    extractDomain,
    isSameDomain,
    looksLikeName,
} from './utils.js';

export const router = createCheerioRouter();

// ──────────────────────────────────────────────
// DEFAULT — Homepage / any non-team page
// ──────────────────────────────────────────────
// Goal: find links to team/about pages and enqueue them.

router.addDefaultHandler(async ({ request, $, enqueueLinks, log }) => {
    const baseDomain = extractDomain(request.url);
    log.info(`[DEFAULT] Scanning ${request.url} for team-page links...`);

    // Also try extracting from this page directly (some sites put team on homepage)
    const employees = runExtractors($);
    if (employees.length > 0) {
        log.info(`  → Found ${employees.length} employees on this page directly.`);
        await pushEmployees(employees, request.url, baseDomain);
    }

    // Collect all internal links and score them
    const links = [];
    $('a[href]').each((_i, a) => {
        const href = $(a).attr('href');
        const text = $(a).text();
        if (!href) return;

        try {
            const absoluteUrl = new URL(href, request.url).href;
            if (!isSameDomain(absoluteUrl, baseDomain)) return;

            const score = scoreTeamLink(absoluteUrl, text);
            if (score > 0) {
                links.push({ url: absoluteUrl, score, text: text.trim() });
            }
        } catch {
            // Invalid URL — skip
        }
    });

    // Sort by score descending and enqueue the top candidates
    links.sort((a, b) => b.score - a.score);
    const topLinks = links.slice(0, 10);

    if (topLinks.length > 0) {
        log.info(`  → Enqueueing ${topLinks.length} candidate team pages.`);
        for (const link of topLinks) {
            log.debug(`    • [score=${link.score}] ${link.url} — "${link.text}"`);
        }
    }

    await enqueueLinks({
        urls: topLinks.map((l) => l.url),
        label: 'TEAM',
    });

    // Also enqueue generic internal links (limited) to explore the site
    await enqueueLinks({
        strategy: 'same-domain',
        label: 'DEFAULT',
        transformRequestFunction: (req) => {
            // Skip non-HTML resources
            const skip = ['.pdf', '.zip', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.css', '.js'];
            if (skip.some((ext) => req.url.toLowerCase().endsWith(ext))) return false;
            return req;
        },
    });
});

// ──────────────────────────────────────────────
// TEAM — Team / About / People page
// ──────────────────────────────────────────────
// Goal: extract employee data.

router.addHandler('TEAM', async ({ request, $, log, enqueueLinks }) => {
    const baseDomain = extractDomain(request.url);
    log.info(`[TEAM] Extracting employees from ${request.url}...`);

    const employees = runExtractors($);

    if (employees.length > 0) {
        log.info(`  → Found ${employees.length} employees.`);
        await pushEmployees(employees, request.url, baseDomain);
    } else {
        log.info(`  → No employees found on this page.`);
    }

    // Look for sub-pages (e.g. /team/page/2, /about/leadership)
    await enqueueLinks({
        strategy: 'same-domain',
        label: 'TEAM',
        globs: ['**/team/**', '**/people/**', '**/about/**', '**/leadership/**', '**/staff/**'],
    });
});

// ──────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────

/**
 * Run all extraction strategies and deduplicate results.
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Array<{name: string, jobTitle: string, email: string|null}>}
 */
function runExtractors($) {
    const all = [
        ...extractFromJsonLd($),
        ...extractFromCards($),
        ...extractFromHeadings($),
        ...extractFromLists($),
        ...extractFromMailtoLinks($),
    ];

    // Deduplicate by name (case-insensitive)
    const seen = new Map();
    for (const emp of all) {
        const key = emp.name.toLowerCase();
        if (seen.has(key)) {
            // Merge: prefer the entry with more data
            const existing = seen.get(key);
            if (!existing.jobTitle && emp.jobTitle) existing.jobTitle = emp.jobTitle;
            if (!existing.email && emp.email) existing.email = emp.email;
        } else {
            seen.set(key, { ...emp });
        }
    }

    return [...seen.values()];
}

/** Cached input to avoid re-reading on every call */
let _cachedInput = null;

/**
 * Push extracted employees to the default Apify dataset.
 * Applies email pattern guessing when configured and no email was found.
 */
async function pushEmployees(employees, sourceUrl, baseDomain) {
    if (!_cachedInput) {
        _cachedInput = await Actor.getInput() || {};
    }
    const enableGuessing = _cachedInput.emailPatternGuessing !== false;

    const items = employees.map((emp) => {
        let email = emp.email;
        let emailGuessed = false;

        if (!email && enableGuessing && looksLikeName(emp.name) && baseDomain) {
            const guesses = guessEmails(emp.name, baseDomain);
            if (guesses.length > 0) {
                email = guesses[0]; // first.last@domain.com is the most common pattern
                emailGuessed = true;
            }
        }

        return {
            name: emp.name,
            jobTitle: emp.jobTitle || '',
            email: email || '',
            emailGuessed,
            source: sourceUrl,
            companyDomain: baseDomain || '',
        };
    });

    await Actor.pushData(items);
}
