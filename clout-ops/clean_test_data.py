"""Remove QA test artifacts (posts and throwaway wallets) from the live Clout DB.
Keeps: itachi_r3birth's real posts, AI influencers, any user with a handle other than testrunner99.
Dry-run by default; pass --apply after a backup."""
import sqlite3, sys
DB = "/opt/hermes/projects/clout/clout-backend/clout.db"
KEEP_ADDR = {"0xe1df0cb3cf0dbebc9c8067702ac5dd7d1c92fcf3"}  # itachi_r3birth
TEST_PATTERNS = ["e2e%", "E2E%", "live production post from itachi's headless QA", "Clout social action verification post",
                 "action probe", "notif-test-%", "e2e-tip-test-%"]
db = sqlite3.connect(DB)
db.execute("PRAGMA foreign_keys=OFF")
where = " OR ".join(["content LIKE ?"] * len(TEST_PATTERNS))
posts = [r[0] for r in db.execute(f"SELECT id FROM posts WHERE ({where})", TEST_PATTERNS)]
# throwaway wallets: no handle (or testrunner99), not automated, not the owner, and no remaining real posts
cands = [r[0] for r in db.execute(
    "SELECT address FROM users WHERE account_type != 'automated' AND (handle IS NULL OR handle = 'testrunner99')")]
users = []
for a in cands:
    if a in KEEP_ADDR: continue
    real = db.execute(f"SELECT COUNT(*) FROM posts WHERE author = ? AND NOT ({where})", [a, *TEST_PATTERNS]).fetchone()[0]
    if real == 0: users.append(a)
print("test posts:", posts)
print("throwaway users:", len(users))
if "--apply" in sys.argv:
    q = lambda xs: ",".join("?" * len(xs))
    with db:
        if posts:
            for t in ["comments", "likes", "reposts", "post_topics"]:
                db.execute(f"DELETE FROM {t} WHERE post_id IN ({q(posts)})", posts)
            db.execute(f"DELETE FROM notifications WHERE post_id IN ({q(posts)})", posts)
            db.execute(f"DELETE FROM posts WHERE id IN ({q(posts)})", posts)
        if users:
            db.execute(f"DELETE FROM notifications WHERE actor IN ({q(users)}) OR recipient IN ({q(users)})", users + users)
            db.execute(f"DELETE FROM follows WHERE follower IN ({q(users)}) OR followee IN ({q(users)})", users + users)
            for t, c in [("likes","liker"),("reposts","reposter"),("comments","author"),("topic_affinities","viewer"),("author_affinities","viewer")]:
                db.execute(f"DELETE FROM {t} WHERE {c} IN ({q(users)})", users)
            db.execute(f"DELETE FROM users WHERE address IN ({q(users)})", users)
        # recompute counts so nothing is left pointing at deleted rows
        db.execute("UPDATE posts SET like_count = (SELECT COUNT(*) FROM likes l WHERE l.post_id = posts.id), repost_count = (SELECT COUNT(*) FROM reposts r WHERE r.post_id = posts.id)")
    print("applied. remaining posts:", db.execute("SELECT COUNT(*) FROM posts").fetchone()[0],
          "users:", db.execute("SELECT COUNT(*) FROM users").fetchone()[0])
