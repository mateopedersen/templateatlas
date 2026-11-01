"""Build sanitized catalog metadata from private, render-verified production receipts."""
import argparse, hashlib, json, shutil
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('indexes',nargs='+',type=Path)
args=p.parse_args()
root=Path(__file__).resolve().parents[1]
seeds={s['seed_id']:s for s in json.loads((root/'src/data/seeds.json').read_text())}
public=[]; seen=set()
def verified(path,expected):
    path=Path(path)
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=expected:
        raise ValueError(f'File mismatch: {path.name}')
    return path
for index in args.indexes:
    for r in json.loads(index.read_text()):
        rid=r['id']
        assert rid in seeds and rid not in seen and r['stage']=='render_verified'
        seen.add(rid)
        files={}
        for fmt,asset in r['files'].items():
            path=verified(asset['path'],asset['sha256'])
            assert path.suffix.lower() == '.'+fmt and path.stat().st_size==asset['bytes'] and asset['bytes']>0
            files[fmt]={k:asset[k] for k in ('mime','bytes','sha256')}
        assert 'pdf' in files and len(files)>1
        preview=verified(r['preview'],r['preview_sha256'])
        target=Path('previews')/(r['preview_sha256'][:24]+preview.suffix)
        dest=root/'public'/target; dest.parent.mkdir(parents=True,exist_ok=True)
        if not dest.exists():shutil.copyfile(preview,dest)
        public.append({'id':rid,'title':r['title'],'summary':r['summary'],'formats':list(files),'assets':files,'pages':r['pages'],'preview':'/'+str(target)})
path=root/'src/data/release.json'; tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(sorted(public,key=lambda s:s['id']),separators=(',',':'))+'\n');tmp.replace(path)
(root/'src/data/release-id.json').write_text(json.dumps({'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})+'\n')
print(len(public),'verified template records')
