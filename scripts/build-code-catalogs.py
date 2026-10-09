"""Rebuild bundled public catalogs from the pinned, extracted CMS source files.
Requires Python 3 and openpyxl. See docs/CODES_AND_COVERAGE.md for source URLs.
No CPT/CDT content or Medicare coverage flags are exported.
"""
import argparse, gzip, hashlib, json, pathlib, re
import openpyxl
parser = argparse.ArgumentParser()
parser.add_argument('source_dir', type=pathlib.Path, help='Contains hcpcs/ and icd/ extracted release directories')
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1] / 'resources/codes'
root.mkdir(parents=True, exist_ok=True)
hcpcs_file = args.source_dir / 'hcpcs/HCPC2026_OCT_ANWEB_09232026.xlsx'
icd_file = args.source_dir / 'icd/Code Descriptions/icd10cm_codes_2027.txt'
hashes = {'hcpcs': 'ac352198b97b407d5a08b1d61965ccc2e13d878d5cc8f78333a8cc1f75896527', 'icd': '3c0583a38ee0e848f7dc0ac8ce88e8f001bbba8c6385ed825d44d46f6e5297c9'}
for name, path in [('hcpcs', hcpcs_file), ('icd', icd_file)]:
    if hashlib.sha256(path.read_bytes()).hexdigest() != hashes[name]:
        raise ValueError('Source integrity mismatch: ' + name)
rows = []
for r in list(openpyxl.load_workbook(hcpcs_file, read_only=True, data_only=True).active.values)[1:]:
    code = r[0].strip()
    if not re.fullmatch('[A-CE-Z][0-9]{4}', code):
        continue  # exclude modifiers, dental CDT and any non-Level-II entries
    end = str(r[-2] or '')
    if end and end < '20261001':
        continue
    start = str(r[-3] or '')
    format_date = lambda s: s[:4] + '-' + s[4:6] + '-' + s[6:8]
    rows.append(dict(code=code, description=r[3], starts_on=max('2026-10-01', format_date(start)) if start else '2026-10-01', ends_on=min('2026-12-31', format_date(end)) if end else '2026-12-31'))
diagnoses = []
for line in icd_file.read_text().splitlines():
    code, description = line.split(maxsplit=1)
    diagnoses.append(dict(code=code[:3] + '.' + code[3:] if len(code) > 3 else code, description=description, starts_on='2026-10-01', ends_on='2027-09-30'))
manifest = []
for system, version, data, url, source in [('HCPCS', '2026-Q4', rows, 'https://www.cms.gov/files/zip/october-2026-alpha-numeric-hcpcs-file.zip', hcpcs_file), ('ICD10CM', 'FY2027', diagnoses, 'https://www.cms.gov/files/zip/2027-code-descriptions-tabular-order.zip', icd_file)]:
    compressed = gzip.compress(json.dumps(data, separators=(',', ':')).encode(), mtime=0)
    name = system.lower() + '.json.gz'
    (root / name).write_bytes(compressed)
    manifest.append(dict(system=system, version=version, source_url=url, source_file=source.name, source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(), file=name, sha256=hashlib.sha256(compressed).hexdigest(), count=len(data), retrieved_on='2026-10-09', notes='CMS public-use non-dental Level II codes; no CPT or dental CDT content. Medicare coverage indicators intentionally excluded.' if system == 'HCPCS' else 'Billable diagnosis code descriptions only. Consult official tabular instructions and coding guidelines.'))
(root / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print([(item['system'], item['count']) for item in manifest])
