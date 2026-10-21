#!/usr/bin/env bash
# Links frontend/node_modules from primary repo to target worktree
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <target-worktree-path>"
  exit 1
fi

TARGET_DIR="$1/frontend/node_modules"
SOURCE_DIR="$(cd "$(dirname "$0")/../frontend/node_modules" && pwd)"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Source node_modules not found at $SOURCE_DIR. Run npm install in primary frontend first."
  exit 1
fi

if [ -e "$TARGET_DIR" ]; then
  echo "Target node_modules already exists at $TARGET_DIR."
  exit 0
fi

if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  cmd //c "mklink /J \"$(cygpath -w "$TARGET_DIR")\" \"$(cygpath -w "$SOURCE_DIR")\""
else
  ln -s "$SOURCE_DIR" "$TARGET_DIR"
fi

echo "Successfully linked node_modules to $TARGET_DIR."
