from datetime import datetime
from zoneinfo import ZoneInfo
TODAY=datetime.now(ZoneInfo("America/New_York")).date().isoformat()
import json,urllib.request,urllib.parse,time,subprocess
from pathlib import Path
project=Path(__file__).resolve().parent.parent
import os
os.chdir(project)
config=json.loads(subprocess.check_output(['node','--input-type=module','-e', "import fs from 'node:fs';import {PERSONAL_RIVERS,PERSONAL_RANGES,PERSONAL_PEAKS} from './scripts/process-countries.mjs';const lakes=JSON.parse(fs.readFileSync('public/geo/lakes.geojson')).features;console.log(JSON.stringify({rivers:Object.keys(PERSONAL_RIVERS),ranges:PERSONAL_RANGES,peaks:PERSONAL_PEAKS.map(p=>p[0]),lakes:[...new Map(lakes.map(f=>[f.properties.name,{name:f.properties.name,id:f.properties.wikidataid}])).values()]}));"]))
headers={'User-Agent':'KnowledgeMapPersonalAtlas/1.0 (geographic reference snapshot)'}
def get(base,params):
 url=base+'?'+urllib.parse.urlencode(params)
 for attempt in range(3):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=45) as r:return json.load(r)
  except Exception:
   if attempt==2:raise
   time.sleep(2)
api='https://en.wikipedia.org/w/api.php'
wd='https://www.wikidata.org/w/api.php'
overrides={'Amazon':'Amazon River','Paraná':'Paraná River','Senegal':'Senegal River','Niger':'Niger River','Volta':'Volta River','Congo':'Congo River','Orange':'Orange River','Limpopo':'Limpopo River','Po':'Po (river)','Tiber':'Tiber','Rhône':'Rhône','Loire':'Loire','Thames':'River Thames','Ural':'Ural (river)','Ob':'Ob (river)','Lena':'Lena (river)','Yenisey':'Yenisei','Amur':'Amur','Songhua':'Songhua River','Yellow River':'Yellow River','Yangtze':'Yangtze','Pearl River':'Pearl River','Tarim':'Tarim River','Helmand':'Helmand River','Indus':'Indus River','Ganges':'Ganges','Brahmaputra':'Brahmaputra River','Irrawaddy':'Irrawaddy River','Salween':'Salween','Murray':'Murray River','Narmada':'Narmada River','Godavari':'Godavari River','Krishna':'Krishna River','Euphrates':'Euphrates','Tigris':'Tigris','Nile':'Nile','White Nile':'White Nile','Blue Nile':'Blue Nile','Danube':'Danube','Dnieper':'Dnieper','Volga':'Volga','Rhine':'Rhine','Altay Mountains':'Altai Mountains','Lake Maracaibo':'Lake Maracaibo'}
targets=[]
for category in ['rivers','ranges','peaks']:
 for name in config[category]:
  title=overrides.get(name,name+(' River' if category=='rivers' else ''))
  targets.append({'category':category,'name':name,'title':title})
for lake in config['lakes']:targets.append({'category':'lakes','name':lake['name'],'id':lake.get('id'),'title':overrides.get(lake['name'],lake['name'])})
unknown=[t for t in targets if not t.get('id')]
for offset in range(0,len(unknown),40):
 batch=unknown[offset:offset+40]
 r=get(api,{'action':'query','format':'json','redirects':1,'prop':'pageprops','titles':'|'.join(t['title'] for t in batch)})
 redirects={x['from']:x['to'] for x in r['query'].get('normalized',[])+r['query'].get('redirects',[])}
 pages={p['title']:p.get('pageprops',{}).get('wikibase_item') for p in r['query']['pages'].values()}
 for t in batch:
  title=t['title']
  for _ in range(5):title=redirects.get(title,title)
  t['id']=pages.get(title)
ids=list(dict.fromkeys(t['id'] for t in targets if t.get('id')))
entities={}
for offset in range(0,len(ids),40):
 entities.update(get(wd,{'action':'wbgetentities','format':'json','ids':'|'.join(ids[offset:offset+40]),'props':'claims|labels','languages':'en'})['entities'])
countryids=set()
def active(claims):
 rows=[c for c in claims if c.get('rank')!='deprecated' and not c.get('qualifiers',{}).get('P582') and c.get('mainsnak',{}).get('datavalue')]
 preferred=[c for c in rows if c.get('rank')=='preferred']
 return preferred or rows
for e in entities.values():
 for c in active(e.get('claims',{}).get('P17',[])):countryids.add(c['mainsnak']['datavalue']['value']['id'])
labels={}
for offset in range(0,len(countryids),40):
 group=list(countryids)[offset:offset+40]
 r=get(wd,{'action':'wbgetentities','format':'json','ids':'|'.join(group),'props':'labels','languages':'en'})['entities']
 labels.update({k:v.get('labels',{}).get('en',{}).get('value',k) for k,v in r.items()})
def measure(e,prop,units):
 rows=active(e.get('claims',{}).get(prop,[]))
 def stamp(c):return c.get('qualifiers',{}).get('P585',[{}])[0].get('datavalue',{}).get('value',{}).get('time','')
 for c in sorted(rows,key=stamp,reverse=True):
  v=c['mainsnak']['datavalue']['value']; unit=v.get('unit','').split('/')[-1]
  if unit in units:return {'value':round(float(v['amount'])*units[unit],3),'year':stamp(c)[1:5] or None}
 return None
output={'source':'Wikidata structured statements; linked per feature','retrieved':TODAY,'features':{}}
for t in targets:
 e=entities.get(t.get('id'),{})
 output['features'][t['category']+':'+t['name']]={'id':t.get('id'),'countries':list(dict.fromkeys(labels[c['mainsnak']['datavalue']['value']['id']] for c in active(e.get('claims',{}).get('P17',[])))),'lengthKm':measure(e,'P2043',{'Q828224':1,'Q11573':.001,'Q253276':1.609344}),'areaKm2':measure(e,'P2046',{'Q712226':1,'Q25343':.000001,'Q35852':.01}),'volumeKm3':measure(e,'P2234',{'Q4243638':1,'Q25517':.000000001,'Q5195628':.001})}
Path('data/catalog-reference.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'features':len(targets),'unresolved':[t['name'] for t in targets if not t.get('id')],'riversWithLength':sum(bool(v['lengthKm']) for k,v in output['features'].items() if k.startswith('rivers:')),'lakesWithVolume':sum(bool(v['volumeKm3']) for k,v in output['features'].items() if k.startswith('lakes:'))}))

import sys
subprocess.run([sys.executable,str(project/'scripts/fetch-catalog-capitals.py')],check=True)
