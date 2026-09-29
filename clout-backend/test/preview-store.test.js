const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { createPreviewStore } = require("../src/preview-store");

function freshDb() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE link_previews (url TEXT PRIMARY KEY, title TEXT, description TEXT, image TEXT,
    site_name TEXT, ok INTEGER NOT NULL DEFAULT 1, fetched_at INTEGER DEFAULT (unixepoch()))`);
  return db;
}

test("attach adds a cached preview to posts that link to it, and leaves others alone", async () => {
  let calls = 0;
  const store = createPreviewStore(freshDb(), async url => { calls++; return { url, title: "Arc", description: "d", image: "https://x/i.png", siteName: "arc.network" }; });
  await store.ensure("https://arc.network/");
  const [linked, plain] = store.attach([
    { id: 1, content: "look https://arc.network/ now" },
    { id: 2, content: "no link" },
  ]);
  assert.equal(linked.preview.title, "Arc");
  assert.equal(linked.preview.image, "https://x/i.png");
  assert.equal(plain.preview, undefined);
  assert.equal(calls, 1);
});

test("a failed unfurl is cached and not retried on every read", async () => {
  let calls = 0;
  const store = createPreviewStore(freshDb(), async () => { calls++; throw new Error("down"); });
  assert.equal(await store.ensure("https://dead.example/"), null);
  assert.equal(await store.ensure("https://dead.example/"), null);
  const [p] = store.attach([{ id: 1, content: "https://dead.example/" }]);
  assert.equal(p.preview, undefined);
  assert.equal(calls, 1);
});

test("concurrent ensures for the same URL share one fetch", async () => {
  let calls = 0;
  const store = createPreviewStore(freshDb(), async url => { calls++; await new Promise(r => setTimeout(r, 20)); return { url, title: "t", description: null, image: null, siteName: "s" }; });
  await Promise.all([store.ensure("https://a.example/"), store.ensure("https://a.example/"), store.ensure("https://a.example/")]);
  assert.equal(calls, 1);
});
