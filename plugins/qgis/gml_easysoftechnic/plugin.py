"""Complemento de QGIS de GML EasySoftechnic."""
import os

from qgis.core import (
    QgsAbstractGeometry,
    QgsCoordinateReferenceSystem,
    QgsCoordinateTransform,
    QgsFeatureRequest,
    QgsGeometry,
    QgsProject,
    QgsSettings,
    QgsVectorLayer,
    QgsWkbTypes,
)
from qgis.PyQt.QtCore import Qt
from qgis.PyQt.QtGui import QIcon
from qgis.PyQt.QtWidgets import (
    QAction,
    QCheckBox,
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFileDialog,
    QFormLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QSpinBox,
    QTextBrowser,
    QVBoxLayout,
)

from . import gmlwriter, license as lic
from .validate import check_polygons

MENU = "&GML EasySoftechnic"
CATASTRO_EPSG = {25828: "ETRS89 / UTM 28N (Canarias)", 25829: "ETRS89 / UTM 29N", 25830: "ETRS89 / UTM 30N", 25831: "ETRS89 / UTM 31N", 32628: "WGS84 / UTM 28N (Canarias)"}
# El Catastro pide que los arcos se conviertan en tramos rectos con una flecha máxima de 2 cm.
ARC_TOLERANCE = 0.02
USES = [("", "Sin indicar"), ("1_residential", "Residencial"), ("2_agriculture", "Agrario"), ("3_industrial", "Industrial"), ("4_1_office", "Oficinas"), ("4_2_retail", "Comercial"), ("4_3_publicServices", "Servicios públicos")]
SETTINGS = "gml_easysoftechnic/"


def polygons_of(geom):
    """QgsGeometry (polígono o multipolígono, con curvas o sin ellas) -> lista de polígonos del escritor."""
    g = QgsGeometry(geom)
    if QgsWkbTypes.isCurvedType(g.wkbType()):
        g = QgsGeometry(g.constGet().segmentize(ARC_TOLERANCE, QgsAbstractGeometry.MaximumDifference))
    parts = g.asMultiPolygon() if g.isMultipart() else [g.asPolygon()]
    out = []
    for rings in parts:
        if not rings:
            continue
        out.append({"exterior": [(p.x(), p.y()) for p in rings[0]], "interiors": [[(p.x(), p.y()) for p in r] for r in rings[1:]]})
    return out


