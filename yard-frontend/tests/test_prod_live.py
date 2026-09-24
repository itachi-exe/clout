from playwright.sync_api import sync_playwright

url = "https://arcyard.vercel.app/app"

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = b.new_page(viewport={"width":1440,"height":900})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(url, wait_until="networkidle", timeout=45000)
    pg.add_script_tag(url="https://cdn.jsdelivr.net/npm/ethers@6.13.2/dist/ethers.umd.min.js")
    pg.wait_for_timeout(300)

    result = pg.evaluate("""
    async () => {
      const wallet = ethers.Wallet.createRandom();
      let chainId = "0x4CEF52";
      window.ethereum = {
        request: async ({ method, params }) => {
          if (method === "eth_requestAccounts") return [wallet.address];
          if (method === "eth_chainId") return chainId;
          if (method === "wallet_switchEthereumChain") { chainId = params[0].chainId; return null; }
          if (method === "wallet_addEthereumChain") { chainId = params[0].chainId; return null; }
          if (method === "personal_sign") return await wallet.signMessage(params[0]);
          throw new Error("unhandled " + method);
        },
        on: () => {}
      };
      return wallet.address;
    }
    """)
    print("wallet:", result)

    pg.click("#btnLogin")
    pg.wait_for_timeout(2500)
    print("login label:", pg.text_content("#btnLogin span"))
    print("token stored:", pg.evaluate("() => !!localStorage.getItem('arcyard-token')"))

    pg.fill(".composer-input", "live production post from itachi's headless QA")
    pg.click(".btn-post")
    pg.wait_for_timeout(1500)
    print("toast:", pg.text_content("#toastMsg"))
    print("feed first post:", pg.eval_on_selector("#posts article.post .post-body p", "el => el.textContent"))

    # like it
    pg.eval_on_selector_all("#posts article.post .act", "els => els[0].click()")
    pg.wait_for_timeout(1000)
    print("like count after self-block check (should be unchanged, own post):", pg.eval_on_selector("#posts article.post .act", "el => el.textContent.trim()"))

    print("errors:", errors)
    b.close()
