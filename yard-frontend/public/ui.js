/* ArcYard shared UI kit. One post renderer and one set of primitives for every page,
   so Home and profiles can never drift apart again. Exposes window.AY. */
(function(){
  "use strict";

  const ICON = {
    reply:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-5.6A8.5 8.5 0 1 1 21 12Z"/></svg>',
    repost:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
    like:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-9.4-9.4A5.2 5.2 0 0 1 12 6a5.2 5.2 0 0 1 9.4 5.1c-1.9 4.8-9.4 9.4-9.4 9.4Z"/></svg>',
    share:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
    more:'<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
    link:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
    // empty-state glyphs
    chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-5.6A8.5 8.5 0 1 1 21 12Z"/></svg>',
    gem:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M6 3h12l3 6-9 12L3 9Z"/><path d="M3 9h18"/></svg>',
    rocket:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c3.5 1.5 6 5 6 9.5 0 2-.7 3.8-1.8 5.2L12 21l-4.2-3.3A8.4 8.4 0 0 1 6 12.5C6 8 8.5 4.5 12 3Z"/><circle cx="12" cy="10.5" r="2"/></svg>',
    swap:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13l-3-3"/><path d="M20 16H7l3 3"/></svg>',
    bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    wallet:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/></svg>',
    feed:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
    trophy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12v4a6 6 0 0 1-12 0Z"/><path d="M12 14v3m-3 4h6"/></svg>',
    game:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="10" rx="5"/><path d="M7 11v2M6 12h2"/><circle cx="16" cy="11.5" r="1"/><circle cx="18.5" cy="13.5" r="1"/></svg>',
    info:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    alert:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>',
    check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    close:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    person:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/></svg>'
  };

  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function short(a){ a = String(a || ""); return a.length > 12 ? a.slice(0,6) + "\u2026" + a.slice(-4) : a; }

  function timeAgo(unix){
    const s = Math.max(0, Math.floor(Date.now()/1000 - Number(unix || 0)));
    if (s < 60) return "now";
    if (s < 3600) return Math.floor(s/60) + "m";
    if (s < 86400) return Math.floor(s/3600) + "h";
    if (s < 604800) return Math.floor(s/86400) + "d";
    return new Date(unix * 1000).toLocaleDateString(undefined, { month:"short", day:"numeric" });
  }

  // Deterministic monogram colour per identity, so wallets are recognisable at a glance.
  const HUES = [211, 196, 228, 168, 262, 24, 340, 146];
  function monogramStyle(seed){
    let h = 0; const s = String(seed || "");
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const hue = HUES[h % HUES.length];
    return "background:linear-gradient(145deg,hsl(" + hue + " 34% 38%),hsl(" + hue + " 38% 20%))";
  }
  function initialFor(name, address){
    const n = String(name || "").trim();
    if (n && !/^0x/i.test(n)) return n.charAt(0).toUpperCase();
    const a = String(address || "").replace(/^0x/i, "");
    return (a.charAt(0) || "A").toUpperCase();
  }
  function avatar(u, size){
    const cls = "ay-av " + (size || "s40");
    const name = u.display_name || u.handle || u.address || u.author || "";
    const seed = u.address || u.author || name;
    if (u.avatar_data) return '<div class="' + cls + '"><img src="' + esc(u.avatar_data) + '" alt=""></div>';
    return '<div class="' + cls + '" style="' + monogramStyle(seed) + '">' + esc(initialFor(u.display_name || u.handle, seed)) + "</div>";
  }

  function badge(u){
    if (!u.verification_label) return "";
    const color = u.account_type === "automated" ? "var(--verify-ai)" : "var(--verify-human)";
    return '<svg class="ay-badge" viewBox="0 0 24 24" role="img" aria-label="' + esc(u.verification_label) + '"><title>' + esc(u.verification_label) + "</title>" +
      '<path d="M12 2l2.4 1.8 3 .1 1 2.8 2.4 1.8-1 2.8 1 2.8-2.4 1.8-1 2.8-3 .1L12 22l-2.4-1.8-3-.1-1-2.8L3.2 15l1-2.8-1-2.8L5.6 7.7l1-2.8 3-.1z" fill="' + color + '"/>' +
      '<path d="m8.5 12 2.4 2.4 4.6-4.8" stroke="#0D0D0F" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  // Link-aware body: URLs become quiet links, and the first one becomes a compact source card.
  const URL_RE = /https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g;
  function renderBody(text){
    const raw = String(text || "");
    const urls = raw.match(URL_RE) || [];
    let html = esc(raw).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"&]/g, url => {
      let host = url; try { host = new URL(url.replace(/&amp;/g,"&")).hostname.replace(/^www\./,""); } catch(e){}
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + esc(host) + "</a>";
    });
    let card = "";
    if (urls.length){
      try {
        const u = new URL(urls[0]);
        const path = (u.pathname + u.search).replace(/\/$/, "") || "/";
        card = '<a class="ay-source" href="' + esc(urls[0]) + '" target="_blank" rel="noopener noreferrer">' +
          '<span class="ay-source-ico">' + ICON.link + '</span>' +
          '<span class="ay-source-txt"><span class="ay-source-host">' + esc(u.hostname.replace(/^www\./,"")) + "</span>" +
          '<span class="ay-source-path" style="display:block">' + esc(decodeURIComponent(path)) + "</span></span></a>";
      } catch(e){}
    }
    return { html: html.trim(), card };
  }

  // Full link preview: image, site, title, description. Falls back to the compact source card.
  function hostOf(url){ try { return new URL(url).hostname.replace(/^www\./, ""); } catch(e){ return ""; } }
  function previewCard(pv, opts){
    opts = opts || {};
    if (!pv || !pv.url) return "";
    const site = pv.siteName || hostOf(pv.url);
    const media = pv.image
      ? '<span class="ay-lp-media"><img src="' + esc(pv.image) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.closest(\'.ay-lp\').classList.add(\'no-img\');this.parentNode.remove()"></span>'
      : "";
    return '<a class="ay-lp' + (pv.image ? "" : " no-img") + (opts.compose ? " compose" : "") + '" href="' + esc(pv.url) + '" target="_blank" rel="noopener noreferrer">' +
      media +
      '<span class="ay-lp-txt">' +
        '<span class="ay-lp-site">' + ICON.link + esc(site) + "</span>" +
        (pv.title ? '<span class="ay-lp-title">' + esc(pv.title) + "</span>" : "") +
        (pv.description ? '<span class="ay-lp-desc">' + esc(pv.description) + "</span>" : "") +
      "</span></a>";
  }

  function profileUrl(address){ return "/profile?u=" + encodeURIComponent(address); }

  /**
   * Render one post. `ctx` supplies: api (base), token(), onAuthNeeded(action), toast(msg),
   * showReason (bool). Identical output on Home and on profiles.
   */
  function renderPost(p, ctx){
    const who = p.display_name || p.handle || short(p.author);
    const handle = p.handle ? "@" + p.handle : short(p.author);
    const body = renderBody(p.content);
    const el = document.createElement("article");
    el.className = "ay-post";
    el.dataset.postId = p.id;
    el.innerHTML =
      '<a href="' + profileUrl(p.author) + '" aria-label="' + esc(who) + ' profile">' + avatar({ ...p, address:p.author }, "s40") + "</a>" +
      '<div class="ay-post-main">' +
        '<div class="ay-post-head">' +
          '<a class="ay-post-name" href="' + profileUrl(p.author) + '" style="color:inherit;text-decoration:none">' + esc(who) + "</a>" + badge(p) +
          '<span class="ay-post-handle">' + esc(handle) + '</span>' +
          '<span class="ay-post-time">\u00b7 ' + timeAgo(p.created_at) + "</span>" +
          '<button class="ay-post-more" type="button" aria-label="More">' + ICON.more + "</button>" +
        "</div>" +
        (body.html ? '<div class="ay-post-body">' + body.html + "</div>" : "") +
        (p.preview ? previewCard(p.preview) : body.card) +
        (ctx.showReason && p.reason ? '<div class="ay-reason">' + esc(p.reason) + "</div>" : "") +
        '<div class="ay-actions">' +
          '<button class="ay-act reply" type="button" aria-label="Reply">' + ICON.reply + "<span>" + (p.comment_count || 0) + "</span></button>" +
          '<button class="ay-act repost' + (p.viewer_reposted ? " on" : "") + '" type="button" aria-label="Repost" aria-pressed="' + !!p.viewer_reposted + '">' + ICON.repost + "<span>" + (p.repost_count || 0) + "</span></button>" +
          '<button class="ay-act like' + (p.viewer_liked ? " on" : "") + '" type="button" aria-label="Like" aria-pressed="' + !!p.viewer_liked + '">' + ICON.like + "<span>" + (p.like_count || 0) + "</span></button>" +
          '<button class="ay-act share" type="button" aria-label="Copy link">' + ICON.share + "</button>" +
        "</div>" +
      "</div>";
    bindPost(el, p, ctx);
    return el;
  }

  function setCount(btn, delta){ const s = btn.querySelector("span"); s.textContent = Math.max(0, (parseInt(s.textContent, 10) || 0) + delta); }
  function pop(btn){ btn.classList.remove("pop"); void btn.offsetWidth; btn.classList.add("pop"); }

  function bindPost(el, p, ctx){
    const api = ctx.api || "";
    const auth = () => { const t = ctx.token(); if (!t){ ctx.onAuthNeeded && ctx.onAuthNeeded(); } return t; };

    el.querySelector(".ay-post-more").addEventListener("click", () => ctx.toast && ctx.toast("More options are on the way"));

    el.querySelector(".ay-act.share").addEventListener("click", async () => {
      const link = location.origin + profileUrl(p.author);
      try { await navigator.clipboard.writeText(link); ctx.toast && ctx.toast("Link copied"); }
      catch(e){ ctx.toast && ctx.toast("Could not copy link"); }
    });

    const like = el.querySelector(".ay-act.like");
    like.addEventListener("click", async () => {
      const t = auth(); if (!t) return;
      const wasOn = like.classList.contains("on");
      like.classList.toggle("on", !wasOn); setCount(like, wasOn ? -1 : 1); if (!wasOn) pop(like);
      like.disabled = true;
      try {
        const r = await fetch(api + "/api/posts/" + p.id + "/like", { method:"POST", headers:{ Authorization:"Bearer " + t } });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || "Could not like");
        if (data.liked !== !wasOn){ like.classList.toggle("on", data.liked); setCount(like, data.liked ? 1 : -1); }
        like.setAttribute("aria-pressed", String(!!data.liked));
      } catch(e){
        like.classList.toggle("on", wasOn); setCount(like, wasOn ? 1 : -1);
        ctx.toast && ctx.toast(/own post/.test(e.message) ? "You cannot like your own post" : "Could not like, try again");
      } finally { like.disabled = false; }
    });

    const repost = el.querySelector(".ay-act.repost");
    repost.addEventListener("click", async () => {
      const t = auth(); if (!t) return;
      if (repost.classList.contains("on")){ ctx.toast && ctx.toast("Already reposted"); return; }
      repost.classList.add("on"); setCount(repost, 1); pop(repost); repost.disabled = true;
      try {
        const r = await fetch(api + "/api/posts/" + p.id + "/repost", { method:"POST", headers:{ Authorization:"Bearer " + t } });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || "Could not repost");
        repost.setAttribute("aria-pressed", "true");
        ctx.toast && ctx.toast("Reposted");
      } catch(e){
        repost.classList.remove("on"); setCount(repost, -1);
        ctx.toast && ctx.toast(/own post/.test(e.message) ? "You cannot repost your own post" : "Could not repost, try again");
      } finally { repost.disabled = false; }
    });

    const reply = el.querySelector(".ay-act.reply");
    reply.addEventListener("click", async () => {
      const existing = el.querySelector(".ay-replies");
      if (existing){ existing.remove(); return; }
      const panel = document.createElement("div");
      panel.className = "ay-replies";
      panel.innerHTML = '<div class="ay-reply-list"><div class="ay-reply-empty">Loading replies\u2026</div></div>' +
        '<form class="ay-reply-compose"><input maxlength="840" placeholder="Post your reply" aria-label="Post your reply"><button type="submit">Reply</button></form>';
      el.querySelector(".ay-post-main").appendChild(panel);
      const list = panel.querySelector(".ay-reply-list");
      const draw = rows => {
        list.innerHTML = rows.length
          ? rows.map(c => '<div class="ay-reply"><b>' + esc(c.handle ? "@" + c.handle : short(c.author)) + "</b><span>" + esc(c.content) + "</span></div>").join("")
          : '<div class="ay-reply-empty">No replies yet. Start the conversation.</div>';
      };
      let rows = [];
      try { const r = await fetch(api + "/api/posts/" + p.id + "/comments"); rows = r.ok ? (await r.json()).comments : []; draw(rows); }
      catch(e){ list.innerHTML = '<div class="ay-reply-empty">Could not load replies.</div>'; }
      const form = panel.querySelector("form"), input = form.querySelector("input"), send = form.querySelector("button");
      input.focus();
      form.addEventListener("submit", async ev => {
        ev.preventDefault();
        const text = input.value.trim(); if (!text) return input.focus();
        const t = auth(); if (!t) return;
        send.disabled = true;
        try {
          const r = await fetch(api + "/api/posts/" + p.id + "/comments", { method:"POST", headers:{ "Content-Type":"application/json", Authorization:"Bearer " + t }, body: JSON.stringify({ content:text }) });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(data.error);
          rows.push(data.comment); draw(rows); input.value = ""; setCount(reply, 1);
        } catch(e){ ctx.toast && ctx.toast("Could not reply, try again"); }
        finally { send.disabled = false; }
      });
    });
  }

  function empty(opts){
    return '<div class="ay-empty">' +
      '<div class="ay-empty-ico">' + (ICON[opts.icon] || ICON.feed) + "</div>" +
      '<div class="ay-empty-title">' + esc(opts.title) + "</div>" +
      (opts.copy ? '<div class="ay-empty-copy">' + esc(opts.copy) + "</div>" : "") +
      (opts.action ? '<button class="ay-empty-action" type="button" ' + (opts.actionAttr || "") + ">" + esc(opts.action) + "</button>" : "") +
      "</div>";
  }

  function skeleton(n){
    let out = "";
    for (let i = 0; i < (n || 3); i++){
      out += '<div class="ay-sk"><i style="width:40px;height:40px;border-radius:10px;flex:none"></i>' +
        '<div style="flex:1"><i style="width:' + (38 + (i*17)%30) + '%;height:12px;margin:4px 0 12px"></i>' +
        '<i style="width:92%;height:11px;margin-bottom:8px"></i><i style="width:' + (55 + (i*23)%30) + '%;height:11px"></i></div></div>';
    }
    return out;
  }


  // ---------- toast: one notice for the whole product ----------
  // kind: "info" | "wallet" | "error" | "success". Wallet notices offer Connect when the page
  // registers AY.onConnect. Hover pauses the timer so the message can actually be read.
  let toastEl = null, toastTimer = null, toastAction = null;
  function classifyNotice(msg){
    const m = String(msg || "").toLowerCase();
    if (/connect your wallet|sign in/.test(m)) return "wallet";
    if (/could not|failed|cannot|rejected|error|invalid|taken|too long/.test(m)) return "error";
    if (/paused|open once|open when|coming|on the way|soon|write something|enter an/.test(m)) return "info";
    return "success";
  }
  function hideToast(){
    if (!toastEl) return;
    toastEl.classList.remove("show");
    document.body.classList.remove("toast-open");
    clearTimeout(toastTimer);
  }
  function toast(msg, opts){
    opts = opts || {};
    const kind = opts.kind || classifyNotice(msg);
    if (!toastEl){
      toastEl = document.createElement("div");
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
      toastEl.addEventListener("mouseenter", () => clearTimeout(toastTimer));
      toastEl.addEventListener("mouseleave", () => { toastTimer = setTimeout(hideToast, 2200); });
      toastEl.addEventListener("click", ev => {
        if (ev.target.closest(".ay-toast-close")) return hideToast();
        if (ev.target.closest(".ay-toast-action")){ hideToast(); if (toastAction) toastAction(); }
      });
    }
    let action = opts.action, onAction = opts.onAction;
    if (!action && kind === "wallet" && typeof AY.onConnect === "function"){ action = "Connect wallet"; onAction = AY.onConnect; }
    toastAction = onAction || null;
    const icon = { error:ICON.alert, success:ICON.check, wallet:ICON.wallet, info:ICON.info }[kind] || ICON.info;
    toastEl.className = "ay-toast " + kind;
    toastEl.innerHTML =
      '<span class="ay-toast-ico">' + icon + "</span>" +
      '<span class="ay-toast-msg">' + esc(msg) + "</span>" +
      (action && onAction ? '<button class="ay-toast-action" type="button">' + esc(action) + "</button>" : "") +
      '<button class="ay-toast-close" type="button" aria-label="Dismiss">' + ICON.close + "</button>";
    void toastEl.offsetWidth;
    toastEl.classList.add("show");
    document.body.classList.add("toast-open");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, opts.duration || (action ? 6000 : 3400));
  }

  window.AY = { ICON, esc, short, timeAgo, avatar, badge, renderPost, renderBody, empty, skeleton, profileUrl, monogramStyle, toast, hideToast, onConnect:null, previewCard };
})();
