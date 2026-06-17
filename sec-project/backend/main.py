"""
SEC Form Generator — FastAPI Backend
Deploy on Render.com (Free Tier)
"""
import io, math, zipfile, base64, os, subprocess, tempfile
from lxml import etree
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List

# ── App ──────────────────────────────────────────────────────
app = FastAPI(title="SEC Form Generator API", version="1.0.0")

FRONTEND_URL = os.getenv("FRONTEND_URL", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), "FM-QAF-01-02_02_form.xlsx")
SERIAL_REFS   = ["C11", "C16", "C20", "C24", "C28", "C32", "C36", "C40"]
NS            = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
PER_PAGE      = 8


# ── Models ───────────────────────────────────────────────────
class GenRequest(BaseModel):
    serials: List[str]


# ── XLSX builder ─────────────────────────────────────────────
def build_xlsx(serials: List[str]) -> bytes:
    n_pages = max(1, math.ceil(len(serials) / PER_PAGE))

    with zipfile.ZipFile(TEMPLATE_PATH, "r") as z:
        files = {n: z.read(n) for n in z.namelist()}

    s1_xml  = files["xl/worksheets/sheet1.xml"]
    drw_xml = files.get("xl/drawings/drawing1.xml", b"")
    drw_rel = files.get("xl/drawings/_rels/drawing1.xml.rels", b"")
    vml_xml = files.get("xl/drawings/vmlDrawing1.vml", b"")
    vml_rel = files.get("xl/drawings/_rels/vmlDrawing1.vml.rels", b"")

    def inject(xml_bytes: bytes, vals: List[str]) -> bytes:
        tree = etree.fromstring(xml_bytes)
        for ref, val in zip(SERIAL_REFS, vals):
            nodes = tree.xpath(f'//*[local-name()="c"][@r="{ref}"]')
            if nodes and val:
                c = nodes[0]
                for ch in list(c): c.remove(ch)
                c.attrib.pop("t", None)
                c.set("t", "inlineStr")
                is_el = etree.SubElement(c, f"{{{NS}}}is")
                etree.SubElement(is_el, f"{{{NS}}}t").text = val
        return etree.tostring(tree, xml_declaration=True, encoding="UTF-8", standalone=True)

    # files to regenerate
    skip = {"xl/workbook.xml", "xl/_rels/workbook.xml.rels", "[Content_Types].xml"}
    for i in range(1, n_pages + 2):
        for f in [f"xl/worksheets/sheet{i}.xml", f"xl/worksheets/_rels/sheet{i}.xml.rels",
                  f"xl/drawings/drawing{i}.xml", f"xl/drawings/_rels/drawing{i}.xml.rels",
                  f"xl/drawings/vmlDrawing{i}.vml", f"xl/drawings/_rels/vmlDrawing{i}.vml.rels"]:
            skip.add(f)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zout:
        for name, data in files.items():
            if name not in skip:
                zout.writestr(name, data)

        sids = []
        for pg in range(1, n_pages + 1):
            chunk = serials[(pg-1)*PER_PAGE : pg*PER_PAGE]
            chunk += [""] * (PER_PAGE - len(chunk))
            sn = pg

            zout.writestr(f"xl/worksheets/sheet{sn}.xml", inject(s1_xml, chunk))

            rels = (
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                f'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing{sn}.xml"/>'
                + (f'<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing" Target="../drawings/vmlDrawing{sn}.vml"/>' if vml_xml else '')
                + '</Relationships>'
            )
            zout.writestr(f"xl/worksheets/_rels/sheet{sn}.xml.rels", rels.encode())
            zout.writestr(f"xl/drawings/drawing{sn}.xml", drw_xml)
            zout.writestr(f"xl/drawings/_rels/drawing{sn}.xml.rels", drw_rel)
            if vml_xml:
                zout.writestr(f"xl/drawings/vmlDrawing{sn}.vml", vml_xml)
                zout.writestr(f"xl/drawings/_rels/vmlDrawing{sn}.vml.rels", vml_rel)
            sids.append(sn)

        # workbook.xml
        wb = etree.fromstring(files["xl/workbook.xml"])
        sh_el = wb.xpath('//*[local-name()="sheets"]')[0]
        for c in list(sh_el): sh_el.remove(c)
        R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
        for sn in sids:
            s = etree.SubElement(sh_el, f"{{{NS}}}sheet")
            s.set("name", f"Page {sn}"); s.set("sheetId", str(sn))
            s.set(f"{{{R}}}id", f"rId{sn+3}")
        zout.writestr("xl/workbook.xml",
            etree.tostring(wb, xml_declaration=True, encoding="UTF-8", standalone=True))

        # workbook.xml.rels
        wbr = etree.fromstring(files["xl/_rels/workbook.xml.rels"])
        for r in [x for x in wbr if "worksheet" in x.get("Type","")]: wbr.remove(r)
        PKG = "http://schemas.openxmlformats.org/package/2006/relationships"
        for sn in sids:
            r = etree.SubElement(wbr, "Relationship")
            r.set("Id", f"rId{sn+3}")
            r.set("Type", f"{PKG.replace('package','officeDocument')}/relationships/worksheet"
                  .replace("package/2006","officeDocument/2006"))
            r.set("Target", f"worksheets/sheet{sn}.xml")
        # rebuild properly
        for sn in sids:
            r = wbr.find(f'.//*[@Id="rId{sn+3}"]')
            if r is not None:
                r.set("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet")
        zout.writestr("xl/_rels/workbook.xml.rels",
            etree.tostring(wbr, xml_declaration=True, encoding="UTF-8"))

        # [Content_Types].xml
        ct = etree.fromstring(files["[Content_Types].xml"])
        for el in list(ct):
            pn = el.get("PartName","")
            if "/worksheets/sheet" in pn or "/drawings/" in pn: ct.remove(el)
        CT = "http://schemas.openxmlformats.org/package/2006/content-types"
        WS  = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"
        DRW = "application/vnd.openxmlformats-officedocument.drawing+xml"
        VML = "application/vnd.openxmlformats-officedocument.vmlDrawing"
        for sn in sids:
            e = etree.SubElement(ct, f"{{{CT}}}Override")
            e.set("PartName", f"/xl/worksheets/sheet{sn}.xml"); e.set("ContentType", WS)
            e2 = etree.SubElement(ct, f"{{{CT}}}Override")
            e2.set("PartName", f"/xl/drawings/drawing{sn}.xml"); e2.set("ContentType", DRW)
            if vml_xml:
                e3 = etree.SubElement(ct, f"{{{CT}}}Override")
                e3.set("PartName", f"/xl/drawings/vmlDrawing{sn}.vml"); e3.set("ContentType", VML)
        zout.writestr("[Content_Types].xml",
            etree.tostring(ct, xml_declaration=True, encoding="UTF-8"))

    buf.seek(0)
    return buf.read()


