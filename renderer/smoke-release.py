"""Exercise the public app with fresh anonymous cookies. No admin, provider or infrastructure API calls."""
import argparse
import hashlib
import http.cookiejar
import io
import json
import os
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from pypdf import PdfReader
from PIL import Image

class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args):return None

def session():
    return urllib.request.build_opener(NoRedirects(),urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

class SmokeError(Exception):pass

def expect(value,message):
    if not value:raise SmokeError(message)

class Check:
    def __init__(self,origin):
        self.origin=origin.rstrip('/');self.owner=session();self.stranger=session();self.docs=[];self.steps=[];self.start=time.time()
    def passed(self,name,**summary):
        self.steps.append(dict(check=name,**summary));print('PASS '+name,flush=True)
    def req(self,path,body=None,method=None,who=None,allowed=(200,),idem=False):
        if not path.startswith('/api/') or path.startswith('//'):raise SmokeError('Unsafe response path.')
        headers={'Origin':self.origin,'Accept':'*/*','User-Agent':'TemplateAtlas-release-check/1.0'}
        if body is not None:headers['Content-Type']='application/json'
        if idem:headers['Idempotency-Key']=str(uuid.uuid4())
        request=urllib.request.Request(self.origin+path,data=None if body is None else json.dumps(body,ensure_ascii=False).encode(),headers=headers,method=method)
        try:response=(who or self.owner).open(request,timeout=95)
        except urllib.error.HTTPError as e:response=e
        except (TimeoutError,urllib.error.URLError,socket.timeout):raise SmokeError('Application request timed out or could not connect.') from None
        with response as result:
            data=result.read(8_000_001);status=result.status
            expect(len(data)<=8_000_000,'Unexpected application response size.')
            if status not in allowed:
                try:code=json.loads(data).get('code','unclassified')
                except Exception:code='non-JSON response'
                raise SmokeError(f'{method or ("POST" if body is not None else "GET")} {path.split("/")[2]} returned HTTP {status} ({code}).')
            return status,result.headers,data
    def api(self,path,*args,**kw):
        code,headers,body=self.req(path,*args,**kw);return json.loads(body)
    def create(self,obj):
        doc=self.api('/api/documents',obj);ident=doc.get('id');expect(isinstance(ident,str) and len(ident)==36,'Missing saved document receipt.')
        self.docs.append(ident);return ident,doc['revision']
    def download_chart(self,ident,rev,fmt):
        started=time.monotonic();job=self.api('/api/exports',{'documentId':ident,'documentRevision':rev,'format':fmt,'paper':'letter'},allowed=(200,202),idem=True)
        while job.get('state') in ('queued','running') and time.monotonic()-started<160:
            job_id=job.get('id','');expect(job_id.startswith('exp-') and len(job_id)==68,'Invalid export job receipt.')
            time.sleep(.9);job=self.api('/api/exports/'+job_id)
        expect(job.get('state')=='succeeded','Export did not reach the completed state.')
        intent=job.get('intent',{});expect(intent.get('documentId')==ident and intent.get('documentRevision')==rev and intent.get('format')==fmt,'Export revision changed.')
        ticket=self.api('/api/download-intents',intent,idem=True);p=ticket.get('url','');expect(p.startswith('/api/downloads/'),'Download ticket was not returned.')
        _,headers,body=self.req(p);return headers,body,round(time.monotonic()-started,2)
    def preview(self,ident,revision):
        started=time.monotonic()
        while time.monotonic()-started<155:
            code,h,b=self.req('/api/documents/'+ident+'/preview',{'revision':revision},allowed=(200,202))
            if code==202:time.sleep(1);continue
            expect(h.get_content_type()=='image/jpeg' and h.get('X-Document-Revision')==str(revision),'Preview content type or revision mismatch.')
            expect('no-store' in h.get('Cache-Control',''),'Private preview cache header missing.')
            im=Image.open(io.BytesIO(b));im.load();expect(im.format=='JPEG' and max(im.size)<=480 and 0<len(b)<=120000,'Preview image failed validation.')
            return b,im.size,round(time.monotonic()-started,2)
        raise SmokeError('Private preview did not finish.')
    def run(self):
        summary=self.api('/api/session');expect(summary.get('user') is None,'A fresh guest session was required.')
        free=summary.get('freeUsed');expect(isinstance(free,int),'No free allowance state.');self.api('/api/session',who=self.stranger)
        caps=self.api('/api/chart-capabilities').get('formats',{}).get('line-chart',[]);expect({'pdf','jpg'}<=set(caps),'Production converter is not configured on this application.')
        self.passed('Anonymous session and application converter capabilities')
        signature=uuid.uuid4().hex[:8].upper();chart={'type':'line-chart','title':'Release check '+signature,'headers':['Week','Hours'],'rows':[['Field study',6],['Follow-up',11]],'sample':False,'palette':'ledger','legend':True,'revision':1,'bins':5,'weekStart':'Sunday','opening':0,'connectMissing':False,'axisTitle':'Hours'}
        cid,rev=self.create({'kind':'chart','data':chart})
        h,pdf,latency=self.download_chart(cid,rev,'pdf');expect(h.get_content_type()=='application/pdf' and pdf.startswith(b'%PDF-'),'Invalid PDF download.')
        doc=PdfReader(io.BytesIO(pdf));expect(len(doc.pages)==1,'Expected one chart page.');page=doc.pages[0]
        expect(sorted(round(float(v)) for v in [page.mediabox.width,page.mediabox.height])==[612,792],'Chart PDF is not US Letter.')
        text=' '.join(page.extract_text().split())
        expect(chart['title'] in text and 'Field study' in text and 'Follow-up' in text,'The PDF does not contain the saved chart revision.')
        self.passed('Personalized chart PDF',bytes=len(pdf),pages=1,sha256=hashlib.sha256(pdf).hexdigest(),seconds=latency)
        h,b,latency=self.download_chart(cid,rev,'jpg');im=Image.open(io.BytesIO(b));im.load();expect(h.get_content_type()=='image/jpeg' and im.format=='JPEG' and max(im.size)==1800,'Invalid full-resolution chart JPEG.')
        self.passed('Personalized chart JPEG',bytes=len(b),width=im.width,height=im.height,seconds=latency)
        expect(self.api('/api/session').get('freeUsed')==free+1,'Two formats of one chart consumed an unexpected allowance.')
        self.passed('One logical chart charged once across formats')
        seed='ta-certificate-of-appreciation-001';schema=self.api('/api/template-fields/'+seed)
        expect(schema.get('previewAvailable') is True,'Private first-page previews are disabled.')
        f=next((x for x in schema.get('fields',[]) if x.get('type')=='text' and 'recipient' in x.get('label','').lower()),None)
        expect(f is not None,'Expected certificate recipient field unavailable.')
        data={'title':'Release preview '+signature,'sourceVersion':schema['sourceVersion'],'sourceHash':schema['sourceHash'],'edits':{f['id']:'First test recipient'}}
        ident,rev=self.create({'kind':'template','templateId':seed,'data':data})
        a,dims,l1=self.preview(ident,rev);again,_,l2=self.preview(ident,rev);expect(a==again,'Cached first-page preview returned different bytes.')
        self.req('/api/documents/'+ident+'/preview',{'revision':rev},who=self.stranger,allowed=(404,))
        data['edits'][f['id']]='Second test recipient'
        r=self.api('/api/documents/'+ident,{'expectedRevision':rev,'data':data},method='PATCH');second,w2,l3=self.preview(ident,r['revision'])
        expect(a!=second,'Changing recipient text did not change preview bytes.');expect(self.api('/api/session').get('freeUsed')==free+1,'Preview unexpectedly consumed a selection.')
        self.passed('Native edited preview, repeat cache, changed revision, owner isolation and unchanged quota',width=dims[0],height=dims[1],previewSeconds=l1,repeatSeconds=l2,changedSeconds=l3)
    def cleanup(self):
        failures=0
        for ident in self.docs:
            try:self.api('/api/documents/'+ident,method='DELETE')
            except Exception:failures+=1
        self.steps.append({'check':'Test drafts marked for deletion','requested':len(self.docs),'failed':failures})
        return failures

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--origin',required=True);parser.add_argument('--run',action='store_true',required=True);parser.add_argument('--report',type=Path);args=parser.parse_args()
    u=urllib.parse.urlsplit(args.origin)
    if not ((u.scheme=='https' and u.netloc=='templateatlas.com') or (u.scheme=='http' and u.hostname in ('localhost','127.0.0.1') and u.port and not u.username and not u.password)) or u.path not in ('','/') or u.query or u.fragment:parser.error('Use the production apex or an explicit loopback URL.')
    check=Check(args.origin);problem=None
    try:check.run()
    except Exception as ex:problem=str(ex) if isinstance(ex,SmokeError) else type(ex).__name__
    finally:
        if check.cleanup() and not problem:problem='One or more disposable documents could not be marked for deletion.'
    report={'origin':args.origin,'target':'actual application HTTP','passed':problem is None,'failure':problem,'checks':check.steps,'elapsedSeconds':round(time.time()-check.start,2)}
    if args.report:args.report.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2));raise SystemExit(1 if problem else 0)
