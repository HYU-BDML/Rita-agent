#!/usr/bin/env python3
"""Apply status/evidence updates to the 119-feature ledger and keep CSV, JSON and HTML rows in sync.
Usage: python3 scripts/sync_ledger.py updates.json   (list of {id,status?,evidence?,append?:bool})
Run from the Cora directory. Never adds or removes ledger rows."""
import csv,json,re,sys,html
from pathlib import Path
D=Path('docs/Cora_집중구현_2026-09-30');CSV=D/'기능별_개발원장.csv';JS=D/'기능별_개발원장.json';HT=D/'01_개발현황.html'
STATUSES={'미구현','부분 구현','부분 검증','브라우저 검증됨'}
updates=json.load(open(sys.argv[1],encoding='utf-8')) if len(sys.argv)>1 else []
raw=open(CSV,encoding='utf-8-sig').read();rows=list(csv.DictReader(raw.splitlines()));fields=list(rows[0].keys())
by={r['id']:r for r in rows};assert len(rows)==119,len(rows)
for u in updates:
    r=by[u['id']]
    if 'status' in u:assert u['status'] in STATUSES,u;r['status']=u['status']
    if 'evidence' in u:r['evidence']=(r['evidence']+'; ' if u.get('append') and r['evidence'] else '')+u['evidence']
with open(CSV,'w',encoding='utf-8-sig',newline='') as f:w=csv.DictWriter(f,fields,lineterminator='\n');w.writeheader();w.writerows(rows)
open(JS,'w',encoding='utf-8').write(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
h=open(HT,encoding='utf-8').read();n=0
for r in rows:
    new=f"<tr><td>{r['id']}</td><td>{r['priority']}</td><td>{r['batch']}</td><td>{html.escape(r['feature'])}</td><td>{r['status']}</td><td>{html.escape(r['evidence'])}</td></tr>"
    h,k=re.subn(r"<tr><td>"+re.escape(r['id'])+r"</td>.*?</tr>",lambda m:new,h,count=1);n+=k
open(HT,'w',encoding='utf-8').write(h)
from collections import Counter;print('rows',len(rows),'html rows updated',n,Counter(r['status'] for r in rows))