class GmlEasySoftechnic:
    def __init__(self, iface):
        self.iface = iface
        self.actions = []

    # ---------- arranque ----------
    def initGui(self):  # noqa: N802
        icon = QIcon(os.path.join(os.path.dirname(__file__), "icon.png"))
        self.toolbar = self.iface.addToolBar("GML EasySoftechnic")
        self.toolbar.setObjectName("GmlEasySoftechnic")
        for text, slot, on_toolbar in [
            ("Exportar GML de parcela…", self.export_parcel, True),
            ("Exportar GML de edificio…", self.export_building, True),
            ("Importar GML catastral…", self.import_gml, False),
            ("Validar entidades seleccionadas", self.validate_selection, True),
            ("Licencia…", self.show_license, False),
        ]:
            a = QAction(icon, text, self.iface.mainWindow())
            a.triggered.connect(slot)
            self.iface.addPluginToVectorMenu(MENU, a)
            if on_toolbar:
                self.toolbar.addAction(a)
            self.actions.append(a)

    def unload(self):
        for a in self.actions:
            self.iface.removePluginVectorMenu(MENU, a)
        del self.toolbar

    # ---------- utilidades ----------
    def msg(self, text, level="info"):
        bar = self.iface.messageBar()
        {"info": bar.pushInfo, "ok": bar.pushSuccess, "warn": bar.pushWarning, "error": bar.pushCritical}[level]("GML EasySoftechnic", text)

    def selected_features(self):
        layer = self.iface.activeLayer()
        if not isinstance(layer, QgsVectorLayer) or layer.geometryType() != QgsWkbTypes.PolygonGeometry:
            QMessageBox.warning(self.iface.mainWindow(), "GML EasySoftechnic", "Selecciona una capa de polígonos en el panel de capas.")
            return None, []
        feats = list(layer.getSelectedFeatures()) or list(layer.getFeatures(QgsFeatureRequest()))
        if not feats:
            QMessageBox.warning(self.iface.mainWindow(), "GML EasySoftechnic", "La capa no tiene entidades.")
        return layer, feats

    def transform_for(self, layer, epsg):
        src = layer.crs()
        dst = QgsCoordinateReferenceSystem("EPSG:%d" % epsg)
        return None if src == dst else QgsCoordinateTransform(src, dst, QgsProject.instance())

    def geometry(self, feat, xform):
        g = QgsGeometry(feat.geometry())
        if xform:
            g.transform(xform)
        return g

    def ask_save(self, default_name):
        s = QgsSettings()
        folder = s.value(SETTINGS + "folder", os.path.expanduser("~"))
        path, _ = QFileDialog.getSaveFileName(self.iface.mainWindow(), "Guardar GML", os.path.join(folder, default_name), "GML (*.gml)")
        if path:
            s.setValue(SETTINGS + "folder", os.path.dirname(path))
            if not path.lower().endswith(".gml"):
                path += ".gml"
        return path

    def epsg_combo(self, layer):
        combo = QComboBox()
        for code, name in CATASTRO_EPSG.items():
            combo.addItem("EPSG:%d · %s" % (code, name), code)
        authid = layer.crs().authid()
        code = int(authid.split(":")[1]) if authid.startswith("EPSG:") else 25830
        idx = combo.findData(code if code in CATASTRO_EPSG else 25830)
        combo.setCurrentIndex(max(idx, 0))
        return combo

    def report_issues(self, polys_by_name):
        issues = []
        for name, polys in polys_by_name:
            issues += ["%s · %s: %s" % ("ERROR" if sev == "error" else "Aviso", name, text) for sev, text in check_polygons(polys)]
        return issues

    def require_license(self):
        state, _ = self.license_state()
        if state == "ok":
            return True
        QMessageBox.information(self.iface.mainWindow(), "GML EasySoftechnic", lic.STATUS_TEXT[state] + "\n\nPuedes activarla en GML EasySoftechnic > Licencia.")
        self.show_license()
        return self.license_state()[0] == "ok"

    # ---------- parcela ----------
    def export_parcel(self):
        layer, feats = self.selected_features()
        if not feats or not self.require_license():
            return
        d = QDialog(self.iface.mainWindow())
        d.setWindowTitle("GML de parcela catastral")
        form = QFormLayout(d)
        field = QComboBox()
        field.addItem("(escribir a mano)", "")
        for f in layer.fields():
            field.addItem(f.name(), f.name())
        for guess in ("refcat", "referencia", "ref_cat", "localid", "nationalCadastralReference", "id"):
            i = field.findData(guess, flags=Qt.MatchFixedString)
            if i > 0:
                field.setCurrentIndex(i)
                break
        manual = QLineEdit()
        manual.setPlaceholderText("Referencia catastral (14 o 20) o identificador local")
        epsg = self.epsg_combo(layer)
        cdec, adec = QSpinBox(), QSpinBox()
        cdec.setRange(2, 4)
        adec.setRange(0, 4)
        mode = QComboBox()
        mode.addItem("Un GML con todas las parcelas (multiparcela)", "multi")
        mode.addItem("Un GML por parcela", "each")
        mode.addItem("Unir todas las entidades en una sola parcela", "union")
        form.addRow(QLabel("%d entidad(es) de «%s»" % (len(feats), layer.name())))
        form.addRow("Identificador desde el campo", field)
        form.addRow("o identificador", manual)
        form.addRow("Sistema de referencia", epsg)
        form.addRow("Decimales de coordenadas", cdec)
        form.addRow("Decimales de superficie", adec)
        form.addRow("Salida", mode)
        bb = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        bb.accepted.connect(d.accept)
        bb.rejected.connect(d.reject)
        form.addRow(bb)
        if d.exec_() != QDialog.Accepted:
            return

        code = epsg.currentData()
        xform = self.transform_for(layer, code)
        fname = field.currentData()
        parcels = []
        if mode.currentData() == "union":
            g = QgsGeometry.unaryUnion([self.geometry(f, xform) for f in feats])
            parcels.append({"id": manual.text().strip() or "PARCELA", "polygons": polygons_of(g)})
        else:
            for i, f in enumerate(feats, 1):
                pid = str(f[fname]).strip() if fname and f[fname] not in (None, "") else (manual.text().strip() or "PARCELA")
                if len(feats) > 1 and not fname:
                    pid = "%s_%d" % (pid, i)
                parcels.append({"id": pid, "polygons": polygons_of(self.geometry(f, xform))})

        issues = self.report_issues([(p["id"], p["polygons"]) for p in parcels])
        if any(t.startswith("ERROR") for t in issues):
            if QMessageBox.question(self.iface.mainWindow(), "GML EasySoftechnic", "La validación ha encontrado errores que el Catastro rechazará:\n\n%s\n\n¿Generar el GML igualmente?" % "\n".join(issues[:15])) != QMessageBox.Yes:
                return

        if mode.currentData() == "each":
            folder = QFileDialog.getExistingDirectory(self.iface.mainWindow(), "Carpeta donde guardar los GML", QgsSettings().value(SETTINGS + "folder", os.path.expanduser("~")))
            if not folder:
                return
            for p in parcels:
                self._write(os.path.join(folder, "%s.gml" % _safe(p["id"])), gmlwriter.write_parcel_gml([p], code, cdec.value(), adec.value()))
            self.msg("%d GML de parcela guardados en %s" % (len(parcels), folder), "ok")
            return
        path = self.ask_save("%s.gml" % _safe(parcels[0]["id"] if len(parcels) == 1 else "multiparcela"))
        if path:
            self._write(path, gmlwriter.write_parcel_gml(parcels, code, cdec.value(), adec.value()))
            area = sum(gmlwriter.total_area(p["polygons"]) for p in parcels)
            self.msg("GML de parcela guardado (%d parcela(s), %.2f m²): %s" % (len(parcels), area, path), "ok")

    # ---------- edificio ----------
    def export_building(self):
        layer, feats = self.selected_features()
        if not feats or not self.require_license():
            return
        d = QDialog(self.iface.mainWindow())
        d.setWindowTitle("GML de edificio (ICUC)")
        form = QFormLayout(d)
        bid = QLineEdit()
        bid.setPlaceholderText("Referencia catastral de la parcela o identificador")
        pools_field = QComboBox()
        pools_field.addItem("(ninguna: todo es edificio)", "")
        for f in layer.fields():
            pools_field.addItem(f.name(), f.name())
        epsg = self.epsg_combo(layer)
        floors = QSpinBox()
        floors.setRange(0, 99)
        floors.setValue(1)
        cond = QComboBox()
        for v, t in [("functional", "Funcional"), ("declined", "Deficiente"), ("ruin", "Ruina")]:
            cond.addItem(t, v)
        use = QComboBox()
        for v, t in USES:
            use.addItem(t, v)
        year, gfa, dwell = QLineEdit(), QLineEdit(), QLineEdit()
        for w, ph in [(year, "opcional"), (gfa, "opcional"), (dwell, "opcional")]:
            w.setPlaceholderText(ph)
        form.addRow(QLabel("%d entidad(es) de «%s». Cada entidad es una parte de la huella." % (len(feats), layer.name())))
        form.addRow("Identificador", bid)
        form.addRow("Campo que marca piscinas (valor 1/sí)", pools_field)
        form.addRow("Sistema de referencia", epsg)
        form.addRow("Plantas sobre rasante", floors)
        form.addRow("Estado", cond)
        form.addRow("Uso dominante", use)
        form.addRow("Año de construcción", year)
        form.addRow("Superficie construida (m²)", gfa)
        form.addRow("Número de viviendas", dwell)
        bb = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        bb.accepted.connect(d.accept)
        bb.rejected.connect(d.reject)
        form.addRow(bb)
        if d.exec_() != QDialog.Accepted:
            return
        code = epsg.currentData()
        xform = self.transform_for(layer, code)
        pf = pools_field.currentData()
        is_pool = lambda f: bool(pf) and str(f[pf]).strip().lower() in ("1", "true", "si", "sí", "s", "piscina", "yes")
        b_polys, pools = [], []
        for f in feats:
            polys = polygons_of(self.geometry(f, xform))
            if is_pool(f):
                pools.append({"id": bid.text().strip() or "EDIFICIO", "polygons": polys})
            else:
                b_polys += polys
        ident = bid.text().strip() or "EDIFICIO"
        buildings = [{
            "id": ident, "polygons": b_polys, "floors": floors.value(), "condition": cond.currentData(), "use": use.currentData() or None,
            "year": year.text().strip()[:4] or None, "gross_floor_area": float(gfa.text().replace(",", ".")) if gfa.text().strip() else None,
            "dwellings": int(dwell.text()) if dwell.text().strip().isdigit() else None,
        }] if b_polys else []
        issues = self.report_issues([(ident, b_polys)] + [("piscina", p["polygons"]) for p in pools])
        if any(t.startswith("ERROR") for t in issues):
            if QMessageBox.question(self.iface.mainWindow(), "GML EasySoftechnic", "La validación ha encontrado errores:\n\n%s\n\n¿Generar el GML igualmente?" % "\n".join(issues[:15])) != QMessageBox.Yes:
                return
        path = self.ask_save("%s_edificio.gml" % _safe(ident))
        if path:
            self._write(path, gmlwriter.write_building_gml(buildings, pools, code))
            self.msg("GML de edificio guardado: %s" % path, "ok")

    # ---------- importar ----------
    def import_gml(self):
        paths, _ = QFileDialog.getOpenFileNames(self.iface.mainWindow(), "Importar GML catastral", QgsSettings().value(SETTINGS + "folder", os.path.expanduser("~")), "GML (*.gml *.xml)")
        for path in paths:
            name = os.path.splitext(os.path.basename(path))[0]
            layer = QgsVectorLayer(path, name, "ogr")
            if not layer.isValid():
                self.msg("No se ha podido leer %s" % path, "error")
                continue
            QgsProject.instance().addMapLayer(layer)
            layer.setOpacity(0.7)
            self.iface.setActiveLayer(layer)
            self.iface.mapCanvas().setExtent(self.iface.mapCanvas().mapSettings().layerExtentToOutputExtent(layer, layer.extent()))
            self.iface.mapCanvas().refresh()
            self.msg("Importado %s (%d entidades)" % (name, layer.featureCount()), "ok")

    # ---------- validar ----------
    def validate_selection(self):
        layer, feats = self.selected_features()
        if not feats:
            return
        lines = []
        geoms = []
        for f in feats:
            name = "Entidad %s" % f.id()
            g = QgsGeometry(f.geometry())
            geoms.append((name, g))
            lines += ["%s · %s: %s" % ("ERROR" if s == "error" else "Aviso", name, t) for s, t in check_polygons(polygons_of(g))]
        for i in range(len(geoms)):
            for j in range(i + 1, len(geoms)):
                inter = geoms[i][1].intersection(geoms[j][1])
                if inter and not inter.isEmpty() and inter.area() > 0.001:
                    lines.append("ERROR · %s y %s se solapan %.3f m²." % (geoms[i][0], geoms[j][0], inter.area()))
        d = QDialog(self.iface.mainWindow())
        d.setWindowTitle("Validación")
        lay = QVBoxLayout(d)
        txt = QTextBrowser()
        txt.setPlainText("\n".join(lines) if lines else "Sin errores: %d entidad(es) cumplen las comprobaciones del Catastro." % len(feats))
        lay.addWidget(txt)
        bb = QDialogButtonBox(QDialogButtonBox.Close)
        bb.rejected.connect(d.reject)
        lay.addWidget(bb)
        d.resize(620, 360)
        d.exec_()

    # ---------- licencia ----------
    def license_state(self):
        s = QgsSettings()
        return lic.evaluate(s.value(SETTINGS + "token", ""), lic.public_key_pem(), lic.machine_id())

    def show_license(self):
        s = QgsSettings()
        server = s.value(SETTINGS + "server", lic.DEFAULT_SERVER)
        d = QDialog(self.iface.mainWindow())
        d.setWindowTitle("Licencia de GML EasySoftechnic")
        lay = QVBoxLayout(d)
        status = QLabel()
        status.setWordWrap(True)
        key = QLineEdit(s.value(SETTINGS + "key", ""))
        key.setPlaceholderText("GML-XXXX-XXXX-XXXX-XXXX")
        lay.addWidget(status)
        lay.addWidget(QLabel("Clave de licencia"))
        lay.addWidget(key)
        b_act, b_check, b_off, b_buy = QPushButton("Activar en este equipo"), QPushButton("Comprobar ahora"), QPushButton("Desactivar en este equipo"), QPushButton("Comprar licencia en la web")
        for b in (b_act, b_check, b_off, b_buy):
            lay.addWidget(b)
        adv = QCheckBox("Servidor alternativo (pruebas)")
        srv = QLineEdit(server)
        srv.setVisible(False)
        adv.toggled.connect(srv.setVisible)
        lay.addWidget(adv)
        lay.addWidget(srv)

        def refresh_label():
            st, p = self.license_state()
            extra = ""
            if p:
                exp = p.get("expiresAt")
                extra = "\nClave %s · %s · funciona sin conexión hasta el %s" % (p.get("key"), "válida hasta el %s" % exp[:10] if exp else "de por vida", p.get("offlineUntil", "")[:10])
            status.setText(lic.STATUS_TEXT[st] + extra)

        def call(path, body, store_token=True):
            try:
                r = lic.post(srv.text().strip() or lic.DEFAULT_SERVER, path, body)
                s.setValue(SETTINGS + "server", srv.text().strip() or lic.DEFAULT_SERVER)
                if store_token:
                    s.setValue(SETTINGS + "key", body["key"])
                    s.setValue(SETTINGS + "token", r.get("token", ""))
            except RuntimeError as e:
                QMessageBox.warning(d, "Licencia", str(e))
            refresh_label()

        import socket

        b_act.clicked.connect(lambda: call("/api/licenses/activate", {"key": key.text().strip().upper(), "machineId": lic.machine_id(), "machineName": "%s (QGIS)" % socket.gethostname()}))
        b_check.clicked.connect(lambda: call("/api/licenses/refresh", {"key": key.text().strip().upper(), "machineId": lic.machine_id()}))

        def deactivate():
            call("/api/licenses/deactivate", {"key": key.text().strip().upper(), "machineId": lic.machine_id()}, store_token=False)
            s.remove(SETTINGS + "token")
            refresh_label()

        b_off.clicked.connect(deactivate)
        from qgis.PyQt.QtCore import QUrl
        from qgis.PyQt.QtGui import QDesktopServices

        b_buy.clicked.connect(lambda: QDesktopServices.openUrl(QUrl((srv.text().strip() or lic.DEFAULT_SERVER) + "/#cuenta")))
        refresh_label()
        d.resize(460, 0)
        d.exec_()

    def _write(self, path, text):
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)


def _safe(s):
    return "".join(c if c.isalnum() or c in "-_." else "_" for c in str(s))[:80] or "gml"
