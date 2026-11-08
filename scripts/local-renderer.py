"""Private, local-only native document conversion. No account, upload directory, or external URL is exposed."""
import argparse
import hmac
import io
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import threading
import warnings
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from xml.etree import ElementTree as ET
from zipfile import ZipFile, BadZipFile
from pypdf import PdfReader, PdfWriter, PageObject, Transformation

MAX_BYTES = 8_000_000
MAX_XML_BYTES = 32_000_000
MIMES = {'pdf':'application/pdf','jpg':'image/jpeg','preview-jpg':'image/jpeg'}
SLOTS = threading.BoundedSemaphore(2)

def inspect_xml(payload):
    # Match the production policy: generated native XML is UTF-8 only.
    text=payload.decode('utf-8-sig')
    lower=text.lower()
    if '\x00' in text or '<!doctype' in lower or '<!entity' in lower:
        raise ValueError('Unsupported XML declarations.')
    if re.search(r'<(?:[\w-]+:)?(?:script|foreignobject|oleobject)\b',lower):
        raise ValueError('Unsupported active content.')
    if re.search(r'\b(?:includetext|includepicture|ddeauto)\b',lower):
        raise ValueError('Unsupported external field.')
    return ET.fromstring(text)

def inspect_svg(data):
    root=inspect_xml(data)
    if root.tag!='{http://www.w3.org/2000/svg}svg':
        raise ValueError('SVG root required.')
    for node in root.iter():
        for attr,v in node.attrib.items():
            a=attr.split('}')[-1].lower()
            if a.startswith('on') or (a in ('href','src') and not v.startswith('#')) or re.search(r'url\(\s*(?!#)',v,re.I):
                raise ValueError('External SVG content is unsupported.')
        if node.tag.split('}')[-1].lower()=='style' and re.search(r'@import|url\(',node.text or '',re.I):
            raise ValueError('External SVG styles are unsupported.')

def inspect_source(data,kind):
    if kind=='svg':
        inspect_svg(data)
        return
    expected={'xlsx':'xl/workbook.xml','docx':'word/document.xml','pptx':'ppt/presentation.xml'}[kind]
    with ZipFile(io.BytesIO(data)) as archive:
        entries=archive.infolist()
        if len(entries)>750 or sum(f.file_size for f in entries)>MAX_XML_BYTES or expected not in archive.namelist():
            raise ValueError('Unsupported package size or format.')
        for info in entries:
            name=info.filename
            if name.startswith('/') or '..' in Path(name).parts or info.file_size>MAX_BYTES or info.flag_bits&1 or re.search(r'(vbaproject|activex|oleobject|externallinks)',name,re.I):
                raise ValueError('Unsupported package component.')
            if name.endswith('.rels'):
                for rel in inspect_xml(archive.read(info)):
                    if rel.get('TargetMode')=='External' and not rel.get('Type','').endswith('/hyperlink'):
                        raise ValueError('External data relationships are unsupported.')
            elif name.lower().endswith('.svg'):
                inspect_svg(archive.read(info))
            elif name.lower().endswith('.xml'):
                inspect_xml(archive.read(info))

def run(args,timeout):
    subprocess.run(args,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=timeout,check=True,env={**os.environ,'SAL_DISABLE_OPENCL':'1'})

