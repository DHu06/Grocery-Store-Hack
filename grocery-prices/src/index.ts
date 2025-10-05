/**
 * Step 2 – Fully working backend that turns a product query string
 * into [{ store, price, location }] using:
 *  - SerpAPI (Google Shopping) for prices
 *  - Nominatim (OpenStreetMap) for store addresses
 *
 * One-file hackathon edition (Express + TypeScript).
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
const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_KEY; // Add this to .env
const DEFAULT_CITY = process.env.CITY || "Vancouver, British Columbia, Canada";

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
type Row = {
  store: string;
  price: number;
  location: string;
  lat?: number;
  lng?: number;
  distance_km?: number;
};

type GeoHit = { address: string; lat?: number; lng?: number };

// ───────────────────────────────────────────────────────────────────────────────
// Caches
// ───────────────────────────────────────────────────────────────────────────────
const serpCache = new LRUCache<string, any>({ max: 300, ttl: 1000 * 60 * 3 }); // 3 minutes
const geocodeCache = new LRUCache<string, GeoHit>({ max: 1000, ttl: 1000 * 60 * 60 }); // 1 hour

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
  console.log(`🔍 Fetching SerpAPI: ${url.replace(SERPAPI_KEY!, 'API_KEY_HIDDEN')}`);
  
  const res = await fetch(url);
  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`❌ SerpAPI Error (${res.status}):`, errorBody);
    throw new Error(`SerpAPI HTTP ${res.status}: ${errorBody}`);
  }
  const json = await res.json();
  console.log(`✅ SerpAPI returned ${json.shopping_results?.length || 0} results`);
  serpCache.set(key, json);
  return json;
}

// ───────────────────────────────────────────────────────────────────────────────
// Geocode store (returns address + lat/lng)
// ───────────────────────────────────────────────────────────────────────────────
async function geocodeStore(store: string, city = DEFAULT_CITY): Promise<GeoHit> {
  const key = `geo:${store}:${city}`;
  const hit = geocodeCache.get(key);
  if (hit) return hit;

  // Try Google Places first if API key available
  if (GOOGLE_PLACES_KEY) {
    try {
      const q = encodeURIComponent(`${store} ${city}`);
      const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${q}&inputtype=textquery&fields=formatted_address,geometry&key=${GOOGLE_PLACES_KEY}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        console.log(`Google Places for "${store}":`, data.status, data.candidates?.length || 0);
        if (data.candidates?.[0]) {
          const place = data.candidates[0];
          const geo: GeoHit = {
            address: place.formatted_address,
            lat: place.geometry?.location?.lat,
            lng: place.geometry?.location?.lng,
          };
          geocodeCache.set(key, geo);
          return geo;
        }
      }
    } catch (err) {
      console.error('Google Places error for', store, ':', err);
    }
  }

  // Fallback to Nominatim
  console.log(`Falling back to Nominatim for "${store}"`);
  const q = encodeURIComponent(`${store} ${city}`);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&addressdetails=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "hackathon-demo/1.0 (contact@example.com)" },
  });
  if (!res.ok) {
    const fallback = { address: "Address unavailable" };
    geocodeCache.set(key, fallback);
    return fallback;
  }
  const data = (await res.json()) as any[];
  const first = data?.[0];
  const geo: GeoHit = first
    ? { address: first.display_name, lat: Number(first.lat), lng: Number(first.lon) }
    : { address: "Address unavailable" };
  geocodeCache.set(key, geo);
  return geo;
}

// ───────────────────────────────────────────────────────────────────────────────
/** Distance helper (Haversine) */
// ───────────────────────────────────────────────────────────────────────────────
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371; // km
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
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
  lat: z
    .string()
    .optional()
    .transform((s) => (s != null ? Number(s) : undefined))
    .refine((n) => n == null || Number.isFinite(n!), { message: "lat must be a number" }),
  lng: z
    .string()
    .optional()
    .transform((s) => (s != null ? Number(s) : undefined))
    .refine((n) => n == null || Number.isFinite(n!), { message: "lng must be a number" }),
  sort: z.enum(["price", "closest"]).optional().default("price"),
});

