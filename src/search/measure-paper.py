"""Usage: python measure-paper.py output.json private-receipts.json [additional JSON indexes]."""
import hashlib,json,sys
from pathlib import Path
from pypdf import PdfReader
out=Path(sys.argv[1]);paper={}
for file in sys.argv[2:]:
    index=json.loads(Path(file).read_text())
    for row in index:
        record=row['files'].get('pdf')
        if not record or not record.get('path'):continue
        path=Path(record['path'])
        if hashlib.sha256(path.read_bytes()).hexdigest()!=record['sha256']:raise ValueError('PDF checksum mismatch')
        reader=PdfReader(str(path))
        boxes=[sorted((float(p.mediabox.width),float(p.mediabox.height))) for p in reader.pages]
        paper[record['sha256']]='letter' if boxes and all(abs(w-612)<=1 and abs(h-792)<=1 for w,h in boxes) else 'other'
out.write_text(json.dumps(paper,sort_keys=True));print(len(paper),'PDF paper sizes verified')
