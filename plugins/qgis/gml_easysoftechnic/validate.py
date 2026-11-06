"""Comprobaciones previas con las reglas del Catastro (Python puro, sin QGIS).

Las de topología entre recintos (solapes) se hacen en plugin.py con la geometría de QGIS.
"""
from .gmlwriter import close_ring, signed_area


def _orient(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _on_segment(a, b, p):
    return min(a[0], b[0]) - 1e-9 <= p[0] <= max(a[0], b[0]) + 1e-9 and min(a[1], b[1]) - 1e-9 <= p[1] <= max(a[1], b[1]) + 1e-9


def _segments_intersect(p1, p2, p3, p4):
    d1, d2, d3, d4 = _orient(p3, p4, p1), _orient(p3, p4, p2), _orient(p1, p2, p3), _orient(p1, p2, p4)
    if ((d1 > 0 > d2) or (d1 < 0 < d2)) and ((d3 > 0 > d4) or (d3 < 0 < d4)):
        return True
    return (
        (d1 == 0 and _on_segment(p3, p4, p1)) or (d2 == 0 and _on_segment(p3, p4, p2))
        or (d3 == 0 and _on_segment(p1, p2, p3)) or (d4 == 0 and _on_segment(p1, p2, p4))
    )


def _intersection_point(p1, p2, p3, p4):
    d = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0])
    if d == 0:
        return p3
    t = ((p1[0] - p3[0]) * (p3[1] - p4[1]) - (p1[1] - p3[1]) * (p3[0] - p4[0])) / d
    return (p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1]))


def self_intersections(ring):
    r = close_ring(ring)
    n = len(r) - 1
    hits = []
    for i in range(n):
        for j in range(i + 1, n):
            if j == i + 1 or (i == 0 and j == n - 1):
                continue
            if _segments_intersect(r[i], r[i + 1], r[j], r[j + 1]):
                hits.append(_intersection_point(r[i], r[i + 1], r[j], r[j + 1]))
    return hits


def check_polygons(polys, min_area=0.01, min_edge=0.01):
    """Devuelve una lista de (gravedad, mensaje). gravedad: 'error' o 'aviso'."""
    out = []
    for k, poly in enumerate(polys, 1):
        tag = "Recinto %d" % k if len(polys) > 1 else "Recinto"
        rings = [("exterior", poly["exterior"])] + [("isla %d" % (i + 1), r) for i, r in enumerate(poly.get("interiors", []))]
        for name, ring in rings:
            r = close_ring(ring)
            if len(r) < 4:
                out.append(("error", "%s, %s: tiene menos de 3 vértices." % (tag, name)))
                continue
            for x, y in self_intersections(r):
                out.append(("error", "%s, %s: el contorno se cruza consigo mismo en X %.2f Y %.2f." % (tag, name, x, y)))
            for i in range(len(r) - 1):
                (x1, y1), (x2, y2) = r[i], r[i + 1]
                if ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5 < min_edge:
                    out.append(("aviso", "%s, %s: vértices %d y %d a menos de %g m (duplicados)." % (tag, name, i + 1, i + 2, min_edge)))
            if abs(signed_area(r)) < min_area:
                out.append(("error", "%s, %s: superficie nula o casi nula." % (tag, name)))
        if signed_area(poly["exterior"]) < 0:
            out.append(("aviso", "%s: el contorno está en sentido horario; se invertirá al escribir el GML." % tag))
    return out
