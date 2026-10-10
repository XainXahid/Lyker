const MUSTS = ["Ocean view", "Parking", "Pet-friendly", "Lanai", "Pool", "AC", "Yard", "Gym"];
const HOODS = ["Waikīkī", "Kaka‘ako", "Mānoa", "Kaimukī", "Kāhala", "Kailua", "Hawai‘i Kai", "Kāne‘ohe", "‘Ewa Beach"];
const TYPES = ["Condo", "House", "Townhouse"];
const RANGE = { buy: { min: 200000, max: 3000000, step: 25000 }, rent: { min: 1500, max: 8000, step: 100 } };
const LOAN = { down: 0.2, rate: 0.065, years: 30 }; // defaults; buyers can change down payment and rate
const THIS_YEAR = new Date().getFullYear();
const PAYMENT_DISCLAIMER = "Payments shown are estimates only, subject to credit approval, and never guaranteed. Your actual rate, terms and payment will vary.";
const FLOOD = { X: { risk: "minimal risk" }, AE: { risk: "high risk", note: "Flood insurance is usually required." }, VE: { risk: "coastal high risk", note: "Flood insurance is required." } };

const DEFAULT = {
  prefs: { mode: "buy", max: { buy: 1500000, rent: 4500 }, beds: 1, types: [], hoods: [], musts: ["Ocean view", "Parking"], feeOnly: false },
  seen: [], liked: [], lead: null, askedSignup: false,
};

let L = [], FEATURED = [], byId = {}, HOODINFO = {}, COMMUTES = [], CFG = { agentName: "Your agent", brokerage: "" };
let S = load();
if (S.loan) Object.assign(LOAN, S.loan);
let history = [];

function load() {
  try {
    const s = JSON.parse(localStorage.getItem("lyker"));
    if (s && s.prefs) return { ...structuredClone(DEFAULT), ...s, prefs: { ...DEFAULT.prefs, ...s.prefs } };
  } catch {}
  return structuredClone(DEFAULT);
}
function save() { try { localStorage.setItem("lyker", JSON.stringify(S)); } catch {} }

// ---------- server ----------
async function api(method, url, body) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && S.lead) { S.lead = null; save(); }
  if (!res.ok) throw new Error(data.error || "Couldn't reach the server. Check your connection and try again.");
  return data;
}
function syncSwipe(listingId, action) {
  if (!S.lead) return;
  api("POST", "/api/swipes", { leadId: S.lead.id, token: S.lead.token, listingId, action }).catch((e) => console.warn(e.message));
}
let prefsTimer;
function syncPrefs() {
  if (!S.lead) return;
  clearTimeout(prefsTimer);
  prefsTimer = setTimeout(() => api("PUT", "/api/leads/prefs", { leadId: S.lead.id, token: S.lead.token, prefs: S.prefs }).catch(() => {}), 800);
}

// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const agentFirst = () => CFG.agentName.split(" ")[0];
const fullMoney = (n) => "$" + Math.round(n).toLocaleString();
function money(n, mode) {
  if (mode === "rent") return "$" + n.toLocaleString();
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2).replace(/0+$/, "").replace(/\.$/, "") + "M";
  return "$" + Math.round(n / 1000) + "K";
}
const bedsLabel = (b) => (b === 0 ? "Studio" : b + " bd");
const priceHTML = (l) => (l.mode === "rent" ? fullMoney(l.price) + "<small>/mo</small>" : fullMoney(l.price));

function score(l) {
  const m = S.prefs.musts, max = S.prefs.max[l.mode];
  const hit = m.length ? m.filter((x) => l.f.includes(x)).length / m.length : 1;
  const room = Math.max(0, 1 - l.price / max);
  return Math.min(99, Math.round(58 + 34 * hit + 14 * room));
}
function costs(l) {
  const loan = l.price * (1 - LOAN.down), r = LOAN.rate / 12, n = LOAN.years * 12;
  const pi = Math.round((loan * r) / (1 - (1 + r) ** -n));
  const c = { pi, maint: l.maintFee || 0, lease: l.leaseRent || 0, tax: Math.round((l.taxAnnual || 0) / 12) };
  c.total = c.pi + c.maint + c.lease + c.tax;
  return c;
}
const monthly = (l) => (l.mode === "rent" ? l.price : costs(l).total);
function tenureTag(l) {
  if (l.mode !== "buy") return "";
  return l.tenure === "Leasehold"
    ? `<span class="tag lh">Leasehold until ${l.leaseExp}</span>`
    : `<span class="tag fs">Fee simple</span>`;
}

function queue() {
  const p = S.prefs;
  return L.filter((l) => l.mode === p.mode && l.price <= p.max[p.mode] && l.beds >= p.beds
    && (!p.types.length || p.types.includes(l.type)) && (!p.hoods.length || p.hoods.includes(l.hood))
    && !(p.feeOnly && l.tenure === "Leasehold") && !S.seen.includes(l.id))
    .sort((a, b) => score(b) - score(a));
}

// Real photo when available; drawn illustration as a fallback if it fails to load.
function photo(l, w = 900) {
  if (!l.photo) return art(l);
  return `<img src="${esc(l.photo)}?w=${w}&q=72&auto=format&fit=crop" alt="" loading="lazy" draggable="false" data-fallback="${l.id}">`;
}
document.addEventListener("error", (e) => {
  const img = e.target;
  if (img.tagName === "IMG" && img.dataset.fallback) img.outerHTML = art(byId[img.dataset.fallback]);
}, true);

function art(l) {
  const skies = [["#86CFE0", "#E3F4EF", "#FFF3C4"], ["#F08A5D", "#F9D7A0", "#FFE9B0"], ["#6D8FC9", "#CFDCEF", "#F4F7FF"]];
  const [s1, s2, sun] = skies[l.id % 3];
  const body = ["#F4ECDD", "#E9C9A6", "#CDE4DF", "#F2D6C4", "#DCE6C4"][l.id % 5], roof = l.id % 2 ? "#8B4A38" : "#3F5A61";
  const b = l.type === "Condo"
    ? `<rect x="135" y="60" width="130" height="170" fill="${body}"/>` + Array.from({ length: 8 }, (_, r) => Array.from({ length: 5 }, (_, c) => `<rect x="${144 + c * 24}" y="${76 + r * 18}" width="16" height="10" rx="1.5" fill="#9FC3CC"/>`).join("")).join("")
    : `<rect x="115" y="160" width="170" height="72" fill="${body}"/><polygon points="98,164 200,108 302,164" fill="${roof}"/><rect x="190" y="190" width="24" height="42" fill="${roof}"/>`;
  return `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="g${l.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s1}"/><stop offset="1" stop-color="${s2}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g${l.id})"/><circle cx="320" cy="64" r="26" fill="${sun}"/><path d="M0 175 C50 110 95 150 140 105 C185 60 235 125 285 88 C330 58 370 102 400 92 L400 300 L0 300Z" fill="#3E7A5D" opacity=".75"/><rect y="230" width="400" height="70" fill="#6FA56A"/>${b}</svg>`;
}

