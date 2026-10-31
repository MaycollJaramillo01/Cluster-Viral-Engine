"""Scan tracked + unignored files, never print matched credential values."""
import pathlib
import re
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[1]
names = subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'], cwd=root).decode().split('\0')
patterns = {
    'private key': rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
    'GitHub token': rb'gh[pousr]_[A-Za-z0-9]{30,}',
    'provider API key': rb'sk-(?:proj-|ant-)?[A-Za-z0-9_-]{35,}',
    'AWS access key': rb'AKIA[0-9A-Z]{16}',
}
failures = []
checked = 0
for name in sorted(set(filter(None,names))):
    p = root/name
    if not p.is_file(): continue  # deletion in a work-in-progress diff
    if '.env' in p.name and p.name != '.env.example': failures.append((name,'environment file'))
    if name.startswith(('.local/','.phase00-postgres/')): failures.append((name,'local credential/data directory'))
    data = p.read_bytes()
    if b'\x00' in data: continue
    checked += 1
    for kind, pattern in patterns.items():
        if re.search(pattern,data): failures.append((name,kind))
for name, kind in failures: print(f'ERROR: {name}: {kind}',file=sys.stderr)
print(f'Secret scan: {checked} text files, {len(failures)} finding(s); values never printed.')
sys.exit(1 if failures else 0)
