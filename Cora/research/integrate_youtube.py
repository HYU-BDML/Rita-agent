from pathlib import Path
p=Path('work/build_report.py');s=p.read_text()
s=s.replace("moat=Path('work/moat.md').read_text()", "moat=Path('work/moat.md').read_text()\nyt_text=Path('outputs/Mirr_영상분석_보완보고서.md').read_text()\nyt_rows=json.loads(Path('work/youtube/supplement.json').read_text())\nyt_map={r['id']:[y for y in yt_rows if r['id'] in y['ids'].split()] for r in R}")
s=s.replace("md+=['\\n---\\n',moat]", "md+=['\\n---\\n',moat,'\\n---\\n',yt_text]")
s=s.replace("'근거 URL'])", "'근거 URL','영상 보완 ID','영상 근거','영상 보완 설명'])")
s=s.replace("for r in R:w.writerow([r[k] for k in ['id','group','name','level','input','flow','controls','unknown','source']])", "for r in R:w.writerow([r[k] for k in ['id','group','name','level','input','flow','controls','unknown','source']]+[' / '.join(y['id'] for y in yt_map[r['id']]),' / '.join(y['evidence'] for y in yt_map[r['id']]),' / '.join(y['flow'] for y in yt_map[r['id']])])")
s=s.replace('Mirr 기능 해부 · 2026-09-28','Mirr 기능 해부 · 영상 보완 2026-09-29').replace('PRODUCT RESEARCH · 2026.09.28','PRODUCT RESEARCH · 2026.09.28 / VIDEO UPDATE · 2026.09.29')
s=s.replace('<nav><a href="#analysis">','<nav><a href="#youtube">영상 보완 35개</a><a href="#analysis">')
s=s.replace('<section id="analysis">{render_md(base)}','<p class="limit"><b>2026-09-29 보완:</b> 공식 튜토리얼·웨비나 6편 약 190분의 자동 자막을 읽고 중복을 합친 35개 보완 기록을 연결했다. <a href="#youtube">영상 근거·구현 제안·완료 테스트 보기</a>. 35개는 기존 기능과 겹친다.</p><section id="analysis">{render_md(base)}')
s=s.replace("search=' '.join(str(v) for v in r.values())", "search=' '.join(str(v) for v in r.values())+' '+' '.join(y['name']+' '+y['flow'] for y in yt_map[r['id']])")
s=s.replace("parts.append(f'</dl><a href=", "parts.append('</dl>'+''.join('<p class=\"limit\"><a href=\"#'+y['id']+'\">'+y['id']+' '+html.escape(y['name'])+'</a><br>'+html.escape(y['flow'])+'<br><span class=\"minor\">영상 자동 자막 근거 · 직접 실행 검증과 구분</span></p>' for y in yt_map[r['id']]))\n parts.append(f'<a href=")
needle="parts.append('</section><section id=\"moat\">'"
replacement="yt_html=render_md(yt_text)\nfor y in yt_rows:yt_html=yt_html.replace('<h3>'+y['id']+' ', '<h3 id=\"'+y['id']+'\">'+y['id']+' ')\nparts.append('</section><section id=\"youtube\"><p><a href=\"Mirr_영상분석_보완보고서.md\">영상 보완 보고서</a> · <a href=\"Mirr_영상분석_구현대장.csv\">구현 대장 CSV</a></p>'+yt_html)\nparts.append('</section><section id=\"moat\">'"
assert needle in s;s=s.replace(needle,replacement)
s=s.replace('공개 자료 + 로그인 화면 관찰 · 2026-09-28','공개 자료 + 로그인 화면 관찰 + 공식 영상 자막 · 2026-09-29 보완')
s=s.replace('500크레딧 약 100 텍스트라는 예시와 텍스트 2 단가가 단순 계산상 불일치. 실행 차감으로 확인 필요.','500크레딧 약 100개 예시는 과거 영상의 텍스트 5크레딧 설명과 일치한다. 현재 화면의 2크레딧과 시점 차이 가능성이 있으며 실제 차감 확인 필요.')
p.write_text(s)
p=Path('work/analysis.md');s=p.read_text().replace('단순 계산상 불일치. 실제 차감 필요','과거 영상의 글 5크레딧과 환산이 일치. 시점 차이 가능성; 현재 실제 차감 확인 필요')
s=s.replace('조사일: 2026-09-28.','화면·API 조사일: 2026-09-28. 공식 영상 자막 보완일: 2026-09-29.')
s+='\n\n## 공식 영상 보완 안내\n\n2026-09-29에 긴 튜토리얼 4편과 장시간 웨비나 2편의 자동 자막을 분석했다. 본 보고서 뒤에 35개 중복 제거 보완 항목과 타임스탬프·독립 구현 제안·완료 테스트를 추가했다. 특히 승인 기준본을 템플릿으로 저장하고 반복 제작에 연결하는 흐름이 구체화됐다. 영상에서 설명된 동작과 직접 실행 검증은 다르다.\n'
p.write_text(s)
p=Path('work/moat.md');s=p.read_text();s+='\n\n## 2026-09-29 영상 근거 보완\n\n공식 웨비나에서는 당시 파운데이션 모델로 Gemini를 사용한다고 설명한다. 이는 외부 모델 사용에 대한 직접 발언이며 현재 모든 기능의 모델·버전을 증명하지 않는다. [당시 설명 1:10:24](https://www.youtube.com/watch?v=4XYhixJzm5w&t=4224s).\n\n영상이 반복해서 강조하는 축적 대상은 사람이 완성한 기준 카드·영상 디자인과 계정별 글 구조다. 이를 템플릿으로 명시적으로 저장하고 다음 생성이나 자동화에 적용한다. 사용자 수정 또는 성과 지표가 자동으로 모델 가중치를 학습시킨다는 근거는 확보되지 않았다.\n';p.write_text(s)