// ---------- live listings (link out) ----------
// Lyker's cards are samples until the IDX feed is connected. These links open
// real, current listings on Zain's brokerage search site (for sale) or on
// HiCentral (rentals), filtered to match. Nothing is copied into Lyker.
const LIVE_SALE = "https://zain.talkrealty.co/search";
const LIVE_RENT = "https://www.hicentral.com/forrent.php";
const LIVE_AREAS = {
  "Waikīkī": { neighborhood: "Waikiki", city: "Honolulu" },
  "Kaka‘ako": { neighborhood: "Kakaako", city: "Honolulu" },
  "Mānoa": { neighborhood: "Manoa", city: "Honolulu" },
  "Kaimukī": { neighborhood: "Kaimuki", city: "Honolulu" },
  "Kāhala": { neighborhood: "Waialae - Kahala", city: "Honolulu" },
  "Hawai‘i Kai": { neighborhood: "Hawaii Kai", city: "Honolulu" },
  "Kailua": { city: "Kailua" },
  "Kāne‘ohe": { city: "Kaneohe" },
  "‘Ewa Beach": { city: "Ewa Beach" },
};
const LIVE_TYPES = { House: "house", Condo: "condo", Townhouse: "condo" };

function liveURL({ mode = "buy", hoods = [], types = [], beds = 0, minPrice = 0, maxPrice = 0, feeOnly = false }) {
  if (mode === "rent") return LIVE_RENT;
  const q = [];
  const areas = hoods.filter((h) => LIVE_AREAS[h]);
  if (areas.length) areas.forEach((h, i) => Object.entries({ ...LIVE_AREAS[h], state: "HI" }).forEach(([k, v]) => q.push([`s[locations][${i}][${k}]`, v])));
  else q.push(["s[locations][0][county]", "Honolulu"], ["s[locations][0][state]", "HI"]);
  [...new Set(types.map((t) => LIVE_TYPES[t]).filter(Boolean))].forEach((t, i) => q.push([`s[propertyTypes][${i}]`, t]));
  if (beds) q.push(["s[beds]", beds]);
  if (minPrice) q.push(["s[minPrice]", minPrice]);
  if (maxPrice) q.push(["s[maxPrice]", maxPrice]);
  if (feeOnly) q.push(["s[sa_is_fee_simple_ownership]", "true"]);
  q.push(["s[orderBy]", "sourceCreationDate,desc"]);
  return LIVE_SALE + "?" + q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}
const liveForPrefs = () => {
  const p = S.prefs;
  return liveURL({ mode: p.mode, hoods: p.hoods, types: p.types, beds: p.beds, maxPrice: p.max[p.mode], feeOnly: p.feeOnly });
};
// Homes like this one: same area and type, same beds or more, price within about 20%.
const liveForListing = (l) => liveURL({
  mode: l.mode, hoods: [l.hood], types: [l.type], beds: l.beds,
  minPrice: Math.round((l.price * 0.8) / 25000) * 25000, maxPrice: Math.round((l.price * 1.2) / 25000) * 25000,
});
const liveLabel = () => (S.prefs.mode === "rent" ? "See live rentals" : "See live homes");

// ---------- discover ----------
function renderSummary() {
  const p = S.prefs;
  const bits = [p.mode === "buy" ? "Buying" : "Renting", "Up to " + money(p.max[p.mode], p.mode) + (p.mode === "rent" ? "/mo" : ""), p.beds === 0 ? "Any beds" : p.beds + "+ bd"];
  if (p.mode === "buy" && p.feeOnly) bits.push("Fee simple only");
  bits.push(p.types.length ? p.types.join(", ") : "All types");
  bits.push(p.hoods.length ? (p.hoods.length > 2 ? p.hoods.length + " areas" : p.hoods.join(", ")) : "All of O‘ahu");
  const live = $("#live");
  live.href = liveForPrefs(); live.textContent = liveLabel();
  $("#summary").innerHTML = bits.map((b) => `<span class="pill">${esc(b)}</span>`).join("") + `<button class="pill edit" data-go="prefs">Edit</button>`;
}

function cardHTML(l, cls) {
  const hits = l.f.filter((x) => S.prefs.musts.includes(x));
  const rest = l.f.filter((x) => !S.prefs.musts.includes(x));
  const est = monthly(l);
  return `<article class="card ${cls}" data-id="${l.id}" aria-label="${esc(l.type + " in " + l.hood + ", " + money(l.price, l.mode))}">
   <div class="photo">${photo(l)}
     <div class="score"><i></i>${score(l)}% match</div><div class="typetag">${l.type}</div>
     <div class="stamp like">LOVE IT</div><div class="stamp nope">NOPE</div><div class="stamp star">MUST SEE</div>
     <div class="overlay"><div class="price">${priceHTML(l)}</div><div class="where">${esc(l.street)}, ${esc(l.hood)}</div></div>
     <div class="stock">Sample home</div>
   </div>
   <div class="info">
     <div class="stats">
       <div class="stat"><b>${l.beds === 0 ? "Studio" : l.beds}</b><span>${l.beds === 0 ? "&nbsp;" : "Beds"}</span></div>
       <div class="stat"><b>${l.baths}</b><span>Baths</span></div>
       <div class="stat"><b>${l.sqft.toLocaleString()}</b><span>Sq ft</span></div>
       ${l.mode === "buy" ? `<div class="stat"><b>$${(est / 1000).toFixed(1)}K</b><span>Est. payment</span></div>` : `<div class="stat"><b>${esc(l.avail)}</b><span>Available</span></div>`}
     </div>
     <div class="bio">${esc(l.bio)}</div>
     <div class="tags">${tenureTag(l)}${hits.map((t) => `<span class="tag hit">✓ ${t}</span>`).join("")}${rest.map((t) => `<span class="tag">${t}</span>`).join("")}</div>
   </div></article>`;
}

function renderDeck() {
  renderSummary();
  const q = queue(), deck = $("#deck");
  $(".deck-note").hidden = S.prefs.mode !== "buy" || !q.length;
  ["#btn-pass", "#btn-like", "#btn-star"].forEach((s) => ($(s).disabled = !q.length));
  if (!q.length) {
    const any = L.some((l) => l.mode === S.prefs.mode && !S.seen.includes(l.id));
    deck.innerHTML = `<div class="empty"><h2>${any ? "That's everyone who fits" : "You've seen every home"}</h2>
      <p>${any ? "Widen your price, beds, tenure or neighborhoods to meet more homes." : "New homes will show up here. You can also bring back the ones you passed on."}</p>
      <a class="btn" href="${liveForPrefs()}" target="_blank" rel="noopener">${liveLabel()} that match</a>
      <button class="btn ghost" data-go="prefs">Adjust preferences</button>${S.liked.length ? `<button class="btn ghost" data-go="saved">See my ${S.liked.length} saved</button>` : ""}</div>`;
    return;
  }
  deck.innerHTML = q.slice(0, 3).map((l, i) => cardHTML(l, ["top", "back1", "back2"][i])).reverse().join("");
  bindDrag(deck.querySelector(".card.top"));
}

