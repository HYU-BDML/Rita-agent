#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Rebuild the release dashboard from CSVs; never resets status or evidence columns."""
from pathlib import Path
import csv,json,html,re
from collections import Counter
D=Path(__file__).resolve().parents[1]/'docs/Cora_출시집중_2026-10-04'
def read(name):
    with (D/name).open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
scope=read('02_119개_출시범위.csv');tasks=read('03_실행백로그.csv');tests=read('04_출시시험표.csv')
assert len(scope)==119 and len({x['원장ID'] for x in scope})==119
assert len({x['ID'] for x in tasks})==len(tasks) and len({x['ID'] for x in tests})==len(tests)
counts=Counter(x['출시분류'] for x in scope)
latest_path=D/'증거/최근구현.json'
latest=json.loads(latest_path.read_text()) if latest_path.exists() else {}
data={'date':'2026-10-04','tasks':tasks,'tests':tests,'scope':scope,'latest':latest}
(D/'출시계획_데이터.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def fmt(x):
    v=html.escape(x)
    v=re.sub(r'`([^`]+)`',r'<code>\1</code>',v)
    return re.sub(r'\*\*([^*]+)\*\*',r'<strong>\1</strong>',v)
def md(text):
    lines=text.splitlines();out=[];i=0
    while i<len(lines):
        l=lines[i]
        if not l.strip():i+=1;continue
        if l.startswith('|') and i+1<len(lines) and re.match(r'^\|[\s:|\-]+\|$',lines[i+1]):
            cols=lambda s:[fmt(c.strip()) for c in s.strip().strip('|').split('|')]
            out.append('<div class="table-wrap"><table><thead><tr>'+''.join('<th>'+c+'</th>' for c in cols(l))+'</tr></thead><tbody>');i+=2
            while i<len(lines) and lines[i].startswith('|'):
                out.append('<tr>'+''.join('<td>'+c+'</td>' for c in cols(lines[i]))+'</tr>');i+=1
            out.append('</tbody></table></div>');continue
        h=re.match(r'^(#{1,4}) (.*)',l)
        if h:out.append(f'<h{len(h[1])}>{fmt(h[2])}</h{len(h[1])}>')
        elif l.startswith('- '):out.append('<p class="point">• '+fmt(l[2:])+'</p>')
        else:out.append('<p>'+fmt(l)+'</p>')
        i+=1
    return ''.join(out)
def table(rows,columns):
    return '<div class="table-wrap"><table class="filter-table"><thead><tr>'+''.join('<th>'+html.escape(c)+'</th>' for c in columns)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+fmt(str(r[c]))+'</td>' for c in columns)+'</tr>' for r in rows)+'</tbody></table></div>'
