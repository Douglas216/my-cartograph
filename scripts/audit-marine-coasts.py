"""Independent GEOS check; run with Python + shapely after regenerating data.

Usage: python3 scripts/audit-marine-coasts.py [--baseline old-seas.geojson]
Writes docs/marine-coast-verification.json and exits nonzero on invalid geometry
or substantial land overlap. Caspian is checked for validity only because the
country source treats inland lake water as land. Units are square degrees;
1e-5 is a small numerical tolerance for the shared six-decimal precision grid.
"""
import argparse,json
from pathlib import Path
import shapely
from shapely.geometry import shape,box
from shapely import STRtree,make_valid,clip_by_rect

root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser()
parser.add_argument('--baseline',type=Path)
args=parser.parse_args()
read=lambda p:json.loads(p.read_text())['features']
land=[]
for feature in read(root/'data/raw/countries-10m-raw.geojson'):
    geom=make_valid(shape(feature['geometry']))
    land.extend(list(geom.geoms) if geom.geom_type=='MultiPolygon' else [geom])
tree=STRtree(land)
print('Land index ready',len(land),flush=True)

def overlap(geom):
    total=0
    w,s,e,n=geom.bounds
    for i in tree.query(geom):
        clipped=make_valid(clip_by_rect(land[i],w-1e-7,s-1e-7,e+1e-7,n+1e-7))
        if not clipped.is_empty: total+=geom.intersection(clipped).area
    return total

baseline=read(args.baseline) if args.baseline else []
rows=[]
for feature in read(root/'public/geo/seas.geojson'):
    p=feature['properties']
    if p['featurecla']=='ocean':continue
    geom=shape(feature['geometry']);valid=geom.is_valid
    row={'name':p['name'],'valid':valid,'landOverlapSquareDegrees':0}
    if p['name']=='Caspian Sea':row['note']='Inland lake; land-mask overlap does not apply.'
    else:row['landOverlapSquareDegrees']=overlap(make_valid(geom))
    if baseline:
        old=[f for f in baseline if f['properties']['name']==p['name']]
        row['previousLandOverlapSquareDegrees']=sum(overlap(make_valid(shape(f['geometry']))) for f in old)
    rows.append(row)
    print(p['name'],row['landOverlapSquareDegrees'],flush=True)
selections={f['properties']['name']:f for f in read(root/'public/geo/marine-selections.geojson')}
selection_checks=[]
for name,feature in selections.items():
    geom=shape(feature['geometry'])
    record={'name':name,'valid':geom.is_valid,'parentGapSquareDegrees':0}
    parent=feature['properties'].get('water_parent')
    if parent:
        record['parentGapSquareDegrees']=make_valid(geom).difference(make_valid(shape(selections[parent]['geometry']))).area
    selection_checks.append(record)
report={'method':'Independent Shapely/GEOS validity and intersection against detailed land polygons','toleranceSquareDegrees':1e-5,'features':rows,'selections':selection_checks}
(root/'docs/marine-coast-verification.json').write_text(json.dumps(report,indent=2)+'\n')
failed=[r for r in rows if not r['valid'] or r['landOverlapSquareDegrees']>1e-5]
failed_selections=[r for r in selection_checks if not r['valid'] or r['parentGapSquareDegrees']>1e-8]
print('Checked',len(rows),'components;',len(set(r['name'] for r in rows)),'names; failures:',failed,flush=True)
print('Selection validity / containment failures:',failed_selections,flush=True)
raise SystemExit(bool(failed or failed_selections))