function bindDrag(card) {
  let sx = 0, sy = 0, dx = 0, dy = 0, down = false, moved = false;
  const st = { like: card.querySelector(".stamp.like"), nope: card.querySelector(".stamp.nope"), star: card.querySelector(".stamp.star") };
  const clamp = (v) => Math.max(0, Math.min(1, v));
  card.addEventListener("pointerdown", (e) => { down = true; moved = false; sx = e.clientX; sy = e.clientY; dx = dy = 0; card.setPointerCapture(e.pointerId); card.style.transition = "none"; });
  card.addEventListener("pointermove", (e) => {
    if (!down) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
    card.style.transform = `translate(${dx}px,${dy}px) rotate(${dx / 18}deg)`;
    st.like.style.opacity = clamp(dx / 100); st.nope.style.opacity = clamp(-dx / 100);
    st.star.style.opacity = Math.abs(dx) < 60 ? clamp(-dy / 120) : 0;
  });
  const end = () => {
    if (!down) return; down = false;
    if (!moved) { card.style.transform = ""; return openSheet(+card.dataset.id); }
    if (dx > 110) return decide("like");
    if (dx < -110) return decide("pass");
    if (dy < -130 && Math.abs(dx) < 60) return decide("star");
    card.style.transition = "transform .3s cubic-bezier(.2,.9,.3,1.3)"; card.style.transform = "";
    Object.values(st).forEach((s) => (s.style.opacity = 0));
  };
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", end);
}

let busy = false;
function decide(kind) {
  const card = $("#deck .card.top");
  if (!card || busy) return;
  busy = true;
  const id = +card.dataset.id, l = byId[id];
  card.querySelector(".stamp." + { like: "like", pass: "nope", star: "star" }[kind]).style.opacity = 1;
  card.style.transition = "transform .35s ease-in";
  card.style.transform = { like: "translate(150%,40px) rotate(24deg)", pass: "translate(-150%,40px) rotate(-24deg)", star: "translate(0,-140%) rotate(-4deg)" }[kind];
  setTimeout(() => {
    S.seen.push(id);
    if (kind !== "pass") S.liked.push({ id, star: kind === "star" });
    history.push({ id, kind });
    save(); busy = false;
    renderDeck(); renderBadge(); $("#undo").disabled = false;
    afterSwipe(l, kind);
  }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 300);
}

function afterSwipe(l, kind) {
  if (kind === "pass") return syncSwipe(l.id, "pass");
  if (S.lead) {
    syncSwipe(l.id, kind);
    if (kind === "star" || score(l) >= 90) showMatch(l, kind === "star");
    else toast(`Saved. ${agentFirst()} can see it too.`);
    return;
  }
  // First like (or any showing request) asks who they are, so the match reaches the agent.
  if (kind === "star" || !S.askedSignup) { S.askedSignup = true; save(); return openSignup(kind, l); }
  toast("Saved " + l.street);
}

function undo() {
  const h = history.pop();
  if (!h) return;
  S.seen = S.seen.filter((x) => x !== h.id);
  S.liked = S.liked.filter((x) => x.id !== h.id);
  save();
  if (S.lead) api("DELETE", "/api/swipes", { leadId: S.lead.id, token: S.lead.token, listingId: h.id }).catch(() => {});
  $("#undo").disabled = !history.length;
  renderBadge(); show("discover");
  toast("Brought back " + byId[h.id].street);
}

// ---------- listing sheet ----------
function factsFor(l) {
  if (l.mode === "rent") return [
    ["Available", esc(l.avail)], ["Lease term", esc(l.leaseTerm)], ["Deposit", fullMoney(l.dep)], ["Parking", l.parking ? l.parking + " stall" + (l.parking > 1 ? "s" : "") : "None"],
    ["Pets", l.f.includes("Pet-friendly") ? "Allowed" : "Ask"], ["Flood zone", `${l.floodZone} <small>(${FLOOD[l.floodZone].risk})</small>`],
    ["Rent per sq ft", "$" + (l.price / l.sqft).toFixed(2)], ["MLS #", esc(l.mls)],
  ];
  const f = [["Tenure", l.tenure === "Leasehold" ? `Leasehold <small>(${l.leaseExp - THIS_YEAR} years left)</small>` : "Fee simple"]];
  if (l.tenure === "Leasehold") f.push(["Lease ends", l.leaseExp], ["Lease rent", fullMoney(l.leaseRent) + "/mo"], ["Fee purchase", esc(l.feeAvail)]);
  f.push(["Maintenance fee", l.maintFee ? fullMoney(l.maintFee) + "/mo" : "None"]);
  if (l.feeIncludes?.length) f.push(["Fee covers", esc(l.feeIncludes.join(", ")), "wide"]);
  f.push(["Property tax", fullMoney(l.taxAnnual) + "/yr"], ["Flood zone", `${l.floodZone} <small>(${FLOOD[l.floodZone].risk})</small>`],
    ["Zoning", esc(l.zoning)], ["Parking", l.parking ? l.parking + " stall" + (l.parking > 1 ? "s" : "") : "None"],
    [l.landSqft ? "Land area" : "Ownership", l.landSqft ? l.landSqft.toLocaleString() + " sq ft" : "Condo (CPR)"], ["Year built", l.year],
    ["Days listed", l.dom], ["Price per sq ft", "$" + Math.round(l.price / l.sqft).toLocaleString()], ["MLS #", esc(l.mls)]);
  return f;
}

function costHTML(l) {
  const c = costs(l);
  return `<div class="cost">
       <div><span>Mortgage (principal + interest)</span><span>${fullMoney(c.pi)}</span></div>
       ${c.maint ? `<div><span>Maintenance fee</span><span>${fullMoney(c.maint)}</span></div>` : ""}
       ${c.lease ? `<div><span>Lease rent</span><span>${fullMoney(c.lease)}</span></div>` : ""}
       <div><span>Property tax</span><span>${fullMoney(c.tax)}</span></div>
       <div class="total"><span>Total</span><span>${fullMoney(c.total)}/mo</span></div>
       <div class="note">${fullMoney(l.price * LOAN.down)} down, ${LOAN.years}-year loan. Doesn't include insurance${l.floodZone !== "X" ? " (flood insurance is likely here)" : ""}.</div>
       <div class="disclaim">${PAYMENT_DISCLAIMER}</div></div>`;
}

