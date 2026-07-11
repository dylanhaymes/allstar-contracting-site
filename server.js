'use strict';

require('dotenv').config();

const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Site Constants ────────────────────────────────────────────────────────────
const SITE_URL = 'https://www.allstarcny.com';
const SITE_NAME = 'All Star Contracting & Seamless Gutters LLC';
const DEFAULT_OG_IMAGE = SITE_URL + '/images/2-story-House-seamless-gutters-installed.jpg';
const DEFAULT_DESCRIPTION =
  "All Star Contracting & Seamless Gutters LLC — Syracuse NY's trusted source for seamless gutters, roofing, renovations, and excavating. Family-owned, licensed & insured. Call (315) 565-9230.";

// ─── Per-Page Meta Config ──────────────────────────────────────────────────────
const META = {
  '/': {
    title: 'Syracuse Contracting & Seamless Gutters | All Star Contracting',
    description:
      "CNY's premier contracting & seamless gutter experts. Serving Syracuse and Central New York with roofing, renovations, gutters, and excavating. Licensed & insured. Free estimates.",
    ogImage: SITE_URL + '/images/2-story-House-seamless-gutters-installed.jpg',
  },
  '/services': {
    title: 'Our Services | Syracuse NY Contracting & Gutters | All Star Contracting',
    description:
      'Explore full-service contracting in Syracuse NY — seamless gutters, roofing, renovations, siding, doors, windows, and excavating. Family-owned and licensed across Central New York.',
    ogImage: SITE_URL + '/images/IMG_9085-87a3f682.JPEG',
  },
  '/seamless-gutters': {
    title: 'Seamless Gutters in Syracuse NY | All Star Contracting',
    description:
      'Custom seamless aluminum gutter installation, repair, and replacement in Syracuse NY. On-site fabrication, gutter guards, and downspout solutions built for CNY winters. Free quotes.',
    ogImage: SITE_URL + '/images/2-story-House-seamless-gutters-installed.jpg',
  },
  '/contracting': {
    title: 'Construction & Renovations in Syracuse NY | All Star Contracting',
    description:
      'Full-service construction and renovation in Syracuse NY — roofing, siding, windows, doors, decks, and interior remodels. Licensed, insured, and locally trusted across Central New York.',
    ogImage: SITE_URL + '/images/IMG_9079-ad2d42a6.JPEG',
  },
  '/excavating': {
    title: 'Excavating Services in Syracuse NY | All Star Contracting',
    description:
      'Professional residential excavating in Syracuse and Central NY — land clearing, grading, trenching, drainage, and site prep. Local crew, own equipment, honest pricing.',
    ogImage: SITE_URL + '/images/excavating-hero.jpg',
  },
  '/about': {
    title: 'About Us | Family-Owned Syracuse Contractor | All Star Contracting',
    description:
      'Meet the All Star Contracting team — a family-owned, licensed Syracuse NY contractor serving Solvay, Liverpool, Camillus, Baldwinsville, and all of Central New York.',
    ogImage: SITE_URL + '/images/Brandon-Walters-63378395.jpeg',
  },
  '/contact': {
    title: 'Contact Us | Free Estimate | All Star Contracting Syracuse NY',
    description:
      "Request a free estimate from All Star Contracting & Seamless Gutters LLC. Call (315) 565-9230 or message us — we respond within one business day. Serving all of Syracuse, NY.",
    ogImage: SITE_URL + '/images/2-story-House-seamless-gutters-installed.jpg',
  },
};

function metaFor(reqPath) {
  return (
    META[reqPath] || {
      title: SITE_NAME,
      description: DEFAULT_DESCRIPTION,
      ogImage: DEFAULT_OG_IMAGE,
    }
  );
}

// ─── Database ──────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  // Fail fast instead of hanging /contact if the DB is reachable-but-stalled.
  connectionTimeoutMillis: 4000,
  statement_timeout: 4000,
  query_timeout: 4000,
});

