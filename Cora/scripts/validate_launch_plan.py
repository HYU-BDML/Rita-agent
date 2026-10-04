#!/usr/bin/env python3
"""Validate release planning references without claiming product acceptance tests pass."""
from pathlib import Path
import csv,json,re,hashlib
C=Path(__file__).resolve().parents[1];D=C/'docs/Cora_출시집중_2026-10-04'
def read(path):
    with path.open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
ledger_path=C/'docs/Cora_집중구현_2026-09-30/기능별_개발원장.csv'
legacy=read(ledger_path);scope=read(D/'02_119개_출시범위.csv');tasks=read(D/'03_실행백로그.csv');tests=read(D/'04_출시시험표.csv')
base=json.loads((D/'증거/기준점.json').read_text());by={r['id']:r for r in legacy}
assert len(scope)==119 and set(by)=={r['원장ID'] for r in scope}
for x in scope:
    src=by[x['원장ID']]
    assert x['기능']==src['feature'] and x['기존상태_보존']==src['status'] and x['기존증거_보존']==src['evidence']
# Scope snapshots are refreshed intentionally if the long-term ledger evolves; no silent completion.
assert hashlib.sha256(ledger_path.read_bytes()).hexdigest()==base['existing_ledger_sha256'],'Ledger changed: review scope snapshot intentionally'
taskids={x['ID'] for x in tasks};testids={x['ID'] for x in tests}
assert len(taskids)==len(tasks) and len(testids)==len(tests)
deps={x['ID']:re.findall(r'L\d+',x['선행']) for x in tasks}
for t in tasks:
    assert set(deps[t['ID']])<=taskids
    assert set(re.findall(r'T\d+',t['시험']))<=testids
seen=set();visiting=set()
def visit(n):
    assert n not in visiting,'Dependency cycle '+n
    if n in seen:return
    visiting.add(n)
    for p in deps[n]:visit(p)
    visiting.remove(n);seen.add(n)
for n in taskids:visit(n)
used=set(re.findall(r'T\d+',' '.join(x['시험'] for x in tasks)))
assert testids<=used,'Orphan tests '+str(testids-used)
data=json.loads((D/'출시계획_데이터.json').read_text())
assert data['scope']==scope and data['tasks']==tasks and data['tests']==tests,'Run render_launch_dashboard.py'
for f in ['00_읽는순서.md','01_출시실행계획.md','05_Claude_Codex_실행프롬프트.md','06_출시대시보드.html','07_보존목록.md','08_유경_10주_출시검수.md']:assert (D/f).is_file()
print(json.dumps({'passed':True,'scope':len(scope),'tasks':len(tasks),'tests':len(tests),'ledger_unchanged':True,'dependency_graph':'acyclic','product_acceptance':'not run by this script'},ensure_ascii=False))
