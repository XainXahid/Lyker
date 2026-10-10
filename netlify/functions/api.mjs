// Netlify version of the Lyker API (the local server is server.js).
// Same routes, same Follow Up Boss events. Leads are stored in Netlify Blobs
// instead of SQLite, and FUB sends happen during the request instead of from
// a background queue.
import { getStore } from "@netlify/blobs";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { listings, listingById } from "../../lib/listings.js";
import * as fub from "../../lib/fub.js";
import neighborhoods, { COMMUTES } from "../../data/neighborhoods.js";
import featured from "../../data/featured.js";

export const config = { path: "/api/*" };

const store = () => getStore({ name: "lyker-leads", consistency: "strong" });
const now = () => new Date().toISOString().slice(0, 19).replace("T", " "); // matches the local server's timestamps
const clean = (v, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

const appConfig = () => fub.agentProfile();

async function readJson(req) {
  const raw = await req.text();
  if (raw.length > 100_000) throw new HttpError(413, "Request too large");
  try { return raw ? JSON.parse(raw) : {}; } catch { throw new HttpError(400, "Invalid JSON"); }
}

async function authLead(b) {
  const lead = typeof b.leadId === "string" ? await store().get(b.leadId, { type: "json" }) : null;
  if (!lead || lead.token !== b.token) throw new HttpError(401, "We couldn't find your sign-up. Please sign up again.");
  return lead;
}

function authAgent(req) {
  const expected = process.env.AGENT_PASSCODE;
  if (!expected) throw new HttpError(503, "Set AGENT_PASSCODE in Netlify's environment variables to use the agent dashboard");
  const given = Buffer.from(req.headers.get("x-agent-passcode") || "");
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) throw new HttpError(401, "Wrong passcode");
}

// ---------- Follow Up Boss ----------
async function deliver(fn, target) {
  if (!fub.enabled()) return;
  try {
    await fn();
    target.fub_status = "sent"; target.fub_error = null;
  } catch (err) {
    console.error("[fub]", err.message);
    target.fub_status = "failed"; target.fub_error = err.message;
  }
}

async function syncLead(lead) {
  if (lead.fub_status !== "sent") await deliver(() => fub.send(fub.registrationEvent(lead)), lead);
  if (lead.fub_status !== "sent") return;
  for (const [listingId, s] of Object.entries(lead.swipes)) {
    if (s.action === "pass" || s.fub_status === "sent") continue;
    const listing = listingById.get(Number(listingId));
    if (listing) await deliver(() => fub.send(fub.swipeEvent(lead, listing, s.action)), s);
  }
  for (const m of lead.messages || []) {
    if (m.fub_status === "sent") continue;
    const listing = m.listing_id ? listingById.get(m.listing_id) : null;
    await deliver(() => fub.send(fub.inquiryEvent(lead, listing, m.message)), m);
  }
}

// Validates the sign-up fields and builds a new lead with any homes they
// liked before signing up. The caller syncs and saves it.
function createLead(b) {
  const firstName = clean(b.firstName, 60);
  const email = clean(b.email).toLowerCase();
  const phone = clean(b.phone, 30);
  if (!firstName) throw new HttpError(400, "Add your first name");
  if (!email && !phone) throw new HttpError(400, "Add an email or phone number so your agent can reach you");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "That email doesn't look right");
  if (phone && phone.replace(/\D/g, "").length < 10) throw new HttpError(400, "Phone needs at least 10 digits");
  if (b.consent !== true) throw new HttpError(400, "Tick the box so your agent is allowed to contact you");

  const lead = {
    id: randomUUID(), token: randomUUID(), first_name: firstName, last_name: clean(b.lastName, 60) || null,
    email: email || null, phone: phone || null, consent_at: now(), prefs: JSON.stringify(b.prefs || null),
    created_at: now(), fub_status: "pending", fub_error: null, swipes: {}, messages: [],
  };
  for (const like of Array.isArray(b.likes) ? b.likes.slice(0, 200) : []) {
    if (listingById.has(Number(like.id))) setSwipe(lead, Number(like.id), like.star ? "star" : "like");
  }
  return lead;
}

function setSwipe(lead, listingId, action) {
  if (!listingById.has(listingId)) throw new HttpError(400, "Unknown listing");
  if (!["like", "star", "pass"].includes(action)) throw new HttpError(400, "Unknown action");
  const prev = lead.swipes[listingId];
  if (prev?.action === action) return;
  lead.swipes[listingId] = { action, created_at: now(), fub_status: action === "pass" ? "skipped" : "pending", fub_error: null };
}

// Backup email. Posts a copy to the hidden Netlify form in public/notify.html,
// and Netlify emails each submission to the address set in its form
// notifications. Plain likes don't send email, only sign-ups, showing
// requests and messages.
async function notify(lead, subject, { listing = null, message = "" } = {}) {
  const base = process.env.URL || process.env.PUBLIC_URL;
  if (!base) return;
  const price = listing ? "$" + listing.price.toLocaleString("en-US") + (listing.mode === "rent" ? "/mo" : "") : "";
  const fields = {
    "form-name": "lyker-notify",
    subject,
    name: [lead.first_name, lead.last_name].filter(Boolean).join(" "),
    email: lead.email || "",
    phone: lead.phone || "",
    home: listing ? `${listing.street}, ${listing.hood} (${price}), ${base}/#listing-${listing.id}` : "",
    message,
    looking_for: lead.prefs ? fub.prefsText(JSON.parse(lead.prefs)) : "",
  };
  try {
    const res = await fetch(`${base}/notify.html`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    });
    if (!res.ok) console.error("[notify]", res.status);
  } catch (err) {
    console.error("[notify]", err.message);
  }
}

