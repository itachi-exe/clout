const test = require("node:test");
const assert = require("node:assert/strict");
const { inferTopics, rankPosts } = require("../src/feed");

const now = 1_800_000_000;
const viewer = "0xviewer";

test("inferTopics identifies Arc-native themes without inventing unrelated tags", () => {
  assert.deepEqual(
    inferTopics("Native USDC checkout removes the hidden payment step."),
    ["payments", "stablecoins"]
  );
  assert.deepEqual(inferTopics("A quiet note about lunch."), []);
});

test("rankPosts puts a followed creator with an affinity topic ahead of equally fresh posts", () => {
  const posts = [
    { id: 1, author: "0xclose", content: "Native USDC checkout is ready.", created_at: now - 180, like_count: 2, repost_count: 1 },
    { id: 2, author: "0xother", content: "A governance proposal is live.", created_at: now - 180, like_count: 2, repost_count: 1 },
  ];
  const ranked = rankPosts(posts, {
    now,
    viewer,
    follows: new Set(["0xclose"]),
    topicWeights: new Map([["payments", 6], ["stablecoins", 6]]),
    authorWeights: new Map([["0xclose", 3]]),
  });

  assert.equal(ranked[0].id, 1);
  assert.match(ranked[0].reason, /Following|payments/);
});

test("rankPosts keeps an unexplored Arc topic in the home feed as discovery", () => {
  const posts = [
    { id: 1, author: "0xa", content: "USDC checkout is live.", created_at: now - 60, like_count: 10, repost_count: 5 },
    { id: 2, author: "0xb", content: "A governance proposal is live.", created_at: now - 60, like_count: 0, repost_count: 0 },
  ];
  const ranked = rankPosts(posts, {
    now,
    viewer,
    follows: new Set(),
    topicWeights: new Map([["payments", 10], ["stablecoins", 10]]),
    authorWeights: new Map(),
    discoverySlots: 1,
  });

  assert.equal(ranked.length, 2);
  assert.equal(ranked.some(post => post.id === 2 && post.reason === "Discovering governance"), true);
});
