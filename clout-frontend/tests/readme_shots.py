"""Capture README screenshots of every main part of Clout, against the live API via the local mirror.

Run the mirror first: python3 clout-frontend/tests/mirror.py
Then: python3 clout-frontend/tests/readme_shots.py
"""
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


errors, done, skipped = [], [], []

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)

    def shot(fn, name):
        try:
            fn()
            done.append(name)
        except Exception as error:
            skipped.append(name + ": " + type(error).__name__ + " " + str(error)[:110])

    # ---------- desktop ----------
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    ctx.add_init_script(QUIET)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))

    def landing():
        pg.goto(BASE + "/", wait_until="networkidle"); pg.wait_for_timeout(2600)
        pg.screenshot(path=str(OUT / "landing.png"))

    def feed():
        pg.goto(BASE + "/app", wait_until="networkidle"); pg.wait_for_timeout(2200)
        pg.screenshot(path=str(OUT / "feed.png"))

    def composer():
        box = pg.locator(".composer-input:visible").first
        box.fill("Circle just shipped the full-stack platform for internet money https://www.circle.com/")
        pg.wait_for_timeout(4500)
        pg.screenshot(path=str(OUT / "composer-link-preview.png"))
        box.fill("")

    def notice():
        pg.locator("#posts .buy-pill").first.click(); pg.wait_for_timeout(700)
        pg.screenshot(path=str(OUT / "notice.png"), clip={"x": 360, "y": 560, "width": 720, "height": 340})
        pg.wait_for_timeout(3600)

    def search():
        nav(pg, "Search")
        pg.locator(".search-box input").first.fill("arc"); pg.wait_for_timeout(1500)
        pg.screenshot(path=str(OUT / "search.png"))

    def leaderboard():
        nav(pg, "Leaderboard"); pg.wait_for_timeout(800)
        pg.screenshot(path=str(OUT / "leaderboard.png"))

    def trade():
        nav(pg, "Trade"); pg.wait_for_timeout(800)
        pg.screenshot(path=str(OUT / "empty-state.png"))

    def profile():
        pg.goto(BASE + "/profile?u=" + KENJI, wait_until="networkidle"); pg.wait_for_timeout(2000)
        pg.screenshot(path=str(OUT / "profile.png"))

    shot(landing, "landing")
    shot(feed, "feed")
    shot(composer, "composer-link-preview")
    shot(notice, "notice")
    shot(search, "search")
    shot(leaderboard, "leaderboard")
    shot(trade, "empty-state")
    shot(profile, "profile")
    ctx.close()

    # ---------- mobile ----------
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx.add_init_script(QUIET)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))

    def m_feed():
        pg.goto(BASE + "/app", wait_until="networkidle"); pg.wait_for_timeout(2200)
        pg.screenshot(path=str(OUT / "mobile.png"))

    def m_profile():
        pg.goto(BASE + "/profile?u=" + KENJI, wait_until="networkidle"); pg.wait_for_timeout(2000)
        pg.screenshot(path=str(OUT / "mobile-profile.png"))

    shot(m_feed, "mobile")
    shot(m_profile, "mobile-profile")
    ctx.close()
    b.close()

print("shots ok:", done)
print("skipped:", skipped)
print("page errors:", errors[:5])
