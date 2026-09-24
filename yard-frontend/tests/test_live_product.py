from playwright.sync_api import sync_playwright

URL = "https://arcyard.vercel.app/app"
POST = "liveproductqa-audit-post"

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = b.new_page(viewport={"width":1440,"height":900})
    errors=[]
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(URL, wait_until="networkidle", timeout=45000)
    pg.add_script_tag(url="https://cdn.jsdelivr.net/npm/ethers@6.13.2/dist/ethers.umd.min.js")
    pg.wait_for_timeout(400)
    a = pg.evaluate("""
    async () => {
      const wallet = ethers.Wallet.createRandom(); let chain="0x4CEF52";
      window.ethereum={request:async({method,params})=>{
        if(method==='eth_requestAccounts')return[wallet.address];
        if(method==='eth_chainId')return chain;
        if(method==='wallet_switchEthereumChain'||method==='wallet_addEthereumChain'){chain=params[0].chainId;return null;}
        if(method==='personal_sign')return wallet.signMessage(params[0]);
        if(method==='eth_getBalance')return '0x1158e460913d0000'; // 1.25 USDC, 18 decimals
        throw new Error('Unhandled '+method);
      },on:()=>{}};
      return wallet.address;
    }
    """)
    pg.click("#btnLogin")
    pg.wait_for_timeout(2400)
    print("login", pg.text_content("#btnLogin span"), "network", pg.text_content("#netLabel"))

    # Wallet shows direct provider balance
    pg.eval_on_selector_all(".nav-item", "els=>els[3].click()")
    pg.wait_for_timeout(500)
    print("wallet", pg.text_content("#walletBalance"))

    # Create persisted post through UI
    pg.eval_on_selector_all(".nav-item", "els=>els[0].click()")
    pg.fill(".composer-input", POST)
    pg.click(".btn-post")
    pg.wait_for_timeout(1100)
    print("post", pg.eval_on_selector("#posts article.post .post-body p", "el=>el.textContent"))

    # Bob authenticates to real backend and likes Alice post, creating a notification
    result = pg.evaluate("""
    async (postText) => {
      const rows = await (await fetch('/api/posts')).json();
      const post = rows.posts.find(p=>p.content===postText);
      const bob=ethers.Wallet.createRandom();
      const n=await (await fetch('/api/auth/nonce?address='+bob.address)).json();
      const sig=await bob.signMessage(n.message);
      const auth=await (await fetch('/api/auth/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:bob.address,signature:sig})})).json();
      const liked=await (await fetch('/api/posts/'+post.id+'/like',{method:'POST',headers:{Authorization:'Bearer '+auth.token}})).json();
      return {postId:post.id, bob:bob.address, liked};
    }
    """, POST)
    print("like", result)

    # Real notification UI
    pg.eval_on_selector_all(".nav-item", "els=>els[2].click()")
    pg.wait_for_timeout(700)
    print("notification", pg.text_content("#notificationsList"))

    # Real server-side search UI
    pg.eval_on_selector_all(".nav-item", "els=>els[1].click()")
    pg.fill(".search-box input", "liveproductqa")
    pg.wait_for_timeout(700)
    print("search", pg.text_content("#view-search .card"))
    print("errors", errors)
    b.close()
