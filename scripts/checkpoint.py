"""Create or restore an offline local installation snapshot. Restores require a new directory."""
import argparse,hashlib,json,os,stat,zipfile
from pathlib import Path,PurePosixPath
def digest(data):return hashlib.sha256(data).hexdigest()
p=argparse.ArgumentParser();p.add_argument('action',choices=['backup','restore']);p.add_argument('archive',type=Path);p.add_argument('state_root',type=Path);args=p.parse_args()
state=args.state_root.resolve();arc=args.archive.resolve()
if args.action=='backup':
    # The operator stops this application's local preview before taking the snapshot.
    if (state/'preview.pid').is_file():
        pid=int((state/'preview.pid').read_text())
        try:os.kill(pid,0)
        except ProcessLookupError:pass
        else:raise SystemExit('Stop the local preview before saving a consistent checkpoint.')
    if not (state/'state/v3').is_dir() or not (state/'local-development.json').is_file():raise SystemExit('Select the application .wrangler directory.')
    if arc.exists() or state in arc.parents:raise SystemExit('Choose a new private archive outside the state directory.')
    files=[f for f in (state/'state').rglob('*') if f.is_file() and not f.is_symlink()]
    files += [state/'local-development.json']
    temp=arc.with_name(arc.name+'.partial');receipts={}
    with os.fdopen(os.open(temp,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600),'wb') as out, zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=2) as z:
        for f in sorted(files):
            name=f.relative_to(state).as_posix();data=f.read_bytes();z.writestr(name,data);receipts[name]=digest(data)
        z.writestr('CHECKSUMS.json',json.dumps(receipts,separators=(',',':')))
    os.replace(temp,arc);print(len(files),'private state files backed up')
else:
    if state.exists():raise SystemExit('Restore into a new directory; the existing installation is preserved.')
    with zipfile.ZipFile(arc) as z:
        receipts=json.loads(z.read('CHECKSUMS.json'));names=z.namelist()
        if len(names)!=len(set(names)) or set(names)!=(set(receipts)|{'CHECKSUMS.json'}):raise SystemExit('Unexpected archive inventory')
        for name,sha in receipts.items():
            f=PurePosixPath(name)
            if f.is_absolute() or '..' in f.parts or not (name.startswith('state/') or name=='local-development.json') or digest(z.read(name))!=sha:raise SystemExit('Invalid checkpoint entry')
        state.mkdir(parents=True,mode=0o700)
        for name in receipts:
            f=state/name;f.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
            with os.fdopen(os.open(f,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600),'wb') as out:out.write(z.read(name))
    print(len(receipts),'private state files restored and verified')
