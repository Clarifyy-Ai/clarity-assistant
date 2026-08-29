# -*- coding: utf-8 -*-
"""Supplement: parse drawing XML anchors and refresh media section of JSON."""
import json
import sys
import zipfile
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

WB = Path("Clarify_AI_BB_Manual_QA_Workbook (2).xlsx")
OUT = Path("_qa_br_rsp_extract.json")
IMG_DIR = Path("_qa_br_rsp_images")
IMG_DIR.mkdir(exist_ok=True)

NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
R_EMBED = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"

data = json.loads(OUT.read_text(encoding="utf-8"))
br_rsp_rows = {c["row"] for c in data["tc_br"] + data["tc_rsp"] + data["tc_pub"]}

anchors = []
with zipfile.ZipFile(WB) as zf:
    drawings = [
        n
        for n in zf.namelist()
        if n.startswith("xl/drawings/drawing") and n.endswith(".xml")
    ]
    print("drawings:", drawings)

    sheet_drawing = {}
    for name in zf.namelist():
        if name.startswith("xl/worksheets/_rels/") and name.endswith(".rels"):
            root = ET.fromstring(zf.read(name))
            for rel in root:
                target = rel.attrib.get("Target", "")
                if "drawing" in target.lower():
                    sheet = name.split("/")[-1].replace(".rels", "")
                    if target.startswith("../"):
                        dt = "xl/" + target.replace("../", "")
                    else:
                        dt = "xl/drawings/" + target.split("/")[-1]
                    sheet_drawing[sheet] = dt
    print("sheet->drawing:", sheet_drawing)
    drawing_to_sheets = {}
    for sheet, dpath in sheet_drawing.items():
        drawing_to_sheets.setdefault(dpath, []).append(sheet)

    for dpath in drawings:
        rels_path = dpath.replace("xl/drawings/", "xl/drawings/_rels/") + ".rels"
        rid_to_media = {}
        if rels_path in zf.namelist():
            rroot = ET.fromstring(zf.read(rels_path))
            for rel in rroot:
                rid = rel.attrib.get("Id")
                tgt = rel.attrib.get("Target", "")
                if "media/" in tgt:
                    media = "xl/media/" + tgt.split("/")[-1]
                    rid_to_media[rid] = media

        root = ET.fromstring(zf.read(dpath))
        nodes = list(root.findall("xdr:twoCellAnchor", NS)) + list(
            root.findall("xdr:oneCellAnchor", NS)
        )
        for two in nodes:
            fr = two.find("xdr:from", NS)
            to = two.find("xdr:to", NS)
            blip = two.find(".//a:blip", NS)
            rid = blip.attrib.get(R_EMBED) if blip is not None else None
            media = rid_to_media.get(rid)
            info = {
                "drawing": dpath,
                "sheets": drawing_to_sheets.get(dpath, []),
                "rId": rid,
                "media": media,
                "from": None,
                "to": None,
                "saved": None,
            }
            if fr is not None:
                info["from"] = {
                    "col": int(fr.find("xdr:col", NS).text),
                    "row": int(fr.find("xdr:row", NS).text),
                    "colOff": (
                        fr.find("xdr:colOff", NS).text
                        if fr.find("xdr:colOff", NS) is not None
                        else None
                    ),
                    "rowOff": (
                        fr.find("xdr:rowOff", NS).text
                        if fr.find("xdr:rowOff", NS) is not None
                        else None
                    ),
                }
            if to is not None:
                info["to"] = {
                    "col": int(to.find("xdr:col", NS).text),
                    "row": int(to.find("xdr:row", NS).text),
                }
            if media and media in zf.namelist():
                out = IMG_DIR / Path(media).name
                if not out.exists():
                    out.write_bytes(zf.read(media))
                info["saved"] = str(out)
            anchors.append(info)

print(f"Total image anchors: {len(anchors)}")
print("anchors per drawing:", dict(Counter(a["drawing"] for a in anchors)))

near = []
for a in anchors:
    if not a["from"]:
        continue
    excel_row = a["from"]["row"] + 1
    if excel_row in br_rsp_rows:
        near.append({**a, "excel_row": excel_row})

print(f"Anchors on exact BR/RSP/PUB rows: {len(near)}")
for a in near[:40]:
    print(
        f"  row={a['excel_row']} col={a['from']['col']} sheets={a['sheets']} media={a['media']}"
    )

data["images"] = [
    {
        "drawing": a["drawing"],
        "sheets": a["sheets"],
        "media": a["media"],
        "anchor_from_col": a["from"]["col"] if a["from"] else None,
        "anchor_from_row_0based": a["from"]["row"] if a["from"] else None,
        "excel_row": (a["from"]["row"] + 1) if a["from"] else None,
        "anchor_to": a["to"],
        "saved_path": a["saved"],
    }
    for a in anchors
]
data["images_on_br_rsp_pub_rows"] = [
    {
        "excel_row": a["excel_row"],
        "from_col": a["from"]["col"],
        "sheets": a["sheets"],
        "media": a["media"],
        "saved_path": a["saved"],
    }
    for a in near
]
media_count = data.get("xlsx_package", {}).get("media_count", len(anchors))
data["media_note"] = (
    f"Embedded media: {len(anchors)} anchored images in drawings; "
    f"{media_count} xl/media files. Extracted to _qa_br_rsp_images/. "
    "openpyxl ws._images was empty; anchors parsed from drawing XML."
)

print("\nBR/RSP hyperlinks/urls:")
for rec in data["tc_br"] + data["tc_rsp"]:
    print(
        rec["Test Case ID"],
        "hl=",
        rec.get("hyperlinks"),
        "urls=",
        rec.get("urls"),
    )

OUT.write_text(
    json.dumps(data, indent=2, ensure_ascii=False, default=str), encoding="utf-8"
)
print("JSON updated:", OUT)
