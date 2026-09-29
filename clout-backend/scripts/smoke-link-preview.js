// Live smoke test for fetchPreview: real public pages must unfurl, internal targets must be refused.
const { fetchPreview } = require("../src/link-preview");
const cases = [
  ["public: github", "https://github.com/anthropics", true],
  ["public: circle", "https://www.circle.com/", true],
  ["attack: loopback api", "http://127.0.0.1/api/health", false],
  ["attack: localhost name", "http://localhost/", false],
  ["attack: cloud metadata", "http://169.254.169.254/latest/meta-data/", false],
  ["attack: private LAN", "http://192.168.1.1/", false],
  ["attack: backend port", "http://94.72.105.176:7080/api/health", false],
  ["attack: ipv6 loopback", "http://[::1]/", false],
  ["attack: decimal ip", "http://2130706433/", false],
  ["attack: dns to loopback", "http://127.0.0.1.nip.io/", false],
];
(async () => {
  let bad = 0;
  for (const [label, url, shouldWork] of cases) {
    try {
      const p = await fetchPreview(url);
      const ok = shouldWork;
      if (!ok) bad++;
      console.log((ok ? "PASS " : "FAIL ") + label + " -> " + JSON.stringify({ title: p.title, image: !!p.image, site: p.siteName }));
    } catch (e) {
      const ok = !shouldWork;
      if (!ok) bad++;
      console.log((ok ? "PASS " : "FAIL ") + label + " -> refused: " + e.message);
    }
  }
  console.log(bad ? `\n${bad} FAILED` : "\nall passed");
  process.exitCode = bad ? 1 : 0;
})();
