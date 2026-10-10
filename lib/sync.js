// Delivers leads and swipes to Follow Up Boss. Everything is saved locally
// first, so nothing is lost if FUB is down or the API key isn't set yet —
// pending rows go out the next time the queue runs.
import { db } from "./db.js";
import { listingById } from "./listings.js";
import * as fub from "./fub.js";

const MAX_ATTEMPTS = 5;
let running = false;

export async function flush() {
  if (running || !fub.enabled()) return;
  running = true;
  try {
    const leads = db.prepare(
      `SELECT * FROM leads WHERE fub_status IN ('pending','failed') AND attempts < ? ORDER BY id`
    ).all(MAX_ATTEMPTS);
    for (const lead of leads) {
      await attempt("leads", lead.id, () => fub.send(fub.registrationEvent(lead)));
    }

    // Swipes only go out once the person exists in FUB.
    const swipes = db.prepare(
      `SELECT s.id, s.listing_id, s.action, l.first_name, l.last_name, l.email, l.phone
         FROM swipes s JOIN leads l ON l.id = s.lead_id
        WHERE s.fub_status IN ('pending','failed') AND s.attempts < ? AND l.fub_status = 'sent'
        ORDER BY s.id`
    ).all(MAX_ATTEMPTS);
    for (const s of swipes) {
      const listing = listingById.get(s.listing_id);
      if (!listing) continue;
      await attempt("swipes", s.id, () => fub.send(fub.swipeEvent(s, listing, s.action)));
    }

    const inquiries = db.prepare(
      `SELECT i.id, i.listing_id, i.message, l.first_name, l.last_name, l.email, l.phone
         FROM inquiries i JOIN leads l ON l.id = i.lead_id
        WHERE i.fub_status IN ('pending','failed') AND i.attempts < ? AND l.fub_status = 'sent'
        ORDER BY i.id`
    ).all(MAX_ATTEMPTS);
    for (const q of inquiries) {
      const listing = q.listing_id ? listingById.get(q.listing_id) : null;
      await attempt("inquiries", q.id, () => fub.send(fub.inquiryEvent(q, listing, q.message)));
    }
  } finally {
    running = false;
  }
}

async function attempt(table, id, fn) {
  try {
    await fn();
    db.prepare(`UPDATE ${table} SET fub_status = 'sent', fub_error = NULL WHERE id = ?`).run(id);
  } catch (err) {
    console.error(`[fub] ${table} #${id}:`, err.message);
    db.prepare(`UPDATE ${table} SET fub_status = 'failed', fub_error = ?, attempts = attempts + 1 WHERE id = ?`)
      .run(err.message, id);
  }
}

export function retryFailed() {
  db.exec(`UPDATE leads  SET attempts = 0, fub_status = 'pending' WHERE fub_status = 'failed'`);
  db.exec(`UPDATE swipes SET attempts = 0, fub_status = 'pending' WHERE fub_status = 'failed'`);
  db.exec(`UPDATE inquiries SET attempts = 0, fub_status = 'pending' WHERE fub_status = 'failed'`);
  return flush();
}
