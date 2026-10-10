import http from "node:http";
import { readFile } from "node:fs/promises";
import { randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./lib/db.js";
import { listings, listingById } from "./lib/listings.js";
import neighborhoods, { COMMUTES } from "./data/neighborhoods.js";
import * as fub from "./lib/fub.js";
import { flush, retryFailed } from "./lib/sync.js";

const PORT = Number(process.env.PORT) || 4780;
const PUBLIC_DIR = fileURLToPath(new URL("./public/", import.meta.url));
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

const config = () => fub.agentProfile();

// ---------- helpers ----------
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function body(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new HttpError(413, "Request too large");
  }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw new HttpError(400, "Invalid JSON"); }
}

const clean = (v, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function authLead(b) {
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(Number(b.leadId));
  if (!lead || lead.token !== b.token) throw new HttpError(401, "We couldn't find your sign-up. Please sign up again.");
  return lead;
}

function authAgent(req) {
  const expected = process.env.AGENT_PASSCODE;
  if (!expected) throw new HttpError(503, "Set AGENT_PASSCODE in .env to use the agent dashboard");
  const given = Buffer.from(String(req.headers["x-agent-passcode"] || ""));
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) throw new HttpError(401, "Wrong passcode");
}

const upsertSwipe = db.prepare(`
  INSERT INTO swipes (lead_id, listing_id, action, fub_status) VALUES (?, ?, ?, ?)
  ON CONFLICT (lead_id, listing_id) DO UPDATE SET
    action     = excluded.action,
    fub_status = CASE WHEN swipes.action = excluded.action THEN swipes.fub_status ELSE excluded.fub_status END,
    attempts   = CASE WHEN swipes.action = excluded.action THEN swipes.attempts ELSE 0 END,
    created_at = CURRENT_TIMESTAMP`);

function recordSwipe(leadId, listingId, action) {
  if (!listingById.has(listingId)) throw new HttpError(400, "Unknown listing");
  if (!["like", "star", "pass"].includes(action)) throw new HttpError(400, "Unknown action");
  upsertSwipe.run(leadId, listingId, action, action === "pass" ? "skipped" : "pending");
}

