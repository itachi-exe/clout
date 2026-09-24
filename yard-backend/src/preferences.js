function preferenceDelta(kind, removing = false) {
  const amount = kind === "repost" ? 3 : 1;
  return removing ? -amount : amount;
}

module.exports = { preferenceDelta };
