const test = require("node:test");
const assert = require("node:assert/strict");
const { firstUrl, extractMeta, isBlockedAddress, normalizeUrl } = require("../src/link-preview");

test("firstUrl returns the first http(s) link and trims trailing punctuation", () => {
  assert.equal(firstUrl("read this: https://arc.network/blog/launch. then reply"), "https://arc.network/blog/launch");
  assert.equal(firstUrl("(see https://circle.com/usdc)"), "https://circle.com/usdc");
  assert.equal(firstUrl("no links here"), null);
  assert.equal(firstUrl("ftp://nope.example and javascript:alert(1)"), null);
});

test("extractMeta prefers OpenGraph, falls back to twitter and <title>, resolves relative images", () => {
  const html = `<html><head>
    <title>Fallback Title</title>
    <meta content="Arc Mainnet Is Live" property="og:title">
    <meta property="og:description" content="Circle&#39;s L1 opens to everyone &amp; everything.">
    <meta property="og:image" content="/img/cover.png">
    <meta property="og:site_name" content="Arc">
  </head></html>`;
  const m = extractMeta(html, "https://www.arc.network/blog/post");
  assert.equal(m.title, "Arc Mainnet Is Live");
  assert.equal(m.description, "Circle's L1 opens to everyone & everything.");
  assert.equal(m.image, "https://www.arc.network/img/cover.png");
  assert.equal(m.siteName, "Arc");

  const plain = extractMeta(`<title> Just A Page </title><meta name="twitter:description" content="tw desc">`, "https://ex.com/");
  assert.equal(plain.title, "Just A Page");
  assert.equal(plain.description, "tw desc");
  assert.equal(plain.image, null);
});

test("extractMeta drops non-https images so the feed never serves mixed content", () => {
  const m = extractMeta(`<meta property="og:title" content="x"><meta property="og:image" content="http://insecure.example/a.png">`, "https://ex.com/");
  assert.equal(m.image, null);
});

test("isBlockedAddress refuses every private, loopback, link-local and metadata range", () => {
  for (const ip of ["127.0.0.1", "10.2.3.4", "172.16.0.9", "172.31.255.1", "192.168.1.1", "169.254.169.254",
                    "0.0.0.0", "100.64.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "104.16.0.1", "172.32.0.1", "2606:4700::1111"]) {
    assert.equal(isBlockedAddress(ip), false, ip);
  }
});

test("normalizeUrl rejects credentials, odd ports and non-http schemes", () => {
  assert.equal(normalizeUrl("https://arc.network/x#frag"), "https://arc.network/x");
  assert.equal(normalizeUrl("https://user:pass@arc.network/"), null);
  assert.equal(normalizeUrl("http://arc.network:7080/api"), null);
  assert.equal(normalizeUrl("file:///etc/passwd"), null);
});
