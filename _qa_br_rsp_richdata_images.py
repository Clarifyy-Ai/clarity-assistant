# -*- coding: utf-8 -*-
"""Map Excel richData/DISPIMG cell images to rows and update JSON."""
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

WB = Path("Clarify_AI_BB_Manual_QA_Workbook (2).xlsx")
OUT = Path("_qa_br_rsp_extract.json")
IMG_DIR = Path("_qa_br_rsp_images")
IMG_DIR.mkdir(exist_ok=True)

data = json.loads(OUT.read_text(encoding="utf-8"))
br_rsp_rows = {c["row"] for c in data["tc_br"] + data["tc_rsp"] + data["tc_pub"]}
case_by_row = {
    c["row"]: c["Test Case ID"]
    for c in data["tc_br"] + data["tc_rsp"] + data["tc_pub"]
}

NS_MAIN = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

images = []
with zipfile.ZipFile(WB) as zf:
    # rid -> media from richValueRel
    rid_media = {}
    rels = ET.fromstring(zf.read("xl/richData/_rels/richValueRel.xml.rels"))
    for rel in rels:
        rid = rel.attrib.get("Id")
        tgt = rel.attrib.get("Target", "")
        if "media" in tgt:
            media = "xl/media/" + tgt.split("/")[-1]
            rid_media[rid] = media
    print("richValueRel media links:", len(rid_media))

    # rich value index -> rId (often in richValueRel.xml)
    idx_rid = {}
    if "xl/richData/richValueRel.xml" in zf.namelist():
        rvrel = ET.fromstring(zf.read("xl/richData/richValueRel.xml"))
        # print structure sample
        print("richValueRel root tag:", rvrel.tag)
        for i, child in enumerate(list(rvrel)[:5]):
            print(" child", i, child.tag, child.attrib, [(c.tag, c.attrib, c.text) for c in list(child)[:5]])
        # Try common patterns
        for i, child in enumerate(rvrel):
            # look for r:id or similar
            rid = None
            for attr, val in child.attrib.items():
                if attr.endswith("id") or attr.endswith("Id") or "id" in attr.lower():
                    if val.startswith("rId"):
                        rid = val
            for sub in child.iter():
                for attr, val in sub.attrib.items():
                    if val.startswith("rId"):
                        rid = val
            if rid:
                idx_rid[i] = rid
    print("idx->rid count", len(idx_rid), "sample", list(idx_rid.items())[:5])

    # Also parse rdrichvalue for LocalImageMetadata / relationships
    if "xl/richData/rdrichvalue.xml" in zf.namelist():
        rdv = ET.fromstring(zf.read("xl/richData/rdrichvalue.xml"))
        print("rdrichvalue root", rdv.tag, "nchildren", len(list(rdv)))
        for i, child in enumerate(list(rdv)[:3]):
            print(" rv", i, child.tag, child.attrib)
            for sub in list(child)[:8]:
                print("   ", sub.tag, sub.attrib, (sub.text or "")[:80])

    # workbook sheet order
    wbxml = ET.fromstring(zf.read("xl/workbook.xml"))
    sheets = []
    for sh in wbxml.findall("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheets/{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet"):
        sheets.append((sh.attrib.get("name"), sh.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")))
    print("sheets", sheets)

    # sheet rels: rId -> sheet path
    wb_rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    rid_to_sheetpath = {}
    for rel in wb_rels:
        rid_to_sheetpath[rel.attrib.get("Id")] = "xl/" + rel.attrib.get("Target", "").lstrip("/")

    # Find DISPIMG / _xlvm.item in shared strings or cells
    # Modern Excel: cells contain =DISPIMG("ID_...",1) in formula, or rich value index
    dispimg_re = re.compile(r'DISPIMG\("([^"]+)"', re.I)

    # Map image id from metadata if present
    meta_map = {}
    if "xl/metadata.xml" in zf.namelist():
        meta = zf.read("xl/metadata.xml").decode("utf-8", errors="replace")
        # print snippet around FutureMetadata / RichValue
        print("metadata size", len(meta))

    # Scan each worksheet for vm/metadata attributes and DISPIMG
    for sname, rid in sheets:
        spath = rid_to_sheetpath.get(rid)
        if not spath or spath not in zf.namelist():
            print("missing sheet", sname, rid, spath)
            continue
        raw = zf.read(spath).decode("utf-8", errors="replace")
        # count dispimg
        ids = dispimg_re.findall(raw)
        print(f"{sname}: DISPIMG refs={len(ids)} unique={len(set(ids))}")

        # parse cells with vm attribute (rich value index) or f containing DISPIMG
        root = ET.fromstring(zf.read(spath))
        ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        for c in root.findall(".//m:c", ns):
            ref = c.attrib.get("r")
            vm = c.attrib.get("vm")  # value metadata index
            f = c.find("m:f", ns)
            v = c.find("m:v", ns)
            formula = f.text if f is not None else None
            img_id = None
            if formula and "DISPIMG" in formula.upper():
                m = dispimg_re.search(formula)
                if m:
                    img_id = m.group(1)
            if vm is None and img_id is None:
                continue
            # parse A1 ref
            mref = re.match(r"([A-Z]+)(\d+)", ref or "")
            if not mref:
                continue
            col_letters, row_s = mref.group(1), int(mref.group(2))
            col_num = 0
            for ch in col_letters:
                col_num = col_num * 26 + (ord(ch) - 64)
            images.append(
                {
                    "sheet": sname,
                    "cell": ref,
                    "excel_row": row_s,
                    "excel_col": col_num,
                    "vm_index": int(vm) if vm is not None else None,
                    "dispimg_id": img_id,
                    "formula": formula,
                    "test_case_id": case_by_row.get(row_s),
                }
            )

    # Resolve vm_index / dispimg to media via rich data structures
    # Read structure files fully for mapping hints
    structure = zf.read("xl/richData/rdrichvaluestructure.xml").decode("utf-8", errors="replace")
    types = zf.read("xl/richData/rdRichValueTypes.xml").decode("utf-8", errors="replace")
    print("structure head:", structure[:500])
    print("types head:", types[:500])
    rvrel_xml = zf.read("xl/richData/richValueRel.xml").decode("utf-8", errors="replace")
    print("richValueRel.xml head:", rvrel_xml[:800])

    # Extract all media anyway
    media_files = [n for n in zf.namelist() if n.startswith("xl/media/")]
    for n in media_files:
        out = IMG_DIR / Path(n).name
        if not out.exists():
            out.write_bytes(zf.read(n))

    # Try map: richValueRel order often matches image index
    # Parse rels in order
    rel_order = []
    for rel in ET.fromstring(zf.read("xl/richData/_rels/richValueRel.xml.rels")):
        tgt = rel.attrib.get("Target", "")
        rid = rel.attrib.get("Id")
        if "media" in tgt:
            rel_order.append((rid, "xl/media/" + Path(tgt).name))

    # richValueRel.xml often lists <rel r:id="rIdN" .../> in value order
    rv_root = ET.fromstring(zf.read("xl/richData/richValueRel.xml"))
    value_media = []
    for child in rv_root.iter():
        for attr, val in child.attrib.items():
            if val.startswith("rId") and val in rid_media:
                value_media.append(rid_media[val])
    print("value_media mapped count", len(value_media))

    # If vm_index is 1-based into value_media
    for img in images:
        vm = img.get("vm_index")
        media = None
        if vm is not None and 1 <= vm <= len(value_media):
            media = value_media[vm - 1]
        elif vm is not None and 0 <= vm < len(value_media):
            media = value_media[vm]
        img["media"] = media
        img["saved_path"] = str(IMG_DIR / Path(media).name) if media else None

# Stats
print(f"\nCell image refs found: {len(images)}")
on_cases = [i for i in images if i.get("test_case_id")]
print(f"On BR/RSP/PUB rows: {len(on_cases)}")
for i in on_cases[:50]:
    print(i)

# Also show RSP/BR specifically
print("\nBR/RSP image cells:")
for i in images:
    tid = i.get("test_case_id") or ""
    if tid.startswith("TC-BR-") or tid.startswith("TC-RSP-"):
        print(i)

data["images"] = images
data["images_on_br_rsp_pub_rows"] = on_cases
data["media_note"] = (
    f"Excel richData/DISPIMG cell images (not classic drawings). "
    f"{len(media_files)} xl/media files extracted to _qa_br_rsp_images/. "
    f"{len(images)} cell image references found; {len(on_cases)} on BR/RSP/PUB rows. "
    "No classic xdr drawings; media is embedded via rich values / DISPIMG."
)
data["xlsx_package"]["drawing_files"] = []
data["xlsx_package"]["rich_data"] = True

OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
print("Updated", OUT)