async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        email VARCHAR(255) NOT NULL,
        address TEXT,
        message TEXT,
        submitted_at TIMESTAMP DEFAULT NOW(),
        ip_address VARCHAR(50),
        source VARCHAR(100) DEFAULT 'website'
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_submitted_at ON leads (submitted_at DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (email);`);
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err.message);
    // Non-fatal — site still works without DB
  }
}

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https://www.google.com', 'https://maps.googleapis.com', 'https://maps.gstatic.com'],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        frameSrc: ["'self'", 'https://www.google.com'],
        connectSrc: ["'self'"],
      },
    },
  })
);

// ─── Rate Limiting ─────────────────────────────────────────────────────────────
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { success: false, error: 'Too many requests. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Core Middleware ───────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Templating ───────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// ─── Helper: Active Nav + Global Locals ───────────────────────────────────────
app.use((req, res, next) => {
  res.locals.path = req.path;
  res.locals.siteUrl = SITE_URL;
  res.locals.siteName = SITE_NAME;
  res.locals.defaultOgImage = DEFAULT_OG_IMAGE;
  res.locals.defaultDescription = DEFAULT_DESCRIPTION;
  next();
});

// ─── Helper: Render with meta ─────────────────────────────────────────────────
function renderPage(res, view, reqPath, extra = {}) {
  const m = metaFor(reqPath);
  res.render(view, {
    title: m.title,
    description: m.description,
    ogImage: m.ogImage,
    canonicalPath: reqPath,
    ...extra,
  });
}

// ─── GET Routes ───────────────────────────────────────────────────────────────
app.get('/', (req, res) => renderPage(res, 'index', '/'));
app.get('/services', (req, res) => renderPage(res, 'services', '/services'));
app.get('/seamless-gutters', (req, res) => renderPage(res, 'seamless-gutters', '/seamless-gutters'));
app.get('/contracting', (req, res) => renderPage(res, 'contracting', '/contracting'));
app.get('/excavating', (req, res) => renderPage(res, 'excavating', '/excavating'));
app.get('/about', (req, res) => renderPage(res, 'about', '/about'));
app.get('/contact', (req, res) => renderPage(res, 'contact', '/contact'));

app.get('/dumpster-service', (req, res) => {
  res.redirect(301, '/excavating');
});

// ─── robots.txt ───────────────────────────────────────────────────────────────
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(
    'User-agent: *\n' +
    'Allow: /\n' +
    `Sitemap: ${SITE_URL}/sitemap.xml\n`
  );
});

// ─── sitemap.xml ──────────────────────────────────────────────────────────────
app.get('/sitemap.xml', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const pages = [
    { loc: '/', priority: '1.0', changefreq: 'weekly' },
    { loc: '/services', priority: '0.9', changefreq: 'monthly' },
    { loc: '/seamless-gutters', priority: '0.9', changefreq: 'monthly' },
    { loc: '/contracting', priority: '0.9', changefreq: 'monthly' },
    { loc: '/excavating', priority: '0.9', changefreq: 'monthly' },
    { loc: '/about', priority: '0.7', changefreq: 'monthly' },
    { loc: '/contact', priority: '0.8', changefreq: 'monthly' },
  ];

  const urls = pages
    .map(
      (p) =>
        `  <url>\n    <loc>${SITE_URL}${p.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
    )
    .join('\n');

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls +
    '\n</urlset>\n';

  res.type('application/xml');
  res.send(xml);
});

// ─── Spam / Bot Detection ──────────────────────────────────────────────────────
//
// isSpam(fields) inspects a contact submission and returns a short string reason
// if it looks like spam/bot traffic, or null if it looks legitimate.
//
// Design goals:
//   • Catch the Russian/Cyrillic + scam-link spam the owner has been getting.
//   • NEVER block a legitimate Syracuse-area gutter/contracting customer, who
//     writes in English, whose name has no URLs, and who at most pastes a single
//     link (e.g. a Google Maps link to their property).
//
// All thresholds live in the constants below so they're easy to tune.
const SPAM_THRESHOLDS = {
  // Minimum count of characters in a given non-Latin script before we flag it.
  // A stray accented/pasted char shouldn't trip it; a flood of Cyrillic will.
  CYRILLIC_MAX: 2, // flag when 3+ Cyrillic chars are present
  CJK_MAX: 2,      // flag when 3+ Chinese/Japanese/Korean chars are present
  ARABIC_MAX: 2,   // flag when 3+ Arabic chars are present
  // How many URLs are allowed in the message body. One link is fine (a customer
  // might paste their address's Google Maps link); two or more is spam.
  MAX_MESSAGE_URLS: 1,
  // Hard cap on message length — spam dumps are enormous.
  MAX_MESSAGE_LENGTH: 3000,
};

