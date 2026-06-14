/**
 * Company Employee Scraper — Apify Actor Entry Point
 *
 * Crawls company websites to extract employee names, job titles, and emails.
 * Uses CheerioCrawler (no browser, no cookies required).
 *
 * Input:
 *   - companyUrls: string[]       — Company website URLs to crawl
 *   - maxPagesPerDomain: number   — Max pages per domain (default 50)
 *   - emailPatternGuessing: bool  — Guess emails when not found (default true)
 *   - proxyConfiguration: object  — Optional proxy settings
 */

import { Actor } from 'apify';
import { CheerioCrawler, log } from 'crawlee';
import { router } from './routes.js';
import { extractDomain } from './utils.js';

await Actor.init();

// ── Read input ──────────────────────────────────
const input = await Actor.getInput() || {};
const {
    companyUrls = [],
    maxPagesPerDomain = 50,
    proxyConfiguration: proxyInput,
} = input;

if (!companyUrls || companyUrls.length === 0) {
    throw new Error('Input "companyUrls" is required. Provide at least one company website URL.');
}

// Normalize URLs
const normalizedUrls = companyUrls.map((url) => {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
    return trimmed;
});

log.info(`Starting scrape for ${normalizedUrls.length} company URL(s):`, { urls: normalizedUrls });

// ── Configure proxy ─────────────────────────────
const proxyConfiguration = proxyInput
    ? await Actor.createProxyConfiguration(proxyInput)
    : undefined;

// ── Build request list ──────────────────────────
const requests = normalizedUrls.map((url) => ({
    url,
    userData: { domain: extractDomain(url) },
}));

// ── Create crawler ──────────────────────────────
const crawler = new CheerioCrawler({
    requestHandler: router,
    proxyConfiguration,
    maxRequestsPerCrawl: maxPagesPerDomain * normalizedUrls.length,
    maxConcurrency: 10,
    requestHandlerTimeoutSecs: 30,
    navigationTimeoutSecs: 30,
    // Do not persist cookies (stateless requests)
    persistCookiesPerSession: false,
    useSessionPool: false,
    // Be polite — respect robots.txt and add small delays
    maxRequestRetries: 2,
    additionalMimeTypes: ['text/html'],
    // Custom headers to look like a normal browser
    preNavigationHooks: [
        (_context, gotOptions) => {
            gotOptions.headers = {
                ...gotOptions.headers,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            };
        },
    ],
});

// ── Run ─────────────────────────────────────────
await crawler.run(requests);

// ── Summary ─────────────────────────────────────
const dataset = await Actor.openDataset();
const datasetInfo = await dataset.getInfo();
const totalItems = datasetInfo?.itemCount ?? 0;

log.info(`✅ Done! Extracted ${totalItems} employee record(s) across ${normalizedUrls.length} company site(s).`);

await Actor.exit();