// ───────────────────────────────────────────────────────────────────────────────
/** Endpoint: /v1/prices/search */
// ───────────────────────────────────────────────────────────────────────────────
app.get("/v1/prices/search", async (req, res) => {
  try {
    const parsed = InputSchema.safeParse({
      q: req.query.q,
      city: req.query.city,
      top: req.query.top,
      lat: req.query.lat,
      lng: req.query.lng,
      sort: req.query.sort,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { q, city, top, lat, lng, sort } = parsed.data;

    // 1) SerpAPI
    const serpa = await fetchSerpShopping(q, city);
    const items: any[] = Array.isArray(serpa?.shopping_results)
      ? serpa.shopping_results
      : [];

    // 2) Rough rows
    const rough: Row[] = [];
    for (const r of items) {
      const price = r.extracted_price ?? parsePrice(r.price);
      if (!price) continue;
      const rawStore: string = r.source || domainFromUrl(r.product_link) || "Unknown";
      const store = normalizeStoreName(rawStore);
      rough.push({ store, price, location: "…" });
    }

    // 3) Dedupe cheapest per store
    let rows = dedupeCheapest(rough);

    // 4) Sort logic
    const limit = top ?? 3;

    // Check if we can do distance sorting
    if (sort === "closest" && lat != null && lng != null) {
      // DISTANCE mode - only geocode what we need (limit + buffer for failures)
      const toGeocode = Math.min(limit + 3, rows.length);
      rows = rows.sort((a, b) => a.price - b.price).slice(0, toGeocode);
      
      console.log(`🗺️  Geocoding ${rows.length} stores for distance sorting...`);
      
      // Geocode in parallel if using Google Places, sequential if Nominatim
      if (GOOGLE_PLACES_KEY) {
        // Parallel geocoding with Google Places (FAST!)
        await Promise.all(rows.map(async (r) => {
          const g = await geocodeStore(r.store, city);
          r.location = g.address;
          r.lat = g.lat;
          r.lng = g.lng;
          if (r.lat != null && r.lng != null) {
            r.distance_km = haversineKm(lat, lng, r.lat, r.lng);
            console.log(`  ✓ ${r.store}: ${r.distance_km.toFixed(2)} km`);
          } else {
            r.distance_km = Number.POSITIVE_INFINITY;
            console.log(`  ✗ ${r.store}: geocode failed`);
          }
        }));
      } else {
        // Sequential with Nominatim rate limiting (SLOW)
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const g = await geocodeStore(r.store, city);
          r.location = g.address;
          r.lat = g.lat;
          r.lng = g.lng;
          if (r.lat != null && r.lng != null) {
            r.distance_km = haversineKm(lat, lng, r.lat, r.lng);
            console.log(`  ✓ ${r.store}: ${r.distance_km.toFixed(2)} km`);
          } else {
            r.distance_km = Number.POSITIVE_INFINITY;
            console.log(`  ✗ ${r.store}: geocode failed`);
          }
          // Respect Nominatim rate limit - wait 1.1s between requests
          if (i < rows.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1100));
          }
        }
      }

      rows = rows
        .filter((r) => r.location !== "Address unavailable")
        .sort((a, b) => (a.distance_km! - b.distance_km!))
        .slice(0, limit);

      // Remove lat/lng from response
      rows.forEach(r => {
        delete r.lat;
        delete r.lng;
      });

      return res.json(rows);
    }

    // PRICE mode (default or when coordinates unavailable)
    rows = rows.sort((a, b) => a.price - b.price).slice(0, limit);
    for (const r of rows) {
      const g = await geocodeStore(r.store, city);
      r.location = g.address;
      r.lat = g.lat;
      r.lng = g.lng;
    }
    // Remove failed geocodes
    rows = rows.filter((r) => r.location !== "Address unavailable");
    rows.sort((a, b) => a.price - b.price);
    return res.json(rows);
  } catch (err: any) {
    console.error("/v1/prices/search error", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch prices", details: err?.message || String(err) });
  }
});

// Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`✅ prices-api listening on http://localhost:${PORT}`);
});