"""Build lightweight public descriptions from the exact distributed native masters."""
import hashlib,json,re,sys,zipfile
from pathlib import Path
from xml.etree import ElementTree as ET
from urllib.parse import urlsplit
root=Path(__file__).resolve().parents[1]
rows=json.loads(Path(sys.argv[1]).read_text());paper=json.loads(Path(sys.argv[2]).read_text())
metadata={}
for r in rows:
    fmt=r['formats'][0];f=r['files'][fmt];file=Path(f['path']);urlset=set();headings=[];count=1
    if hashlib.sha256(file.read_bytes()).hexdigest()!=f['sha256']:raise ValueError('Changed native source')
    if fmt in ('docx','xlsx','pptx'):
        with zipfile.ZipFile(file) as z:
            targets=[]
            if fmt=='docx':
                targets=['word/document.xml']
                doc=ET.fromstring(z.read(targets[0]))
                for p in doc.findall('.//{*}p'):
                    st=p.find('{*}pPr/{*}pStyle');v=next(iter(st.attrib.values()),'') if st is not None else ''
                    t=''.join(p.itertext()).strip()
                    if v.startswith('Heading') and 2<=len(t)<=65 and '[' not in t:headings.append(t)
                count=r['pages']
            elif fmt=='xlsx':
                sheets=ET.fromstring(z.read('xl/workbook.xml')).findall('.//{*}sheet')
                headings=[s.attrib['name'] for s in sheets];count=len(sheets)
                targets=[p for p in z.namelist() if re.fullmatch(r'xl/worksheets/sheet\d+.xml|xl/sharedStrings.xml',p)]
            else:
                targets=[p for p in z.namelist() if re.fullmatch(r'ppt/slides/slide\d+.xml',p)];count=len(targets)
                for path in sorted(targets):
                    texts=[t.text for t in ET.fromstring(z.read(path)).findall('.//{*}t') if t.text and 3<len(t.text)<65 and '[' not in t.text]
                    if texts:headings.append(texts[0])
            for n in targets:
                xml=ET.fromstring(z.read(n))
                for t in xml.itertext():
                    for url in re.findall(r'https?://[^\s<>"\[\]]+',t):
                        url=url.rstrip('.,;:)'); host=urlsplit(url).hostname or ''
                        if '.' in host and len(url)<400 and not host.endswith(('.example','.test','.local')) and host not in ('example.org','example.com','templateatlas.com') and urlsplit(url).username is None:urlset.add(url)
    metadata[r['id']]={'hash':f['sha256'],'format':fmt,'count':count,'sections':list(dict.fromkeys(headings))[:4],'references':sorted(urlset)[:4],'paper':paper.get(r['files']['pdf']['sha256'],'other')}
out=root/'src/data/file-facts.json';out.write_text(json.dumps(metadata,ensure_ascii=False,separators=(',',':'))+'\n');print(len(metadata),'native files inspected')

