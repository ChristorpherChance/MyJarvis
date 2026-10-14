#!/bin/sh
set -eu
/share/CACHEDEV1_DATA/.qpkg/HybridBackup/python/bin/python3 - <<'PY'
import sqlite3,json,re
c=sqlite3.connect('file:/etc/config/cloudconnector/CloudConnector3/config.db?mode=ro',uri=True)
safe={'name','job_name','job_type','type','enabled','status','state','last_result','last_run','last_run_time','last_finished_time','last_execution_time','next_run_time','running','schedule','frequency','start_time','finish_time','end_time','result','progress','percent','job_id','uuid','id','last_status','run_status','sync_status','last_run_status','last_run_result'}
def shape(v,path='',level=0):
 if level>4:return
 if isinstance(v,dict):
  for k,x in v.items():
   p=path+'.'+k
   if re.search('password|token|secret|credential|auth|account',k,re.I):continue
   if isinstance(x,(dict,list)):
    print(json.dumps({'path':p,'type':type(x).__name__,'count':len(x)}));shape(x,p,level+1)
   elif k in safe:print(json.dumps({'path':p,'value':x}))
   else:print(json.dumps({'path':p,'type':type(x).__name__}))
 elif isinstance(v,list):
  for x in v[:1]:shape(x,path+'[]',level+1)
for key,value in c.execute('SELECT key,value FROM jobs LIMIT 20'):
 print(json.dumps({'jobKey':key}))
 try:shape(json.loads(value))
 except:print('unparsed')
c.close()
PY
