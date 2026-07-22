export const prerender = false;

import type { APIRoute } from "astro";

// "Last visitor" widget.
// On each request we read the CURRENT visitor's geo from Vercel's edge headers,
// return the PREVIOUS visitor stored in Upstash Redis, then save the current one
// for the next person to see.
//
// Required env vars (add these in Vercel → Project → Settings → Environment
// Variables, and in a local .env for `npm run dev`):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN

const REDIS_URL = import.meta.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = import.meta.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = "last_visitor";

const RESPONSE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
};

interface Visitor {
  city: string;
  country: string;
}

// Turn an ISO country code (e.g. "NL") into a readable name ("Netherlands").
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

// Vercel sets these headers on the incoming request at the edge.
function readGeo(request: Request): Visitor | null {
  const h = request.headers;
  const rawCity = h.get("x-vercel-ip-city");
  const rawCountry = h.get("x-vercel-ip-country");
  if (!rawCity || !rawCountry) return null;
  const city = decodeURIComponent(rawCity).trim();
  const country = countryName(rawCountry.trim());
  if (!city || !country) return null;
  return { city, country };
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

export const GET: APIRoute = async ({ request }) => {
  const current = readGeo(request);

  // Without a store we can't remember previous visitors. Fail soft: return the
  // current visitor's own location (or nothing) so the UI can still render.
  if (!REDIS_URL || !REDIS_TOKEN) {
    return new Response(JSON.stringify({ visitor: current }), {
      status: 200,
      headers: RESPONSE_HEADERS,
    });
  }

  let previous: Visitor | null = null;
  try {
    const stored = (await redis(["GET", KEY])) as string | null;
    if (stored) previous = JSON.parse(stored) as Visitor;

    // Save the current visitor for the next person, but only when it differs
    // from what's stored — so a refresh doesn't show you your own location.
    if (
      current &&
      (!previous ||
        previous.city !== current.city ||
        previous.country !== current.country)
    ) {
      await redis(["SET", KEY, JSON.stringify(current)]);
    }
  } catch {
    // Redis hiccup — degrade to showing the current visitor.
    return new Response(JSON.stringify({ visitor: current }), {
      status: 200,
      headers: RESPONSE_HEADERS,
    });
  }

  return new Response(JSON.stringify({ visitor: previous }), {
    status: 200,
    headers: RESPONSE_HEADERS,
  });
};