def render(data,source_format,output_format):
    inspect_source(data,source_format)
    with tempfile.TemporaryDirectory(prefix='templateatlas-render-') as folder:
        private=Path(folder)
        src=private/('source.'+source_format)
        src.write_bytes(data)
        profile=(private/'profile').as_uri()
        run([OFFICE,'-env:UserInstallation='+profile,'--headless','--nologo','--norestore','--nodefault','--convert-to','pdf','--outdir',str(private),str(src)],45)
        output=private/'source.pdf'
        if not output.is_file() or output.stat().st_size<50 or output.stat().st_size>MAX_BYTES:
            raise ValueError('PDF conversion failed.')
        reader=PdfReader(output)
        if not 1<=len(reader.pages)<=180:
            raise ValueError('Unsupported page count.')
        if source_format=='svg':
            page=reader.pages[0];width=float(page.mediabox.width);height=float(page.mediabox.height)
            if min(width,height)<=0 or max(width,height)>20000:
                raise ValueError('Invalid graphic dimensions.')
            landscape=width>=height;w,h=(792,612) if landscape else (612,792)
            if abs(w-width)>2 or abs(h-height)>2:
                blank=PageObject.create_blank_page(width=w,height=h);scale=min((w-48)/width,(h-48)/height)
                blank.merge_transformed_page(page,Transformation().scale(scale).translate((w-width*scale)/2,(h-height*scale)/2))
                fixed=private/'letter.pdf';writer=PdfWriter();writer.add_page(blank);writer.write(fixed);output=fixed
        if output_format in ('jpg','preview-jpg'):
            preview=output_format=='preview-jpg'
            run([POPPLER,'-f','1','-l','1','-singlefile','-scale-to','480' if preview else '1800','-jpeg','-jpegopt','quality=58' if preview else 'quality=92','-r','160',str(output),str(private/'page')],20)
            output=private/'page.jpg'
            if preview:
                from PIL import Image, ImageDraw
                with Image.open(output) as src_image:
                    img=src_image.convert('RGB')
                draw=ImageDraw.Draw(img)
                label='TEMPLATEATLAS  /  DOCUMENT PREVIEW'
                x=8; y=max(0,img.height-20)
                draw.rectangle((0,y-2,min(img.width,226),img.height),fill='#f4ede2')
                draw.text((x,y),label,fill='#623849')
                img.save(output,format='JPEG',quality=58,optimize=True)
                if max(img.size)>480 or output.stat().st_size>120000:
                    raise ValueError('Invalid preview dimensions.')
        if output.stat().st_size>MAX_BYTES:
            raise ValueError('Rendered file is too large.')
        return output.read_bytes()

class PrivateHandler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def answer(self,code,data=b'',mime='text/plain'):
        self.send_response(code)
        self.send_header('Content-Type',mime);self.send_header('Cache-Control','private, no-store')
        self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Length',str(len(data)));self.end_headers()
        if data:self.wfile.write(data)
    def do_GET(self):
        if self.path!='/health' or not self.authorized():self.answer(404);return
        self.answer(200,b'ready')
    def authorized(self):
        return hmac.compare_digest(self.headers.get('Authorization','').encode(),b'Bearer '+SECRET.encode())
    def do_POST(self):
        if self.path!='/v1/render' or not self.authorized():self.answer(404);return
        fmt=self.headers.get('X-Source-Format','');out=self.headers.get('X-Output-Format','')
        if fmt not in ['svg','pptx','xlsx','docx'] or out not in MIMES or self.headers.get('Content-Type')!='application/octet-stream':
            self.answer(400);return
        try:n=int(self.headers.get('Content-Length',''))
        except ValueError:n=0
        if not 0<n<=MAX_BYTES:self.answer(413);return
        if not SLOTS.acquire(timeout=3):self.answer(503);return
        try:
            self.connection.settimeout(15);data=self.rfile.read(n)
            if len(data)!=n:raise ValueError('Incomplete input.')
            result=render(data,fmt,out);self.answer(200,result,MIMES[out])
        except (ValueError,BadZipFile,ET.ParseError,TimeoutError,subprocess.SubprocessError,OSError):
            self.answer(422)
        finally:SLOTS.release()

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,required=True);parser.add_argument('--soffice',default='soffice');parser.add_argument('--pdftoppm',default='pdftoppm')
    args=parser.parse_args()
    SECRET=os.environ.get('TEMPLATEATLAS_RENDER_SECRET','');OFFICE=shutil.which(args.soffice);POPPLER=shutil.which(args.pdftoppm)
    if not OFFICE or not POPPLER or len(SECRET)<32 or not 1024<=args.port<=65535:
        raise SystemExit('Provide a 32-character renderer secret, a local port, LibreOffice, and Poppler.')
    server=ThreadingHTTPServer(('127.0.0.1',args.port),PrivateHandler)
    print('TemplateAtlas private renderer ready on loopback port '+str(args.port),flush=True);server.serve_forever()
