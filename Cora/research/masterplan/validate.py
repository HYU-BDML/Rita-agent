from pathlib import Path
from urllib.parse import unquote, urlsplit
from bs4 import BeautifulSoup
from markdown_it import MarkdownIt
import json, csv, re, collections
ROOT=Path('/Users/boramlim/Documents/Codex/2026-09-28/https-www-mirra-my')
OUT=ROOT/'outputs/제품개발_마스터플랜_2026-09-29'
WORK=ROOT/'work/masterplan'
F=json.loads((OUT/'features.json').read_text());C=json.loads((OUT/'proposedcontracts.json').read_text());L=json.loads((OUT/'sources.json').read_text())
errors=[]
def check(ok, note):
    if not ok: errors.append(note)
ids=[f['id'] for f in F]; check(len(F)==110 and len(set(ids))==110,'110 unique feature IDs')
required=['id','section','title','users','stage','inputs','process','outputs','empty_error','acceptance','dependencies','build_reuse','reference_ids','release','release_scope','implementation_status']
for f in F:
    check(all(k in f for k in required),'feature required keys '+f['id'])
    check(all(x in ids for x in f['dependencies']),'dependency '+f['id'])
    check(all(f[k] for k in ['inputs','process','outputs','empty_error','acceptance','release_scope']),'empty feature '+f['id'])
lookup={f['id']:f for f in F}; active=set();done=set()
def dfs(fid):
    if fid in active: errors.append('cycle '+fid);return
    if fid in done:return
    active.add(fid)
    for d in lookup[fid]['dependencies']:dfs(d)
    active.remove(fid);done.add(fid)
for fid in ids:dfs(fid)
refs=set(x for f in F for x in f['reference_ids'])
expected={f'F{i:03}' for i in range(1,110)}|{f'Y{i:02}' for i in range(1,36)}
check(expected<=refs,'reference coverage')
with (OUT/'전체기능원장.csv').open(encoding='utf-8-sig') as f: check(len(list(csv.DictReader(f)))==110,'CSV count')
tables={t['name']:t for t in C['tables']}; check(len(tables)==46,'table count')
fk_count=0
for t in C['tables']:
    check(all(k in t['columns'] for k in t['primary_key']),'PK '+t['name'])
    for fk in t['foreign_keys']:
        fk_count+=1
        target=fk.get('references',{})
        check(target.get('table') in tables,'FK table '+t['name'])
        check(all(k in t['columns'] for k in fk.get('columns',[])),'FK local columns '+t['name'])
        if target.get('table') in tables:
            check(all(k in tables[target['table']]['columns'] for k in target.get('columns',[])),'FK reference cols '+t['name'])
apiids=[(a['method'],a['path']) for a in C['apis']]
check(len(apiids)==21 and len(set(apiids))==21,'API unique count')
check(len(C['critical_invariant_ids'])==10 and len(C['acceptance_test_ids'])==12,'invariant/test counts')
check(len(L['sources'])==15 and len({s['id'] for s in L['sources']})==15,'literature count')
check(all(s.get('url','').startswith('https://') and s.get('directly_checked') and s.get('limits') for s in L['sources']),'literature scope')

md=MarkdownIt('commonmark',{'html':True}).enable('table')
for p in list(OUT.glob('*.md'))+[OUT/'개발계획.html']:
    content=p.read_text()
    soup=BeautifulSoup(content if p.suffix=='.html' else md.render(content),'html.parser')
    for a in soup.find_all('a',href=True):
        raw=a['href'];h=unquote(urlsplit(raw).path)
        if not h or urlsplit(raw).scheme:continue
        if not (p.parent/h).exists(): errors.append('missing link '+p.name+' -> '+h)
    check(not re.search(r'(?i)(sk-[a-zA-Z0-9]{24,}|AIza[0-9A-Za-z_-]{20,}|github_pat_[a-zA-Z0-9_]{20,}|ghp_[a-zA-Z0-9]{20,})',content),'possible credential '+p.name)
    check('cite' not in content,'raw web citation '+p.name)

p=OUT/'개발계획.html';soup=BeautifulSoup(p.read_text(),'html.parser')
allids=[e['id'] for e in soup.select('[id]')]
check(len(allids)==len(set(allids)),'duplicate HTML ID')
check(len(soup.select('.panel'))==12,'HTML panel count')
check(len(soup.select('.feature'))==110,'HTML feature count')
check(len(soup.select('nav button'))==12,'HTML nav count')
check(not soup.select('script[src]'),'HTML no external script dependency')
fixtures={'panels':[p['id'] for p in soup.select('.panel')], 'nav':[b['data-panel'] for b in soup.select('nav button')], 'cards':[{'id':x['data-id'],'stage':x['data-stage'],'area':x['data-area'],'text':x.get_text()} for x in soup.select('.feature')]}
(WORK/'ui-fixtures.json').write_text(json.dumps(fixtures,ensure_ascii=False))
check(144+192+30+72+30==468 and 144+320+40+96+50==650,'budget arithmetic')
check(abs(36*2*6/60+5-12.2)<1e-8,'annotation hours')
check(round(34000/.37)==91892 and round(98500/.37)==266216,'contribution arithmetic')
result={'feature_count':len(F),'sections':len(set(f['section'] for f in F)),'stage_counts':dict(collections.Counter(f['stage'] for f in F)),'reference_count':len(expected),'tables':len(tables),'foreign_keys':fk_count,'apis':len(apiids),'literature':len(L['sources']),'errors':errors}
(WORK/'validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(result,ensure_ascii=False,indent=2))
if errors: raise SystemExit(1)
