(function(){
  // theme
  try{var st=localStorage.getItem('clout-theme');if(st==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}
  var tgl=document.getElementById('themeTgl');
  if(tgl)tgl.addEventListener('click',function(){
    var d=document.documentElement,l=d.getAttribute('data-theme')==='light';
    if(l){d.removeAttribute('data-theme');}else{d.setAttribute('data-theme','light');}
    try{localStorage.setItem('clout-theme',l?'dark':'light');}catch(e){}
  });
  // Arc Testnet params, verified live on-chain (chainId 5042002, EIP-1559, gas token USDC)
  const ARC = {
    chainId: "0x4CEF52", // 5042002
    chainName: "Arc Testnet",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: ["https://rpc.testnet.arc.io"],
    blockExplorerUrls: ["https://explorer.testnet.arc.io"]
  };
  // Clout contracts are deployed and live on Arc Testnet
  const ONCHAIN_ACTIONS_ENABLED = true;
  const btn = document.getElementById("btnLogin");
  const label = btn.querySelector("span");
  const short = a => a.slice(0,6) + "…" + a.slice(-4);
  // hide testnet notice if already dismissed
  try{ if(localStorage.getItem('clout-notice-dismissed')) { const n=document.getElementById('testnetNotice'); if(n) n.style.display='none'; } }catch(e){}

  // --- real activity log: every meaningful success/failure lands here, not just a vanishing toast ---
  const ACTIVITY_LOG_LIMIT = 50;
  let activityLog = [];
  const logPanel = document.getElementById("logPanel");
  const logList = document.getElementById("logList");
  const logDot = document.getElementById("logDot");
  const logBtn = document.getElementById("logBtn");
  const ICONS = {
    error: '<svg class="log-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12" y2="16.5"/></svg>',
    success: '<svg class="log-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    info: '<svg class="log-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="10" x2="12" y2="16"/><line x1="12" y1="7" x2="12" y2="7"/></svg>'
  };
  function renderActivityLog(){
    if (!logList) return;
    if (!activityLog.length){ logList.innerHTML = '<div class="log-empty">Nothing logged yet.</div>'; return; }
    logList.innerHTML = activityLog.map(e => {
      const t = new Date(e.at);
      const time = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      return '<div class="log-row '+e.level+'">'+(ICONS[e.level]||ICONS.info)+'<div class="log-row-body"><div class="log-row-msg">'+escapeHtml(e.msg)+'</div><div class="log-row-time">'+time+'</div></div></div>';
    }).join("");
  }
  function logActivity(level, msg){
    activityLog.unshift({ level, msg, at: Date.now() });
    if (activityLog.length > ACTIVITY_LOG_LIMIT) activityLog.length = ACTIVITY_LOG_LIMIT;
    if (logDot){
      logDot.classList.remove("has-error", "has-info");
      if (level === "error") logDot.classList.add("has-error");
      else if (!logPanel || !logPanel.classList.contains("open")) logDot.classList.add("has-info");
    }
    renderActivityLog();
  }
  function toggleLogPanel(){
    if (!logPanel) return;
    const open = logPanel.classList.toggle("open");
    logPanel.setAttribute("aria-hidden", open ? "false" : "true");
    if (open && logDot) logDot.classList.remove("has-error", "has-info");
  }
  if (logBtn) logBtn.addEventListener("click", toggleLogPanel);
  document.getElementById("logClear")?.addEventListener("click", () => { activityLog = []; renderActivityLog(); });
  document.addEventListener("click", e => {
    if (logPanel && logPanel.classList.contains("open") && !logPanel.contains(e.target) && e.target !== logBtn && !logBtn.contains(e.target)){
      logPanel.classList.remove("open");
      logPanel.setAttribute("aria-hidden", "true");
    }
  });
  let account = null;
  let sessionToken = null;
  let currentUser = null;
  const identityStatus = document.getElementById("identityStatus");
  const identityStatusText = document.getElementById("identityStatusText");
  function setIdentityState(state){
    if (!identityStatus || !identityStatusText) return;
    identityStatus.className = "identity-status" + (state === "ready" ? " ready" : state === "sending" ? " sending" : "");
    if (state === "ready"){
      identityStatusText.textContent = "Identity verified. Your yard is ready.";
    } else if (state === "sending"){
      identityStatusText.textContent = "Publishing to your yard…";
    } else {
      identityStatusText.textContent = "Connect your identity when you are ready.";
    }
  }

  const API = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "http://localhost:7080"
    : ""; // same-origin: Vercel rewrites /api/* to the Clout backend

  function setLabel(t){ label.textContent = t; }

  async function ensureArc(eth){
    const cur = await eth.request({ method: "eth_chainId" });
    if (cur.toLowerCase() === ARC.chainId.toLowerCase()) return;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC.chainId }] });
    } catch (e) {
      if (e.code === 4902) {
        await eth.request({ method: "wallet_addEthereumChain", params: [ARC] });
      } else { throw e; }
    }
  }

  async function signIn(eth, address){
    const r1 = await fetch(API + "/api/auth/nonce?address=" + address);
    if (!r1.ok) throw new Error("nonce request failed");
    const { message } = await r1.json();
    const signature = await eth.request({ method: "personal_sign", params: [message, address] });
    const r2 = await fetch(API + "/api/auth/verify", {
      method: "POST", headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ address, signature })
    });
    if (!r2.ok) throw new Error("sign-in verification failed");
    const data = await r2.json();
    sessionToken = data.token;
    try{ localStorage.setItem("clout-token", data.token); localStorage.setItem("clout-account", address); }catch(e){}
    currentUser = data.user;
    return data;
  }

  let wcProvider = null;

  async function connectViaWalletConnect(){
    try {
      setLabel("Connecting…");
      if (!window.__WC) { showToast("WalletConnect not loaded yet", { kind:"error" }); setLabel("Connect Wallet"); return; }

      wcProvider = await window.__WC.create(
        "595d9bb89f9615e405a41a43f01f07b7",
        [5042002],
        { 5042002: "https://rpc.testnet.arc.io" }
      );

      await wcProvider.connect();
      const accounts = wcProvider.accounts;
      if (!accounts || !accounts.length) throw new Error("No accounts returned");

      account = accounts[0].toLowerCase();
      await ensureArc(wcProvider);
      setLabel("Sign to verify…");
      const signedIn = await signIn(wcProvider, account);
      refreshProfileChrome();
      btn.classList.add("connected");
      setIdentityState("ready");
      logActivity("success", "Wallet connected via WalletConnect: " + short(account));

      // Onboarding for new users
      if (signedIn && !signedIn.user?.handle){
        setTimeout(() => {
          showToast("Welcome to Clout. Set a handle so people can find you.", { kind:"info" });
          setTimeout(() => { const p = document.getElementById("profileEditBtn"); if (p) p.click(); }, 1800);
        }, 600);
      }

      if (typeof loadFeed === "function") loadFeed();
      if (typeof loadNotifications === "function") loadNotifications();
      if (typeof loadWallet === "function") loadWallet();

      wcProvider.on("accountsChanged", a => {
        account = a[0]; sessionToken = null;
        setLabel(a[0] ? short(a[0]) : "Connect Wallet");
        btn.classList.toggle("connected", !!a[0]);
        setIdentityState(a[0] ? "ready" : "idle");
      });
      wcProvider.on("chainChanged", () => { ensureArc(wcProvider).catch(() => {}); });
      wcProvider.on("disconnect", () => {
        account = null; sessionToken = null;
        btn.classList.remove("connected");
        setLabel("Connect Wallet");
        setIdentityState("idle");
      });
    } catch(e) {
      console.error("WalletConnect error:", e);
      setLabel("Connect Wallet");
      if (e.message && e.message.includes("User rejected")) {
        showToast("Connection cancelled", { kind:"info" });
      } else {
        showToast("Could not connect wallet", { kind:"error" });
      }
    }
  }

  async function connect(){
    const eth = window.ethereum;
    if (!eth){
      // No injected wallet (iOS Safari) — use WalletConnect
      await connectViaWalletConnect();
      return;
    }
    try {
      setLabel("Connecting…");
      const accts = await eth.request({ method: "eth_requestAccounts" });
      account = accts[0];
      await ensureArc(eth);
      setLabel("Sign to verify…");
      const signedIn = await signIn(eth, account);
      refreshProfileChrome();
      btn.classList.add("connected");
      setIdentityState("ready");
      logActivity("success", "Wallet connected: " + short(account));
      // Onboarding: if new user has no handle, prompt them to set one
      fetch(API + "/api/me", { headers:{ Authorization:"Bearer "+signedIn.token } })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && data.user && !data.user.handle){
            setTimeout(() => {
              showToast("Welcome to Clout. Set a handle so people can find you.", { kind:"info" });
              setTimeout(() => {
                const profileBtn = document.getElementById("profileEditBtn");
                if (profileBtn) profileBtn.click();
              }, 1800);
            }, 600);
          }
        }).catch(() => {});
      if (typeof loadFeed === "function") loadFeed();
      if (typeof loadNotifications === "function") loadNotifications();
      if (typeof loadWallet === "function") loadWallet();
      eth.on && eth.on("accountsChanged", a => {
        account = a[0]; sessionToken = null;
        setLabel(a[0] ? short(a[0]) : "Connect Wallet");
        btn.classList.toggle("connected", !!a[0]);
        setIdentityState(a[0] ? "ready" : "idle");
        if (typeof loadWallet === "function") loadWallet();
        if (typeof loadNotifications === "function") loadNotifications();
      });
      eth.on && eth.on("chainChanged", () => { ensureArc(eth).catch(()=>{}); });
    } catch (e){
      console.error(e);
      setLabel(e.code === 4001 ? "Request rejected" : "Connect failed");
      logActivity("error", e.code === 4001 ? "Wallet connection rejected" : "Could not connect your wallet");
      setTimeout(()=>setLabel(account ? short(account) : "Connect Wallet"), 2200);
    }
  }
  btn.addEventListener("click", () => account ? openProfile() : connect());

  // --- no injected wallet (phone browsers): open Clout inside a wallet's own browser ---
  const walletSheet = document.getElementById("walletSheet");
  function openWalletSheet(){
    if (!walletSheet) return;
    const here = location.href.split("#")[0];
    const bare = here.replace(/^https?:\/\//, "");
    const enc = encodeURIComponent(here);
    const links = {
      metamask: "metamask://dapp/" + bare,
      coinbase: "cbwallet://dapp?url=" + enc,
      trust: "trust://open_url?coin_id=60&url=" + enc
    };
    walletSheet.querySelectorAll("a[data-wallet]").forEach(a => { a.href = links[a.dataset.wallet]; });
    walletSheet.classList.add("open");
    walletSheet.setAttribute("aria-hidden", "false");
  }
  function closeWalletSheet(){
    if (!walletSheet) return;
    walletSheet.classList.remove("open");
    walletSheet.setAttribute("aria-hidden", "true");
  }
  if (walletSheet){
    walletSheet.addEventListener("click", e => { if (e.target === walletSheet || e.target.closest("[data-close]")) closeWalletSheet(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeWalletSheet(); });
  }
  document.addEventListener("click", event => {
    if (event.target.closest("[data-connect-wallet]")) connect();
  });

  
  const ARCYARD_CONTRACT = "0xE6295feB75B7ca98389654B610Af772684F7ea3b";
  const ARCYARD_KEYS_CONTRACT = "0x15c7C2c5571b675f313C2A87bfF8B708B3562aBF";
  // function selectors verified via ethers.id() against the exact Solidity signatures, not guessed
  const SEL_CREATE_POST = "0x98fc71d7"; // createPost(bytes32)
  const SEL_TIP_POST   = "0x74d3c1f8"; // tipPost(uint256)
  const SEL_GET_BUY_PRICE_AFTER_FEE = "0x0f026f6d"; // getBuyPriceAfterFee(address,uint256)
  const SEL_GET_SELL_PRICE_AFTER_FEE = "0x2267a89c"; // getSellPriceAfterFee(address,uint256)
  const SEL_BUY_KEYS = "0x592de11d"; // buyKeys(address,uint256)
  const SEL_SELL_KEYS = "0x9111ac89"; // sellKeys(address,uint256)

  function encodeUint256(n){ return BigInt(n).toString(16).padStart(64, "0"); }
  function encodeBytes32Hex(hex){ return hex.replace(/^0x/, "").padStart(64, "0"); }
  function encodeAddress(addr){ return addr.replace(/^0x/, "").toLowerCase().padStart(64, "0"); }

  // read-only price calls go straight to the public RPC — works for logged-out visitors too
  async function rpcCall(method, params){
    const r = await fetch(ARC.rpcUrls[0], {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
    });
    const json = await r.json();
    if (json.error) throw new Error(json.error.message || "RPC error");
    return json.result;
  }

  async function ethCallUint(selector, addr, n){
    const data = "0x" + selector.slice(2) + encodeAddress(addr) + encodeUint256(n);
    const result = await rpcCall("eth_call", [{ to: ARCYARD_KEYS_CONTRACT, data }, "latest"]).catch(() => null);
    if (!result || result === "0x") return null;
    return BigInt(result);
  }

  async function getBuyPriceLive(creator){
    return ethCallUint(SEL_GET_BUY_PRICE_AFTER_FEE, creator, 1);
  }
  async function getSellPriceLive(creator){
    return ethCallUint(SEL_GET_SELL_PRICE_AFTER_FEE, creator, 1);
  }

  async function anchorPost(postId, actEl){
    if (!ONCHAIN_ACTIONS_ENABLED){ showToast("On-chain actions are paused while the audited contracts are deployed"); return; }
    if (!window.ethereum || !account){ showToast("Connect your wallet to anchor this post"); return; }
    actEl.classList.add("anchoring");
    const original = actEl.innerHTML;
    try {
      await ensureArc(window.ethereum);
      const r = await fetch(API + "/api/posts/" + postId);
      if (!r.ok) throw new Error("Could not load this post");
      const { post } = await r.json();
      if (!post.content_hash) throw new Error("This post has no content hash yet");
      const data = "0x" + SEL_CREATE_POST.slice(2) + encodeBytes32Hex(post.content_hash);
      showToast("Confirm in your wallet to anchor this post");
      await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from: account, to: ARCYARD_CONTRACT, data }]
      });
      showToast("Anchoring on Arc… this updates once the block confirms");
      pollForAnchor(postId);
    } catch (e){
      actEl.classList.remove("anchoring");
      actEl.innerHTML = original;
      showToast(e && e.code === 4001 ? "Anchor cancelled" : (e && e.message) || "Could not anchor this post");
    }
  }

  function pollForAnchor(postId, attempt){
    attempt = attempt || 0;
    if (attempt > 20) return; // ~1 minute of polling; the next manual feed refresh will also pick it up
    setTimeout(async () => {
      try {
        const r = await fetch(API + "/api/posts/" + postId);
        if (r.ok){
          const { post } = await r.json();
          if (post && post.chain_post_id){ showToast("Post anchored on Arc"); loadFeed(); return; }
        }
      } catch(e){}
      pollForAnchor(postId, attempt + 1);
    }, 3000);
  }

  // --- tip sheet ---
  const tipSheet = document.getElementById("tipSheet");
  let tipTarget = null;
  function openTipSheet(chainPostId, author, actEl){
    if (!ONCHAIN_ACTIONS_ENABLED){ showToast("Tips are paused until the audited contracts are live"); return; }
    if (!sessionToken){ showToast("Connect your wallet to tip"); return; }
    if (!tipSheet) return;
    tipTarget = { chainPostId, author, actEl };
    const amountInput = document.getElementById("tipAmountInput");
    amountInput.value = "";
    document.getElementById("tipRecipient").textContent = short(author);
    tipSheet.classList.add("open");
    tipSheet.setAttribute("aria-hidden", "false");
    setTimeout(() => amountInput.focus(), 50);
  }
  function closeTipSheet(){
    if (!tipSheet) return;
    tipSheet.classList.remove("open");
    tipSheet.setAttribute("aria-hidden", "true");
    tipTarget = null;
  }
  if (tipSheet){
    tipSheet.addEventListener("click", e => { if (e.target === tipSheet || e.target.closest("[data-close]")) closeTipSheet(); });
    document.getElementById("tipSend").addEventListener("click", async () => {
      if (!tipTarget) return;
      const amountInput = document.getElementById("tipAmountInput");
      const amount = parseFloat(amountInput.value);
      if (!amount || amount <= 0){ amountInput.focus(); return; }
      if (!window.ethereum || !account){ showToast("Connect your wallet to tip"); return; }
      const { chainPostId, actEl } = tipTarget;
      const sendBtn = document.getElementById("tipSend");
      sendBtn.disabled = true; sendBtn.textContent = "Confirm in wallet…";
      try {
        await ensureArc(window.ethereum);
        const weiValue = BigInt(Math.round(amount * 1e6)) * 1000000000000n; // 6 decimals of precision, scaled to 18
        const data = "0x" + SEL_TIP_POST.slice(2) + encodeUint256(chainPostId);
        await window.ethereum.request({
          method: "eth_sendTransaction",
          params: [{ from: account, to: ARCYARD_CONTRACT, data, value: "0x" + weiValue.toString(16) }]
        });
        showToast("Tip sent. It lands once confirmed");
        closeTipSheet();
        if (actEl) setTimeout(() => loadFeed(), 4000);
      } catch (e){
        showToast(e && e.code === 4001 ? "Tip cancelled" : (e && e.message ? e.message : "Tip failed"));
      } finally {
        sendBtn.disabled = false; sendBtn.textContent = "Send tip";
      }
    });
  }

  // --- creator keys: buy pill + trade sheet ---
  function formatUsdcShort(wei){
    if (wei === null || wei === undefined) return "$0.00";
    const n = Number(wei) / 1e18;
    if (n === 0) return "$0.00";
    if (n < 0.01) return "$" + n.toFixed(4);
    return "$" + n.toFixed(2);
  }

  async function refreshBuyPill(pillEl, creator){
    try {
      const price = await getBuyPriceLive(creator);
      pillEl.textContent = "Buy " + formatUsdcShort(price);
    } catch (e) {
      pillEl.textContent = "Buy";
    }
  }

  const tradeSheet = document.getElementById("tradeKeysSheet");
  let tradeState = null;
  async function openTradeSheet(creator){
    if (!ONCHAIN_ACTIONS_ENABLED){ showToast("Key trading is paused until the audited contracts are live"); return; }
    if (!tradeSheet) return;
    tradeState = { creator, side: "buy" };
    document.getElementById("tradeCreator").textContent = short(creator);
    document.getElementById("tradeKeyAmount").value = "1";
    document.querySelectorAll("#tradeKeysSheet .trade-side-btn").forEach(b => b.classList.toggle("on", b.dataset.side === "buy"));
    await refreshTradeQuote();
    tradeSheet.classList.add("open");
    tradeSheet.setAttribute("aria-hidden", "false");
  }
  function closeTradeSheet(){
    if (!tradeSheet) return;
    tradeSheet.classList.remove("open");
    tradeSheet.setAttribute("aria-hidden", "true");
    tradeState = null;
  }
  async function refreshTradeQuote(){
    if (!tradeState) return;
    const amount = Math.max(1, parseInt(document.getElementById("tradeKeyAmount").value) || 1);
    const quoteEl = document.getElementById("tradeQuote");
    quoteEl.textContent = "Fetching price…";
    try {
      const price = tradeState.side === "buy"
        ? await ethCallUint(SEL_GET_BUY_PRICE_AFTER_FEE, tradeState.creator, amount)
        : await ethCallUint(SEL_GET_SELL_PRICE_AFTER_FEE, tradeState.creator, amount);
      quoteEl.textContent = (tradeState.side === "buy" ? "Costs " : "You receive ") + formatUsdcShort(price);
      tradeState.quotedAmount = amount;
      tradeState.quotedPrice = price;
    } catch (e) {
      quoteEl.textContent = "Could not fetch price";
    }
  }
  if (tradeSheet){
    tradeSheet.addEventListener("click", e => { if (e.target === tradeSheet || e.target.closest("[data-close]")) closeTradeSheet(); });
    document.querySelectorAll("#tradeKeysSheet .trade-side-btn").forEach(b => {
      b.addEventListener("click", () => {
        if (!tradeState) return;
        tradeState.side = b.dataset.side;
        document.querySelectorAll("#tradeKeysSheet .trade-side-btn").forEach(x => x.classList.toggle("on", x === b));
        document.getElementById("tradeSend").textContent = b.dataset.side === "buy" ? "Buy keys" : "Sell keys";
        refreshTradeQuote();
      });
    });
    document.getElementById("tradeKeyAmount").addEventListener("input", () => refreshTradeQuote());
    document.getElementById("tradeSend").addEventListener("click", async () => {
      if (!tradeState) return;
      if (!sessionToken || !account){ showToast("Connect your wallet to trade keys"); return; }
      if (!window.ethereum){ showToast("Connect your wallet to trade keys"); return; }
      const amount = Math.max(1, parseInt(document.getElementById("tradeKeyAmount").value) || 1);
      const sendBtn = document.getElementById("tradeSend");
      sendBtn.disabled = true; sendBtn.textContent = "Confirm in wallet…";
      try {
        await ensureArc(window.ethereum);
        if (tradeState.side === "buy") {
          const totalCost = await ethCallUint(SEL_GET_BUY_PRICE_AFTER_FEE, tradeState.creator, amount);
          if (totalCost === null) throw new Error("Could not fetch live price");
          const data = "0x" + SEL_BUY_KEYS.slice(2) + encodeAddress(tradeState.creator) + encodeUint256(amount);
          await window.ethereum.request({
            method: "eth_sendTransaction",
            params: [{ from: account, to: ARCYARD_KEYS_CONTRACT, data, value: "0x" + totalCost.toString(16) }]
          });
          showToast("Bought " + amount + " key" + (amount > 1 ? "s" : ""));
        } else {
          const data = "0x" + SEL_SELL_KEYS.slice(2) + encodeAddress(tradeState.creator) + encodeUint256(amount);
          await window.ethereum.request({
            method: "eth_sendTransaction",
            params: [{ from: account, to: ARCYARD_KEYS_CONTRACT, data }]
          });
          showToast("Sold " + amount + " key" + (amount > 1 ? "s" : ""));
        }
        closeTradeSheet();
        setTimeout(() => { loadFeed(); if (typeof loadKeysActivity === "function") loadKeysActivity(); }, 5000);
      } catch (e){
        showToast(e && e.code === 4001 ? "Trade cancelled" : (e && e.reason) || (e && e.message) || "Trade failed");
      } finally {
        sendBtn.disabled = false; sendBtn.textContent = tradeState ? (tradeState.side === "buy" ? "Buy keys" : "Sell keys") : "Buy keys";
      }
    });
  }

  // --- live keys activity ticker (right rail) ---
  async function loadKeysActivity(){
    const box = document.getElementById("keysActivityList");
    if (!box) return;
    try {
      const r = await fetch(API + "/api/keys-activity?limit=12");
      if (!r.ok) return;
      const { activity } = await r.json();
      if (!activity.length){ box.innerHTML = '<div class="empty-note" style="padding:20px 0"><b>No trades yet</b>Be the first to buy a key.</div>'; return; }
      box.innerHTML = activity.map(t => {
        const trader = t.trader_handle || short(t.trader);
        const creator = t.creator_handle || short(t.creator);
        const verb = t.is_buy ? "bought" : "sold";
        const cls = t.is_buy ? "buyv" : "sellv";
        const amountUsd = formatUsdcShort(BigInt(t.usdc_amount));
        return '<div class="ac-row"><div class="chip">'+t.key_amount+'</div>'+
          '<span><b>'+escapeHtml(trader)+'</b> <span class="'+cls+'">'+verb+'</span> '+t.key_amount+' key'+(t.key_amount>1?'s':'')+' of <b>'+escapeHtml(creator)+'</b></span>'+
          '<span class="t">'+amountUsd+' · '+timeAgo(t.created_at)+'</span></div>';
      }).join("");
    } catch(e){ console.warn("loadKeysActivity failed", e); }
  }
  loadKeysActivity();
  setInterval(loadKeysActivity, 20000);

  // restore session on reload
  try{
    const savedToken = localStorage.getItem("clout-token");
    const savedAccount = localStorage.getItem("clout-account");
    if (savedToken && savedAccount){
      sessionToken = savedToken; account = savedAccount;
      setLabel(short(savedAccount)); btn.classList.add("connected");
      setIdentityState("ready");
      fetch(API + "/api/me", { headers:{Authorization:"Bearer "+sessionToken} })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data && data.user){ currentUser=data.user; refreshProfileChrome(); } })
        .catch(()=>{});
    }
  }catch(e){}

  // FAB + sidebar Post button
  const composeSheet = document.getElementById("composeSheet");
  const sheetInput = document.getElementById("sheetComposerInput");
  const sheetCount = document.getElementById("sheetCount");
  const sheetPostBtn = document.getElementById("sheetPostBtn");

  function openComposeSheet() {
    if (composeSheet && window.innerWidth <= 768) {
      composeSheet.classList.add("open");
      document.body.style.overflow = "hidden";
      setTimeout(() => sheetInput && sheetInput.focus(), 200);
    } else {
      openComposer();
    }
  }
  function closeComposeSheet() {
    if (!composeSheet) return;
    composeSheet.classList.remove("open");
    document.body.style.overflow = "";
  }

  // ── Trade sheet ────────────────────────────────────────────────────────────
  const postTradeSheet    = document.getElementById("tradeSheet");
  const postTradeSheetClose = document.getElementById("tradeSheetClose");
  let   tradePost     = null;

  function fmtUsdc(wei) {
    try {
      const n = Number(BigInt(wei)) / 1e18;
      return n < 0.001 ? "<$0.001" : "$" + n.toFixed(n < 0.1 ? 4 : 3);
    } catch { return "—"; }
  }

  async function openTradeSheet(p) {
    if (!postTradeSheet) return;
    tradePost = p;
    document.getElementById("tradeSheetTitle").textContent = "Trade — post by @" + (p.handle || p.author.slice(0,6));
    document.getElementById("tradeSupply").textContent = "—";
    document.getElementById("tradeBuyPrice").textContent = "—";
    document.getElementById("tradeHeld").textContent = "—";
    document.getElementById("tradeStatus").textContent = "";
    postTradeSheet.classList.add("open");
    document.body.style.overflow = "hidden";
    try {
      const r = await fetch(API + "/api/posts/" + p.id + "/shares" + (account ? "?holder=" + account : ""));
      const d = await r.json();
      document.getElementById("tradeSupply").textContent = d.supply;
      // Show price after fees
      const { ethers } = await import("https://cdn.jsdelivr.net/npm/ethers@6.7.0/+esm");
      const provider = new ethers.JsonRpcProvider("https://rpc.testnet.arc.io");
      const abi = ["function getBuyPriceAfterFee(uint256 postId, uint256 amount) view returns (uint256)"];
      const shares = new ethers.Contract("0xB3f5407c64cd2f1cCA52087fcb582c6D1847D16B", abi, provider);
      const buyPrice = await shares.getBuyPriceAfterFee(p.id, 1).catch(() => BigInt(d.lastPrice || "0"));
      document.getElementById("tradeBuyPrice").textContent = fmtUsdc(buyPrice.toString());
      document.getElementById("tradeHeld").textContent = d.heldByViewer || 0;
      document.getElementById("tradeSellBtn").disabled = !d.heldByViewer;
      // Load trade history
      const hist = await fetch(API + "/api/posts/" + p.id + "/shares/trades?limit=5").then(r => r.json()).catch(() => ({ trades: [] }));
      const histEl = document.getElementById("tradeHistory");
      if (histEl && hist.trades && hist.trades.length) {
        histEl.innerHTML = hist.trades.map(t => {
          const who = t.trader_handle ? "@" + t.trader_handle : t.trader.slice(0,6) + "…" + t.trader.slice(-4);
          const action = t.is_buy ? "bought" : "sold";
          const color = t.is_buy ? "var(--repost)" : "var(--like)";
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--line);font-size:12px">
            <span style="color:var(--muted)">${who}</span>
            <span style="color:${color};font-weight:600">${action}</span>
            <span style="color:var(--muted);font-family:var(--mono)">${fmtUsdc(t.usdc_amount)}</span>
          </div>`;
        }).join("");
      } else if (histEl) {
        histEl.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:8px 0">No trades yet. Be the first.</div>';
      }
    } catch(e) {
      document.getElementById("tradeStatus").textContent = "Could not load market data";
    }
  }

  function closePostTradeSheet() {
    postTradeSheet && postTradeSheet.classList.remove("open");
    document.body.style.overflow = "";
    tradePost = null;
  }

  postTradeSheetClose && postTradeSheetClose.addEventListener("click", closePostTradeSheet);
  postTradeSheet && postTradeSheet.addEventListener("click", e => { if (e.target === postTradeSheet) closePostTradeSheet(); });

  async function execTrade(isBuy) {
    if (!tradePost || !sessionToken) {
      showToast("Connect your wallet to trade", { kind:"wallet" }); return;
    }
    const status = document.getElementById("tradeStatus");
    status.textContent = isBuy ? "Preparing buy…" : "Preparing sell…";
    const buyBtn  = document.getElementById("tradeBuyBtn");
    const sellBtn = document.getElementById("tradeSellBtn");
    buyBtn.disabled = true; sellBtn.disabled = true;
    try {
      const mkt = await fetch(API + "/api/posts/" + tradePost.id + "/shares" + (account ? "?holder=" + account : "")).then(r => r.json());
      const SHARES_ADDR = "0xB3f5407c64cd2f1cCA52087fcb582c6D1847D16B";
      const ABI = isBuy
        ? ["function buyShares(uint256 postId, uint256 amount) payable", "function getBuyPriceAfterFee(uint256 postId, uint256 amount) view returns (uint256)"]
        : ["function sellShares(uint256 postId, uint256 amount)"];
      if (!window.ethereum) { status.textContent = "No wallet detected"; return; }
      const { ethers } = await import("https://cdn.jsdelivr.net/npm/ethers@6.7.0/+esm");
      const provider   = new ethers.BrowserProvider(window.ethereum);
      const signer     = await provider.getSigner();
      const contract   = new ethers.Contract(SHARES_ADDR, ABI, signer);
      let tx;
      if (isBuy) {
        // Fetch exact price from contract including fees, add 1% slippage buffer
        const exactCost = await contract.getBuyPriceAfterFee(tradePost.id, 1);
        const withBuffer = exactCost + exactCost / 100n;
        tx = await contract.buyShares(tradePost.id, 1, { value: withBuffer });
      } else {
        tx = await contract.sellShares(tradePost.id, 1);
      }
      status.textContent = "Confirming…";
      await tx.wait();
      status.textContent = isBuy ? "Bought!" : "Sold!";
      const updated = await fetch(API + "/api/posts/" + tradePost.id + "/shares" + (account ? "?holder=" + account : "")).then(r => r.json());
      document.getElementById("tradeSupply").textContent = updated.supply;
      document.getElementById("tradeBuyPrice").textContent = fmtUsdc(updated.lastPrice);
      document.getElementById("tradeHeld").textContent = updated.heldByViewer || 0;
      document.getElementById("tradeSellBtn").disabled = !updated.heldByViewer;
      setTimeout(() => { status.textContent = ""; }, 2000);
    } catch(e) {
      status.textContent = e.reason || e.message?.slice(0,80) || "Transaction failed";
    } finally {
      buyBtn.disabled = false;
      sellBtn.disabled = false;
    }
  }

  document.getElementById("tradeBuyBtn")  && document.getElementById("tradeBuyBtn").addEventListener("click",  () => execTrade(true));
  document.getElementById("tradeSellBtn") && document.getElementById("tradeSellBtn").addEventListener("click", () => execTrade(false));
  // ──────────────────────────────────────────────────────────────────────────

  function openComposer() {
    const homeItem = document.querySelector(".nav-item");
    if (homeItem) homeItem.click();
    const input = document.querySelector(".composer-input");
    if (input) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => input.focus(), 300);
    }
  }

  const mobFab = document.getElementById("mobFab");
  if (mobFab) mobFab.addEventListener("click", openComposeSheet);

  const sidebarPost = document.getElementById("sidebarPost");
  if (sidebarPost) sidebarPost.addEventListener("click", openComposer);

  document.getElementById("composeSheetClose")?.addEventListener("click", closeComposeSheet);
  composeSheet?.addEventListener("click", e => { if (e.target === composeSheet) closeComposeSheet(); });

  // sheet character count
  if (sheetInput && sheetCount) {
    sheetInput.addEventListener("input", () => {
      sheetCount.textContent = sheetInput.value.length + "/840";
    });
  }

  // sheet post button: submit then close
  if (sheetPostBtn && sheetInput) {
    sheetPostBtn.addEventListener("click", async () => {
      const text = sheetInput.value.trim();
      if (!text) return;
      sheetPostBtn.disabled = true;
      try {
        const r = await fetch(API + "/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(currentToken ? { Authorization: "Bearer " + currentToken } : {}) },
          body: JSON.stringify({ text })
        });
        if (r.ok) {
          sheetInput.value = "";
          if (sheetCount) sheetCount.textContent = "0/840";
          closeComposeSheet();
          // switch to home and reload
          const homeItem = document.querySelector(".nav-item");
          if (homeItem) homeItem.click();
          loadFeed(currentScope);
        } else {
          const err = await r.json().catch(() => ({}));
          alert(err.error || "Failed to post");
        }
      } catch(e) {
        alert("Network error");
      } finally {
        sheetPostBtn.disabled = false;
      }
    });
  }

  // sync sheet avatar when user logs in
  function syncSheetAvatar() {
    const el = document.getElementById("sheetComposerAvatar");
    if (!el) return;
    if (currentUser && currentUser.avatar_data) {
      el.innerHTML = avatarMarkup(currentUser.avatar_data, currentUser.handle || account);
    } else if (account) {
      el.innerHTML = account.slice(2, 4).toUpperCase();
    }
  }

  // Chrome recedes while reading, then returns immediately when the reader reverses direction.
  const head = document.getElementById("feedHead");
  const navigation = document.querySelector(".rail-left");
  let previousScrollY = window.scrollY;
  function onScroll(){
    const currentScrollY = window.scrollY;
    const movingDown = currentScrollY > previousScrollY + 8;
    const movingUp = currentScrollY < previousScrollY - 4;
    const hideChrome = movingDown && currentScrollY > 96;
    if (head) { head.classList.toggle("stuck", currentScrollY > 8); head.classList.toggle("chrome-hidden", hideChrome); }
    if (navigation) navigation.classList.toggle("chrome-hidden", hideChrome);
    document.body.classList.toggle("chrome-hidden", hideChrome);
    if (movingUp || currentScrollY < 24) { head?.classList.remove("chrome-hidden"); navigation?.classList.remove("chrome-hidden"); document.body.classList.remove("chrome-hidden"); }
    previousScrollY = currentScrollY;
  }
  window.addEventListener("scroll", onScroll, { passive:true }); onScroll();

  // skeleton -> content: feels like real data loading
  const sk = document.getElementById("skeletons");
  const posts = document.getElementById("posts");
  // Static markup is only a shell. Never leave fabricated posts visible when the API is unavailable.
  if (posts) posts.innerHTML = "";
  setTimeout(() => {
    if (sk) sk.style.display = "none";
    if (posts) posts.classList.remove("sk-hidden");
  }, 650);

  // live character count on composer
  const ta = document.querySelector(".composer-input");
  const cnt = document.querySelector(".count");
  if (ta && cnt) ta.addEventListener("input", () => {
    const n = ta.value.length;
    cnt.textContent = n + "/840";
    cnt.style.color = n > 840 ? "var(--red)" : "";
  });


  // --- feed scope tabs: Discover / Following / Latest, all real ---
  document.querySelectorAll(".tabs .tab[data-scope]").forEach(tabEl => {
    tabEl.addEventListener("click", () => {
      document.querySelectorAll(".tabs .tab[data-scope]").forEach(t => t.classList.remove("active"));
      tabEl.classList.add("active");
      const scope = tabEl.dataset.scope;
      if (scope === "following" && !sessionToken){
        logActivity("info", "Connect your wallet to see people you follow.");
        showToast("Connect your wallet to see who you follow");
      }
      loadFeed(scope);
    });
  });

  // --- toast helper ---
  function classifyToast(msg){
    const m = msg.toLowerCase();
    if (/could not|failed|cancelled|rejected|error|insufficient|not found|invalid|already taken/.test(m)) return "error";
    if (/connect your wallet|sign in|not now|coming soon/.test(m)) return "info";
    return "success";
  }
  function showToast(msg, opts){
    AY.toast(msg, opts);
    logActivity(classifyToast(msg), msg);
  }
  AY.onConnect = () => connect();

  // --- wallet-bound profile ---
  const profileBackdrop = document.getElementById("profileBackdrop");
  const profileHandleInput = document.getElementById("profileHandleInput");
  const profileAvatarInput = document.getElementById("profileAvatarInput");
  const profileAvatarPreview = document.getElementById("profileAvatarPreview");
  const profileHelp = document.getElementById("profileHelp");
  const profileSave = document.getElementById("profileSave");
  let profileAvatarData = null;

  function initialFor(name){ return String(name || "A").trim().charAt(0).toUpperCase() || "A"; }
  function avatarMarkup(avatar, name){
    return avatar ? '<img src="'+escapeHtml(avatar)+'" alt="">' : escapeHtml(initialFor(name));
  }
  const publicProfile = document.createElement("div");
  publicProfile.className = "profile-backdrop";
  publicProfile.id = "publicProfile";
  publicProfile.setAttribute("aria-hidden", "true");
  document.body.appendChild(publicProfile);
  function closePublicProfile(){ publicProfile.classList.remove("open"); publicProfile.setAttribute("aria-hidden", "true"); }
  function openPublicProfile(address){
    location.href = "/profile?u=" + encodeURIComponent(address);
  }
  publicProfile.addEventListener('click',e=>{if(e.target===publicProfile)closePublicProfile();});
  function setProfilePreview(){
    if (!profileAvatarPreview) return;
    profileAvatarPreview.innerHTML = avatarMarkup(profileAvatarData || (currentUser && currentUser.avatar_data), (currentUser && currentUser.handle) || account);
  }
  function refreshProfileChrome(){
    if (!account) return;
    setLabel(currentUser && currentUser.handle ? "@"+currentUser.handle : short(account));
    const composerAvatar = document.getElementById("composerAvatar");
    if (composerAvatar) composerAvatar.innerHTML = avatarMarkup(currentUser && currentUser.avatar_data, (currentUser && currentUser.handle) || account);
  }
  function closeProfile(){
    profileBackdrop.classList.remove("open");
    profileBackdrop.setAttribute("aria-hidden", "true");
  }
  function disconnect(){
    account = null;
    sessionToken = null;
    currentUser = null;
    try{ localStorage.removeItem("clout-token"); localStorage.removeItem("clout-account"); }catch(e){}
    setLabel("Connect Wallet");
    btn.classList.remove("connected");
    setIdentityState("idle");
    const composerAvatar = document.getElementById("composerAvatar");
    if (composerAvatar) composerAvatar.innerHTML = "A";
    closeProfile();
    showToast("Wallet disconnected");
    if (typeof loadFeed === "function") loadFeed();
    if (typeof loadNotifications === "function") loadNotifications();
    if (typeof loadWallet === "function") loadWallet();
  }
  function openProfile(){
    if (!account || !sessionToken){ connect(); return; }
    profileAvatarData = null;
    const hasHandle = !!(currentUser && currentUser.handle);
    document.getElementById("profileTitle").textContent = hasHandle ? "Edit profile" : "Claim your name";
    profileHandleInput.value = (currentUser && currentUser.handle) || "";
    const bioInput = document.getElementById("profileBioInput");
    if (bioInput) bioInput.value = (currentUser && currentUser.bio) || "";
    profileHelp.textContent = "3 to 24 letters, numbers, or underscores.";
    profileHelp.classList.remove("error");
    setProfilePreview();
    profileBackdrop.classList.add("open");
    profileBackdrop.setAttribute("aria-hidden", "false");
    setTimeout(()=>profileHandleInput.focus(), 30);
  }
  function compactAvatar(file){
    return new Promise((resolve, reject) => {
      if (!file || !["image/jpeg","image/png","image/webp"].includes(file.type)) return reject(new Error("Choose a PNG, JPEG, or WebP image"));
      if (file.size > 8 * 1024 * 1024) return reject(new Error("Choose an image smaller than 8MB"));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read that image"));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("Could not open that image"));
        image.onload = () => {
          const side = Math.min(image.width, image.height);
          const sourceX = Math.max(0, (image.width - side) / 2);
          const sourceY = Math.max(0, (image.height - side) / 2);
          const canvas = document.createElement("canvas");
          canvas.width = 256; canvas.height = 256;
          canvas.getContext("2d").drawImage(image, sourceX, sourceY, side, side, 0, 0, 256, 256);
          resolve(canvas.toDataURL("image/webp", .82));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  profileAvatarInput.addEventListener("change", async () => {
    try {
      profileAvatarData = await compactAvatar(profileAvatarInput.files[0]);
      setProfilePreview();
      profileHelp.textContent = "Avatar ready. It will appear anywhere you post.";
      profileHelp.classList.remove("error");
    } catch (error) {
      profileHelp.textContent = error.message;
      profileHelp.classList.add("error");
      profileAvatarInput.value = "";
    }
  });
  profileHandleInput.addEventListener("input", () => {
    profileHandleInput.value = profileHandleInput.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    profileHelp.textContent = "3 to 24 letters, numbers, or underscores.";
    profileHelp.classList.remove("error");
  });
  document.getElementById("profileClose").addEventListener("click", closeProfile);
  document.getElementById("profileCancel").addEventListener("click", closeProfile);
  const profileDisconnect = document.getElementById("profileDisconnect");
  if (profileDisconnect) profileDisconnect.addEventListener("click", disconnect);
  profileBackdrop.addEventListener("click", event => { if (event.target === profileBackdrop) closeProfile(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && profileBackdrop.classList.contains("open")) closeProfile(); });
  profileSave.addEventListener("click", async () => {
    const handle = profileHandleInput.value.trim();
    if (!/^[a-z0-9_]{3,24}$/.test(handle)){
      profileHelp.textContent = "Choose 3 to 24 letters, numbers, or underscores.";
      profileHelp.classList.add("error"); profileHandleInput.focus(); return;
    }
    profileSave.disabled = true; profileSave.textContent = "Saving…";
    try {
      const bioInput = document.getElementById("profileBioInput");
      const bio = bioInput ? bioInput.value.trim().slice(0,160) : undefined;
      const response = await fetch(API + "/api/profile", { method:"PUT", headers:{"Content-Type":"application/json",Authorization:"Bearer "+sessionToken}, body:JSON.stringify({handle, avatarData:profileAvatarData, bio}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save your profile");
      currentUser = data.user; refreshProfileChrome(); closeProfile(); showToast("Profile saved");
      if (typeof loadFeed === "function") loadFeed();
      if (typeof loadLeaderboard === "function") loadLeaderboard();
    } catch (error) {
      profileHelp.textContent = error.message || "Could not save your profile";
      profileHelp.classList.add("error");
    } finally {
      profileSave.disabled = false; profileSave.textContent = "Save profile";
    }
  });

  // --- left rail navigation: real view switching ---
  const feedTitle = document.querySelector(".feed-title");
  const viewMap = {
    Home:"view-home", Search:"view-search", Notifications:"view-notifications",
    Wallet:"view-wallet", Messages:"view-messages", NFTs:"view-nfts",
    Leaderboard:"view-leaderboard", Launch:"view-launch", Trade:"view-trade",
    Games:"view-games", Profile:"view-profile"
  };
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
      item.classList.add("active");
      const label = (item.querySelector("span")||{}).textContent || "Home";
      if (feedTitle) feedTitle.textContent = label;
      const targetId = viewMap[label];
      document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
      const target = document.getElementById(targetId);
      if (target) target.classList.add("active");
      if (label === "Notifications") loadNotifications();
      if (label === "Wallet") loadWallet();
      if (label === "Leaderboard") { loadLeaderboard(); loadLeaderboardFull(); }
      if (label === "Messages") renderMessages();
      if (label === "NFTs") renderNFTs();
      if (label === "Profile") loadOwnProfile();
      window.scrollTo({ top:0, behavior:"smooth" });
    });
  });

  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
      const lbl = ((item.querySelector("span")||{}).textContent || "Home").trim();
      try { history.replaceState(null, "", lbl === "Home" ? location.pathname : "#" + lbl.toLowerCase()); } catch(e){}
    });
  });
  // open the view named in the URL hash, so /app#search from a profile lands in the right place
  setTimeout(() => {
    const want = decodeURIComponent((location.hash || "").slice(1)).toLowerCase();
    if (!want) return;
    document.querySelectorAll(".nav-item").forEach(n => { const s = n.querySelector("span"); if (s && s.textContent.trim().toLowerCase() === want) n.click(); });
  }, 0);

  // --- server-backed search: people use the shared row, posts use the shared card ---
  const searchInput = document.querySelector(".search-box input");
  let searchTimer, searchSeq = 0;
  function searchIdle(){
    const box = document.querySelector("#view-search .card");
    if (box) box.innerHTML = AY.empty({ icon:"search", title:"Search Clout", copy:"Find people by name, handle or wallet, and posts by what they say." });
  }
  if (searchInput){
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      const q = searchInput.value.trim();
      if (q.length < 2){ searchIdle(); return; }
      const seq = ++searchSeq;
      searchTimer = setTimeout(async () => {
        const box = document.querySelector("#view-search .card");
        if (!box) return;
        try {
          const r = await fetch(API + "/api/search?q=" + encodeURIComponent(q));
          if (!r.ok) throw new Error();
          const data = await r.json();
          if (seq !== searchSeq) return;
          box.innerHTML = "";
          if (!data.users.length && !data.posts.length){
            box.innerHTML = AY.empty({ icon:"search", title:"No results for \u201c" + q + "\u201d", copy:"Try a different name, handle or phrase." });
            return;
          }
          if (data.users.length){
            box.insertAdjacentHTML("beforeend", '<div class="ay-section-label">People</div>' + data.users.map(u => personRow(u)).join(""));
          }
          if (data.posts.length){
            box.insertAdjacentHTML("beforeend", '<div class="ay-section-label">Posts</div>');
            data.posts.forEach(p => box.appendChild(AY.renderPost(p, postCtx)));
          }
        } catch(e){ box.innerHTML = AY.empty({ icon:"search", title:"Search is unavailable", copy:"Try again in a moment." }); }
      }, 220);
    });
  }

  // --- generic chip toggles ---
  document.querySelectorAll(".chip-row").forEach(row => {
    row.querySelectorAll(".chip").forEach(c => {
      c.addEventListener("click", () => {
        row.querySelectorAll(".chip").forEach(x => x.classList.remove("on"));
        c.classList.add("on");
      });
    });
  });

  // --- wallet actions: real ones only ---
  document.querySelectorAll("#walletActions button").forEach(b => {
    b.addEventListener("click", async () => {
      if (!account){ showToast("Connect your wallet first", { kind:"wallet" }); return; }
      if (b.dataset.act === "deposit"){
        try { await navigator.clipboard.writeText(account); } catch(e){}
        window.open("https://faucet.circle.com/", "_blank", "noopener");
        showToast("Address copied. Paste it into the faucet");
      } else if (b.dataset.act === "copy"){
        try { await navigator.clipboard.writeText(account); showToast("Address copied"); }
        catch(e){ showToast("Could not copy address"); }
      }
    });
  });

  // --- trade panel ---
  const tradeTabs = document.querySelectorAll(".trade-tabs .tt");
  const tradeBtn = document.querySelector('[data-act="trade"]');
  tradeTabs.forEach(t => {
    t.addEventListener("click", () => {
      tradeTabs.forEach(x => x.classList.remove("on"));
      t.classList.add("on");
      if (tradeBtn) tradeBtn.textContent = (t.dataset.side === "sell" ? "Sell YARD" : "Buy YARD");
    });
  });
  if (tradeBtn){
    tradeBtn.addEventListener("click", () => {
      if (!account){ showToast("Connect your wallet to trade"); return; }
      const amt = document.getElementById("tradeAmt").value;
      if (!amt || Number(amt) <= 0){ showToast("Enter an amount"); return; }
      showToast(tradeBtn.textContent + " · " + amt + " simulated");
    });
  }

  // --- games ---
  document.querySelectorAll(".game-card").forEach(g => {
    g.style.cursor = "pointer";
    g.addEventListener("click", () => showToast(g.querySelector(".gn").textContent + " opening soon"));
  });

  // --- composer: live link preview while typing ---
  const composerEl = document.querySelector(".composer");
  let composePreviewUrl = null, composeDismissed = null, composeTimer = null;
  const composeBox = document.createElement("div");
  composeBox.className = "ay-compose-preview";
  if (composerEl) composerEl.querySelector(".composer-bottom")?.before(composeBox);
  function firstLink(text){
    const m = String(text || "").match(/https?:\/\/[^\s<>"']+/i);
    return m ? m[0].replace(/[.,;:!?)\]}]+$/, "") : null;
  }
  function clearComposePreview(){ composePreviewUrl = null; composeBox.innerHTML = ""; }
  async function updateComposePreview(){
    const url = firstLink(ta && ta.value);
    if (!url || url === composeDismissed){ clearComposePreview(); return; }
    if (url === composePreviewUrl) return;
    composePreviewUrl = url;
    composeBox.innerHTML = '<div class="ay-lp-loading">' + AY.ICON.link + "Fetching link preview\u2026</div>";
    try {
      const r = await fetch(API + "/api/link-preview?url=" + encodeURIComponent(url));
      if (composePreviewUrl !== url) return;
      if (!r.ok){ composeBox.innerHTML = ""; return; }
      const { preview } = await r.json();
      composeBox.innerHTML = '<button class="ay-lp-remove" type="button" aria-label="Remove preview">' + AY.ICON.close + "</button>" + AY.previewCard(preview, { compose:true });
      composeBox.querySelector(".ay-lp-remove").addEventListener("click", () => { composeDismissed = url; clearComposePreview(); });
    } catch(e){ if (composePreviewUrl === url) composeBox.innerHTML = ""; }
  }
  if (ta) ta.addEventListener("input", () => { clearTimeout(composeTimer); composeTimer = setTimeout(updateComposePreview, 450); });

  // --- Post button: posts to real backend when signed in, else local demo ---
  const postBtn = document.querySelector(".btn-post");
  if (postBtn && ta && posts){
    const doPost = async () => {
      const text = ta.value.trim();
      if (!text){ showToast("Write something first"); ta.focus(); return; }

      if (sessionToken){
        postBtn.disabled = true;
        postBtn.textContent = "Posting…";
        setIdentityState("sending");
        try {
          const r = await fetch(API + "/api/posts", {
            method: "POST",
            headers: { "Content-Type":"application/json", Authorization: "Bearer " + sessionToken },
            body: JSON.stringify({ content: text })
          });
          if (!r.ok){ const e = await r.json(); throw new Error(e.error || "post failed"); }
          ta.value = ""; if (cnt) cnt.textContent = "0/840";
          clearComposePreview(); composeDismissed = null;
          showToast("Posted to Clout");
          await loadFeed();
          window.scrollTo({ top:0, behavior:"smooth" });
        } catch (e){
          showToast(/too long/i.test(e.message || "") ? "Posts can be up to 840 characters" : "Could not post, try again");
        } finally {
          postBtn.disabled = false;
          postBtn.textContent = "Post";
          setIdentityState("ready");
        }
        return;
      }

      // not signed in: keep the draft exactly as written and offer to connect
      showToast("Connect your wallet to post. Your draft is kept.", { kind:"wallet" });
    };
    postBtn.addEventListener("click", doPost);
    ta.addEventListener("keydown", e => {
      if ((e.metaKey||e.ctrlKey) && e.key === "Enter") doPost();
    });
  }

  // --- real backend feed loader ---
  function escapeHtml(s){
    return s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  let currentFeedScope = "top";
  const postCtx = {
    api: API,
    token: () => sessionToken,
    get account() { return account; },
    onAuthNeeded: () => { showToast("Connect your wallet to join in", { kind:"wallet" }); },
    toast: msg => showToast(msg),
    showReason: true,
    onTrade: (p) => openTradeSheet(p),
  };
  async function loadFeed(scope){
    if (!posts) return;
    if (scope) currentFeedScope = scope;
    if (!posts.children.length) posts.innerHTML = AY.skeleton(4);
    try {
      const headers = sessionToken ? { Authorization: "Bearer " + sessionToken } : {};
      const r = await fetch(API + "/api/feed?limit=40&scope=" + currentFeedScope, { headers });
      if (!r.ok) throw new Error("Feed request failed (" + r.status + ")");
      const { posts: rows, personalized, requiresAuth } = await r.json();
      if (requiresAuth){
        posts.innerHTML = AY.empty({ icon:"person", title:"See who you follow", copy:"Connect your wallet to load your Following feed.", action:"Connect wallet", actionAttr:"data-connect-wallet" });
        return;
      }
      if (!rows.length){
        posts.innerHTML = currentFeedScope === "following"
          ? AY.empty({ icon:"person", title:"Your Following feed is empty", copy:"Follow people and their posts land here." })
          : AY.empty({ icon:"feed", title:"The yard is quiet", copy:"Be the first to post something real." });
        return;
      }
      postCtx.showReason = !!personalized;
      const frag = document.createDocumentFragment();
      rows.forEach(p => frag.appendChild(AY.renderPost(p, postCtx)));
      posts.innerHTML = "";
      posts.appendChild(frag);
    } catch (e){
      posts.innerHTML = AY.empty({ icon:"feed", title:"Could not load the feed", copy:"Check your connection and try again.", action:"Try again", actionAttr:"data-retry-feed" });
      logActivity("error", e.message || "Could not load the feed");
    }
  }
  document.addEventListener("click", ev => { if (ev.target.closest("[data-retry-feed]")) loadFeed(); });
  loadFeed();

  // --- shared people row: one look for leaderboard, rail, search, notifications ---
  function personRow(u, opts){
    opts = opts || {};
    const who = u.display_name || u.handle || AY.short(u.address);
    const sub = opts.sub != null ? opts.sub : (u.handle ? "@" + u.handle : AY.short(u.address));
    return '<a class="ay-row" href="' + AY.profileUrl(u.address) + '">' +
      (opts.rank != null ? '<span class="ay-row-rank">' + opts.rank + "</span>" : "") +
      AY.avatar(u, "s40") +
      '<span class="ay-row-txt"><span class="ay-row-name">' + AY.esc(who) + AY.badge(u) + '</span><span class="ay-row-sub">' + AY.esc(sub) + "</span></span>" +
      (opts.trail ? '<span class="ay-row-trail">' + opts.trail + "</span>" : "") +
      "</a>";
  }
  async function fetchLeaderboard(){
    const r = await fetch(API + "/api/leaderboard");
    if (!r.ok) throw new Error("leaderboard " + r.status);
    return (await r.json()).leaderboard || [];
  }
  async function loadLeaderboard(){
    const box = document.querySelector("#view-leaderboard .card");
    if (!box) return;
    box.innerHTML = AY.skeleton(5);
    try {
      const rows = await fetchLeaderboard();
      box.innerHTML = rows.length
        ? rows.map((u, i) => personRow(u, { rank:i + 1, trail:'<span class="ay-pts">' + Number(u.points || 0).toLocaleString() + "</span> pts" })).join("")
        : AY.empty({ icon:"trophy", title:"No one on the board yet", copy:"Post, reply and get likes to earn points." });
    } catch(e){ box.innerHTML = AY.empty({ icon:"trophy", title:"Could not load the leaderboard", copy:"Try again in a moment." }); }
  }
  loadLeaderboard();

  // --- real notification stream ---
  function timeAgo(unix){
    const s=Math.max(0,Math.floor(Date.now()/1000-unix));
    if(s<60)return "now"; if(s<3600)return Math.floor(s/60)+"m";
    if(s<86400)return Math.floor(s/3600)+"h"; return Math.floor(s/86400)+"d";
  }
  const NOTIF_COPY = { like:"liked your post", repost:"reposted your post", comment:"replied to your post", tip:"tipped your post", follow:"followed you" };
  const NOTIF_ICON = { like:"like", repost:"repost", comment:"reply", tip:"wallet", follow:"person" };
  function setNotifBadge(count){
    document.querySelectorAll(".nav-item").forEach(item => {
      const span = item.querySelector("span");
      if (!span || span.textContent.trim() !== "Notifications") return;
      let b = item.querySelector(".ay-nav-badge");
      if (count > 0){
        if (!b){ b = document.createElement("i"); b.className = "ay-nav-badge"; item.appendChild(b); }
        b.textContent = count > 9 ? "9+" : String(count);
      } else if (b) b.remove();
    });
  }
  async function loadNotifications(){
    const box = document.getElementById("notificationsList");
    if (!box) return;
    if (!sessionToken){
      box.innerHTML = AY.empty({ icon:"bell", title:"Nothing to see yet", copy:"Connect your wallet and likes, replies, reposts and follows land here.", action:"Connect wallet", actionAttr:"data-connect-wallet" });
      return;
    }
    box.innerHTML = AY.skeleton(3);
    try {
      const r = await fetch(API + "/api/notifications", { headers:{ Authorization:"Bearer " + sessionToken } });
      if (!r.ok) throw new Error();
      const { notifications } = await r.json();
      if (!notifications.length){
        box.innerHTML = AY.empty({ icon:"bell", title:"You are all caught up", copy:"When people interact with your posts, you will see it here." });
        setNotifBadge(0);
        return;
      }
      box.innerHTML = notifications.map(n => {
        const actor = { address:n.actor, handle:n.actor_handle, display_name:n.actor_name, avatar_data:n.actor_avatar, account_type:n.actor_type, verification_label:n.actor_label };
        const who = n.actor_name || (n.actor_handle ? "@" + n.actor_handle : AY.short(n.actor || ""));
        const kind = NOTIF_ICON[n.kind] || "person";
        const excerpt = n.post_excerpt ? '<span class="ay-notif-excerpt">' + AY.esc(String(n.post_excerpt).slice(0, 140)) + "</span>" : "";
        return '<a class="ay-notif' + (n.read ? "" : " unread") + '" href="' + AY.profileUrl(n.actor) + '">' +
          '<span class="ay-notif-kind ' + n.kind + '">' + AY.ICON[kind] + "</span>" +
          '<span class="ay-notif-main">' + AY.avatar(actor, "s36") +
            '<span class="ay-notif-line"><b>' + AY.esc(who) + "</b>" + AY.badge(actor) + " " + (NOTIF_COPY[n.kind] || "interacted with you") +
            ' <span class="ay-notif-time">\u00b7 ' + AY.timeAgo(n.created_at) + "</span></span>" + excerpt +
          "</span></a>";
      }).join("");
      setNotifBadge(0);
      fetch(API + "/api/notifications/read", { method:"POST", headers:{ Authorization:"Bearer " + sessionToken } }).catch(() => {});
    } catch(e){
      box.innerHTML = AY.empty({ icon:"bell", title:"Could not load notifications", copy:"Try again in a moment." });
    }
  }
  async function pollUnread(){
    if (!sessionToken) return setNotifBadge(0);
    try {
      const r = await fetch(API + "/api/notifications", { headers:{ Authorization:"Bearer " + sessionToken } });
      if (!r.ok) return;
      const { notifications } = await r.json();
      setNotifBadge(notifications.filter(n => !n.read).length);
    } catch(e){}
  }
  pollUnread();
  setInterval(pollUnread, 60000);

  // --- native USDC wallet balance, read directly from the connected Arc wallet ---
  function formatNativeUsdc(hex){
    const n=BigInt(hex); const whole=n/1000000000000000000n;
    const frac=(n%1000000000000000000n).toString().padStart(18,"0").slice(0,2).replace(/0+$/,"");
    return whole.toLocaleString()+(frac?"."+frac:"");
  }
  async function loadWallet(){
    const bal=document.getElementById("walletBalance");
    const assets=document.getElementById("walletAssets");
    if(!bal||!assets) return;
    const hero=document.querySelector("#view-wallet .wallet-hero");
    const actions=document.getElementById("walletActions");
    const connected=!!(account&&window.ethereum);
    if(hero) hero.hidden=!connected;
    if(actions) actions.hidden=!connected;
    if(!connected){
      bal.innerHTML='0.00 <span>USDC</span>';
      assets.innerHTML=AY.empty({ icon:'wallet', title:'Connect your wallet', copy:'Arc uses USDC as its gas token, so your balance is all you need.', action:'Connect wallet', actionAttr:'data-connect-wallet' });
      return;
    }
    try{
      const chain=await window.ethereum.request({method:"eth_chainId"});
      if(chain.toLowerCase()!==ARC.chainId.toLowerCase()){
        bal.innerHTML='0.00 <span>USDC</span>';
        assets.innerHTML=AY.empty({ icon:'wallet', title:'Switch to Arc Testnet', copy:'Your wallet is on a different network. Switch to read your balance.' });
        return;
      }
      const raw=await window.ethereum.request({method:"eth_getBalance",params:[account,"latest"]});
      const pretty=formatNativeUsdc(raw);
      bal.innerHTML=pretty+' <span>USDC</span>';
      assets.innerHTML='<div class="asset-row"><div class="asset-ico">U</div><div class="row-txt"><div class="row-name">USDC</div><div class="row-sub">Native gas and settlement token on Arc</div></div><div class="asset-amt"><div class="a1">'+pretty+'</div><div class="a2">Arc Testnet</div></div></div>';
    }catch(e){
      bal.innerHTML='0.00 <span>USDC</span>';
      assets.innerHTML=AY.empty({ icon:'wallet', title:'Could not read your balance', copy:'Check your wallet connection and try again.' });
    }
  }

  // --- Buy buttons ---
  document.querySelectorAll(".buy").forEach(b => {
    b.addEventListener("click", () => {
      if (!account){ showToast("Connect your wallet to buy"); return; }
      showToast("Buy order simulated · " + b.textContent.replace("Buy","").trim());
    });
  });

  // --- more (…) menus ---
  document.querySelectorAll(".more").forEach(m => {
    m.addEventListener("click", () => showToast("Post options coming soon"));
  });

  // --- Search: replace static placeholder trends on first load ---
  (function initSearch(){
    const box = document.querySelector("#view-search .card");
    searchIdle();
  })();

  function loadLeaderboardFull(){ return loadLeaderboard(); }
  document.addEventListener("click", ev => {
    const t = ev.target.closest("[data-open-view]");
    if (!t) return;
    const want = t.dataset.openView;
    document.querySelectorAll(".nav-item").forEach(n => { const s = n.querySelector("span"); if (s && s.textContent.trim() === want) n.click(); });
  });

  // --- right rail: live top five, same row component ---
  async function loadRightRailLeaderboard(){
    const panel = document.getElementById("railLeaderboard");
    if (!panel) return;
    try {
      const rows = (await fetchLeaderboard()).slice(0, 5);
      panel.innerHTML = rows.length
        ? rows.map((u, i) => personRow(u, { rank:i + 1 })).join("")
        : '<div class="ay-rail-empty">No one ranked yet.</div>';
    } catch(e){ panel.innerHTML = '<div class="ay-rail-empty">Leaderboard unavailable.</div>'; }
  }
  loadRightRailLeaderboard();

  // --- views that are not live yet: one honest, designed empty state each ---
  function renderMessages(){
    const box = document.querySelector("#view-messages .card");
    if (box) box.innerHTML = AY.empty({ icon:"chat", title:"Messages are on the way", copy:"Private conversations are the next thing we are building." });
  }
  function renderNFTs(){
    const box = document.querySelector("#view-nfts .grid-2");
    if (box) box.innerHTML = '<div style="grid-column:1/-1">' + AY.empty({ icon:"gem", title:"No collectibles yet", copy:"Your Arc collectibles will show up here once collection indexing goes live." }) + "</div>";
  }
  (function renderStaticViews(){
    const launch = document.getElementById("view-launch");
    if (launch) launch.innerHTML = AY.empty({ icon:"rocket", title:"Nothing launching yet", copy:"Creator drops open after the audited contracts go live on Arc." });
    const trade = document.getElementById("view-trade");
    if (trade) trade.innerHTML = AY.empty({ icon:"swap", title:"Trading opens soon", copy:"Creator keys become tradable once the audited contracts are deployed." });
    const games = document.getElementById("view-games");
    if (games) games.innerHTML = AY.empty({ icon:"game", title:"Games are coming", copy:"Play, compete and earn reputation on Clout. Not live yet." });
    const nftChips = document.querySelector("#view-nfts .chip-row");
    if (nftChips) nftChips.remove();
    renderNFTs();
    renderMessages();
  })();

  // --- own profile view ---
  let ownProfileLoaded = false;
  async function loadOwnProfile(){
    const box = document.getElementById("ownProfileContent");
    if (!box) return;
    if (!account || !sessionToken){
      box.innerHTML = AY.empty({ icon:"person", title:"Connect to see your profile", copy:"Sign in with your wallet to view your own posts, followers and stats.", action:"Connect wallet", actionAttr:"data-connect-wallet" });
      return;
    }
    box.innerHTML = AY.skeleton(3);
    try {
      const r = await fetch(API + "/api/users/" + account, { headers:{ Authorization:"Bearer " + sessionToken } });
      const d = await r.json();
      const u = d.user;
      const name = u.display_name || u.handle || short(account);
      // header: avatar, name, stats, edit profile button
      const headerHtml =
        '<div style="padding:16px 16px 0;display:flex;gap:14px;align-items:flex-start">' +
          AY.avatar(u, "s40") +
          '<div style="flex:1;min-width:0">' +
            '<div style="display:flex;align-items:center;gap:7px;font:700 17px var(--sans);letter-spacing:-.02em;color:var(--ink)">' + AY.esc(name) + AY.badge(u) + '</div>' +
            '<div style="font:13px var(--mono);color:var(--muted);margin-top:2px">' + (u.handle ? "@" + AY.esc(u.handle) : short(account)) + '</div>' +
            (u.bio ? '<p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:var(--ink-2)">' + AY.esc(u.bio) + '</p>' : '') +
          '</div>' +
          '<button id="ownEditBtn" type="button" style="height:32px;padding:0 13px;border:1px solid var(--line-strong);border-radius:999px;background:transparent;color:var(--ink);font:600 13px var(--sans);cursor:pointer;white-space:nowrap">Edit profile</button>' +
        '</div>' +
        '<div style="display:flex;gap:18px;padding:12px 16px 14px;border-bottom:1px solid var(--line);font-size:14px;color:var(--muted)">' +
          '<span><b style="color:var(--ink);font-variant-numeric:tabular-nums">' + d.followingCount + '</b> Following</span>' +
          '<span><b style="color:var(--ink);font-variant-numeric:tabular-nums">' + d.followerCount + '</b> Followers</span>' +
          '<span><b style="color:var(--ink);font-variant-numeric:tabular-nums">' + u.points + '</b> Points</span>' +
          '<a href="/profile?u=' + account + '" style="margin-left:auto;color:var(--accent-2);font-weight:600;text-decoration:none;font-size:13px">Full page ↗</a>' +
        '</div>';
      box.innerHTML = headerHtml;
      document.getElementById("ownEditBtn")?.addEventListener("click", () => openProfile());
      // posts
      if (!d.posts.length){
        box.insertAdjacentHTML("beforeend", AY.empty({ icon:"feed", title:"Nothing posted yet", copy:"Your posts will show here once you write something." }));
      } else {
        const frag = document.createDocumentFragment();
        d.posts.forEach(p => frag.appendChild(AY.renderPost(p, postCtx)));
        box.appendChild(frag);
      }
      ownProfileLoaded = true;
    } catch(e){ box.innerHTML = AY.empty({ icon:"person", title:"Could not load your profile", copy:"Check your connection and try again." }); }
  }

  // --- Buy pill: show live key price, open sheet explaining coming soon (option 2: real contracts) ---
  // patch AY.renderPost so future cards carry the creator address for Buy pill wiring
  const _origRender = AY.renderPost;
  AY.renderPost = function(p, ctx){
    const el = _origRender(p, ctx);
    if (p.author) el.dataset.buyCreator = p.author;
    const more = el.querySelector(".ay-post-more");
    if (more){
      const pill = document.createElement("button");
      pill.className = "buy-pill";
      pill.type = "button";
      pill.textContent = "Buy";
      more.before(pill);
      pill.addEventListener("click", () => openBuySheet(p.author, pill));
      getBuyPriceLive(p.author).then(price => { if (price) pill.textContent = "Buy " + formatUsdcShort(price); }).catch(() => {});

      // Delete button — only for own posts
      if (account && p.author && p.author.toLowerCase() === account.toLowerCase()){
        more.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!confirm("Delete this post?")) return;
          const t = sessionToken;
          if (!t) return;
          fetch(API + "/api/posts/" + p.id, {
            method: "DELETE",
            headers: { Authorization: "Bearer " + t }
          }).then(r => r.json()).then(d => {
            if (d.deleted) {
              el.style.transition = "opacity .2s";
              el.style.opacity = "0";
              setTimeout(() => el.remove(), 200);
              showToast("Post deleted");
            } else {
              showToast(d.error || "Could not delete", { kind:"error" });
            }
          }).catch(() => showToast("Could not delete", { kind:"error" }));
        });
        more.setAttribute("title", "Delete post");
      } else {
        more.addEventListener("click", () => showToast("More options are on the way"));
      }
    }
    return el;
  };

  function openBuySheet(creator, pill){
    if (!ONCHAIN_ACTIONS_ENABLED){
      showToast("Creator keys open when the audited contracts go live", { kind:"info" });
      return;
    }
    openTradeSheet(creator);
  }

})();
