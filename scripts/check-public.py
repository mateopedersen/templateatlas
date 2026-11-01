"""Scan the tracked public source before a push. Never print matched secret values."""
import re, subprocess, sys
from pathlib import Path
tracked = subprocess.check_output(['git','ls-files','-z']).decode().split('\0')
denied = re.compile(r'(^|/)(?:node_modules|\.wrangler|private|receipts|\.astro|dist)(?:/|$)|(?:^|/)\.dev\.vars|\.(?:docx|pptx|xlsx|pdf|sqlite3?|zip|pem|key)$',re.I)
tokens = re.compile(rb'(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|/Users/[^/\s]+/(?:Documents|Downloads)/|Authorization: Bearer [A-Za-z0-9._-]{24,})')
bad=[]
for name in filter(None,tracked):
    if denied.search(name):
        bad.append((name,'prohibited path')); continue
    p=Path(name)
    if not p.exists():continue
    if p.is_symlink():bad.append((name,'symlink')); continue
    if p.suffix.lower() in ('.png','.webp','.jpg','.woff2'):continue
    if tokens.search(p.read_bytes()):bad.append((name,'private data pattern'))
for path,kind in bad:print(kind,path)
print(len(tracked)-1,'tracked paths;',len(bad),'findings')
sys.exit(bool(bad))
