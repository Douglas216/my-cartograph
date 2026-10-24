from datetime import datetime
from zoneinfo import ZoneInfo
TODAY=datetime.now(ZoneInfo("America/New_York")).date().isoformat()
import json,urllib.request,urllib.parse,urllib.error,time,hashlib
from pathlib import Path
import os
os.chdir(Path(__file__).resolve().parent.parent)
api='https://www.wikidata.org/w/api.php'
def get(params):
 url=api+'?'+urllib.parse.urlencode(params)
 cache=Path('data/raw/catalog-api')
 cache.mkdir(parents=True,exist_ok=True)
 file=cache/(hashlib.sha256(url.encode()).hexdigest()+'.json')
 if file.exists() and file.stat().st_mtime > time.time()-86400:return json.loads(file.read_text())
 for attempt in range(5):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'KnowledgeMapPersonalAtlas/1.0 (reference snapshot)'}),timeout=45) as r:data=json.load(r)
   file.write_text(json.dumps(data))
   time.sleep(1.5)
   return data
  except urllib.error.HTTPError as e:
   if e.code not in [429,502,503,504] or attempt==4:raise
   delay=min(45,max(5,int(e.headers.get('Retry-After','10'))))
   print('Reference service busy; retrying shortly.',flush=True)
   time.sleep(delay)
def active(rows):
 out=[]
 for c in rows:
  q=c.get('qualifiers',{})
  starts=[x.get('datavalue',{}).get('value',{}).get('time','') for x in q.get('P580',[])]
  if c.get('rank')=='deprecated' or q.get('P582') or any(x and x[1:11]>TODAY for x in starts):continue
  if c.get('mainsnak',{}).get('datavalue'):out.append(c)
 preferred=[c for c in out if c.get('rank')=='preferred']
 return preferred or out
countries=json.loads(Path('data/raw/countries-10m-raw.geojson').read_text())['features']
ids=list(dict.fromkeys(c['properties'].get('WIKIDATAID') for c in countries if c['properties'].get('WIKIDATAID','').startswith('Q')))
entities={}
for i in range(0,len(ids),40):entities.update(get({'action':'wbgetentities','format':'json','ids':'|'.join(ids[i:i+40]),'props':'claims'})['entities'])
capitals={k:[c['mainsnak']['datavalue']['value']['id'] for c in active(v.get('claims',{}).get('P36',[])) if isinstance(c['mainsnak']['datavalue']['value'],dict)] for k,v in entities.items()}
capids=list(dict.fromkeys(x for row in capitals.values() for x in row));labels={}
for i in range(0,len(capids),40):
 r=get({'action':'wbgetentities','format':'json','ids':'|'.join(capids[i:i+40]),'props':'labels','languages':'en'})['entities'];labels.update({k:v.get('labels',{}).get('en',{}).get('value') for k,v in r.items()})
p=Path('data/catalog-reference.json');data=json.loads(p.read_text())
for f in countries:
 c=f['properties'];qid=c.get('WIKIDATAID');data['features']['countries:'+c['ADM0_A3']]={'id':qid,'capitals':[labels[x] for x in capitals.get(qid,[]) if labels.get(x)]}
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');print('Capital references saved for',len(capitals),'entities')
