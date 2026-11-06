# Complemento de QGIS

Menú *Vectorial > GML EasySoftechnic* y barra de herramientas propia:

| Acción | Licencia |
|---|---|
| **Exportar GML de parcela** desde la selección (o toda la capa): identificador desde un campo o a mano, multiparcela, un GML por parcela o unir todo en una parcela; reproyecta al huso elegido | módulo «Conexión con QGIS» |
| **Exportar GML de edificio** (ICUC): plantas, estado, uso, año, superficie, viviendas; las entidades marcadas con un campo de piscina salen como *OtherConstruction* | módulo «Conexión con QGIS» |
| **Importar GML catastral** (parcela, edificio, v3 o v4) | libre |
| **Validar entidades seleccionadas**: cruces, vértices duplicados, superficie nula, sentido de giro y solapes entre entidades | libre |
| **Licencia**: activar, comprobar, desactivar, comprar | — |

El GML es **idéntico byte a byte** al que generan la web y la aplicación de escritorio (`tests/test_puro.py` lo compara con el motor TypeScript). Los arcos se densifican con flecha de 2 cm, como pide el Catastro.

La licencia usa el mismo servidor y certificado firmado que el escritorio (30 días sin conexión). Cada QGIS cuenta como uno de los 2 equipos de la licencia. La firma se comprueba en Python puro, sin instalar nada en QGIS.

## Instalar

1. `python empaquetar.py` (o descargar el ZIP de GitHub Actions > *Complemento de QGIS*).
2. QGIS > Complementos > Administrar e instalar > *Instalar a partir de ZIP*.

Antes de publicar, sustituir `gml_easysoftechnic/licencia-publica.pem` por la clave pública definitiva (la misma que en `apps/desktop`).

## Pruebas

```bash
python3 -m unittest tests/test_puro.py                       # sin QGIS
QT_QPA_PLATFORM=offscreen GML_TEST_PRIVATE_KEY="$(cat clave-privada-de-pruebas.pem)" python3 tests/test_qgis.py   # con el Python de QGIS
```
