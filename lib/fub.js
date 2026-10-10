// Follow Up Boss Events API — the documented way for a lead source to send
// leads in. FUB matches people by email/phone, so repeat events land on the
// same contact and run through your normal lead flow / routing.
// Docs: https://docs.followupboss.com/reference/events-post

const ENDPOINT = "https://api.followupboss.com/v1/events";
const SOURCE = "Lyker";

export const enabled = () => Boolean(process.env.FUB_API_KEY);

export async function send(event) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: "Basic " + Buffer.from(process.env.FUB_API_KEY + ":").toString("base64"),
    "X-System": process.env.FUB_SYSTEM || SOURCE,
  };
  if (process.env.FUB_SYSTEM_KEY) headers["X-System-Key"] = process.env.FUB_SYSTEM_KEY;

  const res = await fetch(ENDPOINT, { method: "POST", headers, body: JSON.stringify(event) });
  if (!res.ok) throw new Error(`FUB ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

function person(lead) {
  const p = { firstName: lead.first_name, tags: [SOURCE] };
  if (lead.last_name) p.lastName = lead.last_name;
  if (lead.email) p.emails = [{ value: lead.email }];
  if (lead.phone) p.phones = [{ value: lead.phone }];
  return p;
}

const money = (n) => "$" + Number(n).toLocaleString("en-US");

function property(l) {
  return {
    street: l.street,
    city: l.city,
    state: "HI",
    code: l.zip,
    mlsNumber: l.mls,
    price: l.price,
    forRent: l.mode === "rent",
    url: `${process.env.PUBLIC_URL || "http://localhost:4780"}/#listing-${l.id}`,
    type: l.type,
    bedrooms: l.beds,
    bathrooms: l.baths,
    area: l.sqft,
    ...(l.landSqft ? { lot: `${l.landSqft.toLocaleString("en-US")} sq ft` } : {}),
  };
}

// The Hawaii details an agent wants before calling back.
function hawaiiNotes(l) {
  if (l.mode === "rent") return `Rent ${money(l.price)}/mo, available ${l.avail}, ${l.leaseTerm} lease.`;
  const bits = [l.tenure === "Leasehold" ? `Leasehold, lease ends ${l.leaseExp}, lease rent ${money(l.leaseRent)}/mo, fee purchase ${l.feeAvail.toLowerCase()}` : "Fee simple"];
  if (l.maintFee) bits.push(`maintenance fee ${money(l.maintFee)}/mo`);
  bits.push(`flood zone ${l.floodZone}`, `${l.parking} parking stall${l.parking === 1 ? "" : "s"}`);
  return bits.join(". ") + ".";
}

export function prefsText(prefs) {
  if (!prefs) return "";
  const max = prefs.max?.[prefs.mode];
  return [
    prefs.mode === "rent" ? "Renting" : "Buying",
    max ? `up to ${money(max)}${prefs.mode === "rent" ? "/mo" : ""}` : null,
    prefs.beds ? `${prefs.beds}+ beds` : null,
    prefs.types?.length ? prefs.types.join("/") : "any type",
    prefs.hoods?.length ? prefs.hoods.join(", ") : "anywhere on O‘ahu",
    prefs.feeOnly ? "fee simple only" : null,
    prefs.musts?.length ? `must-haves: ${prefs.musts.join(", ")}` : null,
  ].filter(Boolean).join(", ");
}

export function registrationEvent(lead) {
  const prefs = lead.prefs ? JSON.parse(lead.prefs) : null;
  const max = prefs?.max?.[prefs.mode];
  return {
    source: SOURCE,
    system: SOURCE,
    type: "Registration",
    message: `Signed up on Lyker. Looking for: ${prefsText(prefs)}`,
    person: person(lead),
    propertySearch: {
      type: prefs?.types?.join(", ") || undefined,
      neighborhood: prefs?.hoods?.join(", ") || undefined,
      state: "HI",
      minBedrooms: prefs?.beds || undefined,
      maxPrice: max || undefined,
    },
  };
}

export function swipeEvent(lead, listing, action) {
  const star = action === "star";
  const price = listing.mode === "rent" ? `${money(listing.price)}/mo` : money(listing.price);
  return {
    source: SOURCE,
    system: SOURCE,
    // "Property Inquiry" is the high-intent type FUB treats as a real inquiry;
    // a plain right-swipe is a "Saved Property".
    type: star ? "Property Inquiry" : "Saved Property",
    message: star
      ? `Wants a showing: ${listing.street}, ${listing.hood} (${price})`
      : `Swiped right on ${listing.street}, ${listing.hood} (${price})`,
    description: hawaiiNotes(listing),
    person: person(lead),
    property: property(listing),
  };
}

// A message from the contact form, about one home or in general.
export function inquiryEvent(lead, listing, message) {
  const event = {
    source: SOURCE,
    system: SOURCE,
    type: listing ? "Property Inquiry" : "General Inquiry",
    message: listing ? `Question about ${listing.street}, ${listing.hood}: ${message}` : message,
    person: person(lead),
  };
  if (listing) {
    event.description = hawaiiNotes(listing);
    event.property = property(listing);
  }
  return event;
}

// Agent details shown in the app. Set these in .env locally or in Netlify's
// environment variables; anything left blank is hidden.
export function agentProfile() {
  const e = process.env;
  // Lyker only ever shows Zain as the agent. Environment variables can update
  // these details; the defaults are Zain's own.
  return {
    agentName: e.AGENT_NAME || "Zain Zahid",
    brokerage: e.BROKERAGE || "Talk Realty",
    agentTitle: e.AGENT_TITLE || "REALTOR®",
    agentPhone: e.AGENT_PHONE || "(808) 468-3967",
    agentEmail: e.AGENT_EMAIL || "zain@talkrealty.co",
    agentLicense: e.AGENT_LICENSE || "RS-88903",
    agentPhoto: e.AGENT_PHOTO_URL || "",
    agentBio: e.AGENT_BIO || "",
    fubConnected: enabled(),
  };
}