summary=' · '.join(f'{k} {v}' for k,v in counts.items())
page='''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Cora · 출시 집중 계획</title><style>
:root{color-scheme:light;--ink:#192d29;--green:#205b4a;--line:#d9e3dd;--paper:#fafbf7}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.8 system-ui,-apple-system,sans-serif}header,main{max-width:1240px;margin:auto;padding:32px}header{padding-top:48px}h1{font-size:clamp(28px,4vw,44px);letter-spacing:-1.5px;line-height:1.3}h2{margin-top:40px;line-height:1.4}h3{margin-top:26px}.eyebrow{font-weight:750;color:var(--green);letter-spacing:2px}.lead{font-size:21px;max-width:850px}.notice{border-left:4px solid #ae6a22;background:#fff4df;padding:16px 22px}.flow,.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0}.box{padding:20px;background:white;border:1px solid var(--line);border-radius:12px}.box b{display:block;font-size:22px;color:var(--green)}.box small{display:block;color:#53625c}.bar{position:sticky;top:0;background:#f1f5efee;backdrop-filter:blur(8px);padding:14px;z-index:2;border:1px solid var(--line);border-radius:12px;display:flex;gap:10px;flex-wrap:wrap}button,input{font:inherit;border:1px solid #9caf9f;border-radius:8px;padding:8px 12px;background:white;color:var(--ink)}button{cursor:pointer}button[aria-pressed=true]{color:white;background:var(--green)}input{min-width:100px;flex:1}.panel[hidden]{display:none}a{color:#145e49;text-underline-offset:3px}.table-wrap{overflow:auto;max-width:100%;margin:18px 0;border:1px solid var(--line);border-radius:10px}table{width:100%;border-collapse:collapse;background:white;font-size:14px;line-height:1.6}td,th{padding:13px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top;min-width:95px}th{background:#edf3ec}td:nth-child(4){min-width:180px}code{font-size:13px;overflow-wrap:anywhere;background:#eef1ed;padding:1px 4px}p{max-width:1000px;overflow-wrap:anywhere}.point{padding-left:10px}footer{padding:24px 0;color:#59695f}#searchStatus{font-size:14px;color:#4e6257}.muted{color:#637067}@media(max-width:650px){header,main{padding:20px}.flow,.stats{grid-template-columns:1fr 1fr}.box{padding:14px}.lead{font-size:18px}.bar{position:static}h2{font-size:23px}}@media print{body{background:white;font-size:11px}.bar,.tools{display:none}.panel[hidden]{display:block}.table-wrap{overflow:visible}header,main{padding:0}.panel{break-before:page}table{font-size:8px}td,th{min-width:0;padding:5px}h2{break-after:avoid}.box{break-inside:avoid}}
</style>
<header>
<div class="eyebrow">CORA · RELEASE PLAN / 2026.10.04</div>
<h1>기능을 모아둔 작업실에서<br>고객사가 승인하는 콘텐츠 운영으로.</h1>
<p class="lead">고객사별 맥락을 기억하고, 이번 주 콘텐츠를 승인받을 형태로 준비하며, 수정과 결과를 다음 제작에 반영합니다.</p>
<div class="notice">
<strong>__CURRENT_TITLE__</strong>
<br>__CURRENT_NOTE__</div>
<div class="flow">
<div class="box">
<b>01 고객사</b>자료·말투·시각규칙·권한</div>
<div class="box">
<b>02 이번 주 제작</b>소재 → 카드·캡션·광고</div>
<div class="box">
<b>03 검토·승인</b>수정 → 버전 → 승인본</div>
<div class="box">
<b>04 발행·성과</b>게시 → 관찰 → 다음 제작</div>
</div>
<div class="stats">
<div class="box">
<b>119</b>기존 목표 보존<small>__COUNTS__</small>
</div>
<div class="box">
<b>48</b>실행 작업<small>기능 완료 수가 아님</small>
</div>
<div class="box">
<b>65</b>출시 시험 시나리오<small>시험표의 실제 실행 기록 확인</small>
</div>
<div class="box">
<b>__REGRESSION__</b>현재 코드 회귀 통과<small>원본 DB 의존1개 제외</small>
</div>
</div>
</header>
<main>
<nav class="bar" aria-label="계획 보기">
<button data-panel="overview" aria-pressed="true">전체 계획</button>
<button data-panel="tasks" aria-pressed="false">실행 작업</button>
<button data-panel="tests" aria-pressed="false">출시 시험</button>
<button data-panel="scope" aria-pressed="false">119개 범위</button>
<input id="search" aria-label="표 검색" placeholder="작업·기능·시험 검색">
<button id="print">인쇄</button>
</nav>
<p id="searchStatus" aria-live="polite">
</p>
<section id="overview" class="panel">__PLAN__</section>
<section id="tasks" class="panel" hidden>
<h2>48개 실행 작업</h2>
<p>완료 기준과 의존성에 따라 수행합니다. 상태 변경은 CSV에 기록한 뒤 대시보드를 재생성합니다.</p>__TASKS__</section>
<section id="tests" class="panel" hidden>
<h2>65개 출시 시험</h2>
<p>단위/모의/실연결/사람 검수를 구분합니다. 기존 시험 통과가 아래 전 항목의 완료를 뜻하지 않습니다.</p>__TESTS__</section>
<section id="scope" class="panel" hidden>
<h2>119개 목표와 첫 출시 범위</h2>
<p>기존 원장 상태를 보존합니다. MVP 항목도 해당 기능의 축소 범위를 별도로 검증해야 합니다.</p>__SCOPE__</section>
<footer>
<a href="05_Claude_Codex_실행프롬프트.md">Claude·Codex 프롬프트</a> · <a href="07_보존목록.md">보존목록</a> · <a href="08_유경_10주_출시검수.md">유경의 10주</a> · <a href="증거/기준점.json">기준점 증거</a>
<p>이 계획은 성공 보장이나 공개 운영 승인이 아닙니다. 현장 결과에 따라 개선합니다.</p>
</footer>
</main>
<script>
const panels=[...document.querySelectorAll('.panel')];let active='overview';const search=document.querySelector('#search');function filter(){const q=search.value.trim().toLowerCase();let total=0,visible=0;document.querySelectorAll('#'+active+' .filter-table tbody tr').forEach(r=>{total++;r.hidden=!r.textContent.toLowerCase().includes(q);if(!r.hidden)visible++});document.querySelector('#searchStatus').textContent=total?visible+' / '+total+'행 표시':(q?'표 검색은 실행 작업·출시 시험·119개 범위 탭에서 사용할 수 있습니다.':'')};document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>{active=b.dataset.panel;panels.forEach(p=>p.hidden=p.id!==active);document.querySelectorAll('[data-panel]').forEach(x=>x.setAttribute('aria-pressed',x===b?'true':'false'));filter()}));search.addEventListener('input',filter);document.querySelector('#print').addEventListener('click',()=>window.print());window.addEventListener('beforeprint',()=>document.querySelectorAll('tbody tr').forEach(r=>r.hidden=false));window.addEventListener('afterprint',filter);
</script></html>'''
unit=latest.get('unit_tests',{'passed':496,'total':497})
page=page.replace('__CURRENT_TITLE__',html.escape(latest.get('title','계획 확정과 코드 기준점 검수')))
page=page.replace('__CURRENT_NOTE__',html.escape(latest.get('note','첫 출시 UI와 서버 차단은 미실행입니다. 기존 시험 통과를 출시 완료로 계산하지 않습니다.')))
page=page.replace('__REGRESSION__',f"{unit['passed']} / {unit['total']}")
page=page.replace('__COUNTS__',html.escape(summary)).replace('__PLAN__',md((D/'01_출시실행계획.md').read_text()))
page=page.replace('__TASKS__',table(tasks,['ID','단계','작업','선행','완료기준','시험','구현_제안담당','상태']))
page=page.replace('__TESTS__',table(tests,['ID','분야','준비','실행','기대결과','검증방식','상태']))
page=page.replace('__SCOPE__',table(scope,['원장ID','기능','출시분류','출시세부범위','기존상태_보존','출시판정']))
(D/'06_출시대시보드.html').write_text(page,encoding='utf-8')
print(json.dumps({'scope':dict(counts),'tasks':len(tasks),'tests':len(tests)},ensure_ascii=False))