function calcHTML(l) {
  return `<div><h3>Monthly payment</h3>
    <div class="calc">
      <div><span class="calc-label">Down payment</span><div class="chips small" id="calc-down">${[0.05, 0.1, 0.2, 0.25].map((d) => `<button type="button" data-down="${d}" aria-pressed="${LOAN.down === d}">${d * 100}%</button>`).join("")}</div></div>
      <label class="calc-rate"><span class="calc-label">Interest rate</span><span class="rate-in"><input id="calc-rate" type="number" inputmode="decimal" step="0.125" min="1" max="15" value="${(LOAN.rate * 100).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}"><b>%</b></span></label>
    </div>
    <div id="calc-out">${costHTML(l)}</div></div>`;
}

const hoodInfo = (l) => HOODINFO[l.hood];
const gsLink = (school) => `https://www.greatschools.org/search/search.page?q=${encodeURIComponent(school)}&state=HI`;
const mapsDir = (l, dest) => `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${l.street}, ${l.city}, HI ${l.zip}`)}&destination=${encodeURIComponent(dest)}`;

function neighborhoodHTML(l) {
  const n = hoodInfo(l);
  if (!n) return "";
  return `<div><h3>The neighborhood</h3><p class="para">${esc(n.about)}</p>
      <div class="tags">${n.nearby.map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</div></div>
    <div><h3>Public schools nearby</h3>
      <ul class="linklist">${n.schools.map((sc) => `<li><span>${esc(sc)}</span><a href="${gsLink(sc)}" target="_blank" rel="noopener">Ratings</a></li>`).join("")}</ul>
      <p class="note">Ratings open on GreatSchools. School assignments go by address, so confirm with the Hawai‘i DOE.</p></div>
    <div><h3>Police reports on ${esc(l.street)}</h3><div id="crime" data-id="${l.id}"><p class="note">Loading the last 90 days of reports</p></div></div>
    <div><h3>Commute</h3><ul class="linklist">${COMMUTES.map(([name, dest]) => `<li><span>${esc(name)}</span><a href="${mapsDir(l, dest)}" target="_blank" rel="noopener">Directions</a></li>`).join("")}</ul>
      <p class="note">Opens Google Maps with live traffic.</p></div>
    <div><h3>Hazard maps</h3><ul class="linklist">
      <li><span>Flood zone ${l.floodZone} (${FLOOD[l.floodZone].risk})</span><a href="https://msc.fema.gov/portal/search" target="_blank" rel="noopener">FEMA map</a></li>
      <li><span>Tsunami evacuation zones</span><a href="https://dod.hawaii.gov/hiema/public-resources/tsunami-evacuation-zone/" target="_blank" rel="noopener">State map</a></li></ul></div>`;
}

// Live counts from Honolulu Police Department incident data (Honolulu Open Data).
const crimeCache = {};
const streetKey = (street) => street.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[‘ʻ'’]/g, "").toUpperCase()
  .replace(/^EAST /, "E ").replace(/^WEST /, "W ").replace(/^NORTH /, "N ").replace(/^SOUTH /, "S ");
const niceType = (t) => t.charAt(0) + t.slice(1).toLowerCase().replace(/\//g, " or ");

async function loadCrime(l) {
  const el = $("#crime");
  if (!el) return;
  const key = streetKey(l.street);
  try {
    if (!crimeCache[key]) {
      const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
      const q = new URLSearchParams({ $select: "type, count(*) as n", $where: `blockaddress like '%${key}%' AND date > '${since}'`, $group: "type", $order: "n DESC" });
      const res = await fetch("https://data.honolulu.gov/resource/vg88-5rn5.json?" + q);
      if (!res.ok) throw new Error();
      crimeCache[key] = (await res.json()).map((r) => ({ type: r.type, n: +r.n }));
    }
    const rows = crimeCache[key], total = rows.reduce((a, r) => a + r.n, 0), top = rows.slice(0, 5), max = top[0]?.n || 1;
    if (!$("#crime") || $("#crime").dataset.id !== String(l.id)) return;
    $("#crime").innerHTML = (total
      ? `<p class="para"><b>${total}</b> report${total > 1 ? "s" : ""} on this street in the last 90 days.</p>
         <div class="bars">${top.map((r) => `<div class="bar"><span>${esc(niceType(r.type))}</span><i style="--w:${(r.n / max) * 100}%"></i><b>${r.n}</b></div>`).join("")}</div>`
      : `<p class="para">No reports on this street in the last 90 days.</p>`) +
      `<p class="note">Counts cover the whole street, not just this home, and long or busy streets see more. Source: Honolulu Police Department via Honolulu Open Data. <a href="https://www.crimemapping.com/map/hi/honolulu" target="_blank" rel="noopener">See the map</a></p>`;
  } catch {
    if ($("#crime")) $("#crime").innerHTML = `<p class="note">Police reports couldn't load right now. <a href="https://www.crimemapping.com/map/hi/honolulu" target="_blank" rel="noopener">See the map on CrimeMapping</a></p>`;
  }
}

