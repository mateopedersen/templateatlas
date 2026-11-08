"""Tiny parser-only source regression; run only in the parent's isolated fixture.

The full renderer module is never imported. Only its actual inspect_xml function
is selected from AST, compiled, and exercised with bounded dummy XML. No native
converter, pypdf, subprocess, HTTP listener, external document, or entity nesting.
"""
import argparse
import ast
import codecs
from pathlib import Path
import re
import sys
import unittest
from xml.etree import ElementTree


class ParserTrace:
    def __init__(self):
        self.calls = 0

    def fromstring(self, payload):
        self.calls += 1
        return ElementTree.fromstring(payload)


def load_actual_function(source_path):
    path = Path(source_path)
    raw = path.read_bytes()
    if len(raw) > 16_384:
        raise ValueError("Source fixture exceeds its small file bound.")
    tree = ast.parse(raw.decode("utf-8"), filename=str(path))
    definitions = [
        node for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "inspect_xml"
    ]
    if len(definitions) != 1 or definitions[0].decorator_list:
        raise ValueError("Expected one plain inspect_xml function.")
    trace = ParserTrace()
    namespace = {"re": re, "ET": trace}
    # This is the only target-controlled code executed, inside the approved
    # parent sandbox. All other renderer definitions and imports are excluded.
    selected = ast.Module(body=definitions, type_ignores=[])
    exec(compile(selected, str(path), "exec"), namespace)
    return namespace["inspect_xml"], trace


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--source", required=True)
parser.add_argument("--expected", required=True, choices=("baseline", "proposal"))
options, unittest_args = parser.parse_known_args()
inspect_xml, trace = load_actual_function(options.source)


class XmlPolicy(unittest.TestCase):
    def setUp(self):
        trace.calls = 0

    def test_normal_utf8_xml_and_escaped_ampersand(self):
        root = inspect_xml("<root><name>Rīga &amp; Jelgava — mēnesis</name></root>".encode("utf-8"))
        self.assertEqual(root.tag, "root")
        self.assertEqual(root.find("name").text, "Rīga & Jelgava — mēnesis")
        self.assertEqual(trace.calls, 1)

    def test_utf8_bom_and_normal_xml_declaration(self):
        for prefix in (b"", codecs.BOM_UTF8):
            with self.subTest(bom=bool(prefix)):
                root = inspect_xml(prefix + b'<?xml version="1.0" encoding="UTF-8"?><root value="A &amp; B"/>')
                self.assertEqual(root.get("value"), "A & B")

    def test_svg_namespace_remains_ordinary_xml(self):
        root = inspect_xml(
            b'<svg xmlns="http://www.w3.org/2000/svg"><text>Calendar &amp; plans</text></svg>'
        )
        self.assertEqual(root.tag, "{http://www.w3.org/2000/svg}svg")
        self.assertEqual(root[0].text, "Calendar & plans")

    def test_office_namespace_and_non_ascii_text_are_preserved(self):
        root = inspect_xml(
            '<w:document xmlns:w="urn:office:test"><w:p><w:t>Plāns: 08.11.2026.</w:t></w:p></w:document>'.encode("utf-8")
        )
        self.assertEqual(root.tag, "{urn:office:test}document")
        self.assertEqual(root[0][0].text, "Plāns: 08.11.2026.")

    def test_utf8_dtd_is_rejected_before_parsing(self):
        # One harmless constant entity; no nesting, external reference or load.
        payload = b'<!DOCTYPE root [<!ENTITY marker "ENTITY_MARKER">]><root>&marker;</root>'
        with self.assertRaises(ValueError):
            inspect_xml(payload)
        self.assertEqual(trace.calls, 0)

    def test_utf16_single_entity_exposes_only_the_baseline_encoding_gap(self):
        xml = '<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE root [<!ENTITY marker "ENTITY_MARKER">]><root>&marker;</root>'
        for encoding, bom in (("utf-16-le", codecs.BOM_UTF16_LE), ("utf-16-be", codecs.BOM_UTF16_BE)):
            with self.subTest(encoding=encoding):
                trace.calls = 0
                payload = bom + xml.encode(encoding)
                self.assertLess(len(payload), 512)
                if options.expected == "baseline":
                    root = inspect_xml(payload)
                    self.assertEqual(root.tag, "root")
                    self.assertEqual(root.text, "ENTITY_MARKER")
                    self.assertEqual(trace.calls, 1)
                else:
                    with self.assertRaises(ValueError):
                        inspect_xml(payload)
                    self.assertEqual(trace.calls, 0)

    def test_utf16_without_bom_fails_before_proposal_parser(self):
        if options.expected != "proposal":
            self.skipTest("Early UTF-8-only rejection is a proposal invariant.")
        for encoding in ("utf-16-le", "utf-16-be"):
            with self.subTest(encoding=encoding):
                with self.assertRaises(ValueError):
                    inspect_xml("<root>ordinary</root>".encode(encoding))
                self.assertEqual(trace.calls, 0)

    def test_nul_input_rejected(self):
        with self.assertRaises((ValueError, ElementTree.ParseError)):
            inspect_xml(b"<root>\x00</root>")
        self.assertEqual(trace.calls, 0 if options.expected == "proposal" else 1)

    def test_active_elements_and_external_field_checks_are_preserved(self):
        for payload in (
            b"<root><script/></root>",
            b"<root><x:foreignObject xmlns:x='urn:test'/></root>",
            b"<root><oleObject/></root>",
            b"<root>INCLUDETEXT example</root>",
            b"<root>DDEAUTO example</root>",
        ):
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError):
                    inspect_xml(payload)
                self.assertEqual(trace.calls, 0)


if __name__ == "__main__":
    unittest.main(argv=[sys.argv[0], *unittest_args])
