"""Licencia del módulo «Conexión con QGIS» (Python puro, sin QGIS).

Usa el mismo servidor y el mismo formato de certificado que la aplicación de escritorio.
"""
import base64
import hashlib
import json
import os
import platform
import socket
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

from . import ed25519

MODULE = "qgis"
DEFAULT_SERVER = "https://app.easysoftechnic.com"


def machine_id():
    """Resumen estable del equipo (no contiene datos personales)."""
    raw = "|".join([socket.gethostname(), "qgis", platform.machine(), "%012x" % uuid.getnode()])
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def _b64url(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def verify_token(token, public_pem):
    try:
        body, sig = token.split(".")
        raw = _b64url(body)
        if not ed25519.verify(ed25519.public_key_from_pem(public_pem), raw, _b64url(sig)):
            return None
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return None


def _parse(iso):
    d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def evaluate(token, public_pem, mid, now=None):
    """Devuelve (estado, datos). estado: none, ok, invalid, other-machine, expired, offline-expired, no-module."""
    now = now or datetime.now(timezone.utc)
    if not token:
        return "none", None
    p = verify_token(token, public_pem)
    if not p:
        return "invalid", None
    if p.get("machineId") != mid:
        return "other-machine", p
    if p.get("expiresAt") and _parse(p["expiresAt"]) < now:
        return "expired", p
    if _parse(p["offlineUntil"]) < now:
        return "offline-expired", p
    if MODULE not in p.get("modules", []):
        return "no-module", p
    return "ok", p


STATUS_TEXT = {
    "none": "Sin licencia. Exportar a GML de Catastro necesita el módulo «Conexión con QGIS».",
    "ok": "Licencia activa.",
    "invalid": "El certificado guardado no es válido. Vuelve a activar la clave.",
    "other-machine": "La licencia guardada es de otro equipo. Vuelve a activarla en este.",
    "expired": "La licencia ha caducado. Renuévala en la web.",
    "offline-expired": "Han pasado más de 30 días sin conectar. Conéctate y pulsa Comprobar.",
    "no-module": "Tu licencia no incluye el módulo «Conexión con QGIS».",
}


def post(server, path, body, timeout=15):
    req = urllib.request.Request(
        server.rstrip("/") + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read().decode()).get("error")
        except Exception:
            msg = None
        raise RuntimeError(msg or "Error %d del servidor" % e.code)
    except urllib.error.URLError as e:
        raise RuntimeError("No se puede conectar con %s (%s)" % (server, e.reason))


def public_key_pem():
    with open(os.path.join(os.path.dirname(__file__), "licencia-publica.pem"), encoding="utf-8") as f:
        return f.read()
