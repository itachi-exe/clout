from playwright.sync_api import sync_playwright

URL = "https://cloutonarc.fun/app"

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(URL, wait_until="networkidle", timeout=45000)
    page.wait_for_timeout(800)
    feed = page.evaluate("""async () => {
      const response = await fetch('/api/feed?limit=30');
      return { ok: response.ok, status: response.status, body: await response.json() };
    }""")
    visible_posts = page.locator("#posts article.ay-post").count()
    print({
        "feed_ok": feed["ok"],
        "feed_status": feed["status"],
        "personalized": feed["body"].get("personalized"),
        "post_count": len(feed["body"].get("posts", [])),
        "visible_posts": visible_posts,
        "errors": errors,
    })
    browser.close()
