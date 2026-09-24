import sys
from playwright.sync_api import sync_playwright

url = sys.argv[1]
out = sys.argv[2]
w = int(sys.argv[3]) if len(sys.argv) > 3 else 390
h = int(sys.argv[4]) if len(sys.argv) > 4 else 844

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=3, is_mobile=True)
    try:
        pg.goto(url, wait_until="networkidle", timeout=45000)
    except Exception as e:
        print("nav warn:", e)
    pg.wait_for_timeout(3000)
    pg.screenshot(path=out, full_page=False)
    print("saved", out)
    b.close()
