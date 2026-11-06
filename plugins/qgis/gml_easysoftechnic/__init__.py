def classFactory(iface):  # noqa: N802 (nombre exigido por QGIS)
    from .plugin import GmlEasySoftechnic

    return GmlEasySoftechnic(iface)
