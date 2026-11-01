"""Verify a retained Actions archive, optionally transfer its tested image to Cloudflare."""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile

root=Path(__file__).resolve().parent
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('artifact_directory',type=Path);p.add_argument('--commit',required=True)
p.add_argument('--account');p.add_argument('--node',default='node');p.add_argument('--crane',default='crane')
p.add_argument('--push',action='store_true',help='Upload only the verified renderer image to the named Cloudflare account.')
args=p.parse_args()
if not re.fullmatch('[0-9a-f]{40}',args.commit):p.error('Supply the full approved Git commit.')
if args.push and not re.fullmatch('[0-9a-f]{32}',args.account or ''):p.error('An explicit Cloudflare account ID is required to upload.')
bundle=args.artifact_directory.resolve();data=bundle/'renderer-amd64.tar.gz'
if (bundle/'COMMIT').read_text().strip()!=args.commit:raise SystemExit('Unexpected source commit.')
checksum=(bundle/'SHA256SUMS').read_text().strip().split()
if len(checksum)!=2 or checksum[1]!='renderer-amd64.tar.gz' or not re.fullmatch('[a-f0-9]{64}',checksum[0]):raise SystemExit('Invalid artifact checksum manifest.')
h=hashlib.sha256()
with data.open('rb') as f:
    while chunk:=f.read(4*1024*1024):h.update(chunk)
if h.hexdigest()!=checksum[0]:raise SystemExit('Artifact checksum mismatch.')
with tempfile.TemporaryDirectory(prefix='atlas-renderer-transfer-') as folder:
    scratch=Path(folder);tar=scratch/'renderer.tar';size=0
    with gzip.open(data,'rb') as src,tar.open('wb') as out:
        while chunk:=src.read(2*1024*1024):
            size+=len(chunk)
            if size>4_000_000_000:raise SystemExit('Image exceeds the transfer limit.')
            out.write(chunk)
    with tarfile.open(tar,'r:') as image:
        manifests=json.load(image.extractfile('manifest.json'))
        if len(manifests)!=1 or manifests[0].get('RepoTags')!=['templateatlas-renderer:'+args.commit]:raise SystemExit('Unexpected source image tag.')
        cfg=image.extractfile(manifests[0]['Config']).read();cid='sha256:'+hashlib.sha256(cfg).hexdigest();config=json.loads(cfg)
        declared=(bundle/'IMAGE-ID').read_text().strip().split()
        if declared!=['linux/amd64',cid] or config.get('architecture')!='amd64' or config.get('os')!='linux' or config['config'].get('User')!='10001:10001':raise SystemExit('Image configuration mismatch.')
    if not args.push:
        print('Verified linux/amd64 renderer for '+args.commit+' ('+cid+')');raise SystemExit(0)
    cfg_dir=scratch/'registry-session';cfg_dir.mkdir(mode=0o700)
    environment={**os.environ,'DOCKER_CONFIG':str(cfg_dir),'CLOUDFLARE_ACCOUNT_ID':args.account,'WRANGLER_SEND_METRICS':'false','WRANGLER_LOG_PATH':str(scratch/'wrangler.log')}
    wrangler=root.parent/'node_modules/wrangler/bin/wrangler.js'
    result=subprocess.run([args.node,str(wrangler),'containers','registries','credentials','--push','--pull','--expiration-minutes','45','--json','--config',str(root/'wrangler.json')],cwd=root,env=environment,capture_output=True,check=True,text=True)
    credentials=json.loads(result.stdout)
    subprocess.run([args.crane,'auth','login','registry.cloudflare.com','--username',credentials['username'],'--password-stdin'],input=(credentials['password']+'\n').encode(),env=environment,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
    image_name='registry.cloudflare.com/'+args.account+'/templateatlas-renderer'
    tag=image_name+':'+args.commit
    subprocess.run([args.crane,'push',str(tar),tag],env=environment,check=True)
    digest=subprocess.check_output([args.crane,'digest',tag],env=environment,text=True).strip()
    if not re.fullmatch(r'sha256:[0-9a-f]{64}',digest):raise SystemExit('No verified remote digest.')
    print(image_name+'@'+digest)
