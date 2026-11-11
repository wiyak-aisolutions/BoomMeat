#!/bin/sh
# Builds boom-erp-site.zip: only the files the website needs (no server code, no README).
cd "$(dirname "$0")" && rm -f boom-erp-site.zip && zip -q boom-erp-site.zip index.html styles.css config.js i18n.js wiyak-dark.png wiyak-light.png engine.js app.js pages-ops.js pages-fin.js pages-setup.js boom-logo.png favicon.png icon-192.png icon-512.png apple-touch-icon.png manifest.json && echo "boom-erp-site.zip ready"
