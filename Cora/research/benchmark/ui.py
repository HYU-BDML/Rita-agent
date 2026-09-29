from pathlib import Path
import json,html
O=Path('outputs/콘텐츠플랫폼_벤치마크');rows=json.loads((O/'벤치마크_32개.json').read_text())
extra='''
## 11. 첫 고객에 대한 판단과 이유

**첫 고객 추천은 2~10명 규모로 여러 브랜드의 SNS 콘텐츠를 월 단위로 납품하는 대행사다.** 인원 범위는 시장 조사로 확정한 통계가 아니라 모집 범위를 좁히기 위한 가설이다. 고객이 3~15개인 팀을 우선 인터뷰해 반복 업무의 양과 복잡도를 확인한다. 광고비 집행·입찰·매체 구매를 주로 하는 회사는 첫 고객에서 제외한다.

### 왜 이 고객부터인가

1. **이미 가진 기술과 해결할 일이 맞는다.** 트렌드 레이더, 원고 생성, 카드뉴스 렌더는 주기적으로 SNS 콘텐츠를 납품하는 과정의 앞부분이다. 전문 영상 도구를 처음부터 완성하지 않아도 소재 선정→카드뉴스→수정→승인→납품을 끝낼 수 있다.
2. **한 번 만든 기준을 반복해서 쓸 이유가 강하다.** 고객마다 말투·금지 표현·로고·선호 디자인이 다르며 같은 고객은 다음 달에도 돌아온다. 이 기준과 수정 이유를 저장하면 다음 작업이 편해질 수 있다. 이것이 프롬프트 입력창만 제공하는 도구와 다른 가치다.
3. **생성과 별개인 문제가 있다.** 고객에게 잘못된 버전을 보내거나 승인된 문구가 나중에 바뀌는 문제는 더 좋은 이미지 모델만으로 해결되지 않는다. Planable의 단계별 승인과 ContentStudio의 고객 공간은 이 업무를 다루는 확인 가능한 제품 사례다. 이것이 해당 문제가 모든 한국 대행사에서 가장 크다는 증거는 아니므로 인터뷰로 우선순위를 검증한다.
4. **편의의 효과를 측정하기 쉽다.** 게시물 하나의 작업 시간, 수정 왕복 횟수, 승인 대기 시간, 납품 오류, 최종 채택률을 비교할 수 있다. 알고리즘에 영향을 받는 조회수만으로 제품 가치를 설명할 필요가 없다.
5. **한 팀 안에서 반복 검증이 가능하다.** 여러 고객 브랜드를 다루므로 한 사용자에게서도 서로 다른 템플릿·주제·승인 요구를 관찰할 수 있다. 반면 한 고객의 취향을 모든 고객에게 적용하는 과적합을 피하려고 브랜드별 데이터를 분리해야 한다.
6. **지불 이유를 설명할 수 있는 가설이다.** 담당자의 반복 작업과 관리 가능한 고객 수에 영향을 주면 업무 도구 예산으로 검토될 여지가 있다. 실제 매출·마진 개선이나 구매 의사는 아직 확인하지 않았다. 생성 횟수보다 채택된 납품물당 총비용과 줄어든 시간을 함께 보여 주는 것이 맞다.

### 왜 크리에이터와 브랜드팀은 다음인가

|기준|SNS 콘텐츠 대행사|개인·소규모 크리에이터|브랜드 사내팀|
|---|---|---|---|
|현재 자산과의 적합성|카드뉴스·소재 수집을 바로 연결 가능|영상 중심이면 추가 개발이 큼|카드뉴스·제품 소개는 적합|
|반복되는 기준|여러 고객의 고정 브랜드 기준|개인 스타일이 강하고 형식 편차 큼|제품 사실·브랜드 기준이 강함|
|먼저 줄일 비용|수정·승인·납품 관리|편집·아이디어 선정|기획·내부 검토·반복 제작|
|초기 제품 부담|권한·고객 분리·버전 승인 필요|영상 편집 품질과 사용 편의 경쟁|회사마다 승인·자료·보안 요구가 다를 수 있음|
|구매 가설|팀 업무 개선으로 검토 가능|개인 예산과 성장 기대에 좌우될 수 있음|명확한 담당자가 있으면 좋은 초기 고객 가능|
|검증 방식|같은 고객의 전후 납품 작업 비교|같은 원본의 편집·채택률 비교|같은 캠페인의 제작·승인 시간 비교|

브랜드팀이 항상 판매하기 어렵거나 크리에이터가 돈을 내지 않는다고 단정하지 않는다. 특히 이미 관계가 있는 브랜드 담당자가 실제 자료와 피드백을 빠르게 제공한다면, 그 팀이 익명의 대행사보다 좋은 첫 시험 고객이다. 시장 크기 추정보다 반복적으로 관찰할 수 있는 유료 문제를 먼저 확인한다.

### 이 선택의 약점과 대응

- 대행사는 초보자가 아니다. AI 초안이 평범하면 그대로 쓰지 않는다. 근거 자료·브랜드 기준·부분 편집과 되돌리기를 핵심으로 두고, 최종 채택 가능한 결과 비율을 측정한다.
- 고객별 맞춤 요청이 끝없이 늘어날 수 있다. 첫 범위를 카드뉴스와 채널별 문구, 내부·고객 2단계 검토, PNG 납품으로 고정한다. 복잡한 계약·정산·CRM은 넣지 않는다.
- 승인 화면은 이미 전문 경쟁사가 있다. 승인만으로 경쟁하지 않고, 국내외 소재 근거→한국어 카드뉴스→고객 수정 이력의 연결을 하나의 프로젝트에 묶는다.
- 권한·버전·저장 신뢰성이 초기에 필요하다. 예쁜 데모만으로 영업을 시작하지 않고 다른 고객 정보 노출 방지와 승인 버전 고정을 먼저 검증한다.

### 무엇이 확인되면 방향을 바꿀까

대행사 5곳의 실제 최근 납품을 관찰했는데 소재 선정·수정·승인보다 촬영·영업·매체 집행이 큰 병목이면, 이 고객 정의를 더 좁히거나 브랜드팀으로 바꾼다. 생성 결과를 대부분 다시 만들고 기존 도구보다 시간이 더 걸리면 자동화 기능을 늘리지 않고 템플릿·편집 품질부터 개선한다. 크리에이터들이 현재 자산으로 만든 카드뉴스·짧은 정보 콘텐츠를 반복 사용하며 먼저 결제한다면, 그 고객군을 우선할 근거가 된다.

**첫 제품의 약속:** 고객 브랜드에 맞는 소재를 근거와 함께 고르고, 수정 가능한 한국어 카드뉴스와 게시글을 만들어, 승인된 버전으로 납품한다. 이 약속을 검증한 뒤 영상·자동 발행·성과 추천을 확장한다.
'''
p=O/'조사와_제품설계.md';p.write_text(p.read_text().split('\n## 11. 첫 고객에 대한 판단과 이유')[0]+extra)
import re
def inline(t):
 t=html.escape(t)
 t=re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)',r'<a href="\2" target="_blank" rel="noopener">\1</a>',t)
 t=re.sub(r'\*\*([^*]+)\*\*',r'<strong>\1</strong>',t)
 t=re.sub(r'`([^`]+)`',r'<code>\1</code>',t)
 return t
