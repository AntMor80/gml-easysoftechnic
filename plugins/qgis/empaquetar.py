"""Crea dist/gml_easysoftechnic.zip, listo para QGIS > Complementos > Instalar a partir de ZIP."""
import os
import zipfile

here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, "gml_easysoftechnic")
os.makedirs(os.path.join(here, "dist"), exist_ok=True)
out = os.path.join(here, "dist", "gml_easysoftechnic.zip")
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        for f in files:
            if not f.endswith(".pyc"):
                full = os.path.join(root, f)
                z.write(full, os.path.relpath(full, here))
print(out)
