/**
 * Link preview cache: unfurl once per URL, store it, attach it to posts on read.
 * Failed unfurls are cached too (ok=0) so a dead link is not re-fetched on every post.
 */
const { firstUrl, fetchPreview } = require("./link-preview");

const RETRY_FAILED_AFTER = 6 * 3600;   // re-try a failed URL after 6h
const REFRESH_OK_AFTER = 7 * 86400;    // refresh a good preview weekly
const inflight = new Map();

function createPreviewStore(db, fetcher = fetchPreview) {
  const getRow = db.prepare("SELECT * FROM link_previews WHERE url = ?");
  const upsert = db.prepare(`INSERT INTO link_previews (url, title, description, image, site_name, ok, fetched_at)
    VALUES (@url, @title, @description, @image, @site_name, @ok, unixepoch())
    ON CONFLICT(url) DO UPDATE SET title=excluded.title, description=excluded.description, image=excluded.image,
      site_name=excluded.site_name, ok=excluded.ok, fetched_at=excluded.fetched_at`);

  function fresh(row) {
    if (!row) return false;
    const age = Math.floor(Date.now() / 1000) - Number(row.fetched_at || 0);
    return row.ok ? age < REFRESH_OK_AFTER : age < RETRY_FAILED_AFTER;
  }

  /** Unfurl a URL at most once at a time; never throws. */
  async function ensure(url) {
    if (!url) return null;
    const row = getRow.get(url);
    if (fresh(row)) return row.ok ? row : null;
    if (inflight.has(url)) return inflight.get(url);
    const job = (async () => {
      try {
        const p = await fetcher(url);
        upsert.run({ url, title: p.title, description: p.description, image: p.image, site_name: p.siteName, ok: 1 });
      } catch {
        upsert.run({ url, title: null, description: null, image: null, site_name: null, ok: 0 });
      } finally {
        inflight.delete(url);
      }
      const r = getRow.get(url);
      return r && r.ok ? r : null;
    })();
    inflight.set(url, job);
    return job;
  }

  /** Attach cached previews to posts. Missing ones are fetched in the background for next time. */
  function attach(posts) {
    return posts.map(p => {
      const url = firstUrl(p.content);
      if (!url) return p;
      const row = getRow.get(url);
      if (!fresh(row)) ensure(url);
      if (!row || !row.ok) return p;
      return { ...p, preview: { url, title: row.title, description: row.description, image: row.image, siteName: row.site_name } };
    });
  }

  return { ensure, attach };
}

module.exports = { createPreviewStore };
