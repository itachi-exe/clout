const TOPIC_RULES = [
  ["payments", /\b(payment|payments|checkout|merchant|invoice|settle|settlement|payout)\b/i],
  ["stablecoins", /\b(usdc|stablecoin|stablecoins|native gas)\b/i],
  ["identity", /\b(identity|identitys|credential|credentials|attestation|attestations|verified)\b/i],
  ["social", /\b(social|community|communities|creator|creators|conversation|conversations|feed)\b/i],
  ["privacy", /\b(privacy|private|zk|zero knowledge|encryption)\b/i],
  ["governance", /\b(governance|proposal|proposals|vote|voting|delegate|delegation)\b/i],
  ["builders", /\b(build|builder|builders|shipped|shipping|launch|launched|prototype|protocol)\b/i],
  ["cross-chain", /\b(cross.chain|bridge|bridging|interoperab|multi.chain)\b/i],
];

function inferTopics(content) {
  const text = String(content || "");
  return TOPIC_RULES.filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic);
}

function freshness(createdAt, now) {
  const ageHours = Math.max(0, (now - Number(createdAt || now)) / 3600);
  return Math.max(0, 18 - ageHours * 1.5);
}

function rankingReason({ followed, matchedTopics, authorWeight, discoveryTopic }) {
  if (discoveryTopic) return `Discovering ${discoveryTopic}`;
  if (followed) return "Following";
  if (matchedTopics.length) return `Because you engage with ${matchedTopics[0]}`;
  if (authorWeight > 0) return "From a builder you return to";
  return "Moving in the Yard";
}

function rankPosts(posts, options = {}) {
  const now = Number(options.now || Math.floor(Date.now() / 1000));
  const follows = options.follows || new Set();
  const topicWeights = options.topicWeights || new Map();
  const authorWeights = options.authorWeights || new Map();
  const discoverySlots = Math.max(0, Number(options.discoverySlots || 0));

  const scored = posts.map(post => {
    const topics = Array.isArray(post.topics) ? post.topics : inferTopics(post.content);
    const matchedTopics = topics.filter(topic => (topicWeights.get(topic) || 0) > 0);
    const followed = follows.has(post.author);
    const authorWeight = Number(authorWeights.get(post.author) || 0);
    const engagement = Math.min(12, Number(post.like_count || 0) * 0.45 + Number(post.repost_count || 0) * 1.2);
    const score = freshness(post.created_at, now) + engagement + (followed ? 24 : 0) + authorWeight * 2 + matchedTopics.reduce((sum, topic) => sum + Number(topicWeights.get(topic) || 0), 0);
    return { ...post, topics, score, reason: rankingReason({ followed, matchedTopics, authorWeight }) };
  });

  scored.sort((a, b) => b.score - a.score || b.created_at - a.created_at || b.id - a.id);
  if (!discoverySlots || scored.length < 2) return scored;

  const preferredTopics = new Set([...topicWeights.keys()].filter(topic => topicWeights.get(topic) > 0));
  const discovery = scored
    .filter(post => post.topics.some(topic => !preferredTopics.has(topic)))
    .sort((a, b) => freshness(b.created_at, now) - freshness(a.created_at, now) || b.score - a.score)
    .slice(0, discoverySlots)
    .map(post => ({ ...post, reason: rankingReason({ discoveryTopic: post.topics.find(topic => !preferredTopics.has(topic)) }) }));
  const discoveryIds = new Set(discovery.map(post => post.id));
  const personal = scored.filter(post => !discoveryIds.has(post.id));
  const insertionPoint = Math.min(2, personal.length);
  return [...personal.slice(0, insertionPoint), ...discovery, ...personal.slice(insertionPoint)];
}

module.exports = { inferTopics, rankPosts };
