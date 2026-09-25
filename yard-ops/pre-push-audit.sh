#!/usr/bin/env bash
# Pre-push audit: prove no secret, key, env file or database is staged. Exit 1 on any hit.
set -uo pipefail
cd /opt/hermes/projects/arcyard
fail=0

echo "== 1. sensitive files that must be ignored"
for f in yard-backend/.env yard-contracts/.env yard-contracts/keys/deployer.env yard-contracts/keys/deployer-BACKUP.txt \
         yard-contracts/keys/treasury.env yard-contracts/keys/mainnet-treasury.env yard-backend/arcyard.db \
         yard-backend/arcyard.db-wal yard-backend/backups yard-backend/.vercel yard-frontend/.vercel yard-backend/node_modules; do
  if git check-ignore -q "$f"; then echo "  ignored  $f"; else echo "  !! NOT IGNORED  $f"; fail=1; fi
done

echo "== 2. staged paths that look sensitive"
bad_paths=$(git diff --cached --name-only | grep -Ei '(^|/)\.env($|\.)|/keys/|\.db($|-)|\.pem$|\.key$|backup|secret|\.vercel/' | grep -v '\.env\.example$')
if [ -n "$bad_paths" ]; then echo "$bad_paths" | sed 's/^/  !! /'; fail=1; else echo "  none"; fi

echo "== 3. staged content that looks like a secret"
# 64-hex private keys, PEM blocks, known token prefixes, and any value from the real .env files
patterns='(0x)?[0-9a-fA-F]{64}\b|-----BEGIN [A-Z ]*PRIVATE KEY|ghp_[A-Za-z0-9]{30,}|github_pat_|xox[baprs]-|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}'
hits=$(git grep --cached -nIE "$patterns" -- . ':!**/package-lock.json' ':!yard-contracts/deployments/*' ':!yard-ops/pre-push-audit.sh' ':!yard-frontend/public/wc.js' 2>/dev/null \
       | grep -vE 'txHash|tx_hash|content_hash|blockHash|"hash"|keccak|0x" \+ "11"\.repeat' || true)
for envf in yard-backend/.env yard-contracts/.env yard-contracts/keys/*.env; do
  [ -f "$envf" ] || continue
  while IFS='=' read -r k v; do
    v="${v%\"}"; v="${v#\"}"
    [ ${#v} -ge 16 ] || continue
    case "$k" in *ADDRESS*|*RPC*|*BLOCK*|PORT) continue;; esac
    if git grep --cached -qF -- "$v" 2>/dev/null; then hits="$hits
  !! value of $k from $envf appears in a staged file"; fi
  done < <(grep -E '^[A-Z0-9_]+=' "$envf")
done
if [ -n "$(echo "$hits" | tr -d '[:space:]')" ]; then echo "$hits" | sed 's/^/  /'; fail=1; else echo "  none"; fi

echo "== 4. size"
echo "  files staged: $(git diff --cached --name-only | wc -l)"
big=$(git diff --cached --name-only | while read -r f; do [ -f "$f" ] && s=$(stat -c %s "$f") && [ "$s" -gt 2000000 ] && echo "$f $((s/1024))KB"; done)
[ -n "$big" ] && echo "  large files:" && echo "$big" | sed 's/^/    /'

echo
if [ "$fail" -eq 0 ]; then echo "CLEAN: safe to push"; else echo "BLOCKED: fix the items marked !!"; fi
exit $fail
