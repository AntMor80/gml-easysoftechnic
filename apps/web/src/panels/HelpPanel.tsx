import { useEffect, useRef } from 'react';

/** Secciones de la ayuda. El id permite abrirla directamente en una sección. */
export type HelpSection =
  | 'inicio' | 'flujos' | 'mapa' | 'files' | 'vertices' | 'validate' | 'gml' | 'export' | 'reports' | 'catastro' | 'account' | 'errores' | 'faq';

const TOC: { id: HelpSection; title: string }[] = [
  { id: 'inicio', title: 'Primeros pasos' },
  { id: 'flujos', title: 'Pasos para cada trámite' },
  { id: 'mapa', title: 'Mapa y capas' },
  { id: 'files', title: 'Archivos' },
  { id: 'vertices', title: 'Vértices' },
  { id: 'validate', title: 'Validar' },
  { id: 'gml', title: 'Crear GML' },
  { id: 'export', title: 'Exportar' },
  { id: 'reports', title: 'Informes' },
  { id: 'catastro', title: 'Catastro' },
  { id: 'account', title: 'Mi cuenta y licencias' },
  { id: 'errores', title: 'Errores frecuentes' },
  { id: 'faq', title: 'Preguntas frecuentes' },
];

export function HelpPanel({ section, onClose }: { section: HelpSection; onClose: () => void }) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.querySelector(`#ayuda-${section}`)?.scrollIntoView({ block: 'start' });
  }, [section]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const go = (id: HelpSection) => body.current?.querySelector(`#ayuda-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="help-backdrop" onClick={onClose}>
      <div className="help" role="dialog" aria-label="Ayuda" onClick={(e) => e.stopPropagation()}>
        <header>
          <strong>Ayuda de GML EasySoftechnic</strong>
          <button className="icon" onClick={onClose} aria-label="Cerrar">Cerrar ✕</button>
        </header>
        <div className="help-cols">
          <nav>{TOC.map((t) => <button key={t.id} onClick={() => go(t.id)}>{t.title}</button>)}</nav>
          <div className="help-body" ref={body}>
            <section id="ayuda-inicio">
              <h2>Primeros pasos</h2>
              <p>La aplicación prepara la documentación gráfica que pide el Catastro: <b>GML de parcela</b> (representación gráfica alternativa, Ley 13/2015), <b>GML de edificio</b> (Informe Catastral de Ubicación de las Construcciones, ICUC), coordenadas, planos e informes. Todo se procesa en tu ordenador: los archivos no se suben a ningún servidor.</p>
              <ol>
                <li><b>Carga</b> tu medición (DXF, GML, TXT/CSV de coordenadas o GeoJSON) en <i>Archivos</i>, o arrástrala al mapa.</li>
                <li><b>Revisa el papel</b> de cada recinto (parcela, edificio, piscina o referencia) y su <b>identificador</b> (la referencia catastral si la tiene).</li>
                <li>Comprueba que el <b>sistema de referencia</b> (huso UTM) es el correcto: el recinto debe caer en su sitio sobre la ortofoto.</li>
                <li>Trae la <b>parcela del Catastro</b> y, si quieres, los <b>colindantes</b> (pestaña <i>Catastro</i>) para comparar.</li>
                <li><b>Valida</b> y corrige los errores (pestaña <i>Validar</i>).</li>
                <li>Genera el <b>GML</b>, los <b>informes</b> o el <b>paquete completo</b> del trámite.</li>
                <li>Antes de presentarlo, pasa el GML por el validador de la Sede Electrónica del Catastro.</li>
              </ol>
              <p className="hint">Consejo: cada pestaña tiene su apartado en esta ayuda. Pulsa «Ayuda» en la cabecera cuando lo necesites; se abre en la pestaña en la que estás.</p>
            </section>

            <section id="ayuda-flujos">
              <h2>Pasos para cada trámite</h2>
              <h3>1. GML de parcela desde un DXF (segregación, agregación, rectificación…)</h3>
              <ol>
                <li>En tu CAD, dibuja cada parcela resultante como <b>polilínea cerrada</b>. Pon cada tipo en su capa: un nombre de capa con «edif», «constr», «huella» o «build» se lee como edificio; con «piscin», como piscina; el resto, como parcela.</li>
                <li>Arrastra el DXF al mapa. Si el dibujo no está en coordenadas UTM reales, no caerá en su sitio: corrígelo en el CAD.</li>
                <li>En <i>Archivos</i>, escribe el identificador de cada parcela (referencia catastral de 14 caracteres o un nombre local si es nueva).</li>
                <li><i>Catastro</i> → «Cargar la parcela actual» para ver la diferencia con lo catastral.</li>
                <li><i>Validar</i> → «Validar todo». Si hay solape con un vecino, usa «Ajustar medianera».</li>
                <li><i>Crear GML</i> → «Crear GML de parcela» (con varias parcelas sale un GML multiparcela).</li>
                <li><i>Informes</i> → «Paquete completo del trámite (ZIP)».</li>
              </ol>
              <h3>2. GML de edificio para el ICUC</h3>
              <ol>
                <li>Carga la huella del edificio (DXF o coordenadas) y márcala como <b>Edificio</b>. Las piscinas, como <b>Piscina</b>.</li>
                <li>Carga también la parcela (o tráela del Catastro) para comprobar que el edificio queda dentro.</li>
                <li><i>Validar</i> con la tolerancia que indique el ICUC (por defecto 0,005 m).</li>
                <li><i>Crear GML</i> → rellena plantas, estado, uso, año, superficie construida y viviendas → «Crear GML de edificio».</li>
              </ol>
              <h3>3. Revisar un GML que ya tienes</h3>
              <ol>
                <li>Arrástralo al mapa: se detectan la versión (v3 o v4), el sistema de referencia y la superficie declarada.</li>
                <li><i>Validar</i> → «Validar todo». Los avisos de lectura (coma decimal, identificador incoherente…) aparecen abajo a la izquierda.</li>
                <li>Si estaba en formato antiguo o con defectos, <i>Crear GML</i> lo reescribe en v4 corregido.</li>
              </ol>
              <h3>4. Colindantes para notaría o registro</h3>
              <ol>
                <li><i>Catastro</i> → escribe la referencia o pulsa la parcela en el mapa → «Buscar colindantes».</li>
                <li>Descarga la lista en CSV o el informe PDF con el plano numerado.</li>
              </ol>
            </section>

            <section id="ayuda-mapa">
              <h2>Mapa y capas</h2>
              <ul>
                <li><b>Mapa de fondo</b> (desplegable de la cabecera): ortofoto PNOA, ortofoto con calles y nombres, callejero del IGN, Catastro como fondo, OpenStreetMap o sin fondo.</li>
                <li><b>Capas</b>: se superponen al fondo. <i>Catastro</i> (parcelas y edificios, al acercar), <i>Ortofoto histórica</i> con selector de vuelo (americano 1956-57, PNOA de cada año…) y transparencia para comparar con la actual, <i>Relieve</i>, <i>Curvas de nivel</i> y <i>Límites municipales</i>.</li>
                <li><b>Ver todo</b> encuadra los recintos cargados.</li>
                <li>Abajo a la izquierda se ven las coordenadas del cursor en el sistema de trabajo y la escala.</li>
                <li>Pulsar un recinto lo selecciona y numera sus vértices.</li>
              </ul>
            </section>

            <section id="ayuda-files">
              <h2>Archivos</h2>
              <p>Formatos admitidos:</p>
              <ul>
                <li><b>GML</b> de parcela (INSPIRE v3 y v4) y de edificio.</li>
                <li><b>DXF</b>: polilíneas (también con arcos), líneas sueltas que formen un contorno cerrado, arcos y círculos. Los arcos se convierten en tramos rectos con 2 cm de flecha máxima, como pide el Catastro.</li>
                <li><b>TXT / CSV</b> de coordenadas «X Y» o «nº X Y», con espacio, tabulador, coma o punto y coma; también la salida del comando <b>LIST</b> de AutoCAD copiada a un .txt.</li>
                <li><b>GeoJSON</b>.</li>
              </ul>
              <p>Para cada recinto puedes cambiar el <b>identificador</b>, el <b>papel</b>, mostrarlo u ocultarlo y quitarlo. El papel decide qué se hace con él:</p>
              <ul>
                <li><b>Parcela</b>: va al GML de parcela y a los informes.</li>
                <li><b>Edificio</b> y <b>Piscina</b>: van al GML de edificio.</li>
                <li><b>Referencia</b>: solo para comparar (parcela catastral actual, colindantes). Se dibuja en gris en los planos.</li>
              </ul>
            </section>

            <section id="ayuda-vertices">
              <h2>Vértices</h2>
              <p>Muestra del recinto seleccionado la superficie, el perímetro y la tabla de vértices con sus coordenadas y la longitud de cada lado. Es la misma numeración que aparece en el mapa y en los informes.</p>
            </section>

            <section id="ayuda-validate">
              <h2>Validar</h2>
              <p>Aplica las comprobaciones previas del Catastro: contornos cerrados, sentido de giro, cruces del contorno consigo mismo, vértices duplicados o demasiado juntos, superficies nulas, identificadores repetidos, edificios fuera de la parcela y solapes entre recintos.</p>
              <ul>
                <li>La <b>tolerancia</b> (0,002 a 0,020 m) es el margen que admite el ICUC: los solapes o salientes más pequeños se dan por buenos.</li>
                <li>Cada error se señala con un círculo rojo en el mapa.</li>
                <li><b>Ajustar medianera</b>: encaja tu recinto con el colindante. Mueve tus vértices que estén a menos de la distancia indicada del vecino y añade los vértices del vecino en el lado común, para que no queden huecos ni solapes.</li>
              </ul>
            </section>

            <section id="ayuda-gml">
              <h2>Crear GML</h2>
              <ul>
                <li><b>Sistema de referencia</b>: el huso UTM ETRS89 de la zona (29, 30 o 31 en la península; 28 en Canarias). Debe coincidir con el de tus coordenadas.</li>
                <li><b>Decimales</b>: el Catastro recomienda 2 en coordenadas. La superficie se escribe sin decimales salvo que elijas otra cosa.</li>
                <li><b>GML de parcela</b>: una o varias parcelas. Si el identificador es una referencia catastral válida se usa el espacio de nombres ES.SDGC.CP; si no, ES.LOCAL.CP (parcelas nuevas).</li>
                <li><b>GML de edificio</b>: los datos que pide el ICUC (plantas sobre rasante, estado, uso, año, superficie construida y viviendas). Las piscinas salen como «otras construcciones».</li>
                <li>El programa orienta los contornos como exige el Catastro (exterior antihorario, islas horario) y usa punto decimal.</li>
              </ul>
            </section>

            <section id="ayuda-export">
              <h2>Exportar</h2>
              <p>Saca los recintos a otros programas: <b>DXF</b> (una capa por tipo), <b>Shapefile</b> y <b>GeoPackage</b> (QGIS, ArcGIS), <b>KML/KMZ</b> (Google Earth), <b>GeoJSON</b> (en WGS84 o en las coordenadas del proyecto), <b>Excel</b> con vértices y superficies, <b>CSV</b> y <b>TXT</b> de coordenadas. Las exportaciones son gratuitas.</p>
            </section>

            <section id="ayuda-reports">
              <h2>Informes</h2>
              <p><b>Solo hace falta tener un recinto cargado</b> (tuyo o traído del Catastro). Los demás campos son opcionales y, si los rellenas, aparecen en los documentos:</p>
              <ul>
                <li><b>Técnico</b>: nombre, titulación, colegiado, colegio, email y teléfono. Se guardan en este navegador para los próximos informes.</li>
                <li><b>Trabajo</b>: cliente, referencia catastral (si la dejas vacía se usa el identificador del recinto), municipio, provincia, tipo de actuación y lugar de firma.</li>
                <li><b>Superficie registral</b>: el certificado de superficies la compara con la medida y avisa si la diferencia pasa del 10 %.</li>
                <li><b>Finca y Registro de la Propiedad</b>: aparecen en la representación gráfica para notaría y registro.</li>
                <li><b>Observaciones</b>: texto libre al final de los documentos.</li>
              </ul>
              <p>Documentos:</p>
              <ul>
                <li><b>Informe de coordenadas</b> (PDF y Word): plano, tabla de vértices, lados y superficies.</li>
                <li><b>Informe de validación</b>: resultado de las comprobaciones, con los errores señalados en el plano.</li>
                <li><b>Certificado de superficies</b>: superficie medida, catastral (si hay recinto de referencia) y registral.</li>
                <li><b>Representación gráfica para notaría y registro</b>.</li>
                <li><b>Paquete completo (ZIP)</b>: GML de parcela y de edificio, CSV, Excel, KML y los cinco documentos.</li>
              </ul>
              <p className="hint">Para que los informes comparen tu medición con el Catastro, carga la parcela catastral (pestaña Catastro): queda como «Referencia» y se dibuja en gris.</p>
            </section>

            <section id="ayuda-catastro">
              <h2>Catastro</h2>
              <ul>
                <li>Escribe la <b>referencia catastral</b> (14 o 20 caracteres) o <b>pulsa una parcela en el mapa</b> con esta pestaña abierta: verás su localización, clase, uso, superficies y año.</li>
                <li><b>Cargar la parcela actual del Catastro</b>: la añade como «Referencia». Si no tienes medición propia, los informes y el GML se harán sobre ella.</li>
                <li><b>Buscar colindantes</b>: dibuja las parcelas vecinas y las lista con referencia, dirección, uso y superficie. Se descargan en CSV o en un informe PDF con plano numerado.</li>
                <li>Los <b>titulares</b> son datos protegidos y no se muestran: se obtienen con la certificación catastral.</li>
                <li>Esta pestaña necesita conexión. En el archivo HTML de prueba no funciona porque el Catastro bloquea esas consultas; sí funciona con iniciar-web.bat, en la web publicada y en la aplicación de escritorio.</li>
              </ul>
            </section>

            <section id="ayuda-account">
              <h2>Mi cuenta y licencias</h2>
              <ul>
                <li><b>Web</b>: cada actuación (GML, informe, paquete, colindantes) gasta créditos; las exportaciones y la validación son gratis. Los créditos se compran en bonos desde <i>Mi cuenta</i>.</li>
                <li><b>Aplicación de escritorio</b>: en lugar de créditos, cada módulo se desbloquea con su licencia (anual, bianual o de por vida), válida en 2 equipos y 30 días sin conexión. Se activa en la pestaña <i>Licencia</i> o en el menú <i>Ayuda → Activar licencia</i>.</li>
                <li><b>Modo desarrollo</b>: en las pruebas (archivo HTML o iniciar-web.bat) no hay cuentas ni cobros y todo está desbloqueado.</li>
              </ul>
            </section>

            <section id="ayuda-errores">
              <h2>Errores frecuentes</h2>
              <ul>
                <li><b>El recinto no aparece o sale en el mar</b>: el sistema de referencia no es el de tus coordenadas, o el DXF no está en coordenadas UTM reales. Cambia el huso en <i>Crear GML</i> o corrige el dibujo.</li>
                <li><b>«El contorno se cruza consigo mismo»</b>: hay vértices fuera de orden o un lado que corta a otro. Mira el círculo rojo y corrígelo en el CAD.</li>
                <li><b>Solape con el colindante</b>: usa «Ajustar medianera» con el colindante de referencia, o ajusta los vértices en el CAD.</li>
                <li><b>Vértices duplicados</b>: dos puntos a menos de 1 cm. Elimina uno.</li>
                <li><b>Superficie con coma</b> en un GML antiguo: se corrige sola al reescribir el GML.</li>
                <li><b>El DXF no carga recintos</b>: las líneas no forman un contorno cerrado. Usa polilíneas cerradas o revisa que los extremos coincidan.</li>
                <li><b>Los botones de informes están grises</b>: no hay ningún recinto cargado.</li>
              </ul>
            </section>

            <section id="ayuda-faq">
              <h2>Preguntas frecuentes</h2>
              <p><b>¿El GML generado se puede presentar directamente?</b> Sí, sigue el formato INSPIRE que exige el Catastro. Aun así, compruébalo siempre con el validador de la Sede Electrónica antes de presentarlo.</p>
              <p><b>¿Se suben mis archivos a internet?</b> No. Todo se procesa en tu equipo. Solo se consulta internet para el mapa y para la pestaña Catastro.</p>
              <p><b>¿Qué tolerancia uso?</b> La que indique el ICUC o el técnico del Catastro; 0,005 m es un valor habitual.</p>
              <p><b>¿Puedo trabajar en QGIS?</b> Sí, con el complemento de QGIS (exportar GML desde cualquier capa, importar, validar y traer parcela y colindantes), o exportando a GeoPackage o Shapefile.</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
