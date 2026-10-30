#!/usr/bin/env python3
"""Offline structural and consistency checks; NOT a Postgres/Meta integration test."""
import csv,json,pathlib,re,sys
root=pathlib.Path(__file__).resolve().parents[1]
errors=[]
for path in ['README.md','ROADMAP.md','source/requerimientos_originales.txt','api/openapi.yaml','db/migrations/001_init.sql','db/migrations/002_rls.sql','workers/render/poc.sh','apps/web/package.json']:
 if not (root/path).is_file():errors.append(f'Missing {path}')
for p in (root/'schemas').glob('*.json'):
 try: json.loads(p.read_text(encoding='utf-8'))
 except Exception as e: errors.append(f'Invalid schema {p}: {e}')
try:
 with (root/'backlog/backlog.csv').open(encoding='utf-8-sig',newline='') as f:
  rows=list(csv.DictReader(f))
 ids={r['id'] for r in rows}
 if len(rows)!=108 or len(ids)!=len(rows): errors.append(f'Expected 108 unique tasks, found {len(rows)}')
 for r in rows:
  if r['dependencia']!='NINGUNA' and r['dependencia'] not in ids:errors.append('Bad dependency '+r['id'])
  if float(r['horas_min'])>float(r['horas_max']):errors.append('Bad hours '+r['id'])
 mins=sum(float(r['horas_min']) for r in rows); maxs=sum(float(r['horas_max']) for r in rows)
 if abs(mins-380)>0.01 or abs(maxs-550)>0.01:errors.append(f'Expected 380-550 total, got {mins}-{maxs}')
except Exception as e: errors.append(str(e))
for i in range(9):
 matches=list((root/'phases').glob(f'FASE-{i:02d}-*.md'))
 if len(matches)!=1:errors.append(f'Phase file missing/duplicate {i}')
print(f'Validated: {len(rows) if "rows" in locals() else 0} tasks, {len(list(root.rglob("*.md")))} markdown files, {len(errors)} error(s).')
for err in errors: print('ERROR:',err,file=sys.stderr)
sys.exit(1 if errors else 0)
