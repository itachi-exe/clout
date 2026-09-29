function validateComment(content) {
  const text = String(content || "").trim();
  if (!text) throw new Error("content required");
  if (text.length > 840) throw new Error("content too long (max 840 chars)");
  return text;
}

module.exports = { validateComment };
