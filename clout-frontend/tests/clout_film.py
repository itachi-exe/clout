"""Clout cinematic demo: record the real product, scene by scene.

Records 10 live-app scenes against the local mirror (instant loads, real API),
one Playwright context per scene, so each scene is its own .webm and can be
re-recorded alone. Video is 1920x1080 landscape except scene 09 (portrait
phone insert).

Never simulates a wallet signature, trade or payout: the trade sheet is opened,
read and closed, buy/sell are hovered only.
"""
import os, shutil, sys, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("CLOUT_BASE", "http://127.0.0.1:9147")
OUT = "/tmp/clout_film"
STATE = "/tmp/clout_state.json"
KENJI = "0x0000000000000000000000000000000000000102"

ERRORS = []

CURSOR_JS = """
(() => {
  if (window.__cloutCursor) return;
  window.__cloutCursor = true;
  const add = () => {
    if (document.getElementById('__clout_cursor')) return;
    const d = document.createElement('div');
    d.id = '__clout_cursor';
    d.style.cssText = 'position:fixed;left:0;top:0;width:16px;height:16px;border-radius:50%;' +
      'background:rgba(255,255,255,.92);box-shadow:0 0 0 1.5px rgba(0,0,0,.45),0 4px 14px rgba(0,0,0,.5);' +
      'pointer-events:none;z-index:2147483647;transform:translate3d(-40px,-40px,0);' +
      'transition:transform 70ms linear,width 90ms ease,height 90ms ease';
    document.documentElement.appendChild(d);
    let x = -40, y = -40;
    addEventListener('mousemove', e => { x = e.clientX; y = e.clientY; d.style.transform =
      'translate3d(' + (x - 8) + 'px,' + (y - 8) + 'px,0)'; }, true);
    addEventListener('mousedown', () => { d.style.width = '11px'; d.style.height = '11px'; }, true);
    addEventListener('mouseup', () => { d.style.width = '16px'; d.style.height = '16px'; }, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', add); else add();
})();
"""

WALLET_JS = """
async () => {
  const wallet = ethers.Wallet.createRandom(); let chain = "0x4CEF52";
  window.ethereum = {request: async ({method, params}) => {
      if (method === 'eth_requestAccounts') return [wallet.address];
      if (method === 'eth_accounts') return [wallet.address];
      if (method === 'eth_chainId') return chain;
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') { chain = params[0].chainId; return null; }
      if (method === 'personal_sign') return wallet.signMessage(params[0]);
      if (method === 'eth_getBalance') return '0x1158e460913d0000';
      throw new Error('Unhandled ' + method);
    }, on: () => {}, removeListener: () => {}, isMetaMask: true};
  return wallet.address;
}
"""


def hold(page, ms):
    page.wait_for_timeout(int(ms))


def scroll_container(page):
    """The app may scroll a container rather than the window."""
    return """
    () => {
      const cands = [...document.querySelectorAll('div,main,section')].filter(e => {
        const s = getComputedStyle(e);
        return e.scrollHeight > e.clientHeight + 60 && ['auto', 'scroll', 'overlay'].includes(s.overflowY);
      });
      cands.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
      return cands[0] ? true : false;
    }
    """


def smooth_scroll(page, dy, ms=6000):
    page.evaluate(
        """([dy, ms]) => new Promise(res => {
          const cands = [...document.querySelectorAll('div,main,section')].filter(e => {
            const s = getComputedStyle(e);
            return e.scrollHeight > e.clientHeight + 60 && ['auto','scroll','overlay'].includes(s.overflowY);
          });
          cands.sort((a,b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
          const tgt = cands[0] || document.scrollingElement;
          const start = tgt.scrollTop, t0 = performance.now();
          const ease = t => t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t;
          function step(now) {
            const p = Math.min(1, (now - t0) / ms);
            tgt.scrollTop = start + dy * ease(p);
            window.scrollTo(tgt === document.scrollingElement ? 0 : window.scrollY, tgt === document.scrollingElement ? start + dy*ease(p) : window.scrollY);
            if (p < 1) requestAnimationFrame(step); else res(tgt.scrollTop);
          }
          requestAnimationFrame(step);
        })""",
        [dy, ms],
    )