def render_md(text):
 out=[];lines=text.splitlines();i=0
 while i<len(lines):
  l=lines[i].strip()
  if not l:i+=1;continue
  if l.startswith('|'):
   rows=[]
   while i<len(lines) and lines[i].strip().startswith('|'):
    a=[x.strip() for x in lines[i].strip().strip('|').split('|')]
    if not all(re.fullmatch(r'[-: ]+',x) for x in a):rows.append(a)
    i+=1
   out.append('<div class="tablewrap"><table><thead><tr>'+''.join('<th>'+inline(x)+'</th>' for x in rows[0])+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+inline(x)+'</td>' for x in rr)+'</tr>' for rr in rows[1:])+'</tbody></table></div>');continue
  h=re.match(r'^(#{1,3}) (.+)',l)
  if h:out.append(f'<h{len(h[1])}>{inline(h[2])}</h{len(h[1])}>')
  elif l.startswith('- '):out.append('<p class="bullet">• '+inline(l[2:])+'</p>')
  else:out.append('<p>'+inline(l)+'</p>')
  i+=1
 return ''.join(out)

body=render_md(p.read_text())
css='''*{box-sizing:border-box}body{margin:0;background:#f4f5f7;color:#192330;font:15px/1.7 -apple-system,BlinkMacSystemFont,"Noto Sans KR",sans-serif}header{background:#142b36;color:#fff;padding:38px max(5vw,24px)}h1{font-size:32px;line-height:1.3}h2{margin-top:42px}a{color:#087065}button,select,input,textarea{font:inherit}button{cursor:pointer}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #f0b850;outline-offset:3px}button{border:1px solid #ccd6d8;background:white;border-radius:8px;padding:9px 16px;color:#263a42}button.active,.primary{background:#087568;color:white;border-color:#087568}.muted{color:#647681}.wrap{max-width:1400px;margin:auto;padding:28px}nav{position:sticky;top:0;background:#fff;z-index:3;padding:12px 5vw;display:flex;gap:10px;border-bottom:1px solid #ddd;flex-wrap:wrap}.pane{display:none}.pane.active{display:block}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}.card{background:white;padding:22px;border:1px solid #dce4e7;border-radius:13px}.num{font-size:26px;font-weight:750;color:#087568}.tag{display:inline-block;padding:2px 8px;background:#e9f2ef;border-radius:20px;font-size:12px}.filters{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}input,select,textarea{padding:10px;border:1px solid #c6d3d7;border-radius:7px}input{min-width:240px}.layout{display:grid;grid-template-columns:180px 1fr;gap:18px}.side{background:#142b36;border-radius:12px;padding:18px;color:#fff}.side div{margin:14px 0}.stages{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:16px}.demo-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.preview{aspect-ratio:4/5;background:#f5e7cc;color:#1c453c;padding:30px;border-radius:10px;display:flex;flex-direction:column;justify-content:space-between;max-width:340px}.preview h3{font-size:30px;line-height:1.4}.notice{background:#fff6da;border-left:4px solid #d6a334;padding:12px 18px;margin:16px 0}article{max-width:1120px;margin:auto;background:white;padding:36px;border-radius:12px}table{border-collapse:collapse;width:100%;font-size:14px;display:block;overflow:auto}td,th{border:1px solid #d8e0e4;padding:10px;min-width:110px;vertical-align:top}th{background:#edf4f3}textarea{width:100%;height:120px}code{background:#edf1f2;padding:2px 5px;overflow-wrap:anywhere}.hidden{display:none!important}#demoStatus{font-weight:650}footer{margin:30px 0;color:#647681}@media(max-width:800px){.layout,.demo-grid{grid-template-columns:1fr}.side{display:none}header{padding:25px}.wrap{padding:16px}article{padding:18px}h1{font-size:25px}}'''
htmltxt='''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>콘텐츠 플랫폼 · 벤치마크와 설계</title><style>'''+css+'''</style><header><div>RESEARCH → WORKFLOW → PRODUCT · 2026.09.29</div><h1>소재에서 승인된 콘텐츠까지</h1><p>국내 8개 · 해외 24개 서비스 / 기존 Claude 자산을 활용하는 새 제품 설계</p><span class="tag" style="color:#173f37">첫 고객 제안: SNS 콘텐츠 대행사</span></header><nav><button class="active" data-pane="compare">32개 비교</button><button data-pane="demo">새 사이트 화면 초안</button><button data-pane="report">조사·설계 전문</button><a href="조사와_제품설계.md">Markdown</a><a href="벤치마크_32개.csv">비교표 CSV</a></nav><main class="wrap"><section id="compare" class="pane active"><h2>가져올 가치가 높은 순서</h2><p>공식 자료에 근거한 적용 우선순위다. 생성 품질을 실측한 순위는 아니다. 고객과 기능을 바꾸어 비교할 수 있다.</p><div class="filters"><input id="search" placeholder="서비스·가져올 기능 검색" aria-label="서비스 검색"><select id="region" aria-label="지역"><option value="">국내외 전체</option><option>해외</option><option>국내</option></select><select id="persona" aria-label="우선 고객"><option value="">고객 전체</option><option>광고회사</option><option>크리에이터</option><option>브랜드팀</option></select><span id="count"></span></div><div id="grid" class="cards"></div></section>
<section id="demo" class="pane"><h2>고객별로 시작하는 작업이 다르다</h2><p class="notice">클릭 가능한 화면 설계다. 모든 자료와 결과는 가상 예시이며 AI 생성·서버 저장·SNS 발행은 연결하지 않았다. 새로고침하면 초기화된다.</p><div class="filters"><button class="active role" data-role="agency">대행사</button><button class="role" data-role="creator">크리에이터</button><button class="role" data-role="brand">브랜드팀</button></div><div class="layout"><aside class="side"><strong>가상 브랜드 · 모닝브루</strong><div>오늘 할 일</div><div>소재 찾기</div><div>제작 프로젝트</div><div>검토·승인</div><div>발행 달력</div><div>성과</div><div>브랜드 자료</div></aside><div><div class="card"><h3 id="roleTitle"></h3><p id="roleText"></p><div class="stages"><button data-step="0">1 소재</button><button data-step="1">2 기획</button><button data-step="2">3 편집</button><button data-step="3">4 검토·납품</button></div><p id="demoStatus" role="status"></p><div id="stage"></div></div></div></div></section><section id="report" class="pane"><article>'''+body+r'''</article></section><footer>비교 근거는 각 서비스의 공식 자료 링크에서 확인할 수 있다. 기존 Mirr 보고서와 기존 운영 서비스는 그대로 유지했다.</footer></main><script>
const rows=DATA;
const q=s=>document.querySelector(s);const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function draw(){let a=rows.filter(r=>(!q('#region').value||r.region===q('#region').value)&&(!q('#persona').value||r.persona===q('#persona').value)&&JSON.stringify(r).toLowerCase().includes(q('#search').value.toLowerCase()));q('#count').textContent=a.length+' / 32개';q('#grid').innerHTML=a.map(r=>`<div class="card"><span class="num">${r.rank.toString().padStart(2,'0')}</span> <span class="tag">${r.region} · ${r.category}</span><h3>${esc(r.name)}</h3><p>${esc(r.why)}</p><strong>가져올 부분</strong><p>${esc(r.take)}</p><p class="muted">${esc(r.limit)}</p><a href="${r.source}" target="_blank" rel="noopener">공식 근거 ↗</a></div>`).join('')}
['search','region','persona'].forEach(x=>q('#'+x).addEventListener('input',draw));draw();
document.querySelectorAll('[data-pane]').forEach(b=>b.onclick=()=>{document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('active',p.id===b.dataset.pane));document.querySelectorAll('[data-pane]').forEach(p=>p.classList.toggle('active',p===b))});
let role='agency',step=0,selected=false,v=1,approved=0,internal=0,history=[],text='바쁜 아침에도\n커피 한 잔의 여유', exported=false;
const roles={agency:['오늘 처리할 고객 작업','모닝브루 주간 카드뉴스 · 내부 검토 후 고객 승인 · 출처와 수정 이력을 함께 전달'],creator:['원본 하나로 여러 콘텐츠 만들기','내 채널의 원본과 아이디어로 카드뉴스 초안 · 내가 최종 확인'],brand:['이번 주 브랜드 콘텐츠 완성하기','제품 사실과 브랜드 기준을 유지한 카드뉴스 · 팀 검토 후 담당자 승인']};
document.querySelectorAll('.role').forEach(b=>b.onclick=()=>{role=b.dataset.role;approved=0;internal=0;exported=false;render()});document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{step=Number(b.dataset.step);render()});
function render(){q('#roleTitle').textContent=roles[role][0];q('#roleText').textContent=roles[role][1];document.querySelectorAll('.role').forEach(b=>b.classList.toggle('active',b.dataset.role===role));document.querySelectorAll('[data-step]').forEach(b=>b.classList.toggle('active',Number(b.dataset.step)===step));q('#demoStatus').textContent=`버전 v${v} · ${approved===v?'승인됨':internal===v?'내부 검토 완료':'작성 중'}${exported?' · 납품 메모 다운로드 완료':''}`;
if(step===0){q('#stage').innerHTML=`<div class="demo-grid"><div class="card"><span class="tag">가상 자료 · 제품팀 제공</span><h3>아침에 커피를 준비하는 세 가지 방법</h3><p>모닝브루가 제공한 원고와 사진을 사용하는 예시다. 실제 트렌드·조회수 자료가 아니다.</p><p>사용 목적: 브랜드 소개 / 제품 효과·가격 주장 없음</p><button id="pick" class="primary">${selected?'선택한 소재로 기획하기':'이 소재 선택'}</button></div><div><h3>추천 근거를 먼저 확인</h3><p>브랜드와의 관계, 자료 시점, 사실의 확인 상태를 분리해서 보여 준다.</p><p class="muted">실제품에서는 여기서 해외 사례와 국내 유사 사례를 나란히 확인한다.</p></div></div>`;q('#pick').onclick=()=>{selected=true;step=1;render()};}
if(step===1){q('#stage').innerHTML=selected?`<h3>이번 콘텐츠의 기획</h3><p>목표: 브랜드 친숙도 / 독자: 바쁜 직장인 / 형식: 카드뉴스 / 핵심 메시지: 아침의 짧은 여유</p><p>자료: 브랜드 제공 원고 · 검증되지 않은 건강·효능 주장 제외</p><p class="notice">기획 내용과 비용 확인 후 초안을 만드는 자리다. 이 데모에서는 준비된 예시 한 장을 연다.</p><button id="edit" class="primary">예시 초안 열기</button>`:'소재 단계에서 자료를 먼저 선택한다.';if(q('#edit'))q('#edit').onclick=()=>{step=2;render()};}
if(step===2){q('#stage').innerHTML=selected?`<div class="demo-grid"><div class="preview"><div>가상 브랜드 · 모닝브루</div><h3 id="previewText">${esc(text).replace(/\n/g,'<br>')}</h3><div>01 / 예시 카드 · 로고 영역 고정</div></div><div><h3>선택한 카드의 문구</h3><textarea id="copy" aria-label="카드 문구">${esc(text)}</textarea><p class="muted">실시간 미리보기 후 저장한다. 저장하면 새 버전이 생기고 기존 승인은 해제된다.</p><button id="save" class="primary">변경 저장</button> <button id="undo" ${history.length?'':'disabled'}>되돌리기</button><p><button id="review">검토로 이동</button></p></div></div>`:'소재를 먼저 선택한다.';if(q('#copy')){q('#copy').oninput=()=>q('#previewText').textContent=q('#copy').value;q('#save').onclick=()=>{let next=q('#copy').value.trim();if(!next)return;if(next!==text){history.push(text);text=next;v++;approved=internal=0;exported=false}render()};q('#undo').onclick=()=>{if(history.length){text=history.pop();v++;approved=internal=0;exported=false;render()}};q('#review').onclick=()=>{step=3;render()}}}
if(step===3){q('#stage').innerHTML=selected?`<h3>정확히 이 버전을 확인한다 · v${v}</h3><blockquote>${esc(text).replace(/\n/g,'<br>')}</blockquote><p>출처: 가상 브랜드 제공 자료 / 상태: 데모 문구 / 최종 승인 후 파일 납품</p>${role!=='creator'?'<button id="internal">1. 내부 검토 완료</button> ':''}<button id="approve" class="primary" ${role!=='creator'&&internal!==v?'disabled':''}>${role==='agency'?'2. 고객 승인 모의 실행':role==='creator'?'최종 확인':'2. 담당자 승인 모의 실행'}</button><p><button id="deliver" ${approved===v?'':'disabled'}>승인 버전의 납품 메모 다운로드</button> <button id="back">수정하기</button></p><p class="muted">이 데모의 승인 버튼은 권한 분리 구현이 아니다. 실제 제품에서는 다른 역할의 계정과 서버 권한 검사가 필요하다.</p>`:'소재를 먼저 선택한다.';if(q('#internal'))q('#internal').onclick=()=>{internal=v;render()};if(q('#approve'))q('#approve').onclick=()=>{approved=v;render()};if(q('#back'))q('#back').onclick=()=>{step=2;render()};if(q('#deliver'))q('#deliver').onclick=()=>{if(approved!==v)return;const blob=new Blob([JSON.stringify({demo:true,brand:'가상 브랜드 모닝브루',version:v,approvedVersion:approved,text},null,2)],{type:'application/json'});const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='데모_승인버전_납품메모.json';a.click();URL.revokeObjectURL(u);exported=true;render()};}}
render();</script></html>'''
htmltxt=htmltxt.replace('const rows=DATA;', 'const rows='+json.dumps(rows,ensure_ascii=False).replace('</','<\\/')+';')
(O/'벤치마크와_화면설계.html').write_text(htmltxt)
print('wrote HTML',len(htmltxt))
