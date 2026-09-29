import sys
from playwright.sync_api import sync_playwright

url = sys.argv[1]
out = sys.argv[2]
wait = int(sys.argv[3]) if len(sys.argv) > 3 else 3500
full = "--full" in sys.argv

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    try:
        pg.goto(url, wait_until="networkidle", timeout=45000)
    except Exception as e:
        print("nav warn:", e)
    pg.wait_for_timeout(wait)
    pg.screenshot(path=out, full_page=full)
    print("saved", out)
    b.close()