def xlsx_to_pdf(xlsx_bytes: bytes) -> bytes:
    with tempfile.TemporaryDirectory() as d:
        xp = os.path.join(d, "form.xlsx")
        with open(xp, "wb") as f: f.write(xlsx_bytes)
        r = subprocess.run(
            ["libreoffice","--headless","--convert-to","pdf","--outdir", d, xp],
            capture_output=True, timeout=90)
        if r.returncode != 0:
            raise RuntimeError(r.stderr.decode())
        pp = os.path.join(d, "form.pdf")
        with open(pp, "rb") as f: return f.read()


def pdf_to_images(pdf_bytes: bytes, dpi=130) -> List[str]:
    with tempfile.TemporaryDirectory() as d:
        pp = os.path.join(d, "doc.pdf")
        with open(pp, "wb") as f: f.write(pdf_bytes)
        subprocess.run(
            ["pdftoppm","-r",str(dpi),"-png", pp, os.path.join(d,"pg")],
            capture_output=True, timeout=60)
        images, i = [], 1
        while True:
            for fmt in [f"pg-{i:02d}.png", f"pg-{i}.png"]:
                p = os.path.join(d, fmt)
                if os.path.exists(p):
                    with open(p,"rb") as f:
                        images.append(base64.b64encode(f.read()).decode())
                    break
            else:
                break
            i += 1
        return images


# ── Routes ───────────────────────────────────────────────────
@app.get("/health")
def health(): return {"status":"ok"}

@app.post("/generate/xlsx")
def gen_xlsx(req: GenRequest):
    if not req.serials: raise HTTPException(400, "No serials")
    try:
        data = build_xlsx(req.serials)
        return StreamingResponse(io.BytesIO(data),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition":"attachment; filename=FM-QAF-01-02_02.xlsx"})
    except Exception as e: raise HTTPException(500, str(e))

@app.post("/generate/pdf")
def gen_pdf(req: GenRequest):
    if not req.serials: raise HTTPException(400, "No serials")
    try:
        pdf = xlsx_to_pdf(build_xlsx(req.serials))
        return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
            headers={"Content-Disposition":"attachment; filename=FM-QAF-01-02_02.pdf"})
    except Exception as e: raise HTTPException(500, str(e))

@app.post("/preview")
def preview(req: GenRequest):
    if not req.serials: return {"pages":[], "total":0}
    try:
        pdf = xlsx_to_pdf(build_xlsx(req.serials))
        imgs = pdf_to_images(pdf)
        return {"pages": imgs, "total": len(imgs)}
    except Exception as e: raise HTTPException(500, str(e))
