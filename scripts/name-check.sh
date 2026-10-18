#!/usr/bin/env bash
# Fails if the name or domain of the product Traureise is modelled on appears in tracked files,
# commit messages, branch names, or the GitHub issue/PR texts. The terms are read at runtime from
# .secrets/reference.env (never committed) so this script itself stays clean.
#
# Usage: scripts/name-check.sh [--staged] [--message-file FILE] [--no-github]
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

env_file=".secrets/reference.env"
if [[ ! -f "$env_file" ]]; then
  echo "name-check: $env_file not found; nothing to check against." >&2
  exit 0
fi
name=$(grep -E '^REFERENCE_NAME=' "$env_file" | cut -d= -f2- | tr -d '"'"'"' \r')
url=$(grep -E '^REFERENCE_URL=' "$env_file" | cut -d= -f2- | tr -d '"'"'"' \r')
domain=$(printf '%s' "$url" | sed -E 's#^[a-z]+://##; s#/.*$##; s#^www\.##')
patterns=(-e "$name")
[[ -n "$domain" ]] && patterns+=(-e "$domain")

staged=0; msg_file=""; github=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --staged) staged=1 ;;
    --message-file) msg_file="$2"; shift ;;
    --no-github) github=0 ;;
  esac
  shift
done

fail=0
report() { echo "name-check: found reference term in $1" >&2; fail=1; }

if [[ -n "$msg_file" ]]; then
  grep -qiF "${patterns[1]}" "$msg_file" && report "commit message"
  [[ -n "$domain" ]] && grep -qiF "$domain" "$msg_file" && report "commit message"
  exit $fail
fi

if [[ $staged -eq 1 ]]; then
  git grep --cached -qiF "${patterns[@]}" && report "staged files: $(git grep --cached -liF "${patterns[@]}" | tr '\n' ' ')"
  exit $fail
fi

git grep -qiF "${patterns[@]}" && report "tracked files: $(git grep -liF "${patterns[@]}" | tr '\n' ' ')"
git log --all --format=%B | grep -qiF "${patterns[@]}" && report "commit messages"
git for-each-ref --format='%(refname)' | grep -qiF "${patterns[@]}" && report "branch names"

if [[ $github -eq 1 ]] && command -v gh >/dev/null; then
  gh issue list --state all --limit 100 --json title,body --jq '.[] | .title + "\n" + .body' | grep -qiF "${patterns[@]}" && report "GitHub issues"
  gh pr list --state all --limit 100 --json title,body,headRefName --jq '.[] | .title + "\n" + .body + "\n" + .headRefName' | grep -qiF "${patterns[@]}" && report "GitHub pull requests"
fi

if [[ $fail -eq 0 ]]; then echo "name-check: clean"; fi
exit $fail
