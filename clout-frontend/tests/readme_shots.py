"""Capture README screenshots of every main part of Clout, against the live API via the local mirror."""
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://clout.test:9147"
OUT = Path("/opt/hermes/projects/clout/clout-frontend/docs/screenshots")
OUT.mkdir(parents=True, exist_ok=True)
KENJI = "0x0000000000000000000000000000000000000102"
ARGS = ["--no-sandbox", "--host-resolver-rules=MAP clout.test 127.0.0.1"]
QUIET = "localStorage.setItem('clout-notice-dismissed','1')"

def nav(pg, label):
    pg.evaluate("(l)=>{for(const n of document.querySelectorAll('.nav-item')){const s=n.querySelector('span');if(s&&s.textContent.trim()===l){n.click();return}}}", label)
    pg.wait_for_timeout(900)

errors = []
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)

    # ---------- desktop ----------
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    ctx.add_init_script(QUIET)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))

    pg.goto(BASE + "/", wait_until="networkidle"); pg.wait_for_timeout(2600)
    pg.screenshot(path=str(OUT / "landing.png"))

    pg.goto(BASE + "/app", wait_until="networkidle"); pg.wait_for_timeout(1800)
    pg.screenshot(path=str(OUT / "feed.png"))

    pg.locator(".composer-input").fill("Circle just shipped the full-stack platform for internet money https://www.circle.com/")
    pg.wait_for_timeout(4500)
    pg.screenshot(path=str(OUT / "composer-link-preview.png"))
    pg.locator(".composer-input").fill("")

    pg.locator("#posts .buy-pill").first.click(); pg.wait_for_timeout(600)
    pg.screenshot(path=str(OUT / "notice.png"), clip={"x": 360, "y": 560, "width": 720, "height": 340})
    pg.wait_for_timeout(3600)

    nav(pg, "Search")
    pg.locator(".search-box input").fill("arc"); pg.wait_for_timeout(1400)
    pg.screenshot(path=str(OUT / "search.png"))

    nav(pg, "Leaderboard"); pg.wait_for_timeout(600)
    pg.screenshot(path=str(OUT / "leaderboard.png"))

    nav(pg, "Trade")
    pg.screenshot(path=str(OUT / "empty-state.png"))

    pg.goto(BASE + "/profile?u=" + KENJI, wait_until="networkidle"); pg.wait_for_timeout(1500)
    pg.screenshot(path=str(OUT / "profile.png"))
    ctx.close()

    # ---------- mobile ----------
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx.add_init_script(QUIET)
    pg = ctx.new_page(); pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(BASE + "/app", wait_until="networkidle"); pg.wait_for_timeout(1800)
    pg.screenshot(path=str(OUT / "_m-feed.png"))
    pg.goto(BASE + "/profile?u=" + KENJI, wait_until="networkidle"); pg.wait_for_timeout(1500)
    pg.screenshot(path=str(OUT / "_m-profile.png"))
    pg.goto(BASE + "/app", wait_until="networkidle"); pg.wait_for_timeout(1500)
    nav(pg, "Leaderboard"); pg.wait_for_timeout(600)
    pg.screenshot(path=str(OUT / "_m-leaderboard.png"))
    ctx.close()
    b.close()

print("errors:", errors)
print(sorted(f.name for f in OUT.iterdir()))
