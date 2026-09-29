"""Screenshot every Clout surface at desktop and mobile for a design consistency audit."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://cloutonarc.fun"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "/opt/hermes/projects/clout/clout-frontend/tests/shots")
OUT.mkdir(parents=True, exist_ok=True)
KENJI = "0x0000000000000000000000000000000000000102"
VIEWS = ["Home", "Search", "Notifications", "Wallet", "Messages", "NFTs", "Leaderboard", "Launch", "Trade", "Games"]
SIZES = {"desk": (1440, 900), "mob": (390, 844)}

errors = []
with sync_playwright() as p:
    browser = p.chromium.launch(args=["--no-sandbox", "--host-resolver-rules=MAP clout.test 127.0.0.1"])
    for tag, (w, h) in SIZES.items():
        page = browser.new_page(viewport={"width": w, "height": h})
        page.on("pageerror", lambda e, t=tag: errors.append(f"{t}: {e}"))
        page.goto(BASE + "/", wait_until="networkidle")
        page.wait_for_timeout(2200)
        page.screenshot(path=str(OUT / f"{tag}-landing.png"))
        page.goto(BASE + "/app", wait_until="networkidle")
        page.wait_for_timeout(900)
        for i, name in enumerate(VIEWS):
            if tag == "mob" and i >= 5:
                # mobile bottom rail hides items 6+, switch views through the same handler
                page.evaluate("(n)=>document.querySelectorAll('.nav-item')[n].click()", i)
            else:
                page.evaluate("(n)=>document.querySelectorAll('.nav-item')[n].click()", i)
            page.wait_for_timeout(500)
            page.screenshot(path=str(OUT / f"{tag}-app-{name.lower()}.png"))
        page.goto(BASE + "/profile?u=" + KENJI, wait_until="networkidle")
        page.wait_for_timeout(700)
        page.screenshot(path=str(OUT / f"{tag}-profile.png"), full_page=True)
        page.close()
    browser.close()

print("shots:", sorted(x.name for x in OUT.glob("*.png")))
print("errors:", errors)
