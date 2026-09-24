"""Smoothness benchmark for ArcYard. Measures what a person actually feels:
  - landing: animation frame rate
  - feed: frame times while scrolling with a real wheel, and long main-thread tasks
  - load: layout shift (content jumping while the page loads)
  - navigation: view switches and app -> profile
Runs at normal speed and with the CPU throttled 4x (a mid-range phone).
Usage: python3 perf.py [base_url] [label]"""
import json, sys, statistics
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://arcyard.test:9147"
LABEL = sys.argv[2] if len(sys.argv) > 2 else "run"
ARGS = ["--no-sandbox", "--host-resolver-rules=MAP arcyard.test 127.0.0.1"]

RECORDER = """
window.__frames = []; window.__long = []; window.__cls = 0;
new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push(e.duration) }).observe({type:'longtask', buffered:true});
new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({type:'layout-shift', buffered:true});
"""
START_FRAMES = """() => { window.__frames = []; window.__long = []; let last = performance.now();
  window.__rec = true; (function f(t){ window.__frames.push(t - last); last = t; if (window.__rec) requestAnimationFrame(f) })(performance.now()); }"""
STOP_FRAMES = "() => { window.__rec = false; return { frames: window.__frames.slice(2), long: window.__long } }"

def summarize(r):
    f = sorted(r["frames"]) or [0]
    n = len(f)
    return {
        "fps": round(1000 / statistics.mean(f), 1),
        "p95_ms": round(f[int(n * 0.95) - 1], 1),
        "janky_frames": sum(1 for x in f if x > 34),   # missed 2+ vsyncs
        "long_tasks": len(r["long"]),
        "long_task_ms": round(sum(r["long"])),
    }

def run(throttle):
    out = {}
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        ctx.add_init_script("localStorage.setItem('arcyard-notice-dismissed','1')")
        ctx.add_init_script(RECORDER)
        pg = ctx.new_page()
        cdp = ctx.new_cdp_session(pg)
        if throttle > 1:
            cdp.send("Emulation.setCPUThrottlingRate", {"rate": throttle})

        # landing animation
        pg.goto(BASE + "/", wait_until="networkidle"); pg.wait_for_timeout(2500)
        pg.evaluate(START_FRAMES); pg.wait_for_timeout(3000)
        out["landing"] = summarize(pg.evaluate(STOP_FRAMES))

        # feed load: layout shift
        pg.goto(BASE + "/app", wait_until="networkidle"); pg.wait_for_timeout(2500)
        out["feed_cls"] = round(pg.evaluate("window.__cls"), 4)

        # feed scroll with a real wheel, down then back up
        pg.evaluate(START_FRAMES)
        for _ in range(24): pg.mouse.wheel(0, 140); pg.wait_for_timeout(45)
        for _ in range(24): pg.mouse.wheel(0, -140); pg.wait_for_timeout(45)
        pg.wait_for_timeout(300)
        out["feed_scroll"] = summarize(pg.evaluate(STOP_FRAMES))

        # switching views inside the app
        pg.evaluate(START_FRAMES)
        for label in ["Search", "Notifications", "Leaderboard", "Home"]:
            pg.evaluate("(l)=>{for(const n of document.querySelectorAll('.nav-item')){const s=n.querySelector('span');if(s&&s.textContent.trim()===l){n.click();return}}}", label)
            pg.wait_for_timeout(500)
        out["view_switch"] = summarize(pg.evaluate(STOP_FRAMES))

        # app -> profile: time until the profile content is on screen
        import time
        t0 = time.perf_counter()
        pg.locator("#posts .ay-post a.ay-post-name").first.click()
        pg.wait_for_selector(".head .name", timeout=15000)
        out["to_profile_ms"] = round((time.perf_counter() - t0) * 1000)
        pg.wait_for_timeout(800)
        out["profile_cls"] = round(pg.evaluate("window.__cls"), 4)
        b.close()
    return out

results = {"normal": run(1), "phone_4x": run(4)}
print(json.dumps({LABEL: results}, indent=1))
