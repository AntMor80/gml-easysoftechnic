"""Escritura de GML catastrales (parcela INSPIRE CP 4.0 y edificio bu-ext2d).

Python puro, sin QGIS: es una traducción literal de packages/core/src/gml/*.ts para que
el complemento genere exactamente el mismo GML que la web y la aplicación de escritorio.
Un polígono es un dict {"exterior": [(x, y), ...], "interiors": [[(x, y), ...], ...]}.
"""
from datetime import datetime, timezone
import math
import re
from xml.sax.saxutils import escape as _esc

NIL = 'xsi:nil="true" nilReason="other:unpopulated"'


def esc(s):
    return _esc(str(s), {'"': "&quot;", "'": "&apos;"})


def srs_uri(epsg):
    return "http://www.opengis.net/def/crs/EPSG/0/%d" % epsg


def time_stamp(d=None):
    d = d or datetime.now(timezone.utc)
    return d.strftime("%Y-%m-%dT%H:%M:%S")


def _round(v, dec):
    # Igual que Math.round de JavaScript (redondeo hacia arriba en el .5), no el de Python.
    f = 10 ** dec
    return math.floor(v * f + 0.5) / f


def _fmt(v, dec):
    return "%.*f" % (dec, v)


def close_ring(ring):
    ring = [tuple(p) for p in ring]
    if not ring:
        return []
    if len(ring) > 1 and abs(ring[0][0] - ring[-1][0]) <= 1e-9 and abs(ring[0][1] - ring[-1][1]) <= 1e-9:
        return ring[:-1] + [ring[0]]
    return ring + [ring[0]]


def signed_area(ring):
    r = close_ring(ring)
    return sum(r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1] for i in range(len(r) - 1)) / 2.0


def polygon_area(poly):
    return abs(signed_area(poly["exterior"])) - sum(abs(signed_area(r)) for r in poly.get("interiors", []))


def total_area(polys):
    return sum(polygon_area(p) for p in polys)


def round_polygon(poly, dec):
    rr = lambda ring: [(_round(x, dec), _round(y, dec)) for x, y in ring]
    return {"exterior": rr(poly["exterior"]), "interiors": [rr(r) for r in poly.get("interiors", [])]}


def orient_polygon(poly):
    """Exterior en sentido antihorario e islas en horario, como exige el Catastro."""
    ext = close_ring(poly["exterior"])
    if signed_area(ext) < 0:
        ext = ext[::-1]
    ints = []
    for r in poly.get("interiors", []):
        c = close_ring(r)
        ints.append(c[::-1] if signed_area(c) > 0 else c)
    return {"exterior": ext, "interiors": ints}


def _pos_list(ring, dec):
    return " ".join("%s %s" % (_fmt(x, dec), _fmt(y, dec)) for x, y in ring)


def _ring_xml(ring, dec):
    return '<gml:LinearRing>\n<gml:posList srsDimension="2" count="%d">%s</gml:posList>\n</gml:LinearRing>' % (len(ring), _pos_list(ring, dec))


def _surface_member(poly, sid, srs, dec, interiors=True):
    p = orient_polygon(round_polygon(poly, dec))
    ints = "\n".join("<gml:interior>\n%s\n</gml:interior>" % _ring_xml(r, dec) for r in p["interiors"]) if interiors else ""
    return (
        '<gml:surfaceMember>\n<gml:Surface gml:id="Surface_%s" srsName="%s">\n<gml:patches>\n<gml:PolygonPatch>\n'
        "<gml:exterior>\n%s\n</gml:exterior>%s\n</gml:PolygonPatch>\n</gml:patches>\n</gml:Surface>\n</gml:surfaceMember>"
        % (sid, srs, _ring_xml(p["exterior"], dec), ("\n" + ints) if ints else "")
    )


def is_cadastral_reference(s):
    """Referencia catastral de 14 o 20 caracteres alfanuméricos."""
    s = str(s or "").strip().upper()
    return re.fullmatch(r"[0-9A-Z]{14}|[0-9A-Z]{20}", s) is not None


