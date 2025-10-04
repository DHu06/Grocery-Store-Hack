/**
 * Step 2 – Fully working backend that turns a product query string
 * into [{ store, price, location }] using:
 *  - SerpAPI (Google Shopping) for prices
 *  - Nominatim (OpenStreetMap) for store addresses
 *
 * One-file hackathon edition (Express + TypeScript).
 *
 * ───────────────
 * Setup
 * ───────────────
 * npm init -y
 * npm i express node-fetch lru-cache zod express-rate-limit dotenv
 * npm i -D typescript ts-node @types/node @types/express
 * npx tsc --init
 *
 * .env
 *   PORT=3001
 *   SERPAPI_KEY=your_serpapi_key_here
 *   CITY="Vancouver, BC"
 *
 * package.json scripts
 *   "dev": "TS_NODE_TRANSPILE_ONLY=1 node -r dotenv/config -r ts-node/register src/index.ts",
 *   "build": "tsc -p .",
 *   "start": "node -r dotenv/config dist/index.js"
 *
 * Folder
 *   src/index.ts   ← put this file here
 *
 * Run
 *   npm run dev
 *   http://localhost:3001/v1/prices/search?q=coca%20cola%20355%20ml
 */

import express from "express";
import fetch from "node-fetch";
import { LRUCache } from "lru-cache";
import { z } from "zod";
import rateLimit from "express-rate-limit";

// ───────────────────────────────────────────────────────────────────────────────
// Env + Constants
// ───────────────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3001);
const SERPAPI_KEY = process.env.SERPAPI_KEY;
const DEFAULT_CITY = process.env.CITY || "Vancouver, BC";

if (!SERPAPI_KEY) {
  console.error("❌ Missing SERPAPI_KEY in .env");
  process.exit(1);
}

// Basic rate limit (hackathon safe)
app.use(
  
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// ───────────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────────
type Row = { store: string; price: number; location: string };

// ───────────────────────────────────────────────────────────────────────────────
// Caches
// ───────────────────────────────────────────────────────────────────────────────
const serpCache = new LRUCache<string, any>({ max: 300, ttl: 1000 * 60 * 3 }); // 3 minutes
const geocodeCache = new LRUCache<string, string>({ max: 1000, ttl: 1000 * 60 * 60 }); // 1 hour

// ───────────────────────────────────────────────────────────────────────────────
// Helpers: parsing & normalization
// ───────────────────────────────────────────────────────────────────────────────
function domainFromUrl(urlStr?: string): string | null {
  if (!urlStr) return null;
  try {
    const u = new URL(urlStr);
    return u.hostname.replace(/^www\./, ""); // walmart.ca
  } catch {
    return null;
  }
}

function normalizeStoreName(raw: string): string {
  return raw
    .replace(/\.ca$|\.com$|\.net$|\.org$/i, "")
    .replace(/supercentre|supercenter/gi, "")
    .replace(/-/g, " ")
    .replace(/\binc\.?\b|\bltd\.?\b|\bcorp\.?\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()); // Title Case
}

function parsePrice(p: unknown): number | null {
  if (typeof p === "number") return p;
  if (typeof p === "string") {
    const n = Number(p.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function dedupeCheapest(rows: Row[]): Row[] {
  const by = new Map<string, Row>();
  for (const r of rows) {
    const k = r.store.toLowerCase();
    if (!by.has(k) || r.price < by.get(k)!.price) by.set(k, r);
  }
  return [...by.values()];
}

// ───────────────────────────────────────────────────────────────────────────────
// External calls: SerpAPI + Nominatim
// ───────────────────────────────────────────────────────────────────────────────
async function fetchSerpShopping(query: string, city = DEFAULT_CITY) {
  const key = `serp:${query}:${city}`;
  const cached = serpCache.get(key);
  if (cached) return cached;

  const params = new URLSearchParams({
    engine: "google_shopping",
    q: query,
    location: city,
    hl: "en",
    gl: "ca",
    num: "20",
    api_key: SERPAPI_KEY!,
  });
  const url = `https://serpapi.com/search?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SerpAPI HTTP ${res.status}`);
  const json = await res.json();
  serpCache.set(key, json);
  return json;
}

async function geocodeStore(store: string, city = DEFAULT_CITY): Promise<string> {
  const key = `geo:${store}:${city}`;
  const hit = geocodeCache.get(key);
  if (hit) return hit;

  const q = encodeURIComponent(`${store} ${city}`);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&addressdetails=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "hackathon-demo/1.0 (contact@example.com)" },
  });
  if (!res.ok) {
    geocodeCache.set(key, "Address unavailable");
    return "Address unavailable";
  }
  const data = (await res.json()) as any[];
  const address = data?.[0]?.display_name || "Address unavailable";
  geocodeCache.set(key, address);
  return address;
}

// ───────────────────────────────────────────────────────────────────────────────
// Input schema
// ───────────────────────────────────────────────────────────────────────────────
const InputSchema = z.object({
  q: z.string().min(1, "q is required"),
  city: z.string().optional().default(DEFAULT_CITY),
  top: z
    .string()
    .optional()
    .transform((s) => (s ? Number(s) : undefined))
    .refine((n) => n == null || (Number.isInteger(n) && n > 0 && n <= 10), {
      message: "top must be 1..10 if provided",
    }),
});

// ───────────────────────────────────────────────────────────────────────────────
// Endpoint: /v1/prices/search
// ───────────────────────────────────────────────────────────────────────────────
app.get("/v1/prices/search", async (req, res) => {
  try {
    const parsed = InputSchema.safeParse({
      q: req.query.q,
      city: req.query.city,
      top: req.query.top,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { q, city, top } = parsed.data;

    // 1) Query SerpAPI for shopping results
    const serpa = await fetchSerpShopping(q, city);
    const items: any[] = Array.isArray(serpa?.shopping_results)
      ? serpa.shopping_results
      : [];

    // 2) Convert to rough rows
    const rough: Row[] = [];
    for (const r of items) {
      const price = r.extracted_price ?? parsePrice(r.price);
      if (!price) continue;

      const rawStore: string = r.source || domainFromUrl(r.product_link) || "Unknown";
      const store = normalizeStoreName(rawStore);
      rough.push({ store, price, location: "…" });
    }

    // 3) Keep cheapest per store
    let rows = dedupeCheapest(rough);

    // 4) Top N (optional) BEFORE geocode (to save calls). Default top=3
    const limit = top ?? 3;
    rows = rows.sort((a, b) => a.price - b.price).slice(0, limit);

    // 5) Geocode addresses (sequential keeps Nominatim happy)
    for (const r of rows) {
      r.location = await geocodeStore(r.store, city);
    }

    // 6) Final sort and return
    rows.sort((a, b) => a.price - b.price);

    return res.json(rows);
  } catch (err: any) {
    console.error("/v1/prices/search error", err);
    return res.status(500).json({ error: "Failed to fetch prices", details: err?.message || String(err) });
  }
});

// Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`✅ prices-api listening on http://localhost:${PORT}`);
});
