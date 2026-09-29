/**
 * Attach per-viewer interaction state to posts so the UI can render a liked or
 * reposted post correctly on first paint, instead of guessing and drifting.
 * `state` is { liked: Set<postId>, reposted: Set<postId> } or null for anonymous viewers.
 */
function annotateViewerState(posts, state) {
  const liked = state && state.liked ? state.liked : new Set();
  const reposted = state && state.reposted ? state.reposted : new Set();
  return posts.map(post => ({
    ...post,
    viewer_liked: liked.has(post.id),
    viewer_reposted: reposted.has(post.id),
  }));
}

function loadViewerState(db, viewer) {
  if (!viewer) return null;
  return {
    liked: new Set(db.prepare("SELECT post_id FROM likes WHERE liker = ?").all(viewer).map(r => r.post_id)),
    reposted: new Set(db.prepare("SELECT post_id FROM reposts WHERE reposter = ?").all(viewer).map(r => r.post_id)),
  };
}

module.exports = { annotateViewerState, loadViewerState };
