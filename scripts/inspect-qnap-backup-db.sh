#!/bin/sh
set -eu
printf '===HBS_DATABASE_NAMES===\n'
find /etc/config/cloudconnector /share/CACHEDEV1_DATA/.qpkg/HybridBackup/CloudConnector3/data -maxdepth 3 -type f -print | head -n 70
printf '===HBS_DATABASE_SCHEMA===\n'
/share/CACHEDEV1_DATA/.qpkg/HybridBackup/python/bin/python3 - <<'PY'
from pathlib import Path
import sqlite3,json
for root in ['/etc/config/cloudconnector','/share/CACHEDEV1_DATA/.qpkg/HybridBackup/CloudConnector3/data']:
 for p in Path(root).rglob('*.db'):
  if len(p.relative_to(root).parts)>4:continue
  try:
   c=sqlite3.connect(p.as_uri()+'?mode=ro',uri=True,timeout=2)
   tables=[r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")]
   print(json.dumps({'file':str(p),'tables':tables}))
   for t in tables:
    if any(x in t.lower() for x in ['job','history','log','task','run','backup','schedule']):
     print(json.dumps({'table':t,'columns':[r[1] for r in c.execute('PRAGMA table_info("'+t.replace('"','""')+'")')]}))
   c.close()
  except:print(json.dumps({'file':str(p),'readable':False}))
PY
printf '===QTS_SNAPSHOT_READ===\n'
/sbin/qcli_volumesnapshot -l volumeID=1 2>&1 | head -n 12 || true
printf '===UPS_UNPRIVILEGED_ALLOWED_NEXT===\n'
printf 'done\n'
