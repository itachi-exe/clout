from playwright.sync_api import sync_playwright
import json

url = "http://localhost:9000/app.html"

# inject a minimal EIP-1193 mock wallet backed by a real ethers wallet, so
# eth_requestAccounts / personal_sign actually produce valid signatures.
init_script = """
window.ethereum = (function(){
  const { Wallet, hashMessage } = window.__ethers || {};
})();
"""

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = b.new_page(viewport={"width":1440,"height":900})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: print("CONSOLE:", m.type, m.text) if m.type == "error" else None)

    # load ethers into the page first so our mock provider can sign for real
    pg.goto(url, wait_until="networkidle", timeout=45000)
    pg.add_script_tag(url="https://cdn.jsdelivr.net/npm/ethers@6.13.2/dist/ethers.umd.min.js")
    pg.wait_for_timeout(300)

    result = pg.evaluate("""
    async () => {
      const wallet = ethers.Wallet.createRandom();
      window.__testWallet = wallet;
      let chainId = "0x4CEF52";
      window.ethereum = {
        request: async ({ method, params }) => {
          if (method === "eth_requestAccounts") return [wallet.address];
          if (method === "eth_chainId") return chainId;
          if (method === "wallet_switchEthereumChain") { chainId = params[0].chainId; return null; }
          if (method === "wallet_addEthereumChain") { chainId = params[0].chainId; return null; }
          if (method === "personal_sign") {
            const [message, addr] = params;
            return await wallet.signMessage(message);
          }
          throw new Error("unhandled method " + method);
        },
        on: () => {}
      };
      return { address: wallet.address };
    }
    """)
    print("mock wallet:", result)

    # click connect
    pg.click("#btnLogin")
    pg.wait_for_timeout(2500)
    label = pg.text_content("#btnLogin span")
    print("login button label after connect:", label)

    has_token = pg.evaluate("() => !!localStorage.getItem('arcyard-token')")
    print("session token stored:", has_token)

    # post something real
    pg.fill(".composer-input", "real signed post via headless test")
    pg.click(".btn-post")
    pg.wait_for_timeout(1200)
    toast = pg.text_content("#toastMsg")
    print("toast after post:", toast)

    first_post_text = pg.eval_on_selector("#posts article.post .post-body p", "el => el.textContent")
    print("first post in feed:", first_post_text)

    print("page errors:", errors)
    b.close()
