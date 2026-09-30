#!/usr/bin/env python3
"""Audit the 119-row feature ledger against the Mirr source list, evidence files and proof results.
Run from the Cora directory: python3 scripts/audit_ledger.py [proof_result_dir]
Checks: (1) all 109 Mirr IDs present with the same feature names, (2) every non-'미구현' row cites
evidence that exists, (3) cited proof JSON files report passed, (4) rows whose evidence is only a
generic placeholder are flagged. Prints a Markdown table; exit code 1 when a hard mismatch exists."""
import csv, json, re, sys
from pathlib import Path
D = Path('docs/Cora_집중구현_2026-09-30'); APP = Path('apps/trend-hub')
mirr = list(csv.DictReader(open('docs/Mirr_기능대장.csv', encoding='utf-8-sig')))
ledger = list(csv.DictReader(open(D / '기능별_개발원장.csv', encoding='utf-8-sig')))
by = {r['id']: r for r in ledger}
hard, soft = [], []
# 1. Mirr coverage
for m in mirr:
    r = by.get(m['ID'])
    if not r: hard.append((m['ID'], 'Mirr 기능이 원장에 없음', m['기능']))
    elif r['feature'].strip() != m['기능'].strip(): hard.append((m['ID'], '기능 이름 불일치', f"원장 {r['feature']} / Mirr {m['기능']}"))
if len(ledger) != 119: hard.append(('-', '원장 행 수 오류', str(len(ledger))))
# 2~4. Evidence
PLACEHOLDER = '부분 구현은 기존 Cora 브라우저 증거 참조'
rows = []
for r in ledger:
    st, ev = r['status'], r['evidence']
    docs = sorted(set(re.findall(r'(\d\d_[^\s;:,]+?\.md)', ev)))
    proofs = sorted(set(re.findall(r'검증기록/([\w.-]+\.json)', ev)))
    scripts = sorted(set(re.findall(r'(cora-[\w-]+\.mjs)', ev)))
    missing = [d for d in docs if not (D / d).exists()] + [p for p in proofs if not (D / '검증기록' / p).exists()] + [s for s in scripts if not (APP / 'scripts' / s).exists()]
    failed = []
    for p in proofs:
        f = D / '검증기록' / p
        if f.exists():
            try:
                v = json.load(open(f, encoding='utf-8'))
                if isinstance(v, dict) and v.get('passed') is False: failed.append(p)
            except Exception: failed.append(p + '(읽기 실패)')
    note = []
    if st != '미구현' and not ev.strip(): hard.append((r['id'], '증거 없음', st))
    if missing: hard.append((r['id'], '인용한 증거 파일 없음', ', '.join(missing)))
    if failed: hard.append((r['id'], '인용한 검수 결과가 실패', ', '.join(failed)))
    if PLACEHOLDER in ev and not docs and not proofs and not scripts: soft.append((r['id'], '구체 증거 없이 일반 문구만 있음', r['feature'])); note.append('일반 문구')
    if st == '브라우저 검증됨' and not (proofs or scripts): soft.append((r['id'], '브라우저 검증됨인데 검수 파일 인용 없음', r['feature']))
    rows.append((r['id'], r['priority'], r['feature'], st, len(docs) + len(proofs) + len(scripts), '·'.join(note)))
print(f"# 원장 점검\n\nMirr 원본 {len(mirr)}개, 원장 {len(ledger)}개(F {sum(1 for r in ledger if r['id'].startswith('F'))}, E {sum(1 for r in ledger if r['id'].startswith('E'))}).\n")
print('## 반드시 고칠 불일치\n'); print('\n'.join(f'- {a} {b}: {c}' for a, b, c in hard) or '- 없음')
print('\n## 증거가 약한 행\n'); print('\n'.join(f'- {a} {b}: {c}' for a, b, c in soft) or '- 없음')
from collections import Counter
print('\n## 상태 분포\n'); print(', '.join(f'{k} {v}' for k, v in Counter(r['status'] for r in ledger).items()))
sys.exit(1 if hard else 0)
