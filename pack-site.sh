#!/bin/sh
# Builds boom-erp-site.zip: only the files the website needs (no server code, no README).
# The Excel export code (supabase/functions/_shared/backup.mjs) is bundled into app.js, so the site never needs a nested folder.
cd "$(dirname "$0")" && rm -f boom-erp-site.zip && T=$(mktemp -d) && cp index.html styles.css config.js i18n.js wiyak-dark.png wiyak-light.png engine.js app.js pages-ops.js pages-fin.js pages-setup.js boom-logo.png favicon.png icon-192.png icon-512.png apple-touch-icon.png manifest.json "$T/" \
  && { printf '\n/* bundled from supabase/functions/_shared/backup.mjs */\n(() => {\n'; sed -e 's/^export function /function /' -e 's/^export const /const /' supabase/functions/_shared/backup.mjs; printf '\nwindow.BOOM_BACKUP = { backupSheets, backupDue };\n})();\n'; } >> "$T/app.js" \
  && (cd "$T" && zip -q "$OLDPWD/boom-erp-site.zip" *) && rm -rf "$T" && echo "boom-erp-site.zip ready"
