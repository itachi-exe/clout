"""Main-thread cost per second of animation, from Chrome's own metrics. GPU-independent,
so it measures the page's own work instead of this server's software GPU.
Usage: python3 perf_cpu.py <file_or_url_for_landing> [label]"""
import sys
from playwright.sync_api import sync_playwright

TARGETS = sys.argv[1:] or ["http://clout.test:9147/"]
KEYS = ["TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration"]

def metrics(cdp):
    return {m["name"]: m["value"] for m in cdp.send("Performance.getMetrics")["metrics"]}

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox", "--host-resolver-rules=MAP clout.test 127.0.0.1"])
    for url in TARGETS:
        for label, vp, dpr, thr in [("desktop", (1440, 900), 1, 1), ("phone 4x", (390, 844), 2, 4)]:
            ctx = b.new_context(viewport={"width": vp[0], "height": vp[1]}, device_scale_factor=dpr, is_mobile=dpr > 1, has_touch=dpr > 1)
            pg = ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            cdp = ctx.new_cdp_session(pg); cdp.send("Performance.enable")
            cdp.send("Emulation.setCPUThrottlingRate", {"rate": thr})
            pg.goto(url, wait_until="networkidle"); pg.wait_for_timeout(2500)
            m0 = metrics(cdp); pg.wait_for_timeout(3000); m1 = metrics(cdp)
            secs = 3.0
            busy = {k: round((m1[k] - m0[k]) / secs * 100, 1) for k in KEYS}
            print(f"{url.split('/')[-1] or 'landing':22} {label:9} main thread busy {busy['TaskDuration']:5}%  "
                  f"(script {busy['ScriptDuration']}%, layout {busy['LayoutDuration']}%, style {busy['RecalcStyleDuration']}%)  errors={errs}")
            ctx.close()
    b.close()
