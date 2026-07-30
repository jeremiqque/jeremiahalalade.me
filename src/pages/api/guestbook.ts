export const prerender = false;

import type { APIRoute } from "astro";

// Guestbook.
// GET  → the most recent entries, newest first.
// POST → append one entry, then trim the list.
//
// Entries live in a single Upstash Redis list under GUESTBOOK_KEY. The country
// is NOT taken from the form — it's read from Vercel's edge geo headers, the
// same source /api/visitor uses, so it can't be spoofed by the submitter.
//
// Reuses the env vars already set for the last-visitor widget:
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN

const REDIS_URL = import.meta.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = import.meta.env.UPSTASH_REDIS_REST_TOKEN;

const GUESTBOOK_KEY = "guestbook";
const MAX_ENTRIES = 100; // hard cap on what we keep
const PAGE_SIZE = 30; // how many we hand to the client
const MAX_NAME = 32;
const MAX_MESSAGE = 280;
const MAX_LINK = 200;
const RATE_LIMIT_SECONDS = 3600; // one signature per IP per hour

const RESPONSE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export interface GuestEntry {
  name: string;
  message: string;
  /** ISO timestamp. The UI formats it. */
  date: string;
  country: string;
  /** Optional. When set, the name renders as a link. */
  href?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: RESPONSE_HEADERS,
  });
}

async function redis(command: unknown[]): Promise<unknown> {
  const res = await fetch(REDIS_URL as string, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Upstash error ${res.status}`);
  const data = await res.json();
  return data.result;
}

function countryName(code: string): string {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(
      code.toUpperCase(),
    );
    return name || code;
  } catch {
    return code;
  }
}

// The signer never sends their location — it comes off the edge headers on
// their own request, so it can't be spoofed through the form.
//   x-vercel-ip-country → set by Vercel in production
//   cf-ipcountry        → set by Cloudflare, in case this ever moves
// Neither exists on localhost, where there's no edge in front of the server.
function readCountry(request: Request): string {
  const h = request.headers;
  const raw = h.get("x-vercel-ip-country") || h.get("cf-ipcountry");
  const code = raw ? raw.trim() : "";
  // "XX" is what Cloudflare sends for clients it can't place.
  if (!code || code === "XX") return import.meta.env.DEV ? "Localhost" : "Somewhere";
  return countryName(code);
}

function readIp(request: Request): string {
  const h = request.headers;
  // x-forwarded-for can be a chain; the first entry is the client.
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") || "unknown";
}

// Strip control characters and collapse runs of whitespace, so a submission
// can't break the layout with 40 newlines.
function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// Optional link. Anything that isn't a plain http(s) URL is dropped rather than
// rejected, so a bad link never blocks an otherwise fine signature. The
// protocol allowlist is the important part: it stops javascript: and data: URIs
// from reaching an href attribute.
function cleanUrl(value: unknown): string {
  const raw = clean(value, MAX_LINK);
  if (!raw) return "";
  // Bare domains are common in a URL field — assume https rather than failing.
  const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (!url.hostname.includes(".")) return "";
    return url.toString().slice(0, MAX_LINK);
  } catch {
    return "";
  }
}

export const GET: APIRoute = async () => {
  if (!REDIS_URL || !REDIS_TOKEN) return json({ entries: [] });

  try {
    const rows = (await redis([
      "LRANGE",
      GUESTBOOK_KEY,
      0,
      PAGE_SIZE - 1,
    ])) as string[] | null;

    const entries = (rows || [])
      .map((row) => {
        try {
          return JSON.parse(row) as GuestEntry;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is GuestEntry => Boolean(entry && entry.name));

    return json({ entries });
  } catch {
    // Never let a Redis hiccup take the page down — the tab just renders empty.
    return json({ entries: [] });
  }
};

export const POST: APIRoute = async ({ request }) => {
  if (!REDIS_URL || !REDIS_TOKEN) {
    return json({ error: "Guestbook is not configured." }, 503);
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Send JSON." }, 400);
  }

  // Honeypot: the field is hidden, so anything in it came from a bot. Return a
  // success shape so the bot has no signal that it was caught.
  if (clean(payload.website, 200)) return json({ ok: true });

  const name = clean(payload.name, MAX_NAME);
  const message = clean(payload.message, MAX_MESSAGE);

  if (name.length < 2) return json({ error: "Add a name." }, 400);
  if (message.length < 2) return json({ error: "Add a message." }, 400);

  const ip = readIp(request);

  try {
    // SET with NX only succeeds if the key is absent, so this both checks and
    // sets the rate limit in a single round trip.
    const allowed = await redis([
      "SET",
      `guestbook:rate:${ip}`,
      "1",
      "NX",
      "EX",
      RATE_LIMIT_SECONDS,
    ]);
    if (!allowed) {
      return json(
        { error: "You already signed recently. Try again later." },
        429,
      );
    }

    const href = cleanUrl(payload.link);

    const entry: GuestEntry = {
      name,
      message,
      date: new Date().toISOString(),
      country: readCountry(request),
      ...(href ? { href } : {}),
    };

    await redis(["LPUSH", GUESTBOOK_KEY, JSON.stringify(entry)]);
    await redis(["LTRIM", GUESTBOOK_KEY, 0, MAX_ENTRIES - 1]);

    return json({ ok: true, entry }, 201);
  } catch {
    return json({ error: "Could not save that. Try again." }, 500);
  }
};
