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

try {
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
    let proxyConfiguration;
    if (proxyInput) {
        try {
            proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);
        } catch (err) {
            log.warning(`Proxy configuration failed, continuing without proxy: ${err.message}`);
        }
    }

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
        maxRequestRetries: 2,
    });

    // ── Run ─────────────────────────────────────────
    await crawler.run(requests);

    // ── Summary ─────────────────────────────────────
    const dataset = await Actor.openDataset();
    const datasetInfo = await dataset.getInfo();
    const totalItems = datasetInfo?.itemCount ?? 0;

    log.info(`Done! Extracted ${totalItems} employee record(s) across ${normalizedUrls.length} company site(s).`);

    await Actor.exit();
} catch (err) {
    log.error(`Actor failed: ${err.message}`, { stack: err.stack });
    await Actor.exit(1);
}
