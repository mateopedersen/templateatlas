"""Run inside the built image. All input is generated test data."""
import io
import os
import time
import urllib.error
import urllib.request
from zipfile import ZipFile
from PIL import Image
from pypdf import PdfReader

secret=os.environ['TEMPLATEATLAS_RENDER_SECRET']
origin='http://127.0.0.1:8080'

def request(path,data=None,source='',out='',token=secret):
    req=urllib.request.Request(origin+path,data=data,headers={'Authorization':'Bearer '+token,'Content-Type':'application/octet-stream','X-Source-Format':source,'X-Output-Format':out})
    try:
        with urllib.request.urlopen(req,timeout=65) as r:return r.status,r.read()
    except urllib.error.HTTPError as e:return e.code,e.read()

for attempt in range(30):
    try:
        if request('/health')[0]==200:break
    except OSError:pass
    time.sleep(.4)
else:raise RuntimeError('Private converter did not become ready.')
assert request('/health',token='untrusted')[0]==404
svg=b'<svg xmlns="http://www.w3.org/2000/svg" width="576" height="300" viewBox="0 0 576 300"><rect width="576" height="300" fill="#ffffff"/><text x="20" y="60">Synthetic renderer check</text></svg>'
for fmt in ('pdf','jpg','preview-jpg'):
    status,data=request('/v1/render',svg,'svg',fmt)
    assert status==200,(fmt,status)
    if fmt=='pdf':
        page=PdfReader(io.BytesIO(data)).pages[0];assert abs(float(page.mediabox.width)-792)<2
    else:
        im=Image.open(io.BytesIO(data));assert im.format=='JPEG';assert max(im.size)==(480 if fmt=='preview-jpg' else 1800)

def document():
    b=io.BytesIO()
    with ZipFile(b,'w') as z:
        z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
        z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Native Word test</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>')
    return b.getvalue()
status,data=request('/v1/render',document(),'docx','pdf');assert status==200,status
assert 'Native Word test' in PdfReader(io.BytesIO(data)).pages[0].extract_text()
assert request('/v1/render',b'<svg xmlns="http://www.w3.org/2000/svg"><image href="http://169.254.169.254/"/></svg>','svg','pdf')[0]==422
print('HTTP auth, Word/PDF, SVG/PDF, JPEG, watermarked preview dimensions and external-image rejection passed.')
