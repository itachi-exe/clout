const test = require("node:test");
const assert = require("node:assert/strict");
const { annotateViewerState } = require("../src/viewer-state");

test("annotateViewerState marks exactly the posts the viewer liked and reposted", () => {
  const posts = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const out = annotateViewerState(posts, { liked: new Set([2]), reposted: new Set([3]) });
  assert.deepEqual(out.map(p => [p.id, p.viewer_liked, p.viewer_reposted]), [
    [1, false, false],
    [2, true, false],
    [3, false, true],
  ]);
});

test("annotateViewerState leaves anonymous viewers with everything false", () => {
  const out = annotateViewerState([{ id: 7 }], null);
  assert.equal(out[0].viewer_liked, false);
  assert.equal(out[0].viewer_reposted, false);
});
