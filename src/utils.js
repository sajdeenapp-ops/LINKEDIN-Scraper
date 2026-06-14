/**
 * Utility functions for employee data extraction.
 * Handles email extraction, name parsing, job title detection,
 * and email pattern guessing.
 */

// ──────────────────────────────────────────────
// Email extraction
// ──────────────────────────────────────────────

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

/**
 * Extract all valid email addresses from raw text.
 * Filters out common false positives (images, stylesheets, scripts).
 * @param {string} text
 * @returns {string[]}
 */
export function extractEmails(text) {
    if (!text) return [];

    const matches = text.match(EMAIL_REGEX) || [];
    const falsePositiveExtensions = [
        '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
        '.css', '.js', '.woff', '.woff2', '.ttf', '.eot',
    ];

    return [...new Set(
        matches.filter((email) => {
            const lower = email.toLowerCase();
            // Skip image/asset file references mistakenly captured
            if (falsePositiveExtensions.some((ext) => lower.endsWith(ext))) return false;
            // Skip common noreply / generic addresses
            if (/^(noreply|no-reply|info@|support@|hello@|contact@|admin@|webmaster@|sales@)/i.test(lower)) return false;
            return true;
        }),
    )];
}

// ──────────────────────────────────────────────
// Team-page link detection
// ──────────────────────────────────────────────

/** Keywords that commonly appear in URLs or link text of team pages. */
const TEAM_PAGE_KEYWORDS = [
    'team', 'about', 'people', 'staff', 'leadership', 'management',
    'our-team', 'our-people', 'who-we-are', 'meet-the-team', 'executives',
    'founders', 'directors', 'board', 'advisors', 'partners',
    'employees', 'crew', 'humans', 'members',
];

/**
 * Score a URL / link-text pair for likelihood of being a team page.
 * @param {string} href
 * @param {string} linkText
 * @returns {number} 0 = not relevant, higher = more likely a team page
 */
export function scoreTeamLink(href, linkText) {
    const combined = `${href} ${linkText}`.toLowerCase();
    let score = 0;
    for (const kw of TEAM_PAGE_KEYWORDS) {
        if (combined.includes(kw)) score += 1;
    }
    return score;
}

// ──────────────────────────────────────────────
// Job-title detection
// ──────────────────────────────────────────────

const JOB_TITLE_PATTERNS = [
    // C-suite
    /\b(?:chief\s+\w+\s+officer|c[efimopst]o)\b/i,
    // VP / Director / Head
    /\b(?:vice\s+president|vp|director|head)\s+(?:of\s+)?\w+/i,
    // Manager / Lead / Senior / Junior
    /\b(?:senior|sr\.?|junior|jr\.?|lead|principal|staff)\s+\w+/i,
    /\b\w+\s+(?:manager|lead|engineer|developer|designer|analyst|architect|specialist|coordinator|consultant|strategist|scientist|researcher)\b/i,
    // Common standalone titles
    /\b(?:founder|co-founder|co founder|partner|managing\s+director|president|chairman|chairwoman|cto|ceo|cfo|coo|cmo|cio|cso|cpo|evangelist)\b/i,
    // Software-specific
    /\b(?:software\s+engineer|full[\s-]?stack|front[\s-]?end|back[\s-]?end|devops|sre|data\s+scientist|data\s+engineer|ml\s+engineer|product\s+manager|ux\s+designer|ui\s+designer|qa\s+engineer|technical\s+writer)\b/i,
    // Marketing / Sales / HR
    /\b(?:marketing|sales|human\s+resources|hr|account|growth|content|brand|communications?)\s+\w+/i,
];

