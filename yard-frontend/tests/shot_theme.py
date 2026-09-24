import sys
from playwright.sync_api import sync_playwright

url   = sys.argv[1]
out   = sys.argv[2]
theme = sys.argv[3]                       # "light" | "dark"
w     = int(sys.argv[4]) if len(sys.argv) > 4 else 1440
h     = int(sys.argv[5]) if len(sys.argv) > 5 else 900
mobile = "--mobile" in sys.argv

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
    dsf = 3 if mobile else 2
    pg = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=dsf, is_mobile=mobile)
    # set theme before any app JS runs
    pg.add_init_script(f"try{{localStorage.setItem('arcyard-theme','{theme}');}}catch(e){{}}")
    try:
        pg.goto(url, wait_until="networkidle", timeout=45000)
    except Exception as e:
        print("nav warn:", e)
    pg.wait_for_timeout(3500)
    pg.screenshot(path=out, full_page=False)
    print("saved", out, theme, w, "x", h)
    b.close()