def parcel_member_xml(parcel, epsg, coord_decimals=2, area_decimals=0):
    """parcel: {"id", "namespace" (opcional), "polygons", "area" (opcional), "label" (opcional)}"""
    dec = coord_decimals
    srs = srs_uri(epsg)
    ns = parcel.get("namespace") or ("ES.SDGC.CP" if is_cadastral_reference(parcel["id"]) else "ES.LOCAL.CP")
    fid = "%s.%s" % (ns, parcel["id"])
    area = parcel.get("area")
    if area is None:
        area = total_area([round_polygon(p, dec) for p in parcel["polygons"]])
    surfaces = "\n".join(_surface_member(p, "%s.%d" % (fid, i + 1), srs, dec) for i, p in enumerate(parcel["polygons"]))
    return (
        "<member>\n"
        '<cp:CadastralParcel gml:id="%(fid)s">\n'
        '<cp:areaValue uom="m2">%(area)s</cp:areaValue>\n'
        '<cp:beginLifespanVersion xsi:nil="true" nilReason="other:unpopulated"></cp:beginLifespanVersion>\n'
        '<cp:endLifespanVersion xsi:nil="true" nilReason="other:unpopulated"></cp:endLifespanVersion>\n'
        "<cp:geometry>\n"
        '<gml:MultiSurface gml:id="MultiSurface_%(fid)s" srsName="%(srs)s">\n%(surfaces)s\n</gml:MultiSurface>\n'
        "</cp:geometry>\n"
        "<cp:inspireId>\n"
        '<Identifier xmlns="http://inspire.ec.europa.eu/schemas/base/3.3">\n'
        "<localId>%(id)s</localId>\n<namespace>%(ns)s</namespace>\n</Identifier>\n"
        "</cp:inspireId>\n"
        "<cp:label>%(label)s</cp:label>\n"
        "<cp:nationalCadastralReference>%(rc)s</cp:nationalCadastralReference>\n"
        "</cp:CadastralParcel>\n"
        "</member>"
    ) % {
        "fid": esc(fid), "area": _fmt(area, area_decimals), "srs": srs, "surfaces": surfaces, "id": esc(parcel["id"]),
        "ns": ns, "label": esc(parcel.get("label") or ""), "rc": esc(parcel["id"]) if ns == "ES.SDGC.CP" else "",
    }


def write_parcel_gml(parcels, epsg, coord_decimals=2, area_decimals=0, ts=None):
    members = "\n".join(parcel_member_xml(p, epsg, coord_decimals, area_decimals) for p in parcels)
    n = len(parcels)
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<!--Parcela Catastral generada con GML EasySoftechnic-->\n"
        '<FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:gmd="http://www.isotc211.org/2005/gmd" '
        'xmlns:ogc="http://www.opengis.net/ogc" xmlns:xlink="http://www.w3.org/1999/xlink" '
        'xmlns:cp="http://inspire.ec.europa.eu/schemas/cp/4.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        'xsi:schemaLocation="http://inspire.ec.europa.eu/schemas/cp/4.0 http://inspire.ec.europa.eu/schemas/cp/4.0/CadastralParcels.xsd" '
        'xmlns="http://www.opengis.net/wfs/2.0" timeStamp="%s" numberMatched="%d" numberReturned="%d">\n%s\n</FeatureCollection>\n'
    ) % (ts or time_stamp(), n, n, members)


def _opt(tag, value):
    return "<%s %s></%s>" % (tag, NIL, tag) if value is None else "<%s>%s</%s>" % (tag, value, tag)


def _multi_surface(polys, fid, srs, dec, interiors):
    members = "\n".join(_surface_member(p, "%s.%d" % (fid, i + 1), srs, dec, interiors) for i, p in enumerate(polys))
    return '<gml:MultiSurface gml:id="MultiSurface_%s" srsName="%s">\n%s\n</gml:MultiSurface>' % (fid, srs, members)