/**
 * Check if a string looks like a job title.
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeJobTitle(text) {
    if (!text || text.length < 2 || text.length > 120) return false;
    return JOB_TITLE_PATTERNS.some((p) => p.test(text));
}

// ──────────────────────────────────────────────
// Name validation
// ──────────────────────────────────────────────

/** Words that commonly appear in product names, navigation, or UI but are NOT person names. */
const NAME_BLOCKLIST = new Set([
    'scraper', 'crawler', 'spider', 'bot', 'tool', 'tools', 'plugin', 'api',
    'app', 'platform', 'service', 'services', 'product', 'products', 'solution',
    'solutions', 'software', 'system', 'systems', 'data', 'analytics', 'cloud',
    'server', 'client', 'website', 'web', 'online', 'digital', 'mobile',
    'search', 'engine', 'browser', 'page', 'pages', 'home', 'blog', 'docs',
    'documentation', 'guide', 'tutorial', 'support', 'help', 'contact',
    'login', 'signup', 'register', 'download', 'install', 'update', 'version',
    'free', 'pro', 'enterprise', 'premium', 'starter', 'pricing', 'plan',
    'google', 'facebook', 'twitter', 'instagram', 'linkedin', 'tiktok',
    'youtube', 'amazon', 'apple', 'microsoft', 'github', 'slack', 'zoom',
    'maps', 'reviews', 'store', 'shop', 'market', 'content', 'cheerio',
    'playwright', 'puppeteer', 'selenium', 'proxy', 'proxies', 'integration',
    'extractor', 'monitor', 'tracker', 'checker', 'finder', 'generator',
    'builder', 'manager', 'handler', 'reader', 'writer', 'loader',
    'template', 'templates', 'actor', 'actors', 'dataset', 'datasets',
    'learn', 'more', 'read', 'view', 'see', 'get', 'start', 'try',
    'new', 'best', 'top', 'all', 'our', 'your', 'the', 'and',
    // Tech / abbreviations
    'sdk', 'cli', 'gpt', 'llm', 'ips', 'dns', 'vpn', 'cdn', 'saas', 'paas',
    'suite', 'framework', 'library', 'module', 'package', 'runtime',
    // Organization-related terms
    'academy', 'institute', 'university', 'college', 'school', 'foundation',
    'association', 'consortium', 'alliance', 'council', 'committee', 'board',
    'embassy', 'chamber', 'federation', 'union', 'league', 'society',
    'network', 'group', 'club', 'community', 'hub', 'center', 'centre',
    'startup', 'startups', 'incubator', 'accelerator', 'venture', 'ventures',
    // Adjectives commonly in org/product names
    'residential', 'commercial', 'industrial', 'european', 'american',
    'global', 'international', 'national', 'local', 'regional',
    'czech', 'british', 'french', 'german', 'spanish', 'italian',
    // Misc false positives
    'fingerprint', 'adviser', 'advisory', 'consulting',
    'experts', 'expert', 'professionals', 'specialists', 'partners',
    'insights', 'resources', 'solutions',
]);

/**
 * Heuristic: does this string look like a person's name?
 * Filters out product names, navigation items, and other non-person text.
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeName(text) {
    if (!text) return false;
    const trimmed = text.trim();
    // Name should be 3–50 chars
    if (trimmed.length < 3 || trimmed.length > 50) return false;
    // Must have at least two words (first + last), max 4
    const words = trimmed.split(/\s+/);
    if (words.length < 2 || words.length > 4) return false;
    // Each word should start with an uppercase letter
    if (!words.every((w) => /^[A-ZÀ-ÖØ-Þ]/.test(w))) return false;
    // Should not contain numbers or common non-name chars
    if (/[0-9@#$%^&*(){}[\]<>]/.test(trimmed)) return false;
    // Each word should be reasonable length for a name part (2-15 chars)
    if (!words.every((w) => w.length >= 2 && w.length <= 15)) return false;
    // Reject ALL-CAPS words (abbreviations like SDK, CLI, GPT, IPs)
    if (words.some((w) => w.length >= 2 && w === w.toUpperCase())) return false;
    // Reject if ANY word is in the blocklist (case-insensitive)
    if (words.some((w) => NAME_BLOCKLIST.has(w.toLowerCase()))) return false;
    // Reject if the whole string looks like a title/heading (contains common verbs/articles)
    if (/\b(How|What|Why|When|Where|Which|About|With|From|Into)\b/.test(trimmed)) return false;
    return true;
}

// ──────────────────────────────────────────────
// Email pattern guessing
// ──────────────────────────────────────────────

/**
 * Generate common email patterns from a person's name and company domain.
 * @param {string} fullName  e.g. "Jane Doe"
 * @param {string} domain    e.g. "acme.com"
 * @returns {string[]}       e.g. ["jane.doe@acme.com", "jdoe@acme.com", ...]
 */
export function guessEmails(fullName, domain) {
    if (!fullName || !domain) return [];

    const parts = fullName.toLowerCase().trim().split(/\s+/);
    if (parts.length < 2) return [];

    const first = parts[0].replace(/[^a-z]/g, '');
    const last = parts[parts.length - 1].replace(/[^a-z]/g, '');
    if (!first || !last) return [];

    const fi = first[0]; // first initial
    const li = last[0];  // last initial

    return [
        `${first}.${last}@${domain}`,
        `${first}${last}@${domain}`,
        `${fi}${last}@${domain}`,
        `${first}@${domain}`,
        `${first}_${last}@${domain}`,
        `${first}-${last}@${domain}`,
        `${last}.${first}@${domain}`,
        `${last}${fi}@${domain}`,
    ];
}

// ──────────────────────────────────────────────
// Domain helpers
// ──────────────────────────────────────────────

/**
 * Extract the root domain from a URL string.
 * @param {string} urlStr
 * @returns {string|null}
 */
export function extractDomain(urlStr) {
    try {
        const url = new URL(urlStr);
        return url.hostname.replace(/^www\./, '');
    } catch {
        return null;
    }
}

/**
 * Check if a URL belongs to the same domain.
 * @param {string} urlStr
 * @param {string} baseDomain
 * @returns {boolean}
 */
export function isSameDomain(urlStr, baseDomain) {
    const domain = extractDomain(urlStr);
    if (!domain) return false;
    return domain === baseDomain || domain.endsWith(`.${baseDomain}`);
}
