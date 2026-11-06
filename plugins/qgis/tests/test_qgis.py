"""Prueba del complemento dentro de QGIS real (sin ventanas). Se ejecuta con el Python de QGIS:
    QT_QPA_PLATFORM=offscreen python3 tests/test_qgis.py
Necesita GML_TEST_PRIVATE_KEY con la clave privada que corresponde a licencia-publica.pem.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from qgis.core import QgsApplication, QgsFeature, QgsGeometry, QgsProject, QgsSettings, QgsVectorLayer
from qgis.PyQt.QtWidgets import QDialog, QFileDialog, QMessageBox

app = QgsApplication([], False)
app.initQgis()
from unittest import mock  # noqa: E402

from qgis.gui import QgsMapCanvas  # noqa: E402


def get_iface():
    iface = mock.MagicMock()
    iface.mapCanvas.return_value = QgsMapCanvas()
    iface.mainWindow.return_value = None
    return iface

from gml_easysoftechnic import license as lic  # noqa: E402
from gml_easysoftechnic.plugin import GmlEasySoftechnic, polygons_of  # noqa: E402

TMP = tempfile.mkdtemp()


def sign(payload):
    script = "const c=require('crypto');const b=Buffer.from(process.argv[1]);console.log(b.toString('base64url')+'.'+c.sign(null,b,c.createPrivateKey(process.env.GML_TEST_PRIVATE_KEY)).toString('base64url'))"
    return subprocess.run(["node", "-e", script, json.dumps(payload)], capture_output=True, text=True, check=True).stdout.strip()


class Complemento(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.iface = get_iface()
        cls.plugin = GmlEasySoftechnic(cls.iface)
        cls.layer = QgsVectorLayer("Polygon?crs=EPSG:25830&field=refcat:string&field=piscina:integer", "parcelas", "memory")
        feats = []
        for wkt, rc, pool in [
            ("POLYGON((465500 4175100, 465520 4175100, 465520 4175130, 465500 4175130, 465500 4175100))", "1234567VK1213S", 0),
            # parcela con un lado curvo: debe densificarse con flecha de 2 cm
            ("CURVEPOLYGON(COMPOUNDCURVE((465530 4175100, 465550 4175100), CIRCULARSTRING(465550 4175100, 465560 4175115, 465550 4175130), (465550 4175130, 465530 4175130, 465530 4175100)))", "7654321VK1213S", 1),
        ]:
            f = QgsFeature(cls.layer.fields())
            f.setGeometry(QgsGeometry.fromWkt(wkt))
            f["refcat"], f["piscina"] = rc, pool
            feats.append(f)
        cls.layer.dataProvider().addFeatures(feats)
        QgsProject.instance().addMapLayer(cls.layer)
        cls.iface.activeLayer = lambda: cls.layer
        # Sin ventanas: los diálogos se aceptan solos y los mensajes responden "Sí".
        QDialog.exec_ = lambda self: QDialog.Accepted
        QMessageBox.question = staticmethod(lambda *a, **k: QMessageBox.Yes)
        QMessageBox.information = staticmethod(lambda *a, **k: None)
        QMessageBox.warning = staticmethod(lambda *a, **k: None)

    def set_license(self, modules):
        now = datetime.now(timezone.utc)
        tok = sign({"key": "GML-TEST-TEST-TEST-TEST", "modules": modules, "plan": "anual", "machineId": lic.machine_id(),
                    "expiresAt": (now + timedelta(days=200)).isoformat(), "issuedAt": now.isoformat(),
                    "offlineUntil": (now + timedelta(days=30)).isoformat(), "email": "t@e.es"})
        QgsSettings().setValue("gml_easysoftechnic/token", tok)

    def test_menu_y_barra(self):
        p = GmlEasySoftechnic(get_iface())
        p.initGui()
        self.assertEqual([a.text() for a in p.actions][:2], ["Exportar GML de parcela…", "Exportar GML de edificio…"])
        p.unload()

    def test_importa_gml(self):
        self.set_license(["qgis"])
        out = os.path.join(TMP, "para_importar.gml")
        QFileDialog.getSaveFileName = staticmethod(lambda *a, **k: (out, ""))
        self.plugin.export_parcel()
        QFileDialog.getOpenFileNames = staticmethod(lambda *a, **k: ([out], ""))
        before = len(QgsProject.instance().mapLayers())
        self.plugin.import_gml()
        self.assertEqual(len(QgsProject.instance().mapLayers()), before + 1)

    def test_carga_del_catastro(self):
        import urllib.request
        from qgis.PyQt.QtWidgets import QInputDialog
        gml = open(os.path.join(TMP, "multi.gml"), "rb").read() if os.path.exists(os.path.join(TMP, "multi.gml")) else None
        if gml is None:
            self.test_exporta_parcela_y_la_relee()
            gml = open(os.path.join(TMP, "multi.gml"), "rb").read()
        class R:
            def __init__(self, d): self.d = d
            def read(self): return self.d
            def __enter__(self): return self
            def __exit__(self, *a): pass
        seen = []
        with mock.patch.object(QInputDialog, "getText", staticmethod(lambda *a, **k: ("1234567 vk1213s", True))), \
             mock.patch.object(urllib.request, "urlopen", lambda req, timeout=0: (seen.append(req.full_url), R(gml))[1]):
            before = len(QgsProject.instance().mapLayers())
            self.plugin.load_catastro()
        self.assertEqual(len(QgsProject.instance().mapLayers()), before + 2)
        self.assertIn("GetNeighbourParcel", seen[1])
        self.assertIn("refcat=1234567VK1213S", seen[1])

    def test_curvas_densificadas(self):
        f = list(self.layer.getFeatures())[1]
        polys = polygons_of(f.geometry())
        self.assertGreater(len(polys[0]["exterior"]), 20)

    def test_sin_licencia_no_exporta(self):
        self.set_license(["gmlParcela"])
        out = os.path.join(TMP, "nolic.gml")
        QFileDialog.getSaveFileName = staticmethod(lambda *a, **k: (out, ""))
        self.plugin.show_license = lambda: None
        self.plugin.export_parcel()
        self.assertFalse(os.path.exists(out))

    def test_exporta_parcela_y_la_relee(self):
        self.set_license(["qgis"])
        out = os.path.join(TMP, "multi.gml")
        QFileDialog.getSaveFileName = staticmethod(lambda *a, **k: (out, ""))
        self.plugin.export_parcel()
        with open(out, encoding="utf-8") as fh:
            text = fh.read()
        self.assertIn("ES.SDGC.CP.1234567VK1213S", text)
        self.assertIn('<cp:areaValue uom="m2">600</cp:areaValue>', text)
        back = QgsVectorLayer(out, "relectura", "ogr")
        self.assertTrue(back.isValid())
        self.assertEqual(back.featureCount(), 2)
        areas = sorted(round(f.geometry().area(), 1) for f in back.getFeatures())
        self.assertAlmostEqual(areas[0], 600.0, places=1)
        self.assertGreater(areas[1], 600.0)

    def test_exporta_edificio_con_piscina(self):
        self.set_license(["qgis"])
        out = os.path.join(TMP, "edificio.gml")
        QFileDialog.getSaveFileName = staticmethod(lambda *a, **k: (out, ""))
        # Campo "piscina" elegido en el diálogo: un combo que lo selecciona al añadirlo.
        from qgis.PyQt.QtWidgets import QComboBox
        import gml_easysoftechnic.plugin as plugmod

        class AutoCombo(QComboBox):
            def addItem(self, *a):  # noqa: N802
                super().addItem(*a)
                if len(a) > 1 and a[1] == "piscina":
                    self.setCurrentIndex(self.count() - 1)

        with mock.patch.object(plugmod, "QComboBox", AutoCombo):
            self.plugin.export_building()
        with open(out, encoding="utf-8") as fh:
            text = fh.read()
        self.assertIn("<bu-ext2d:Building", text)
        self.assertIn("swimmingPool", text)

    def test_valida_solapes(self):
        shown = []
        from qgis.PyQt.QtWidgets import QTextBrowser
        orig = QTextBrowser.setPlainText
        QTextBrowser.setPlainText = lambda self, t: shown.append(t)
        try:
            lay = QgsVectorLayer("Polygon?crs=EPSG:25830", "solapes", "memory")
            fs = []
            for wkt in ("POLYGON((0 0,10 0,10 10,0 10,0 0))", "POLYGON((9.9 0,20 0,20 10,9.9 10,9.9 0))"):
                f = QgsFeature()
                f.setGeometry(QgsGeometry.fromWkt(wkt))
                fs.append(f)
            lay.dataProvider().addFeatures(fs)
            self.iface.activeLayer = lambda: lay
            self.plugin.validate_selection()
        finally:
            QTextBrowser.setPlainText = orig
            self.iface.activeLayer = lambda: self.layer
        self.assertIn("se solapan 1.000 m²", shown[0])


if __name__ == "__main__":
    unittest.main(verbosity=2)