def building_member_xml(b, epsg, coord_decimals=2):
    """b: {"id", "polygons", "floors", "condition", "year", "use", "gross_floor_area", "dwellings", "units"}"""
    dec = coord_decimals
    srs = srs_uri(epsg)
    fid = "ES.LOCAL.BU.%s" % b["id"]
    year = b.get("year")
    date = (
        "<bu-core2d:dateOfConstruction>\n<bu-core2d:DateOfEvent>\n<bu-core2d:end>%s-01-01T00:00:00</bu-core2d:end>\n"
        "</bu-core2d:DateOfEvent>\n</bu-core2d:dateOfConstruction>" % esc(year)
        if year else "<bu-core2d:dateOfConstruction %s></bu-core2d:dateOfConstruction>" % NIL
    )
    use = b.get("use")
    use_xml = (
        "<bu-ext2d:currentUse>\n<bu-ext2d:CurrentUse>\n"
        '<bu-ext2d:currentUse xlink:href="http://inspire.ec.europa.eu/codelist/CurrentUseValue/%s"></bu-ext2d:currentUse>\n'
        "<bu-ext2d:percentage %s></bu-ext2d:percentage>\n</bu-ext2d:CurrentUse>\n</bu-ext2d:currentUse>" % (use, NIL)
        if use else "<bu-ext2d:currentUse %s></bu-ext2d:currentUse>" % NIL
    )
    gfa = b.get("gross_floor_area")
    gfa_xml = (
        "<bu-ext2d:officialArea>\n<bu-ext2d:OfficialArea>\n"
        '<bu-ext2d:officialAreaReference xlink:href="http://inspire.ec.europa.eu/codelist/OfficialAreaReferenceValue/grossFloorArea"></bu-ext2d:officialAreaReference>\n'
        '<bu-ext2d:value uom="m2">%s</bu-ext2d:value>\n</bu-ext2d:OfficialArea>\n</bu-ext2d:officialArea>' % _fmt(gfa, 0)
        if gfa else "<bu-ext2d:officialArea %s></bu-ext2d:officialArea>" % NIL
    )
    return "\n".join([
        "<member>",
        '<bu-ext2d:Building gml:id="%s">' % esc(fid),
        "<bu-core2d:beginLifespanVersion %s></bu-core2d:beginLifespanVersion>" % NIL,
        "<bu-core2d:conditionOfConstruction>%s</bu-core2d:conditionOfConstruction>" % (b.get("condition") or "functional"),
        date,
        "<bu-core2d:endLifespanVersion %s></bu-core2d:endLifespanVersion>" % NIL,
        "<bu-core2d:inspireId>",
        '<Identifier xmlns="http://inspire.ec.europa.eu/schemas/base/3.3">',
        "<localId>%s</localId>" % esc(b["id"]),
        "<namespace>ES.LOCAL.BU</namespace>",
        "</Identifier>",
        "</bu-core2d:inspireId>",
        "<bu-ext2d:geometry>",
        "<bu-core2d:BuildingGeometry>",
        "<bu-core2d:geometry>",
        _multi_surface(b["polygons"], fid, srs, dec, True),
        "</bu-core2d:geometry>",
        '<bu-core2d:horizontalGeometryEstimatedAccuracy uom="m" %s></bu-core2d:horizontalGeometryEstimatedAccuracy>' % NIL,
        "<bu-core2d:horizontalGeometryReference>footPrint</bu-core2d:horizontalGeometryReference>",
        "<bu-core2d:referenceGeometry>true</bu-core2d:referenceGeometry>",
        "</bu-core2d:BuildingGeometry>",
        "</bu-ext2d:geometry>",
        use_xml,
        _opt("bu-ext2d:numberOfBuildingUnits", b.get("units")),
        _opt("bu-ext2d:numberOfDwellings", b.get("dwellings")),
        "<bu-ext2d:numberOfFloorsAboveGround>%s</bu-ext2d:numberOfFloorsAboveGround>" % b.get("floors", 1),
        gfa_xml,
        "</bu-ext2d:Building>",
        "</member>",
    ])


def other_construction_member_xml(c, index, epsg, coord_decimals=2):
    srs = srs_uri(epsg)
    fid = "ES.LOCAL.OC.%s.%d" % (c["id"], index)
    return "\n".join([
        "<member>",
        '<bu-ext2d:OtherConstruction gml:id="%s">' % esc(fid),
        "<bu-core2d:beginLifespanVersion %s></bu-core2d:beginLifespanVersion>" % NIL,
        "<bu-core2d:endLifespanVersion %s></bu-core2d:endLifespanVersion>" % NIL,
        "<bu-core2d:inspireId>",
        '<Identifier xmlns="http://inspire.ec.europa.eu/schemas/base/3.3">',
        "<localId>%s.%d</localId>" % (esc(c["id"]), index),
        "<namespace>ES.LOCAL.OC</namespace>",
        "</Identifier>",
        "</bu-core2d:inspireId>",
        "<bu-ext2d:geometry>",
        _multi_surface(c["polygons"], fid, srs, coord_decimals, False),
        "</bu-ext2d:geometry>",
        "<bu-ext2d:otherConstructionNature>swimmingPool</bu-ext2d:otherConstructionNature>",
        "</bu-ext2d:OtherConstruction>",
        "</member>",
    ])


def write_building_gml(buildings, others, epsg, coord_decimals=2, ts=None):
    n = len(buildings) + len(others)
    members = "\n".join(
        [building_member_xml(b, epsg, coord_decimals) for b in buildings]
        + [other_construction_member_xml(c, i + 1, epsg, coord_decimals) for i, c in enumerate(others)]
    )
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<!--Edificio generado con GML EasySoftechnic-->\n"
        '<FeatureCollection xmlns="http://www.opengis.net/wfs/2.0" xmlns:bu-base="http://inspire.jrc.ec.europa.eu/schemas/bu-base/3.0" '
        'xmlns:bu-core2d="http://inspire.jrc.ec.europa.eu/schemas/bu-core2d/2.0" xmlns:bu-ext2d="http://inspire.jrc.ec.europa.eu/schemas/bu-ext2d/2.0" '
        'xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        'xsi:schemaLocation="http://www.opengis.net/wfs/2.0 http://schemas.opengis.net/wfs/2.0/wfs.xsd http://inspire.jrc.ec.europa.eu/schemas/bu-ext2d/2.0 '
        'http://inspire.ec.europa.eu/draft-schemas/bu-ext2d/2.0/BuildingExtended2D.xsd" timeStamp="%s" numberMatched="%d" numberReturned="%d">\n%s\n</FeatureCollection>\n'
    ) % (ts or time_stamp(), n, n, members)
