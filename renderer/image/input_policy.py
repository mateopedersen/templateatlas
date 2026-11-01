"""Reject automatic external loads before any native document interpreter runs."""
import io
import posixpath
import re
from pathlib import PurePosixPath
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree as ET
from zipfile import ZipFile

MAX_EXPANDED = 32_000_000
MAX_ENTRIES = 750
SVG_ELEMENTS = set('svg g title desc defs clipPath rect circle ellipse line path polyline polygon text tspan pattern linearGradient radialGradient stop marker mask use'.split())
EXTERNAL_FIELD = re.compile(r'\b(INCLUDEPICTURE|INCLUDETEXT|DDE(?:AUTO)?|DATABASE|WEBSERVICE|FILTERXML|IMAGE|RTD|IMPORTXML|IMPORTDATA)\b|\bLINK\s+(?:Excel|Word)\b|(?:file|ftp|smb|https?):/{1,2}|\\\\',re.I)

def reject():
    raise ValueError('Unsupported active or externally linked content.')

def xml(data):
    # All allowed generated documents use UTF-8 XML. Exclude disguised byte-order encodings and entities.
    text = data.decode('utf-8-sig')
    if '\x00' in text or re.search(r'<!\s*(?:DOCTYPE|ENTITY)|<\?(?!xml\s)',text,re.I):
        reject()
    return ET.fromstring(text)

def local(tag): return tag.rsplit('}',1)[-1]

def svg(node):
    for element in node.iter():
        if element.tag not in {'{http://www.w3.org/2000/svg}'+name for name in SVG_ELEMENTS}:
            reject()
        for raw,value in element.attrib.items():
            key = local(raw).lower()
            if key.startswith('on') or key in {'base','src'} or (key=='href' and not re.fullmatch(r'#[\w:.-]+',value)):
                reject()
            if re.search(r'@import|expression\s*\(|/\*|\\',value,re.I):
                reject()
            for target in re.findall(r'url\s*\(([^)]*)\)',value,re.I):
                if not re.fullmatch(r'\s*#[\w:.-]+\s*',target):reject()

def inspect_extra(data,kind):
    if kind=='svg':
        svg(xml(data));return
    state=[0,0]
    def inspect_package(payload,depth):
        with ZipFile(io.BytesIO(payload)) as archive:
            seen=set()
            for part in archive.infolist():
                name=part.filename
                state[0]+=1;state[1]+=part.file_size
                if name in seen or state[0]>MAX_ENTRIES or state[1]>MAX_EXPANDED or part.file_size>8_000_000 or part.flag_bits&1:
                    reject()
                seen.add(name)
                if '..' in PurePosixPath(name).parts or name.startswith('/') or '\\' in name or re.search(r'(?:vbaProject|activex|oleObject|externalLinks|customUI|webExtension)',name,re.I):
                    reject()
                if name.lower().endswith(('.bin','.exe','.dll','.html','.js','.mht','.vbs')):reject()
                if name.lower().endswith('.xlsx'):
                    if depth or '/embeddings/' not in name:reject()
                    inspect_package(archive.read(part),depth+1);continue
                if name.lower().endswith('.svg'):
                    svg(xml(archive.read(part)));continue
                if not name.lower().endswith(('.rels','.xml')):continue
                tree=xml(archive.read(part))
                instructions=[]
                for elem in tree.iter():
                    tag=local(elem.tag)
                    if tag in {'script','foreignObject','oleObject','externalLink','altChunk','attachedTemplate','webExtension'}:reject()
                    if tag=='Relationship':
                        target=unquote(elem.get('Target',''));parsed=urlsplit(target)
                        if any(ord(v)<32 for v in target) or '\\' in target:reject()
                        if elem.get('TargetMode','').lower()=='external':
                            if not elem.get('Type','').endswith('/hyperlink') or parsed.scheme not in {'https','http','mailto'}:reject()
                        else:
                            if parsed.scheme or parsed.netloc:reject()
                            relbase=posixpath.dirname(posixpath.dirname(name))
                            if posixpath.normpath(posixpath.join(relbase,target)).startswith('..'):reject()
                    if tag in {'f','instrText'} and elem.text:
                        if EXTERNAL_FIELD.search(elem.text):reject()
                        if tag=='instrText':instructions.append(elem.text)
                    for key,v in elem.attrib.items():
                        if local(key)=='instr' and EXTERNAL_FIELD.search(v):reject()
                if EXTERNAL_FIELD.search(''.join(instructions)):reject()
    inspect_package(data,0)
