# @gml/core

Motor común. Funciones principales:

- `writeParcelGml`, `writeBuildingGml`: GML INSPIRE v4 para el Catastro.
- `parseGml`, `convertParcelGmlToV4`: lectura de GML v3/v4 y conversión.
- `readDxf`, `writeDxf`, `dxfToCatastroPackage`: del DXF al GML y al CSV de coordenadas.
- `parseCoordinateText`: coordenadas pegadas del comando LIST de AutoCAD o TXT con `separador`.
- `validatePolygons`, `validateBuildingInParcel`: validación previa con las reglas del Catastro.
- `linesToPolygons`, `polygonsToLines`, `densifyArc`: geometría.
- `transformPoint`, `helmert2D`: husos, sistemas de referencia y catastro desplazado.
- `toGeoJson`, `fromGeoJson`, `toKml`, `toKmz`, `toShapefileZip`, `toXlsx`, `coordinatesWorkbook`: exportación a GeoJSON, KML/KMZ, Shapefile y Excel.
- `coordinateReportDefinition`, `coordinateReportDocx`, `planSvg`: informe de coordenadas georreferenciadas en PDF (pdfmake) y Word (docx), con plano a escala.