def move_slow(page, x, y, ms=1400, steps=28):
    pos = page.evaluate("() => [window.__mx || 20, window.__my || 20]")
    sx, sy = pos
    for i in range(1, steps + 1):
        t = i / steps
        e = t * t * (3 - 2 * t)
        cx, cy = sx + (x - sx) * e, sy + (y - sy) * e
        page.mouse.move(cx, cy)
        page.evaluate("([x,y]) => { window.__mx = x; window.__my = y; }", [cx, cy])
        page.wait_for_timeout(max(1, int(ms / steps)))


def hover_center(page, selector, ms=1500):
    try:
        el = page.locator(selector).first
        box = el.bounding_box(timeout=4000)
        if not box:
            return False
        move_slow(page, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, ms)
        hold(page, 700)
        return True
    except Exception as exc:
        ERRORS.append(f"hover {selector}: {exc}")
        return False


def ready(page, selector=".ay-post", timeout=20000):
    try:
        page.wait_for_selector(selector, timeout=timeout)
        return True
    except Exception as exc:
        ERRORS.append(f"ready {selector}: {type(exc).__name__}")
        return False


SEED_FOLLOWS_JS = """
async () => {
  const token = localStorage.getItem('clout-token');
  const rows = await (await fetch('/api/posts')).json();
  const authors = [...new Set((rows.posts || []).map(p => p.author))].slice(0, 6);
  const out = [];
  for (const a of authors) {
    try {
      const r = await fetch('/api/follow/' + a, {method: 'POST', headers: {Authorization: 'Bearer ' + token}});
      out.push(a.slice(0, 12) + ':' + r.status);
    } catch (e) { out.push(a.slice(0, 12) + ':err'); }
  }
  return out;
}
"""


def seed_follows(page):
    """A fresh wallet follows nobody, so the Following tab renders an empty state.
    Seed it off camera so the feed scene shows real followed posts."""
    try:
        return page.evaluate(SEED_FOLLOWS_JS)
    except Exception as exc:
        ERRORS.append(f"seed follows: {exc}")
        return None


def login(page):
    try:
        page.add_script_tag(url="https://cdn.jsdelivr.net/npm/ethers@6.13.2/dist/ethers.umd.min.js")
        page.wait_for_timeout(400)
        addr = page.evaluate(WALLET_JS)
        page.click("#btnLogin")
        page.wait_for_timeout(2600)
        return addr
    except Exception as exc:
        ERRORS.append(f"login: {type(exc).__name__} {exc}")
        return None


def go_app(page, wait=2600):
    page.goto(BASE + "/app", wait_until="domcontentloaded")
    ready(page, "#posts", 20000)
    ready(page, ".ay-post", 20000)
    hold(page, wait)


def go_landing(page, wait=2600):
    page.goto(BASE + "/", wait_until="domcontentloaded")
    hold(page, wait)


def nav(page, idx, wait=1800):
    try:
        page.evaluate("(n) => document.querySelectorAll('.nav-item')[n].click()", idx)
        hold(page, wait)
    except Exception as exc:
        ERRORS.append(f"nav {idx}: {exc}")


# ---------------------------------------------------------------- scenes

def s01_hook(pg):
    """Landing, cold. Cursor drifts to the primary entry point."""
    go_landing(pg, 3000)
    move_slow(pg, 1180, 560, 2600)
    hold(pg, 900)
    cta = ".hero a[href='/app'], a[href='/app']"
    hover_center(pg, cta, 2200)
    hold(pg, 2600)
    smooth_scroll(pg, 260, 7000)
    hold(pg, 2400)


def s02_idea(pg):
    """Into the app: the feed, real posts, slow read."""
    go_landing(pg, 2200)
    try:
        pg.locator("a[href='/app']").first.click()
    except Exception as exc:
        ERRORS.append(f"s02 click: {exc}")
        pg.goto(BASE + "/app", wait_until="domcontentloaded")
    ready(pg, ".ay-post", 20000)
    hold(pg, 2400)
    smooth_scroll(pg, 520, 11000)
    hold(pg, 2400)
    smooth_scroll(pg, 420, 8000)
    hold(pg, 2600)


