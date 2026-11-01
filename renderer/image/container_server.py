"""Cloudflare-private transport for the same local converter used by Form and Chart Studio."""
import os
import signal
import subprocess
import sys
import tempfile
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parent))
import renderer_impl as core
from input_policy import inspect_extra

def confined_run(args,timeout):
    if args[0] not in {core.OFFICE,core.POPPLER}:raise ValueError('Unknown converter.')
    with tempfile.TemporaryDirectory(prefix='renderer-env-') as scratch:
        env={'HOME':scratch,'XDG_CACHE_HOME':scratch,'TMPDIR':scratch,'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','SAL_DISABLE_OPENCL':'1','SAL_USE_VCLPLUGIN':'svp'}
        command=['/usr/bin/prlimit','--cpu=65:65','--core=0:0','--nofile=512:512','--fsize=67108864:67108864','--','/usr/bin/python3','-I','/opt/renderer/locked_exec.py',*args]
        with subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,cwd=scratch,env=env,start_new_session=True) as child:
            try:
                if child.wait(timeout=timeout):raise subprocess.CalledProcessError(child.returncode,command)
            except subprocess.TimeoutExpired:
                try:os.killpg(child.pid,signal.SIGKILL)
                except ProcessLookupError:pass
                child.wait();raise

def main():
    core.SECRET=os.environ.pop('TEMPLATEATLAS_RENDER_SECRET','')
    if len(core.SECRET)<32:raise SystemExit('Missing private transport authentication.')
    core.OFFICE='/usr/bin/soffice';core.POPPLER='/usr/bin/pdftoppm'
    core.SLOTS=threading.BoundedSemaphore(1)
    original_check=core.inspect_source
    def check(data,kind):
        inspect_extra(data,kind);original_check(data,kind)
    core.inspect_source=check;core.run=confined_run
    os.umask(0o077)
    with ThreadingHTTPServer(('0.0.0.0',8080),core.PrivateHandler) as server:server.serve_forever()

if __name__=='__main__':main()