// Validates the sign-up fields and saves a new lead with any homes they
// liked before signing up.
function createLead(b) {
  const firstName = clean(b.firstName, 60);
  const email = clean(b.email).toLowerCase();
  const phone = clean(b.phone, 30);
  if (!firstName) throw new HttpError(400, "Add your first name");
  if (!email && !phone) throw new HttpError(400, "Add an email or phone number so your agent can reach you");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "That email doesn't look right");
  if (phone && phone.replace(/\D/g, "").length < 10) throw new HttpError(400, "Phone needs at least 10 digits");
  if (b.consent !== true) throw new HttpError(400, "Tick the box so your agent is allowed to contact you");

  const token = randomUUID();
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO leads (token, first_name, last_name, email, phone, consent_at, prefs)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`
  ).run(token, firstName, clean(b.lastName, 60) || null, email || null, phone || null, JSON.stringify(b.prefs || null));
  const id = Number(lastInsertRowid);

  // Homes they liked before signing up come along with them.
  for (const like of Array.isArray(b.likes) ? b.likes.slice(0, 200) : []) {
    if (listingById.has(Number(like.id))) recordSwipe(id, Number(like.id), like.star ? "star" : "like");
  }
  return { id, token, firstName };
}

// ---------- API ----------
const routes = {
  "GET /api/config": () => config(),

  // Sample set is small, so the client filters. With the live IDX feed this
  // becomes a filtered, paginated query.
  "GET /api/listings": () => ({ listings, neighborhoods, commutes: COMMUTES }),

  "POST /api/leads": async (req) => {
    const b = await body(req);
    const { id, token, firstName } = createLead(b);
    flush();
    return { id, token, firstName };
  },

  // Contact form. Signed-in buyers send their lead id; anyone else signs up
  // with the same fields as the sign-up form.
  "POST /api/contact": async (req) => {
    const b = await body(req);
    const message = clean(b.message, 2000);
    if (!message) throw new HttpError(400, "Add a message");
    const listingId = b.listingId ? Number(b.listingId) : null;
    if (listingId && !listingById.has(listingId)) throw new HttpError(400, "Unknown listing");
    const lead = b.leadId ? authLead(b) : createLead(b);
    db.prepare("INSERT INTO inquiries (lead_id, listing_id, message) VALUES (?, ?, ?)").run(lead.id, listingId, message);
    flush();
    return b.leadId ? { ok: true } : { ok: true, id: lead.id, token: lead.token, firstName: lead.firstName };
  },

  "PUT /api/leads/prefs": async (req) => {
    const b = await body(req);
    const lead = authLead(b);
    db.prepare("UPDATE leads SET prefs = ? WHERE id = ?").run(JSON.stringify(b.prefs || null), lead.id);
    return { ok: true };
  },

  "POST /api/swipes": async (req) => {
    const b = await body(req);
    const lead = authLead(b);
    recordSwipe(lead.id, Number(b.listingId), b.action);
    flush();
    return { ok: true };
  },

  "DELETE /api/swipes": async (req) => {
    const b = await body(req);
    const lead = authLead(b);
    db.prepare("DELETE FROM swipes WHERE lead_id = ? AND listing_id = ?").run(lead.id, Number(b.listingId));
    return { ok: true };
  },

  "GET /api/agent/leads": (req) => {
    authAgent(req);
    const leads = db.prepare("SELECT * FROM leads ORDER BY id DESC").all();
    const swipes = db.prepare("SELECT * FROM swipes ORDER BY created_at DESC").all();
    const inquiries = db.prepare("SELECT * FROM inquiries ORDER BY created_at DESC").all();
    const byLead = new Map(leads.map((l) => [l.id, []]));
    const msgsByLead = new Map(leads.map((l) => [l.id, []]));
    for (const s of swipes) byLead.get(s.lead_id)?.push(s);
    for (const q of inquiries) msgsByLead.get(q.lead_id)?.push(q);
    return {
      ...config(),
      leads: leads.map((l) => {
        const all = byLead.get(l.id);
        const kept = all.filter((s) => s.action !== "pass");
        const msgs = msgsByLead.get(l.id);
        return {
          id: l.id, firstName: l.first_name, lastName: l.last_name, email: l.email, phone: l.phone,
          createdAt: l.created_at, prefs: l.prefs ? JSON.parse(l.prefs) : null,
          fubStatus: l.fub_status, fubError: l.fub_error,
          lastActivity: [all[0]?.created_at, msgs[0]?.created_at, l.created_at].filter(Boolean).sort().pop(),
          passes: all.length - kept.length,
          homes: kept.map((s) => ({ action: s.action, at: s.created_at, fubStatus: s.fub_status, fubError: s.fub_error, listing: listingById.get(s.listing_id) })),
          messages: msgs.map((q) => ({ message: q.message, at: q.created_at, fubStatus: q.fub_status, fubError: q.fub_error, listing: q.listing_id ? listingById.get(q.listing_id) : null })),
        };
      }),
    };
  },

  "POST /api/agent/retry": async (req) => {
    authAgent(req);
    await retryFailed();
    return { ok: true };
  },
};

// ---------- static ----------
async function serveStatic(req, res, pathname) {
  const file = pathname === "/" ? "index.html" : pathname === "/agent" ? "agent.html" : pathname.slice(1);
  const full = path.join(PUBLIC_DIR, path.normalize(file));
  if (!full.startsWith(PUBLIC_DIR)) throw new HttpError(404, "Not found");
  try {
    const data = await readFile(full);
    res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "application/octet-stream" });
    res.end(data);
  } catch {
    throw new HttpError(404, "Not found");
  }
}

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  try {
    const handler = routes[`${req.method} ${pathname}`];
    if (handler) return send(res, 200, await handler(req));
    if (pathname.startsWith("/api/")) throw new HttpError(404, "Not found");
    await serveStatic(req, res, pathname);
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    send(res, status, { error: status === 500 ? "Something went wrong on the server" : err.message });
  }
}).listen(PORT, () => {
  console.log(`Lyker is running at http://localhost:${PORT} (agent dashboard at /agent)`);
  console.log(fub.enabled() ? "Follow Up Boss: connected" : "Follow Up Boss: not connected. Leads are saved locally until FUB_API_KEY is set.");
});

flush();
setInterval(flush, 60_000);
