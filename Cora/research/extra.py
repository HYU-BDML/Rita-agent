import json,urllib.request,concurrent.futures
from bs4 import BeautifulSoup
from pathlib import Path
D=json.load(open('work/pages.json'));seen={d['path'] for d in D}
paths=sorted(set(x['url'] for d in D for x in d.get('links',[]) if x['url'].startswith('/en/') and '?' not in x['url'] and not any(t in x['url'] for t in ['/blog/','/settings/','/sign-','/carousel-lab/','/video-lab/','/referral','/affiliate','/home','/subscription']))-seen)
def f(p):
 try:
  r=urllib.request.urlopen('https://www.mirra.my'+p,timeout=20);b=BeautifulSoup(r.read(),'html.parser'); links=[{'text':a.get_text(' ',strip=True),'url':a['href']} for a in b.select('a[href]')]
  for e in b.select('script,style,nav,footer,header'):e.decompose()
  t=b.get_text('\n',strip=True);ix=t.find('\nAI Carousel & Carousel');t=t[:ix] if ix>=0 else t
  return dict(path=p,url=r.url,text=t,links=links)
 except Exception as e:return dict(path=p,error=str(e))
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:E=list(ex.map(f,paths))
Path('work/extra.json').write_text(json.dumps(E,ensure_ascii=False,indent=2))
for d in E:print('\nURL',d['path'],'\n',d.get('text',d.get('error')))
