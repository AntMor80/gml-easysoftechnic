"""Pruebas sin QGIS: el GML debe ser idéntico al del motor TypeScript y las firmas deben verificarse."""
import base64
import json
import os
import subprocess
import sys
import unittest
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, ".."))

from gml_easysoftechnic import ed25519, gmlwriter, license as lic  # noqa: E402
from gml_easysoftechnic.validate import check_polygons  # noqa: E402

TS = "2026-01-01T00:00:00"
SQ = {"exterior": [(0, 0), (0, 10.005), (10.12345, 10), (10, 0)], "interiors": [[(2, 2), (4, 2), (4, 4), (2, 4)]]}
TRI = {"exterior": [(20, 0), (30, 0), (25, 7.5)], "interiors": []}


class IgualQueTypeScript(unittest.TestCase):
    ref = json.load(open(os.path.join(HERE, "reference.json"), encoding="utf-8"))

    def test_parcela(self):
        got = gmlwriter.write_parcel_gml(
            [{"id": "1234567VK1213S", "polygons": [SQ, TRI]}, {"id": "A&B", "polygons": [TRI]}], 25830, 2, 1, ts=TS
        )
        self.assertEqual(got, self.ref["parcel"])

    def test_edificio(self):
        got = gmlwriter.write_building_gml(
            [{"id": "EDIF1", "polygons": [SQ], "floors": 2, "condition": "functional", "use": "1_residential", "year": "1998", "gross_floor_area": 180.4, "dwellings": 1}],
            [{"id": "EDIF1", "polygons": [TRI]}], 25830, 2, ts=TS,
        )
        self.assertEqual(got, self.ref["building"])


class Validacion(unittest.TestCase):
    def test_cruce_y_sentido(self):
        bow = {"exterior": [(0, 0), (10, 10), (10, 0), (0, 10)], "interiors": []}
        msgs = check_polygons([bow])
        self.assertTrue(any("se cruza" in m for s, m in msgs if s == "error"))
        cw = {"exterior": [(0, 0), (0, 10), (10, 10), (10, 0)], "interiors": []}
        self.assertTrue(any("horario" in m for _, m in check_polygons([cw])))
        self.assertEqual([m for s, m in check_polygons([SQ]) if s == "error"], [])


def node_sign(payload):
    """Firma con Node (como el servidor real) para comprobar la verificación en Python."""
    script = """
const c=require('crypto');const k=c.generateKeyPairSync('ed25519');
const body=Buffer.from(process.argv[1]);
console.log(JSON.stringify({pem:k.publicKey.export({type:'spki',format:'pem'}),
token:body.toString('base64url')+'.'+c.sign(null,body,k.privateKey).toString('base64url')}));"""
    out = subprocess.run(["node", "-e", script, json.dumps(payload)], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


class Licencia(unittest.TestCase):
    def payload(self, **kw):
        now = datetime.now(timezone.utc)
        p = {"key": "GML-AAAA-BBBB-CCCC-DDDD", "modules": ["qgis"], "plan": "anual", "machineId": lic.machine_id(),
             "expiresAt": (now + timedelta(days=300)).isoformat(), "issuedAt": now.isoformat(),
             "offlineUntil": (now + timedelta(days=30)).isoformat(), "email": "a@b.es"}
        p.update(kw)
        return p

    def test_valida(self):
        r = node_sign(self.payload())
        self.assertEqual(lic.evaluate(r["token"], r["pem"], lic.machine_id())[0], "ok")

    def test_rechazos(self):
        r = node_sign(self.payload(modules=["gmlParcela"]))
        self.assertEqual(lic.evaluate(r["token"], r["pem"], lic.machine_id())[0], "no-module")
        r = node_sign(self.payload())
        self.assertEqual(lic.evaluate(r["token"], r["pem"], "otro")[0], "other-machine")
        body, sig = r["token"].split(".")
        p = json.loads(base64.urlsafe_b64decode(body + "=="))
        p["modules"] = ["qgis", "gmlParcela"]
        forged = base64.urlsafe_b64encode(json.dumps(p).encode()).decode().rstrip("=")
        self.assertEqual(lic.evaluate(forged + "." + sig, r["pem"], lic.machine_id())[0], "invalid")
        old = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        r = node_sign(self.payload(offlineUntil=old))
        self.assertEqual(lic.evaluate(r["token"], r["pem"], lic.machine_id())[0], "offline-expired")
        r = node_sign(self.payload(expiresAt=old))
        self.assertEqual(lic.evaluate(r["token"], r["pem"], lic.machine_id())[0], "expired")

    def test_vector_rfc8032(self):
        # Prueba 1 del RFC 8032 (mensaje vacío)
        pk = bytes.fromhex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a")
        sig = bytes.fromhex("e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b")
        self.assertTrue(ed25519.verify(pk, b"", sig))
        self.assertFalse(ed25519.verify(pk, b"x", sig))


if __name__ == "__main__":
    unittest.main()