def s03_arc(pg):
    """Landing, read down through the Arc sections."""
    go_landing(pg, 2600)
    smooth_scroll(pg, 700, 6000)
    hold(pg, 2200)
    smooth_scroll(pg, 900, 12000)
    hold(pg, 3000)
    smooth_scroll(pg, 700, 6000)
    hold(pg, 2600)


def s04_identity(pg, logged=False):
    """Wallet entry, then a readable profile."""
    go_app(pg, 2200)
    if not logged:
        move_slow(pg, 1560, 96, 1800)
        hover_center(pg, "#btnLogin", 1600)
        hold(pg, 1200)
        login(pg)
    hold(pg, 1600)
    pg.goto(BASE + "/profile?u=" + KENJI, wait_until="domcontentloaded")
    hold(pg, 3000)
    smooth_scroll(pg, 620, 10000)
    hold(pg, 3000)


def s05_feed(pg):
    """Discover, Following, Latest, all real."""
    go_app(pg, 2400)
    smooth_scroll(pg, 600, 9000)
    hold(pg, 1800)
    try:
        pg.click(".tabs .tab[data-scope='following']")
        hold(pg, 2600)
        smooth_scroll(pg, 380, 6000)
    except Exception as exc:
        ERRORS.append(f"s05 following: {exc}")
    try:
        pg.click(".tabs .tab[data-scope='latest']")
        hold(pg, 2600)
        smooth_scroll(pg, 460, 7000)
    except Exception as exc:
        ERRORS.append(f"s05 latest: {exc}")
    hover_center(pg, ".ay-post", 1800)
    hold(pg, 2400)


def s06_reputation(pg):
    """The leaderboard, then the profile history behind it."""
    go_app(pg, 2600)
    nav(pg, 6, 3000)
    smooth_scroll(pg, 520, 9000)
    hold(pg, 2400)
    pg.goto(BASE + "/profile?u=" + KENJI, wait_until="domcontentloaded")
    hold(pg, 2600)
    smooth_scroll(pg, 520, 8000)
    hold(pg, 2600)


def s07_markets(pg):
    """The turn: a post becomes a market. Read only, never execute."""
    go_app(pg, 2400)
    for i in (0, 1):
        opened = False
        try:
            btn = pg.locator(".ay-act.trade").nth(i)
            box = btn.bounding_box(timeout=5000)
            if box:
                move_slow(pg, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, 1800)
                btn.click()
                hold(pg, 900)
                opened = ready(pg, "#tradeSheet", 6000)
        except Exception as exc:
            ERRORS.append(f"s07 open {i}: {exc}")
        if not opened:
            continue
        hold(pg, 3200)
        for sel in ("#tradeSheetTitle", "#tradeKeyAmount", "#tradeBuyBtn", "#tradeSellBtn"):
            hover_center(pg, sel, 1100)
            hold(pg, 900)
        smooth_scroll(pg, 120, 4000)
        hold(pg, 3000)
        try:
            pg.click("#tradeSheetClose")
        except Exception:
            pg.keyboard.press("Escape")
        hold(pg, 1600)
        if i == 0:
            smooth_scroll(pg, 260, 5000)
            hold(pg, 1200)
    hold(pg, 2000)


def s08_keys(pg):
    """Creator keys, honestly staged. Rollout state stays visible."""
    go_app(pg, 2200)
    nav(pg, 7, 3000)
    smooth_scroll(pg, 640, 11000)
    hold(pg, 3600)
    pg.goto(BASE + "/profile?u=" + KENJI, wait_until="domcontentloaded")
    hold(pg, 2600)
    smooth_scroll(pg, 480, 8000)
    hold(pg, 3600)
    smooth_scroll(pg, 380, 6000)
    hold(pg, 2600)


