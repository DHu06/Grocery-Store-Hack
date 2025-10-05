/**
 * Step 2 – Fully working backend that turns a product query string
 * into [{ store, price, location }] using:
 *  - SerpAPI (Google Shopping) for prices
 *  - Google Places API for geocoding (FAST)
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
const GOOGLE_PLACES_KEY = process.env.GOOGLE_PLACES_KEY;
const DEFAULT_CITY = process.env.CITY || "Vancouver, British Columbia, Canada";

if (!SERPAPI_KEY) {
  console.error("❌ Missing SERPAPI_KEY in .env");
  process.exit(1);
}

if (!GOOGLE_PLACES_KEY) {
  console.warn("⚠️  GOOGLE_PLACES_KEY not set - geocoding will be SLOW (Nominatim fallback)");
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
// Blocklist: online-only stores without physical locations
// ───────────────────────────────────────────────────────────────────────────────
const ONLINE_ONLY_PATTERNS = [
  /^ebay/i,
  /^amazon/i,
  /^etsy/i,
  /^redbubble/i,
  /^teepublic/i,
  /^teespring/i,
  /^aliexpress/i,
  /^wish/i,
  /^shein/i,
  /^temu/i,
  /uber\s*eats/i,
  /door\s*dash/i,
  /^instacart/i,
  /^grubhub/i,
  /skip\s*the\s*dishes/i,
  /^walmart\.com/i,
  /^target\.com/i,
];

function isOnlineOnlyStore(rawStore: string, normalizedStore: string): boolean {
  const rawLower = rawStore.toLowerCase().trim();
  const normLower = normalizedStore.toLowerCase().trim();
  
  // Check against patterns on BOTH raw and normalized names
  for (const pattern of ONLINE_ONLY_PATTERNS) {
    if (pattern.test(rawLower) || pattern.test(normLower)) {
      return true;
    }
  }
  
  return false;
}

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
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function normalizeStoreName(raw: string): string {
  let normalized = raw
    .replace(/\.ca$|\.com$|\.net$|\.org$/i, "")
    .replace(/supercentre|supercenter/gi, "")
    .replace(/-/g, " ")
    .replace(/\binc\.?\b|\bltd\.?\b|\bcorp\.?\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  
  // Specific store normalization for major retailers
  if (/walmart/i.test(normalized)) normalized = "Walmart";
  if (/amazon/i.test(normalized)) normalized = "Amazon";
  if (/costco/i.test(normalized)) normalized = "Costco";
  if (/london\s*drugs/i.test(normalized)) normalized = "London Drugs";
  if (/save\s*on\s*foods/i.test(normalized)) normalized = "Save On Foods";
  if (/superstore/i.test(normalized)) normalized = "Superstore";
  
  return normalized.replace(/\b\w/g, (c) => c.toUpperCase());
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
// External calls: SerpAPI
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
    num: "40",
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
// Geocode store - PARALLEL OPTIMIZED
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

  // Fallback to Nominatim (SLOW - sequential only)
  const q = encodeURIComponent(`${store} ${city}`);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&addressdetails=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "hackathon-demo/1.0 (contact@example.com)" },
  });
  if (!res.ok) {
    const fallback = { address: `${store} (location not found)` };
    geocodeCache.set(key, fallback);
    return fallback;
  }
  const data = (await res.json()) as any[];
  const first = data?.[0];
  const geo: GeoHit = first
    ? { address: first.display_name, lat: Number(first.lat), lng: Number(first.lon) }
    : { address: `${store} (location not found)` };
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
    .refine((n) => n == null || (Number.isInteger(n) && n > 0 && n <= 20), {
      message: "top must be 1..20 if provided",
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
/** Endpoint: /v1/prices/search - OPTIMIZED FOR SPEED */
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

    // 2) Rough rows - FILTER OUT ONLINE-ONLY STORES
    const rough: Row[] = [];
    for (const r of items) {
      const price = r.extracted_price ?? parsePrice(r.price);
      if (!price) continue;
      const rawStore: string = r.source || domainFromUrl(r.product_link) || "Unknown";
      const store = normalizeStoreName(rawStore);
      
      // Skip online-only stores (check BEFORE normalization removes identifiers)
      if (isOnlineOnlyStore(rawStore, store)) {
        console.log(`⏭️  Skipping online-only store: ${rawStore} -> ${store}`);
        continue;
      }
      
      rough.push({ store, price, location: "…" });
    }

    console.log(`📦 Raw items from SerpAPI: ${items.length}`);
    console.log(`📦 After rough parsing & filtering: ${rough.length}`);

    // 3) Dedupe cheapest per store
    let rows = dedupeCheapest(rough);
    console.log(`📦 After deduplication: ${rows.length}`);

    // 4) Sort logic
    const limit = top ?? 5;

    // DISTANCE mode
    if (sort === "closest" && lat != null && lng != null) {
      const toGeocode = Math.min(limit * 3, rows.length);
      rows = rows.sort((a, b) => a.price - b.price).slice(0, toGeocode);
      
      console.log(`🗺️  Geocoding ${rows.length} stores for distance sorting...`);
      const startTime = Date.now();
      
      // PARALLEL geocoding (works with Google Places, must be sequential with Nominatim)
      if (GOOGLE_PLACES_KEY) {
        await Promise.all(rows.map(async (r) => {
          const g = await geocodeStore(r.store, city);
          r.location = g.address;
          r.lat = g.lat;
          r.lng = g.lng;
          if (r.lat != null && r.lng != null) {
            r.distance_km = haversineKm(lat, lng, r.lat, r.lng);
          } else {
            r.distance_km = Number.POSITIVE_INFINITY;
          }
        }));
      } else {
        // Sequential with Nominatim (SLOW)
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const g = await geocodeStore(r.store, city);
          r.location = g.address;
          r.lat = g.lat;
          r.lng = g.lng;
          if (r.lat != null && r.lng != null) {
            r.distance_km = haversineKm(lat, lng, r.lat, r.lng);
          } else {
            r.distance_km = Number.POSITIVE_INFINITY;
          }
          if (i < rows.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1100));
          }
        }
      }

      console.log(`⚡ Geocoding took ${Date.now() - startTime}ms`);

      rows = rows.sort((a, b) => {
        if (a.distance_km === Number.POSITIVE_INFINITY && b.distance_km === Number.POSITIVE_INFINITY) {
          return a.price - b.price;
        }
        return a.distance_km! - b.distance_km!;
      }).slice(0, limit);

      // KEEP lat/lng in response for map pins
      return res.json(rows);
    }

    // PRICE mode - PARALLEL OPTIMIZED
    rows = rows.sort((a, b) => a.price - b.price).slice(0, limit * 2);
    
    console.log(`🗺️  Geocoding ${rows.length} stores for price mode...`);
    const startTime = Date.now();
    
    // PARALLEL if Google Places, sequential if Nominatim
    if (GOOGLE_PLACES_KEY) {
      await Promise.all(rows.map(async (r) => {
        const g = await geocodeStore(r.store, city);
        r.location = g.address;
        r.lat = g.lat;
        r.lng = g.lng;
      }));
    } else {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const g = await geocodeStore(r.store, city);
        r.location = g.address;
        r.lat = g.lat;
        r.lng = g.lng;
        if (i < rows.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1100));
        }
      }
    }
    
    console.log(`⚡ Geocoding took ${Date.now() - startTime}ms`);
    
    rows = rows.sort((a, b) => a.price - b.price).slice(0, limit);
    
    console.log(`📦 Final result count: ${rows.length}`);
    
    // KEEP lat/lng in response for map pins
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