// Case-insensitive keyword/substring blocklist. Add new terms here as they show
// up. Kept as plain lowercase strings so it's readable and trivial to extend.
const SPAM_KEYWORDS = [
  'viagra', 'cialis', 'casino', 'crypto', 'bitcoin', 'forex', 'loan',
  'seo service', 'backlink', 'escort', 'betting', 'porn', 'payday',
  '投资', 'кредит', 'займ', 'ставки', 'казино',
];

function isSpam(fields) {
  const name = (fields.name || '').toString();
  const address = (fields.address || '').toString();
  const message = (fields.message || '').toString();
  const honeypot = (fields.company_url || '').toString();

  // Rule 1: Honeypot filled. Real users never see or tab to this hidden field,
  // so any value at all means an automated bot filled it. Strongest signal.
  if (honeypot.trim().length > 0) {
    return 'honeypot filled';
  }

  // Rule 2: URL/link in the NAME field. Real names never contain links; spam
  // bots stuff URLs everywhere. Matches http(s)://, www., <a tags, [url], .ru,
  // and common shorteners.
  if (/https?:\/\/|www\.|<a\s|\[url|\.ru\b|bit\.ly|tinyurl/i.test(name)) {
    return 'url in name';
  }

  // Rule 3: Two or more URLs in the MESSAGE. One link is allowed (a customer
  // pasting a Maps/photo link); 2+ is a link-spam dump.
  const urlMatches = message.match(/https?:\/\/|www\./gi) || [];
  if (urlMatches.length > SPAM_THRESHOLDS.MAX_MESSAGE_URLS) {
    return `too many links (${urlMatches.length})`;
  }

  const combined = name + ' ' + message + ' ' + address;

  // Rule 4: Cyrillic script flood. This is a Syracuse-local, English-only
  // business — a burst of Cyrillic is Russian spam.
  const cyrillic = combined.match(/[Ѐ-ӿ]/g) || [];
  if (cyrillic.length > SPAM_THRESHOLDS.CYRILLIC_MAX) {
    return `cyrillic script (${cyrillic.length} chars)`;
  }

  // Rule 5: CJK script flood (Chinese / Japanese kana / Korean Hangul).
  const cjk = combined.match(/[一-鿿぀-ヿ가-힯]/g) || [];
  if (cjk.length > SPAM_THRESHOLDS.CJK_MAX) {
    return `cjk script (${cjk.length} chars)`;
  }

  // Rule 6: Arabic script flood.
  const arabic = combined.match(/[؀-ۿ]/g) || [];
  if (arabic.length > SPAM_THRESHOLDS.ARABIC_MAX) {
    return `arabic script (${arabic.length} chars)`;
  }

  // Rule 7: Spam keyword blocklist (case-insensitive substring match across
  // name + message + address).
  const haystack = combined.toLowerCase();
  for (const kw of SPAM_KEYWORDS) {
    if (haystack.includes(kw.toLowerCase())) {
      return `spam keyword (${kw})`;
    }
  }

  // Rule 8: Oversized message — legitimate project descriptions are never this
  // long; spam dumps are.
  if (message.length > SPAM_THRESHOLDS.MAX_MESSAGE_LENGTH) {
    return `message too long (${message.length} chars)`;
  }

  return null;
}

// ─── POST /contact ─────────────────────────────────────────────────────────────
app.post('/contact', contactLimiter, async (req, res) => {
  const { name, phone, email, address, message } = req.body;

  // Validate required fields
  if (!name || !phone || !email || !message) {
    return res.status(400).json({ success: false, error: 'All fields are required.' });
  }

  // Reject non-string fields up front. A real browser form only sends strings; a bot posting JSON
  // with a number/object would otherwise crash `.trim()` later (async reject → hung request).
  if ([name, phone, email, address, message].some((v) => v != null && typeof v !== 'string')) {
    return res.status(400).json({ success: false, error: 'Invalid input.' });
  }

  // Basic email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
  }

  const ip =
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  // ── Spam / bot check ──────────────────────────────────────────────────────
  // Run heuristics on the raw submission. If it's spam we still record it to the
  // DB (as source='spam-filtered' so a false-positive is recoverable) but we
  // suppress ALL owner notifications (email + Make webhook) so it never reaches
  // the inbox. We return the SAME success response so bots can't detect the
  // filter and a false-positived human isn't shown an error.
  const spamReason = isSpam(req.body);
  const leadSource = spamReason ? 'spam-filtered' : 'website';
  if (spamReason) {
    console.warn(`Spam filtered: ${spamReason} from ${ip}`);
  }

  // 1. Rapid-duplicate guard: if an identical submission (same email + same message) already
  //    landed in the last 5 minutes, treat this as an accidental re-send (a network retry or a
  //    double-tap) — skip the insert AND the notification and return the same success response.
  //    This prevents duplicate LEADS without ever blocking a legitimate repeat customer, who
  //    would submit days apart (different timestamp) or about a different project (different message).
  if (!spamReason) {
    try {
      const recent = await pool.query(
        `SELECT 1 FROM leads
          WHERE email = $1 AND message = $2 AND source = 'website'
            AND submitted_at > NOW() - INTERVAL '5 minutes'
          LIMIT 1`,
        [email.trim(), message.trim()]
      );
      if (recent.rowCount > 0) {
        console.warn(`Duplicate suppressed: ${email.trim()} (identical submission within 5 min)`);
        return res.json({ success: true });
      }
    } catch (dupErr) {
      console.error('Dedup check error:', dupErr.message);
      // If the check itself fails, fall through and process normally — never lose a real lead.
    }
  }

  // 2. Save to database (clean leads as 'website', spam as 'spam-filtered')
  try {
    await pool.query(
      `INSERT INTO leads (name, phone, email, address, message, ip_address, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [name.trim(), phone.trim(), email.trim(), (address || '').trim(), message.trim(), ip, leadSource]
    );
  } catch (dbErr) {
    console.error('DB insert error:', dbErr.message);
    // Continue even if DB fails — a DB error must not block the response
  }

  // Spam submissions stop here: recorded to the DB above, but never forwarded to the owner.
  if (spamReason) {
    return res.json({ success: true });
  }

  // 3. Notify the owner — ONE path, via the Make webhook. The Make scenario "All Star - Website
  //    Contact Form Notification" emails all three recipients (Jamie, Scale It, Dylan). The
  //    server's own nodemailer email was removed 2026-07-11: it sent an IDENTICAL notification to
  //    the same three people, so every lead arrived twice. Make is the single notifier now.
  if (process.env.MAKE_WEBHOOK_URL) {
    const payload = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: (address || '').trim(),
      message: message.trim(),
      timestamp: new Date().toISOString(),
      source: 'website',
    };

    // Fire-and-forget so we never block the user. Retry ONLY on a network-level failure (fetch
    // rejects → Make never received it) so a transient blip doesn't drop the sole notification. A
    // non-2xx RESPONSE is logged but NOT retried — Make may have already received and run the
    // scenario, so retrying could re-send. The lead is saved to the DB regardless.
    const notify = (attempt) =>
      fetch(process.env.MAKE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then((r) => {
          if (!r.ok) {
            console.error(`Make webhook responded ${r.status} ${r.statusText} for lead ${email.trim()} — check the scenario (not retried, to avoid a double-send).`);
          }
        })
        .catch((err) => {
          if (attempt < 2) {
            setTimeout(() => notify(attempt + 1), 2000);
          } else {
            console.error(`Make webhook unreachable after retry — lead ${email.trim()} saved to DB but NOT emailed: ${err.message}`);
          }
        });
    notify(1);
  } else {
    console.error(`MAKE_WEBHOOK_URL not set — lead ${email.trim()} saved to DB but NO notification sent!`);
  }

  return res.json({ success: true });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.set('X-Robots-Tag', 'noindex');
  res.status(404).render('404', {
    title: 'Page Not Found | All Star Contracting',
    description: "Sorry, that page doesn't exist. Return home or get in touch with All Star Contracting in Syracuse, NY.",
    ogImage: DEFAULT_OG_IMAGE,
    canonicalPath: req.path,
  });
});

// ─── Error Handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong. Please try again.');
});

// ─── Start ────────────────────────────────────────────────────────────────────
if (!process.env.MAKE_WEBHOOK_URL) {
  console.error(
    'WARNING: MAKE_WEBHOOK_URL is not set. The Make webhook is now the SOLE lead notifier — ' +
    'without it, leads are saved to the DB but nobody is emailed. Set it in the Railway env.'
  );
}
initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`All Star Contracting server running on port ${PORT}`);
  });
});