def s09_effortless(pg):
    """Phone insert: search, then write in one motion, no ceremony."""
    go_app(pg, 2600)
    nav(pg, 1, 1800)
    try:
        pg.click(".search-box input")
        hold(pg, 500)
        pg.type(".search-box input", "clout", delay=140)
        hold(pg, 2400)
    except Exception as exc:
        ERRORS.append(f"s09 search: {exc}")
    nav(pg, 0, 1800)
    try:
        pg.click(".composer-input")
        hold(pg, 600)
        pg.type(".composer-input", "the social layer for arc", delay=120)
        hold(pg, 1800)
        hover_center(pg, ".btn-post", 1400)
    except Exception as exc:
        ERRORS.append(f"s09 composer: {exc}")
    pg.keyboard.press("Escape")
    hold(pg, 2400)


def s10_close(pg):
    """Let the feed settle and breathe."""
    go_app(pg, 2600)
    smooth_scroll(pg, -240, 5000)
    hold(pg, 4000)
    smooth_scroll(pg, 180, 4000)
    hold(pg, 3200)


# name, record seconds, fn, portrait
SCENES = [
    ("01-hook", 28, s01_hook, False),
    ("02-idea", 32, s02_idea, False),
    ("03-arc", 31, s03_arc, False),
    ("04-identity", 31, s04_identity, False),
    ("05-feed", 35, s05_feed, False),
    ("06-reputation", 27, s06_reputation, False),
    ("07-markets", 56, s07_markets, False),
    ("08-keys", 42, s08_keys, False),
    ("09-effortless", 25, s09_effortless, True),
    ("10-close", 11, s10_close, False),
]


def main():
    only = sys.argv[1:] or None
    if only:
        os.makedirs(OUT, exist_ok=True)
    else:
        shutil.rmtree(OUT, ignore_errors=True)
        os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage",
                                          "--autoplay-policy=no-user-gesture-required"])
        # one off-camera login to reuse a real session in later scenes
        try:
            sctx = browser.new_context(viewport={"width": 1920, "height": 1080})
            spg = sctx.new_page()
            spg.goto(BASE + "/app", wait_until="domcontentloaded")
            ready(spg, "#posts", 20000)
            addr = login(spg)
            print("session wallet:", addr)
            print("seeded follows:", seed_follows(spg))
            sctx.storage_state(path=STATE)
            sctx.close()
        except Exception as exc:
            ERRORS.append(f"session setup: {exc}")

        state = STATE if os.path.exists(STATE) else None
        for idx, (name, dur, fn, portrait) in enumerate(SCENES, start=1):
            if only and name not in only and str(idx) not in only:
                continue
            vp = {"width": 430, "height": 932} if portrait else {"width": 1920, "height": 1080}
            vs = {"width": 1080, "height": 1920} if portrait else {"width": 1920, "height": 1080}
            ctx = browser.new_context(viewport=vp, record_video_dir=OUT, record_video_size=vs,
                                      storage_state=state, device_scale_factor=1)
            ctx.add_init_script(CURSOR_JS)
            page = ctx.new_page()
            page.on("pageerror", lambda e, n=name: ERRORS.append(f"{n} pageerror: {e}"))
            t0 = time.time()
            try:
                fn(page)
            except Exception as exc:
                ERRORS.append(f"{name} scene: {type(exc).__name__} {exc}")
            remain = dur - (time.time() - t0)
            if remain > 0:
                try:
                    page.wait_for_timeout(int(remain * 1000))
                except Exception:
                    pass
            video = page.video
            real = round(time.time() - t0, 1)
            ctx.close()
            try:
                path = video.path()
                dest = os.path.join(OUT, f"{idx:02d}-{name}.webm")
                shutil.move(path, dest)
                print(f"[{idx:02d}] {name}: {real}s -> {dest} ({os.path.getsize(dest)//1024} KB)")
            except Exception as exc:
                ERRORS.append(f"{name} video: {exc}")
        browser.close()
    print("ERRORS:")
    for e in ERRORS:
        print(" -", e)


if __name__ == "__main__":
    main()
