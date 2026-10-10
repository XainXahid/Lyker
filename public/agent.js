const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const money = (l) => (l.mode === "rent" ? "$" + l.price.toLocaleString() + "/mo" : "$" + l.price.toLocaleString());
const when = (ts) => {
  const d = new Date(ts.replace(" ", "T") + "Z"), mins = Math.round((Date.now() - d) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + " min ago";
  if (mins < 1440) return Math.round(mins / 60) + " hr ago";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

let pass = "";
try { pass = sessionStorage.getItem("lyker-agent") || ""; } catch {}
let onlyShowings = false, data = null;

async function load() {
  const res = await fetch("/api/agent/leads", { headers: { "x-agent-passcode": pass } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { pass = ""; return login(body.error); }
  try { sessionStorage.setItem("lyker-agent", pass); } catch {}
  data = body;
  render();
}

function login(msg) {
  $("#root").innerHTML = `<form class="login" id="login"><h1>Lyker leads</h1>
    <label class="field">Agent passcode<input id="pc" type="password" autocomplete="current-password" required></label>
    <p class="err" role="alert">${esc(msg && msg !== "Wrong passcode" ? msg : msg ? "That passcode didn't work." : "")}</p>
    <button class="btn">Open dashboard</button></form>`;
  $("#pc").focus();
}

function prefsText(p) {
  if (!p) return "";
  const max = p.max?.[p.mode];
  return [p.mode === "rent" ? "Renting" : "Buying", max ? "up to $" + max.toLocaleString() + (p.mode === "rent" ? "/mo" : "") : "",
    p.beds ? p.beds + "+ bd" : "", p.types?.join("/") || "any type", p.hoods?.length ? p.hoods.join(", ") : "all O‘ahu",
    p.feeOnly ? "fee simple only" : "", p.musts?.length ? "wants " + p.musts.join(", ") : ""].filter(Boolean).join(", ");
}

function render() {
  const leads = [...data.leads].sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
  const showings = leads.reduce((n, l) => n + l.homes.filter((h) => h.action === "star").length, 0);
  const saves = leads.reduce((n, l) => n + l.homes.length, 0);
  const failed = leads.some((l) => l.fubStatus === "failed" || l.homes.some((h) => h.fubStatus === "failed") || (l.messages || []).some((m) => m.fubStatus === "failed"));
  const shown = onlyShowings ? leads.filter((l) => l.homes.some((h) => h.action === "star") || (l.messages || []).length) : leads;

  $("#root").innerHTML = `
   <div class="top"><div class="brand">lyker<span>.</span><small>Leads for ${esc(data.agentName)}</small></div>
     <span class="fub ${data.fubConnected ? "on" : "off"}"><i></i>${data.fubConnected ? "Sending to Follow Up Boss" : "Follow Up Boss isn't connected yet. Leads are saved here."}</span></div>
   <div class="kpis">
     <div class="kpi"><b>${leads.length}</b><span>Leads</span></div>
     <div class="kpi"><b>${showings}</b><span>Showing requests</span></div>
     <div class="kpi"><b>${saves}</b><span>Homes matched</span></div>
     <div class="kpi"><b>${leads.reduce((n, l) => n + (l.messages || []).length, 0)}</b><span>Messages</span></div>
   </div>
   <div class="toolbar">
     <button class="pill ${onlyShowings ? "" : "edit"}" id="f-all" aria-pressed="${!onlyShowings}">All leads</button>
     <button class="pill ${onlyShowings ? "edit" : ""}" id="f-show" aria-pressed="${onlyShowings}">Showings and messages</button>
     ${failed ? `<button class="pill" id="retry">Retry failed sends</button>` : ""}
     <button class="pill" id="refresh">Refresh</button>
   </div>
   ${shown.length ? shown.map(leadHTML).join("") : `<div class="empty" style="height:auto;margin-top:40px"><h2>No leads yet</h2><p>When someone signs up on Lyker, they'll show up here with every home they matched.</p></div>`}`;
}

function leadHTML(l) {
  const homes = [...l.homes].sort((a, b) => (b.action === "star") - (a.action === "star"));
  const hot = homes.some((h) => h.action === "star") || (l.messages || []).length > 0;
  return `<article class="lead ${hot ? "hot" : ""}">
    <div class="lead-head"><div>
      <h2>${esc(l.firstName)} ${esc(l.lastName || "")}</h2>
      <div class="contact">${l.phone ? `<span>${esc(l.phone)}</span>` : ""}${l.email ? `<span>${esc(l.email)}</span>` : ""}</div>
      <div class="meta">Joined ${when(l.createdAt)}, last active ${when(l.lastActivity)}. ${homes.length} matched, ${l.passes} passed.</div>
      <div class="meta">${esc(prefsText(l.prefs))}</div>
    </div><span class="status ${l.fubStatus}" title="${esc(l.fubError || "")}">FUB: ${l.fubStatus}</span></div>
    ${homes.length ? `<div class="homes">${homes.map(({ action, at, fubStatus, listing: h }) => h ? `<div class="home">
      <div class="thumb"><img src="${esc(h.photo)}?w=200&q=60&auto=format&fit=crop" alt=""></div>
      <div><div class="p">${money(h)}${action === "star" ? '<span class="must">★ Showing</span>' : ""}</div>
      <div class="a">${esc(h.street)}, ${esc(h.hood)}, ${h.beds === 0 ? "studio" : h.beds + " bd"}</div>
      <div class="a">${h.mode === "buy" ? (h.tenure === "Leasehold" ? `Leasehold until ${h.leaseExp}` : "Fee simple") + ", " : ""}${when(at)}${fubStatus === "failed" ? ". Didn't reach FUB" : ""}</div></div></div>` : "").join("")}</div>` : ""}
    ${(l.messages || []).length ? `<div class="msgs">${l.messages.map((m) => `<div class="msg">
      <div class="meta">${m.listing ? `About ${esc(m.listing.street)}, ${esc(m.listing.hood)}` : "General message"}, ${when(m.at)}${m.fubStatus === "failed" ? ". Didn't reach FUB" : ""}</div>
      <p>${esc(m.message)}</p></div>`).join("")}</div>` : ""}
  </article>`;
}

document.addEventListener("submit", (e) => { if (e.target.id === "login") { e.preventDefault(); pass = $("#pc").value; load(); } });
document.addEventListener("click", async (e) => {
  const id = e.target.closest("button")?.id;
  if (id === "f-all" || id === "f-show") { onlyShowings = id === "f-show"; render(); }
  if (id === "refresh") load();
  if (id === "retry") { await fetch("/api/agent/retry", { method: "POST", headers: { "x-agent-passcode": pass } }); load(); }
});
setInterval(() => { if (pass && document.visibilityState === "visible") load(); }, 20000);

pass ? load() : login();