function openSheet(id, fromSaved) {
  const l = byId[id];
  if (!l) return;
  const liked = S.liked.find((x) => x.id === id), musts = S.prefs.musts;
  const yrs = l.tenure === "Leasehold" ? l.leaseExp - THIS_YEAR : null;
  $("#layer").innerHTML = `<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="Home profile">
   <div class="photo">${photo(l, 1200)}<button class="close" id="closeSheet" aria-label="Close">✕</button>
    <div class="overlay"><div class="price">${priceHTML(l)}</div><div class="where">${l.type} on ${esc(l.street)}, ${esc(l.hood)}</div></div></div>
   <div class="sheet-body">
    <div class="stats"><div class="stat"><b>${bedsLabel(l.beds)}</b><span>Beds</span></div><div class="stat"><b>${l.baths}</b><span>Baths</span></div><div class="stat"><b>${l.sqft.toLocaleString()}</b><span>Sq ft</span></div><div class="stat"><b>${score(l)}%</b><span>Match</span></div></div>
    <div class="sheet-actions"><button class="btn ghost" data-ask="${id}">Ask ${esc(agentFirst())} a question</button><button class="btn ghost" data-share="${id}">Share this home</button></div>
    <div><h3>About me</h3><div>${esc(l.bio)}</div></div>
    ${yrs !== null ? `<div class="warn"><b>Leasehold:</b> you'd own the home but lease the land until ${l.leaseExp} (${yrs} years), plus ${fullMoney(l.leaseRent)}/mo lease rent. Lenders usually want the lease to run past the loan term${yrs < 35 ? `, so a ${LOAN.years}-year mortgage may not be possible here` : ""}. Ask ${esc(agentFirst())} about buying the fee.</div>` : ""}
    ${musts.length ? `<div><h3>Your must-haves</h3><ul class="checks">${musts.map((m) => `<li class="${l.f.includes(m) ? "" : "no"}">${l.f.includes(m) ? "✓" : "✕"} ${m}</li>`).join("")}</ul></div>` : ""}
    ${l.mode === "buy" ? calcHTML(l) : ""}
    <div><h3>Hawai‘i details</h3><dl class="facts">${factsFor(l).map(([k, v, w]) => `<div class="${w || ""}"><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl></div>
    ${l.floodZone !== "X" ? `<div class="hint">Flood zone ${l.floodZone} is ${FLOOD[l.floodZone].risk}. ${FLOOD[l.floodZone].note}</div>` : ""}
    <div class="live-box"><div><b>Real homes like this</b><p class="note">${l.mode === "rent" ? "Opens current O‘ahu rentals on HiCentral." : `Opens current ${esc(l.type.toLowerCase())} listings in ${esc(l.hood)} near this price.`}</p></div>
      <a class="btn" href="${liveForListing(l)}" target="_blank" rel="noopener">${l.mode === "rent" ? "See live rentals" : "See live homes"}</a></div>
    ${neighborhoodHTML(l)}
    ${fromSaved
      ? `<div class="sheet-actions"><button class="btn pass" data-unsave="${id}">Remove</button><button class="btn" data-star="${id}">${liked?.star ? "Unmark must-see" : "Request a showing"}</button></div>`
      : `<div class="sheet-actions"><button class="btn pass" data-decide="pass">Pass</button><button class="btn" data-decide="like">Love it</button></div>`}
    <p class="legal">Equal Housing Opportunity. Listing details are deemed reliable but not guaranteed. ${l.mode === "buy" ? PAYMENT_DISCLAIMER + " " : ""}School, crime and hazard information comes from third parties, so please verify it yourself.</p>
   </div></div></div>`;
  $("#closeSheet").focus();
  sheetListing = l;
  loadCrime(l);
}
let sheetListing = null;
function closeLayer() { $("#layer").innerHTML = ""; }

// ---------- sign-up ----------
let pendingMatch = null;
function openSignup(kind, l) {
  pendingMatch = l ? { l, kind } : null;
  const star = kind === "star";
  const who = CFG.brokerage ? `${esc(CFG.agentName)} of ${esc(CFG.brokerage)}` : esc(CFG.agentName);
  $("#layer").innerHTML = `<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="su-title">
   <div class="sheet-body">
    <div><h2 id="su-title">${star ? "Let's get you inside this one" : "Nice pick! Want your matches saved?"}</h2>
    <p class="sub" style="margin:6px 0 0">${star ? `${esc(agentFirst())} will reach out to set up a showing.` : `Your saved homes go to ${esc(agentFirst())}, a local agent who can answer questions and set up showings.`}</p></div>
    <form class="signup" id="signup" novalidate>
      <div class="two">
        <label class="field">First name<input id="su-first" name="firstName" autocomplete="given-name" required></label>
        <label class="field">Last name<input id="su-last" name="lastName" autocomplete="family-name"></label>
      </div>
      <label class="field">Email<input id="su-email" name="email" type="email" autocomplete="email" inputmode="email"></label>
      <label class="field">Mobile<input id="su-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel"></label>
      <label class="consent"><input type="checkbox" id="su-consent" name="consent">
        <span>I agree that ${who} may contact me by call, text or email about homes. Message and data rates may apply. Consent isn't required to buy.</span></label>
      <p class="err" id="su-err" role="alert"></p>
      <div class="sheet-actions"><button type="button" class="btn ghost" id="su-skip">Not now</button><button class="btn" id="su-go">${star ? "Request showing" : "Save my homes"}</button></div>
    </form>
   </div></div></div>`;
  $("#su-first").focus();
}

async function submitSignup(form) {
  const v = Object.fromEntries(new FormData(form));
  const err = $("#su-err");
  if (!v.firstName.trim()) return (err.textContent = "Add your first name.");
  if (!v.email.trim() && !v.phone.trim()) return (err.textContent = `Add an email or mobile number so ${agentFirst()} can reach you.`);
  if (!form.consent.checked) return (err.textContent = "Tick the box so we're allowed to contact you.");
  err.textContent = "";
  $("#su-go").disabled = true;
  try {
    const r = await api("POST", "/api/leads", { ...v, consent: true, prefs: S.prefs, likes: S.liked });
    S.lead = { id: r.id, token: r.token, firstName: r.firstName };
    save(); closeLayer(); renderSaved();
    if (pendingMatch && (pendingMatch.kind === "star" || score(pendingMatch.l) >= 90)) showMatch(pendingMatch.l, pendingMatch.kind === "star");
    else toast(`Thanks ${r.firstName}! ${agentFirst()} has your saved homes.`);
  } catch (e) {
    err.textContent = e.message;
    $("#su-go").disabled = false;
  }
}

function showMatch(l, star) {
  $("#layer").innerHTML = `<div class="match" role="dialog" aria-modal="true" aria-label="It's a match">
    <h2>${star ? "Showing requested!" : "It's a match!"}</h2><div class="frame">${photo(l, 600)}</div>
    <p>${esc(l.street)} in ${esc(l.hood)} fits ${score(l)}% of what you're looking for. ${star ? `${esc(agentFirst())} will reach out to set up a time.` : `${esc(agentFirst())} has it on your list.`}</p>
    <button class="btn" data-go="saved">View saved homes</button><button class="btn ghost" id="keep">Keep swiping</button></div>`;
  $("#keep").focus();
}

let toastTimer;
function toast(msg) {
  clearTimeout(toastTimer);
  let t = $(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false;
  toastTimer = setTimeout(() => (t.hidden = true), 2200);
}

// ---------- contact ----------
function contactFormHTML(listingId) {
  const l = listingId ? byId[listingId] : null;
  const who = CFG.brokerage ? `${esc(CFG.agentName)} of ${esc(CFG.brokerage)}` : esc(CFG.agentName);
  const starter = l ? `Hi ${agentFirst()}, I'd like to know more about the ${l.type.toLowerCase()} on ${l.street}.` : "";
  return `<form class="signup contact" novalidate data-listing="${l ? l.id : ""}">
    ${S.lead ? `<p class="note">Sending as ${esc(S.lead.firstName)}.</p>` : `
    <div class="two">
      <label class="field">First name<input name="firstName" autocomplete="given-name" required></label>
      <label class="field">Last name<input name="lastName" autocomplete="family-name"></label>
    </div>
    <label class="field">Email<input name="email" type="email" autocomplete="email" inputmode="email"></label>
    <label class="field">Mobile<input name="phone" type="tel" autocomplete="tel" inputmode="tel"></label>`}
    <label class="field">Message<textarea name="message" rows="4" maxlength="2000">${esc(starter)}</textarea></label>
    ${S.lead ? "" : `<label class="consent"><input type="checkbox" name="consent">
      <span>I agree that ${who} may contact me by call, text or email about homes. Message and data rates may apply. Consent isn't required to buy.</span></label>`}
    <p class="err" role="alert"></p>
    <button class="btn">Send message</button>
  </form>`;
}

function openContact(listingId) {
  const l = listingId ? byId[listingId] : null;
  $("#layer").innerHTML = `<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="ct-title">
   <div class="sheet-body">
    <div><h2 id="ct-title">${l ? `Ask about ${esc(l.street)}` : `Message ${esc(agentFirst())}`}</h2>
    <p class="sub" style="margin:6px 0 0">${esc(agentFirst())} usually replies the same day.</p></div>
    ${contactFormHTML(listingId)}
    <button type="button" class="btn ghost" id="su-skip">Cancel</button>
   </div></div></div>`;
  $("#layer form textarea").focus();
}

async function submitContact(form) {
  const v = Object.fromEntries(new FormData(form));
  const err = form.querySelector(".err"), btn = form.querySelector("button.btn");
  if (!v.message.trim()) return (err.textContent = "Add a message.");
  if (!S.lead) {
    if (!v.firstName.trim()) return (err.textContent = "Add your first name.");
    if (!v.email.trim() && !v.phone.trim()) return (err.textContent = `Add an email or mobile number so ${agentFirst()} can reply.`);
    if (!form.consent.checked) return (err.textContent = "Tick the box so we're allowed to contact you.");
  }
  err.textContent = ""; btn.disabled = true;
  const body = { message: v.message, listingId: form.dataset.listing ? +form.dataset.listing : null };
  Object.assign(body, S.lead ? { leadId: S.lead.id, token: S.lead.token } : { ...v, consent: true, prefs: S.prefs, likes: S.liked });
  try {
    const r = await api("POST", "/api/contact", body);
    if (r.id) { S.lead = { id: r.id, token: r.token, firstName: r.firstName }; save(); }
    if (form.closest("#layer")) closeLayer();
    else { renderAgent(); }
    toast(`Sent. ${agentFirst()} will get back to you soon.`);
  } catch (e) {
    err.textContent = e.message; btn.disabled = false;
  }
}

// ---------- agent profile ----------
const GUIDES = [
  ["Fee simple vs leasehold", `Fee simple means you own the home and the land under it, with no end date. Leasehold means you own the home but lease the land until a set year and pay monthly lease rent. Leasehold homes cost less up front but get harder to finance and resell as the end date gets closer.`],
  ["Maintenance fees", `Condo and townhouse owners pay a monthly fee to the association. In Hawai‘i it often covers water, sewer and the building's insurance, and sometimes electricity or cable. Check what's included and ask whether any special assessments are planned.`],
  ["Flood and tsunami zones", `Flood zone X is minimal risk. Zones AE and VE are high risk, and lenders usually require flood insurance there. Tsunami evacuation zones are mapped separately, so check the state map too.`],
  ["Costs beyond the down payment", `Budget for closing costs such as escrow, title insurance and loan fees, plus home insurance and moving. Ask ${"AGENT"} for an estimate on the home you want. Monthly payments in Lyker are estimates only, subject to credit approval, and never guaranteed.`],
  ["Renting on O‘ahu", `Most leases run 12 months. In Hawai‘i a landlord can ask for a security deposit of up to one month's rent, and a separate pet deposit where pets are allowed.`],
  ["Schools", `Public school assignments go by address. Each home's profile lists public schools nearby with links to ratings, and the Hawai‘i DOE can confirm the exact school for an address.`],
];

function renderAgent() {
  const initials = CFG.agentName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const role = [CFG.agentTitle, CFG.brokerage].filter(Boolean).join(" at ");
  const bio = CFG.agentBio || `${CFG.agentName} helps buyers and renters find homes across O‘ahu, from Waikīkī condos to houses on the Windward side. Swipe on homes you like and ${agentFirst()} will follow up with answers and showings.`;
  $("#agent").innerHTML = `
    <div class="agent-card">
      <div class="avatar">${CFG.agentPhoto ? `<img src="${esc(CFG.agentPhoto)}" alt="">` : esc(initials)}</div>
      <div><h1 class="title">${esc(CFG.agentName)}</h1>
        ${role ? `<div class="sub" style="margin:0">${esc(role)}</div>` : ""}
        ${CFG.agentLicense ? `<div class="note">License ${esc(CFG.agentLicense)}</div>` : ""}</div>
    </div>
    ${CFG.agentPhone || CFG.agentEmail ? `<div class="reach">
      ${CFG.agentPhone ? `<a class="btn" href="tel:${esc(CFG.agentPhone.replace(/[^\d+]/g, ""))}">Call ${esc(CFG.agentPhone)}</a>` : ""}
      ${CFG.agentEmail ? `<a class="btn ghost" href="mailto:${esc(CFG.agentEmail)}">Email ${esc(CFG.agentEmail)}</a>` : ""}</div>` : ""}
    <p class="para">${esc(bio)}</p>
    <div class="reach"><a class="btn" href="${liveURL({})}" target="_blank" rel="noopener">Search all O‘ahu homes for sale</a><a class="btn ghost" href="${LIVE_RENT}" target="_blank" rel="noopener">O‘ahu rentals</a></div>
    <div class="section"><h3>Areas I cover</h3><div class="tags">${HOODS.map((h) => `<span class="tag">${h}</span>`).join("")}</div></div>
    <div class="section"><h3>Send a message</h3>${contactFormHTML(null)}</div>
    <div class="section"><h3>Guides for buyers and renters</h3>
      ${GUIDES.map(([t, body]) => `<details class="explain"><summary>${t}</summary><p>${esc(body.replace("AGENT", agentFirst()))}</p></details>`).join("")}</div>
    <p class="legal">Equal Housing Opportunity. Homes in the swipe deck are samples with stock photos. Live listings open on outside sites. Listing details are deemed reliable but not guaranteed. ${PAYMENT_DISCLAIMER}</p>`;
}

// ---------- browse (photo cards) ----------
// Real listings from data/featured.js come first. Each one credits the listing
// brokerage and HiCentral MLS and opens on Zain's Talk Realty site. Sample homes
// follow, clearly labeled, and open their Lyker profile.
const TALK_DETAIL = (id) => `https://zain.talkrealty.co/listing-detail/${encodeURIComponent(id)}?no_reg=1`;
const IDX_DISCLAIMER = () => `Listing information is based on data from the Multiple Listing Service of HiCentral MLS, Ltd. and is deemed reliable but not guaranteed and should be independently verified. IDX information is provided exclusively for consumers' personal, non-commercial use and may not be used for any purpose other than to identify prospective properties consumers may be interested in purchasing or renting. Listings marked with a brokerage name other than Talk Realty are held by that brokerage. © ${THIS_YEAR} HiCentral MLS, Ltd.`;

function factsLine(l) {
  return [l.beds != null && (l.beds === 0 ? "Studio" : `<b>${l.beds}</b> bd`), l.baths && `<b>${l.baths}</b> ba`,
    l.sqft && `<b>${Number(l.sqft).toLocaleString()}</b> sq ft`, l.type && esc(l.type)].filter(Boolean).map((x) => `<span>${x}</span>`).join("");
}

function realCard(l) {
  const rent = l.mode === "rent";
  const img = l.photo ? `<img src="${esc(l.photo)}" alt="" loading="lazy">` : art({ id: Number(l.talkId) % 97 || 1, type: l.type });
  return `<a class="lcard" href="${TALK_DETAIL(l.talkId)}" target="_blank" rel="noopener" aria-label="${esc(`${rent ? "For rent" : "For sale"}: ${l.address}, ${fullMoney(l.price)}${rent ? " a month" : ""}. Opens on Talk Realty.`)}">
    <div class="lphoto">${img}<span class="lstatus ${rent ? "rent" : "sale"}">${rent ? "For rent" : "For sale"}</span><span class="lsource">HiCentral MLS</span></div>
    <div class="lbody">
      <div class="lprice">${fullMoney(l.price)}${rent ? "<small>/mo</small>" : ""}</div>
      <div class="lfacts">${factsLine(l)}</div>
      <div class="laddr">${esc(l.address)}</div>
      <div class="lhood">${esc([l.hood, l.city].filter(Boolean).join(", "))}</div>
      <span class="lcta">View on Talk Realty ↗</span>
      <div class="lcredit">Listing courtesy of ${esc(l.listOffice || "the listing brokerage")}. Source: HiCentral MLS, Ltd.${l.mls ? ` MLS# ${esc(l.mls)}` : ""}</div>
    </div></a>`;
}

function sampleCard(l) {
  const rent = l.mode === "rent";
  return `<button type="button" class="lcard" data-open-browse="${l.id}" aria-label="${esc(`Sample ${l.type.toLowerCase()} on ${l.street}, ${fullMoney(l.price)}${rent ? " a month" : ""}`)}">
    <div class="lphoto">${photo(l, 700)}<span class="lstatus ${rent ? "rent" : "sale"}">${rent ? "For rent" : "For sale"}</span><span class="lsource">Sample home</span></div>
    <div class="lbody">
      <div class="lprice">${fullMoney(l.price)}${rent ? "<small>/mo</small>" : ""}</div>
      <div class="lfacts">${factsLine(l)}</div>
      <div class="laddr">${esc(l.street)}</div>
      <div class="lhood">${esc(l.hood)}, ${esc(l.city)}</div>
      ${tenureTag(l) ? `<div class="tags">${tenureTag(l)}</div>` : ""}
      <div class="lcredit">Sample listing with a stock photo, for trying out Lyker.</div>
    </div></button>`;
}

function renderBrowse() {
  const mode = S.prefs.mode;
  const real = FEATURED.filter((l) => l.mode === mode && l.talkId);
  const samples = L.filter((l) => l.mode === mode).sort((a, b) => score(b) - score(a));
  $("#browse").innerHTML = `
    <h1 class="title">${mode === "rent" ? "Rentals on O‘ahu" : "Homes for sale on O‘ahu"}</h1>
    <p class="sub">Tap a home for photos and full details${real.length ? " on Talk Realty" : ""}.</p>
    <div class="seg" id="browse-mode" style="margin-bottom:14px">
      <button type="button" data-v="buy" aria-pressed="${mode === "buy"}">Buy</button>
      <button type="button" data-v="rent" aria-pressed="${mode === "rent"}">Rent</button>
    </div>
    ${real.length ? `<div class="lgrid">${real.map(realCard).join("")}</div>` : ""}
    <div class="live-box"><div><b>${real.length ? "See more properties" : "See real, current listings"}</b><p class="note">${mode === "rent" ? "Opens current O‘ahu rentals." : "Opens Zain's Talk Realty search, filtered to your preferences."}</p></div>
      <a class="btn" href="${liveForPrefs()}" target="_blank" rel="noopener">${liveLabel()}</a></div>
    ${samples.length ? `<h3 class="lhead">${real.length ? "Sample homes" : "Sample homes to try Lyker with"}</h3><div class="lgrid">${samples.map(sampleCard).join("")}</div>` : ""}
    <p class="legal">${real.length ? IDX_DISCLAIMER() + " " : ""}Equal Housing Opportunity. Sample homes use stock photos and aren't for sale.</p>`;
}

// ---------- saved ----------
function renderBadge() { const b = $("#savedCount"); b.textContent = S.liked.length; b.hidden = !S.liked.length; }
function renderSaved() {
  const items = S.liked.filter((x) => byId[x.id]).map((x) => ({ ...x, l: byId[x.id] })).sort((a, b) => b.star - a.star || score(b.l) - score(a.l));
  const stars = items.filter((i) => i.star).length;
  const banner = S.lead
    ? `<div class="banner"><div>Signed in as <b>${esc(S.lead.firstName)}</b>. ${esc(CFG.agentName)} can see these homes and will reach out about showings.</div></div>`
    : items.length ? `<div class="banner"><div>Want a local agent to see these and set up showings?</div><button class="btn" id="open-signup">Send my homes to ${esc(agentFirst())}</button></div>` : "";
  const liveBanner = `<div class="live-box"><div><b>Ready for real homes?</b><p class="note">Browse live listings that match your preferences.</p></div><a class="btn" href="${liveForPrefs()}" target="_blank" rel="noopener">${liveLabel()}</a></div>`;
  $("#saved").innerHTML = `<h1 class="title">Saved homes</h1><p class="sub">${items.length ? `${items.length} saved${stars ? `, ${stars} showing request${stars > 1 ? "s" : ""}` : ""}` : "Swipe right on a home and it lands here."}</p>${banner}${liveBanner}` +
    (items.length ? items.map(({ l, star }) => `<div class="row"><button class="row-open" data-open="${l.id}" aria-label="Open ${esc(l.street)}"><div class="thumb">${photo(l, 240)}</div>
      <div><div class="p">${l.mode === "rent" ? fullMoney(l.price) + "/mo" : money(l.price)}${star ? '<span class="must">★ Showing</span>' : ""}</div>
      <div class="a">${esc(l.street)}, ${esc(l.hood)}</div>
      <div class="a">${l.mode === "buy" ? (l.tenure === "Leasehold" ? `Leasehold until ${l.leaseExp}` : "Fee simple") + ", " : ""}${bedsLabel(l.beds)}, ${l.baths} ba, ${score(l)}% match</div></div></button>
      <button class="x" data-unsave="${l.id}" aria-label="Remove ${esc(l.street)}">✕</button></div>`).join("")
    : `<div class="empty" style="height:auto;margin-top:40px"><button class="btn" data-go="discover">Start swiping</button></div>`);
}

// ---------- prefs ----------
function renderPrefs() {
  const p = S.prefs, r = RANGE[p.mode];
  document.querySelectorAll("#mode button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === p.mode));
  document.querySelectorAll("#tenure button").forEach((b) => b.setAttribute("aria-pressed", (b.dataset.v === "fee") === p.feeOnly));
  $("#tenureSet").hidden = p.mode !== "buy";
  const m = $("#max");
  m.min = r.min; m.max = r.max; m.step = r.step; m.value = p.max[p.mode];
  $("#maxOut").textContent = money(+m.value, p.mode) + (p.mode === "rent" ? "/mo" : "");
  $("#beds").innerHTML = [0, 1, 2, 3, 4].map((n) => `<button type="button" data-beds="${n}" aria-pressed="${p.beds === n}">${n === 0 ? "Any" : n + "+"}</button>`).join("");
  const chips = (el, list, key) => ($(el).innerHTML = list.map((v) => `<button type="button" data-k="${key}" data-v="${esc(v)}" aria-pressed="${p[key].includes(v)}">${v}</button>`).join(""));
  chips("#types", TYPES, "types"); chips("#hoods", HOODS, "hoods"); chips("#musts", MUSTS, "musts");
  const n = queue().length;
  $("#go").textContent = n ? `Show me ${n} home${n > 1 ? "s" : ""}` : "No new homes match. Try widening your search.";
}
function prefsChanged() { save(); syncPrefs(); renderPrefs(); }

// ---------- nav + events ----------
function show(tab) {
  closeLayer();
  for (const t of ["discover", "browse", "saved", "prefs", "agent"]) {
    $("#v-" + t).hidden = t !== tab;
    const b = document.querySelector(`nav [data-tab="${t}"]`);
    t === tab ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current");
  }
  if (tab === "discover") renderDeck();
  if (tab === "browse") renderBrowse();
  if (tab === "saved") renderSaved();
  if (tab === "prefs") renderPrefs();
  if (tab === "agent") renderAgent();
}

document.addEventListener("click", (e) => {
  if (e.target.id === "scrim") return closeLayer();
  const t = e.target.closest("button,[data-go]");
  if (!t) return;
  const d = t.dataset;
  if (d.tab) return show(d.tab);
  if (d.go) return show(d.go);
  if (t.id === "keep" || t.id === "closeSheet" || t.id === "su-skip") return closeLayer();
  if (t.id === "open-signup") return openSignup("like", null);
  if (d.decide) { closeLayer(); return decide(d.decide); }
  if (d.ask) return openContact(+d.ask);
  if (d.share) {
    const url = `${location.origin}/#listing-${d.share}`;
    return navigator.clipboard?.writeText(url).then(() => toast("Link copied"), () => toast(url)) ?? toast(url);
  }
  if (d.down) {
    LOAN.down = +d.down; S.loan = { down: LOAN.down, rate: LOAN.rate }; save();
    document.querySelectorAll("#calc-down button").forEach((b) => b.setAttribute("aria-pressed", b === t));
    if (sheetListing) $("#calc-out").innerHTML = costHTML(sheetListing);
    return;
  }
  if (d.open) return openSheet(+d.open, true);
  if (d.openBrowse) return openSheet(+d.openBrowse, S.liked.some((x) => x.id === +d.openBrowse));
  if (d.unsave) {
    const id = +d.unsave;
    S.liked = S.liked.filter((x) => x.id !== id); save();
    if (S.lead) api("DELETE", "/api/swipes", { leadId: S.lead.id, token: S.lead.token, listingId: id }).catch(() => {});
    closeLayer(); renderSaved(); renderBadge();
    return toast("Removed " + byId[id].street);
  }
  if (d.star) {
    const x = S.liked.find((x) => x.id === +d.star);
    if (!x) return;
    x.star = !x.star; save();
    if (x.star && !S.lead) return openSignup("star", byId[x.id]);
    syncSwipe(x.id, x.star ? "star" : "like");
    closeLayer(); renderSaved();
    return toast(x.star ? `Showing requested. ${agentFirst()} will reach out.` : "Showing request removed");
  }
  if (d.beds) { S.prefs.beds = +d.beds; return prefsChanged(); }
  if (d.k) { const a = S.prefs[d.k]; S.prefs[d.k] = a.includes(d.v) ? a.filter((x) => x !== d.v) : [...a, d.v]; return prefsChanged(); }
  if (t.parentElement?.id === "browse-mode") { S.prefs.mode = d.v; save(); syncPrefs(); return renderBrowse(); }
  if (t.parentElement?.id === "mode") { S.prefs.mode = d.v; return prefsChanged(); }
  if (t.parentElement?.id === "tenure") { S.prefs.feeOnly = d.v === "fee"; return prefsChanged(); }
  if (t.id === "go") return show("discover");
  if (t.id === "replay") {
    const liked = S.liked.map((x) => x.id);
    S.seen = S.seen.filter((id) => liked.includes(id)); history = []; $("#undo").disabled = true; save(); renderPrefs();
    return toast("Passed homes are back in your deck");
  }
  if (t.id === "btn-pass") return decide("pass");
  if (t.id === "btn-like") return decide("like");
  if (t.id === "btn-star") return decide("star");
  if (t.id === "undo") return undo();
});
document.addEventListener("submit", (e) => {
  if (e.target.id === "signup") { e.preventDefault(); submitSignup(e.target); }
  if (e.target.classList.contains("contact")) { e.preventDefault(); submitContact(e.target); }
});
document.addEventListener("input", (e) => {
  if (e.target.id !== "calc-rate") return;
  const r = parseFloat(e.target.value);
  if (!(r >= 1 && r <= 15) || !sheetListing) return;
  LOAN.rate = r / 100; S.loan = { down: LOAN.down, rate: LOAN.rate }; save();
  $("#calc-out").innerHTML = costHTML(sheetListing);
});
$("#max").addEventListener("input", (e) => { S.prefs.max[S.prefs.mode] = +e.target.value; prefsChanged(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") return closeLayer();
  if ($("#layer").innerHTML || $("#v-discover").hidden || e.target.matches("input, textarea")) return;
  if (e.key === "ArrowRight") decide("like");
  else if (e.key === "ArrowLeft") decide("pass");
  else if (e.key === "ArrowUp") { e.preventDefault(); decide("star"); }
  else if (e.key.toLowerCase() === "z") undo();
});

// ---------- boot ----------
(async function start() {
  renderBadge();
  try {
    const [cfg, data] = await Promise.all([api("GET", "/api/config"), api("GET", "/api/listings")]);
    CFG = cfg; L = data.listings; FEATURED = data.featured || []; HOODINFO = data.neighborhoods || {}; COMMUTES = data.commutes || [];
    byId = Object.fromEntries(L.map((l) => [l.id, l]));
  } catch (e) {
    $("#deck").innerHTML = `<div class="empty"><h2>Can't load homes</h2><p>${esc(e.message)}</p></div>`;
    return;
  }
  show("discover");
  const m = location.hash.match(/^#listing-(\d+)$/);
  if (m) openSheet(+m[1], S.liked.some((x) => x.id === +m[1]));
})();
