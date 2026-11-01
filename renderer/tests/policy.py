import io
import sys
import unittest
from pathlib import Path
from zipfile import ZipFile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'image'))
from input_policy import inspect_extra

def archive(files):
    out=io.BytesIO()
    with ZipFile(out,'w') as z:
        for name,value in files:z.writestr(name,value)
    return out.getvalue()

class Policy(unittest.TestCase):
    def test_safe_svg(self):inspect_extra(b'<svg xmlns="http://www.w3.org/2000/svg"><defs><path id="a" d="M0 0 L8 8"/></defs><use href="#a"/></svg>','svg')
    def test_svg_external_and_active(self):
        for v in ['<image href="http://169.254.169.254/"/>','<use href="//local"/>','<g xml:base="file:///tmp"><use href="#a"/></g>','<g style="fill:url(http://127.0.0.1/a)"/>','<foreignObject/>','<script/>']:
            with self.assertRaises(ValueError):inspect_extra(('<svg xmlns="http://www.w3.org/2000/svg">'+v+'</svg>').encode(),'svg')
    def test_nested_workbook_and_hidden_field(self):
        workbook=archive([('xl/worksheets/sheet1.xml','<worksheet><f>WEBSERVICE("http://localhost")</f></worksheet>')])
        for data in [archive([('ppt/embeddings/chart.xlsx',workbook)]),archive([('word/document.xml','<document><instrText>INCLUDE</instrText><instrText>TEXT</instrText></document>')])]:
            with self.assertRaises(ValueError):inspect_extra(data,'pptx')
    def test_relationships(self):
        for target,mode,kind in [('http://localhost/','','image'),('file:///etc/passwd','External','hyperlink'),('../../../../etc/passwd','','image'),('https://example.org/x','External','image')]:
            rel=f'<Relationships><Relationship Target="{target}" TargetMode="{mode}" Type="urn:office/{kind}"/></Relationships>'
            with self.assertRaises(ValueError):inspect_extra(archive([('word/_rels/document.xml.rels',rel)]),'docx')
        rel='<Relationships><Relationship Target="https://example.org/" TargetMode="External" Type="urn:office/hyperlink"/></Relationships>'
        inspect_extra(archive([('word/_rels/document.xml.rels',rel)]),'docx')

if __name__=='__main__':unittest.main()
