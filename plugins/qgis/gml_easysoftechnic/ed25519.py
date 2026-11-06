"""Verificación de firmas Ed25519 en Python puro (RFC 8032).

Se incluye para no depender de librerías externas que no todas las instalaciones de
QGIS traen. Solo verifica (no firma), que es lo único que necesita el complemento.
"""
import hashlib

_p = 2 ** 255 - 19
_L = 2 ** 252 + 27742317777372353535851937790883648493
_d = -121665 * pow(121666, _p - 2, _p) % _p
_I = pow(2, (_p - 1) // 4, _p)


def _inv(x):
    return pow(x, _p - 2, _p)


def _xrecover(y):
    xx = (y * y - 1) * _inv(_d * y * y + 1)
    x = pow(xx, (_p + 3) // 8, _p)
    if (x * x - xx) % _p != 0:
        x = (x * _I) % _p
    if (x * x - xx) % _p != 0:
        return None
    return x


_By = 4 * _inv(5) % _p
_Bx = _xrecover(_By)
if _Bx & 1:  # el punto base tiene x par
    _Bx = _p - _Bx
_B = (_Bx % _p, _By % _p, 1, _Bx * _By % _p)


def _add(P, Q):
    A = (P[1] - P[0]) * (Q[1] - Q[0]) % _p
    B = (P[1] + P[0]) * (Q[1] + Q[0]) % _p
    C = 2 * P[3] * Q[3] * _d % _p
    D = 2 * P[2] * Q[2] % _p
    E, F, G, H = B - A, D - C, D + C, B + A
    return (E * F % _p, G * H % _p, F * G % _p, E * H % _p)


def _mul(s, P):
    Q = (0, 1, 1, 0)
    while s > 0:
        if s & 1:
            Q = _add(Q, P)
        P = _add(P, P)
        s >>= 1
    return Q


def _equal(P, Q):
    return (P[0] * Q[2] - Q[0] * P[2]) % _p == 0 and (P[1] * Q[2] - Q[1] * P[2]) % _p == 0


def _decode_point(b):
    if len(b) != 32:
        return None
    y = int.from_bytes(b, "little")
    sign = y >> 255
    y &= (1 << 255) - 1
    if y >= _p:
        return None
    x = _xrecover(y)
    if x is None or (x == 0 and sign):
        return None
    if (x & 1) != sign:
        x = _p - x
    return (x, y, 1, x * y % _p)


def verify(public_key, message, signature):
    """public_key: 32 bytes; signature: 64 bytes."""
    if len(signature) != 64:
        return False
    A = _decode_point(public_key)
    R = _decode_point(signature[:32])
    if A is None or R is None:
        return False
    s = int.from_bytes(signature[32:], "little")
    if s >= _L:
        return False
    h = int.from_bytes(hashlib.sha512(signature[:32] + public_key + message).digest(), "little") % _L
    return _equal(_mul(s, _B), _add(R, _mul(h, A)))


def public_key_from_pem(pem):
    """Clave pública Ed25519 en PEM (SPKI): los 32 últimos bytes del DER son la clave."""
    import base64

    body = "".join(line for line in pem.strip().splitlines() if not line.startswith("-----"))
    der = base64.b64decode(body)
    return der[-32:]
