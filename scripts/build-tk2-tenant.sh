#!/usr/bin/env bash
# Builds TrustKeeper 2's tenant web app (unchanged TK2 code, demo mode) into public/t/
# and plugs in the desk bridge. Needs Flutter 3.38.6 (TK2's .fvmrc) and a clone of
# desicode-blip/trustkeyper-flutter. Usage: scripts/build-tk2-tenant.sh /path/to/trustkeyper-flutter [branch]
set -euo pipefail
repo="$1"; branch="${2:-staging}"; desk="$(cd "$(dirname "$0")/.." && pwd)"; tmp="$(mktemp -d)"
git -C "$repo" archive "$branch" | tar -x -C "$tmp"
( cd "$tmp/apps/flutter_app" && flutter pub get && flutter build web -t lib/main_tk2_web.dart --release --no-web-resources-cdn --pwa-strategy=none --base-href=/t/ -o build/tk2_web )
rm -rf "$desk/public/t" && cp -r "$tmp/apps/flutter_app/build/tk2_web" "$desk/public/t"
python3 - "$desk/public/t/index.html" <<'PY'
import sys;p=sys.argv[1];h=open(p).read()
inj="""<script>(function(){var s=new URLSearchParams(location.search).get('s');if(!s)return;var f=document.createElement('iframe');f.src='/t-bridge.html?s='+encodeURIComponent(s);f.hidden=true;f.style.display='none';(document.body||document.documentElement).appendChild(f);})();</script>\n</body>"""
open(p,'w').write(h.replace('</body>',inj,1))
PY
echo "Built TK2 tenant app into public/t (from $branch)"