function homesSummary(lead) {
  const pick = (action) => Object.entries(lead.swipes).filter(([, sw]) => sw.action === action)
    .map(([id]) => listingById.get(Number(id))).filter(Boolean).map((l) => `${l.street}, ${l.hood}`);
  const stars = pick("star"), likes = pick("like");
  return [stars.length ? `Showing requested: ${stars.join("; ")}.` : "", likes.length ? `Liked: ${likes.join("; ")}.` : ""].filter(Boolean).join(" ");
}

// ---------- routes ----------
const routes = {
  "GET /api/config": () => appConfig(),
  "GET /api/listings": () => ({ listings, featured, neighborhoods, commutes: COMMUTES }),

  "POST /api/leads": async (req) => {
    const lead = createLead(await readJson(req));
    await syncLead(lead);
    await store().setJSON(lead.id, lead);
    await notify(lead, "New Lyker sign-up", { message: homesSummary(lead) });
    return { id: lead.id, token: lead.token, firstName: lead.first_name };
  },

  // Contact form. Signed-in buyers send their lead id; anyone else signs up
  // with the same fields as the sign-up form.
  "POST /api/contact": async (req) => {
    const b = await readJson(req);
    const message = clean(b.message, 2000);
    if (!message) throw new HttpError(400, "Add a message");
    const listingId = b.listingId ? Number(b.listingId) : null;
    if (listingId && !listingById.has(listingId)) throw new HttpError(400, "Unknown listing");
    const lead = b.leadId ? await authLead(b) : createLead(b);
    lead.messages = lead.messages || [];
    lead.messages.unshift({ message, listing_id: listingId, created_at: now(), fub_status: "pending", fub_error: null });
    await syncLead(lead);
    await store().setJSON(lead.id, lead);
    const listing = listingId ? listingById.get(listingId) : null;
    await notify(lead, listing ? "Question about a home" : "New message", { listing, message });
    return b.leadId ? { ok: true } : { ok: true, id: lead.id, token: lead.token, firstName: lead.first_name };
  },

  "PUT /api/leads/prefs": async (req) => {
    const b = await readJson(req);
    const lead = await authLead(b);
    lead.prefs = JSON.stringify(b.prefs || null);
    await store().setJSON(lead.id, lead);
    return { ok: true };
  },

  "POST /api/swipes": async (req) => {
    const b = await readJson(req);
    const lead = await authLead(b);
    const wasStar = lead.swipes[Number(b.listingId)]?.action === "star";
    setSwipe(lead, Number(b.listingId), b.action);
    await syncLead(lead);
    await store().setJSON(lead.id, lead);
    if (b.action === "star" && !wasStar) await notify(lead, "Showing request", { listing: listingById.get(Number(b.listingId)) });
    return { ok: true };
  },

  "DELETE /api/swipes": async (req) => {
    const b = await readJson(req);
    const lead = await authLead(b);
    delete lead.swipes[Number(b.listingId)];
    await store().setJSON(lead.id, lead);
    return { ok: true };
  },

  "GET /api/agent/leads": async (req) => {
    authAgent(req);
    const s = store();
    const { blobs } = await s.list();
    const all = (await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })))).filter(Boolean);
    all.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return {
      ...appConfig(),
      leads: all.map((l) => {
        const swipes = Object.entries(l.swipes).map(([id, sw]) => ({ ...sw, listing_id: Number(id) }))
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        const kept = swipes.filter((sw) => sw.action !== "pass");
        const msgs = l.messages || [];
        return {
          id: l.id, firstName: l.first_name, lastName: l.last_name, email: l.email, phone: l.phone,
          createdAt: l.created_at, prefs: l.prefs ? JSON.parse(l.prefs) : null,
          fubStatus: l.fub_status, fubError: l.fub_error,
          lastActivity: [swipes[0]?.created_at, msgs[0]?.created_at, l.created_at].filter(Boolean).sort().pop(),
          passes: swipes.length - kept.length,
          homes: kept.map((sw) => ({ action: sw.action, at: sw.created_at, fubStatus: sw.fub_status, fubError: sw.fub_error, listing: listingById.get(sw.listing_id) })),
          messages: msgs.map((m) => ({ message: m.message, at: m.created_at, fubStatus: m.fub_status, fubError: m.fub_error, listing: m.listing_id ? listingById.get(m.listing_id) : null })),
        };
      }),
    };
  },

  "POST /api/agent/retry": async (req) => {
    authAgent(req);
    const s = store();
    const { blobs } = await s.list();
    for (const { key } of blobs) {
      const lead = await s.get(key, { type: "json" });
      if (!lead) continue;
      const failed = lead.fub_status !== "sent" || [...Object.values(lead.swipes), ...(lead.messages || [])].some((x) => x.fub_status === "failed" || x.fub_status === "pending");
      if (!failed) continue;
      await syncLead(lead);
      await s.setJSON(key, lead);
    }
    return { ok: true };
  },
};

export default async (req) => {
  const { pathname } = new URL(req.url);
  try {
    const handler = routes[`${req.method} ${pathname}`];
    if (!handler) throw new HttpError(404, "Not found");
    return Response.json(await handler(req));
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    return Response.json({ error: status === 500 ? "Something went wrong on the server" : err.message }, { status });
  }
};
