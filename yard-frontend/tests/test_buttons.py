import sys
from playwright.sync_api import sync_playwright

url = "http://localhost:9000/app.html"
results = []
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = b.new_page(viewport={"width":1440,"height":900})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(url, wait_until="networkidle", timeout=45000)
    pg.wait_for_timeout(1200)

    # 1. Post button with empty -> toast "Write something first"
    pg.click(".btn-post")
    pg.wait_for_timeout(400)
    t = pg.text_content("#toastMsg")
    results.append(("empty post toast", t))

    # 2. Type + post -> new post appears at top
    before = pg.eval_on_selector_all("#posts article.post", "els => els.length")
    pg.fill(".composer-input", "hello arc, this is a live test post")
    pg.click(".btn-post")
    pg.wait_for_timeout(500)
    after = pg.eval_on_selector_all("#posts article.post", "els => els.length")
    first_text = pg.eval_on_selector("#posts article.post .post-body p", "el => el.textContent")
    results.append(("post added", f"{before}->{after}"))
    results.append(("new post text", first_text))

    # 3. Buy without wallet -> toast connect
    pg.click(".buy")
    pg.wait_for_timeout(400)
    results.append(("buy no wallet toast", pg.text_content("#toastMsg")))

    # 4. Nav item click -> feed title changes
    pg.eval_on_selector_all(".nav-item", "els => els[5].click()")  # NFTs
    pg.wait_for_timeout(400)
    results.append(("feed title after nav", pg.text_content(".feed-title")))

    # 5. like toggle
    pg.eval_on_selector_all("#posts article.post .act", "els => els[0].click()")
    pg.wait_for_timeout(200)
    results.append(("page errors", errors))
    b.close()

for k,v in results:
    print(f"{k}: {v}")
