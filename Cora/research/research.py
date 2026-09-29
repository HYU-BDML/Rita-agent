import urllib.request,json,concurrent.futures
from bs4 import BeautifulSoup
from pathlib import Path
base='https://www.mirra.my'
home=BeautifulSoup(Path('work/home.html').read_text(),'html.parser')
paths=set(a['href'] for a in home.select('a[href]') if a['href'].startswith('/en'))
paths|={'/en/help/'+x for x in ['getting-started','create-carousel','brand-tone','content-manager','publish-safely','connect-accounts','billing-and-plan','team-workspace']}
def fetch(p):
 try:
  r=urllib.request.urlopen(base+p,timeout=25); b=BeautifulSoup(r.read(),'html.parser')
  links=[{'text':a.get_text(' ',strip=True),'url':a['href']} for a in b.select('a[href]')]
  for e in b.select('script,style,nav,footer,header'): e.decompose()
  txt=b.get_text('\n',strip=True)
  ix=txt.find('\nAI Carousel & Carousel');txt=txt[:ix] if ix>=0 else txt
  return {'path':p,'url':r.url,'text':txt,'links':links}
 except Exception as e:return {'path':p,'error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex: data=list(ex.map(fetch,sorted(paths)))
Path('work/pages.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
for d in data:print('\nURL',d['path'],'\n',d.get('text',d.get('error')))
