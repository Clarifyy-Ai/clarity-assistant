#!/bin/bash
set -e

# Post-merge setup script — runs automatically after any task branch merges.
# Must be: idempotent, non-interactive (stdin is /dev/null), and fast.

echo "[post-merge] Installing dependencies..."
npm install --prefer-offline

echo "[post-merge] Done."
