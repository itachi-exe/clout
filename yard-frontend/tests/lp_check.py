"""Visual check: feed cards with previews, and the composer's live preview."""
from playwright.sync_api import sync_playwright
OUT = "/opt/hermes/projects/arcyard/yard-frontend/tests/shots/"
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox", "--host-resolver-rules=MAP arcyard.test 127.0.0.1"])
    for tag, (w, h) in {"desk": (1440, 900), "mob": (390, 844)}.items():
        pg = b.new_page(viewport={"width": w, "height": h}); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto("http://arcyard.test:9147/app", wait_until="networkidle"); pg.wait_for_timeout(1500)
        cards = pg.locator("#posts .ay-lp").count()
        first = pg.locator("#posts .ay-post:has(.ay-lp)").first
        if first.count(): first.screenshot(path=OUT + f"lp-feed-{tag}.png")
        # composer live preview with an image-bearing link
        pg.locator(".composer-input").fill("this is the one https://github.com/anthropics")
        pg.wait_for_timeout(4500)
        comp = pg.locator(".ay-compose-preview .ay-lp").count()
        img = pg.locator(".ay-compose-preview .ay-lp-media img").count()
        pg.locator(".composer").screenshot(path=OUT + f"lp-compose-{tag}.png")
        pg.locator(".ay-lp-remove").click(); pg.wait_for_timeout(200)
        removed = pg.locator(".ay-compose-preview .ay-lp").count() == 0
        print(tag, {"feed_cards": cards, "compose_card": comp, "compose_img": img, "remove_works": removed, "errors": errs})
        pg.close()
    b.close()
