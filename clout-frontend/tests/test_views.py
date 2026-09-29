import os
from playwright.sync_api import sync_playwright

url = os.environ.get("CLOUT_BASE_URL", "http://localhost:9000/app.html")
labels = ["Home","Search","Notifications","Wallet","Messages","NFTs","Leaderboard","Launch","Trade","Games"]
results = []
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox","--disable-dev-shm-usage"])
    pg = b.new_page(viewport={"width":1440,"height":900})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(url, wait_until="networkidle", timeout=45000)
    pg.wait_for_timeout(1200)

    items = pg.query_selector_all(".nav-item")
    for i, label in enumerate(labels):
        items[i].click()
        pg.wait_for_timeout(250)
        title = pg.text_content(".feed-title")
        visible_id = pg.eval_on_selector(".view.active", "el => el.id") if pg.query_selector(".view.active") else None
        results.append((label, title, visible_id))

    # extra interaction checks
    items[1].click(); pg.wait_for_timeout(200)  # Search
    pg.fill(".search-box input", "yard")
    pg.wait_for_timeout(200)
    visible_rows = pg.eval_on_selector_all("#view-search .row-card", "els => els.filter(e => e.style.display !== 'none').length")
    results.append(("search filter visible rows for 'yard'", visible_rows, None))

    items[3].click(); pg.wait_for_timeout(200)  # Wallet
    pg.click('[data-act="deposit"]')
    pg.wait_for_timeout(300)
    results.append(("wallet deposit toast", pg.text_content("#toastMsg"), None))

    items[8].click(); pg.wait_for_timeout(200)  # Trade
    pg.click('.tt[data-side="sell"]')
    pg.fill("#tradeAmt", "50")
    pg.click('[data-act="trade"]')
    pg.wait_for_timeout(300)
    results.append(("trade sell toast (no wallet)", pg.text_content("#toastMsg"), None))

    items[9].click(); pg.wait_for_timeout(200)  # Games
    pg.click(".game-card")
    pg.wait_for_timeout(300)
    results.append(("game click toast", pg.text_content("#toastMsg"), None))

    results.append(("page errors", errors, None))
    b.close()

for r in results:
    print(r)
