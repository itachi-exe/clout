"""Trigger each toast state on the local mirror and screenshot it."""
from playwright.sync_api import sync_playwright
OUT = "/opt/hermes/projects/clout/clout-frontend/tests/shots/"
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox", "--host-resolver-rules=MAP clout.test 127.0.0.1"])
    for tag, (w, h) in {"desk": (1440, 900), "mob": (390, 844)}.items():
        pg = b.new_page(viewport={"width": w, "height": h}); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto("http://clout.test:9147/app", wait_until="networkidle"); pg.wait_for_timeout(1200)
        # 1. buy while paused
        pg.locator("#posts .buy-pill").first.click(); pg.wait_for_timeout(450)
        pg.screenshot(path=OUT + f"toast-buy-{tag}.png")
        info = pg.locator(".ay-toast").evaluate("e=>({cls:e.className,text:e.innerText,action:!!e.querySelector('.ay-toast-action')})")
        # 2. post without wallet
        pg.locator(".composer-input").fill("draft that should survive")
        pg.locator(".btn-post").click(); pg.wait_for_timeout(450)
        pg.screenshot(path=OUT + f"toast-post-{tag}.png")
        post = pg.locator(".ay-toast").evaluate("e=>({cls:e.className,text:e.innerText,action:!!e.querySelector('.ay-toast-action')})")
        draft = pg.locator(".composer-input").input_value()
        fake = pg.locator("#posts .post").count()
        # 3. like without wallet
        pg.locator("#posts .ay-act.like").first.click(); pg.wait_for_timeout(450)
        like = pg.locator(".ay-toast").evaluate("e=>e.innerText")
        # 4. dismiss
        pg.locator(".ay-toast-close").click(); pg.wait_for_timeout(350)
        gone = not pg.locator(".ay-toast").evaluate("e=>e.classList.contains('show')")
        print(tag, {"buy": info, "post": post, "draft_kept": draft, "fake_local_posts": fake,
                    "like": like, "dismissed": gone, "errors": errs})
        pg.close()
    b.close()
