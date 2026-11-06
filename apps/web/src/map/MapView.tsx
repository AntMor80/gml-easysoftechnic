import { useEffect, useRef, useState } from 'react';
import OlMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import LayerGroup from 'ol/layer/Group';
import type Layer from 'ol/layer/Layer';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import ImageLayer from 'ol/layer/Image';
import ImageWMS from 'ol/source/ImageWMS';
import XYZ from 'ol/source/XYZ';
import Feature from 'ol/Feature';
import { MultiPolygon, Point as OlPoint } from 'ol/geom';
import { Circle, Fill, Stroke, Style, Text } from 'ol/style';
import { register } from 'ol/proj/proj4';
import { transform } from 'ol/proj';
import { ScaleLine } from 'ol/control';
import proj4 from 'proj4';
import { CRS_DEFS, closeRing } from '@gml/core';
import type { Item, Role } from '../lib/state';

for (const [code, def] of Object.entries(CRS_DEFS)) proj4.defs(`EPSG:${code}`, def.proj4);
register(proj4);

export type BaseLayer = 'pnoa' | 'pnoaNombres' | 'ignBase' | 'catastro' | 'osm' | 'blanco';

export const BASE_LABELS: Record<BaseLayer, string> = {
  pnoa: 'Ortofoto PNOA',
  pnoaNombres: 'Ortofoto PNOA con calles y nombres',
  ignBase: 'Callejero IGN (mapa base)',
  catastro: 'Catastro (como fondo)',
  osm: 'OpenStreetMap',
  blanco: 'Sin fondo',
};

/**
 * Teselas en caché (WMTS) del IGN: se sirven ya generadas y cargan mucho más rápido
 * que el WMS, que dibuja cada imagen al vuelo.
 */
const ignWmts = (service: string, layer: string, format: string, maxZoom: number, attributions: string) =>
  new TileLayer({
    preload: 2,
    source: new XYZ({
      url: `https://www.ign.es/wmts/${service}?request=GetTile&service=WMTS&VERSION=1.0.0&Layer=${layer}&Style=default&Format=${format}&TileMatrixSet=GoogleMapsCompatible&TileMatrix={z}&TileRow={y}&TileCol={x}`,
      maxZoom,
      attributions,
      crossOrigin: 'anonymous',
    }),
  });

const CATASTRO_WMS = 'https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx';
const CATASTRO_PARAMS = { SERVICE: 'WMS', VERSION: '1.1.1', LAYERS: 'Catastro', STYLES: '', FORMAT: 'image/png', TRANSPARENT: 'TRUE' };
// Servicio INSPIRE del Catastro: se usa como respaldo si el WMS principal falla.
const CATASTRO_INSPIRE_WMS = 'https://ovc.catastro.meh.es/cartografia/INSPIRE/spadgcwms.aspx';
const CATASTRO_INSPIRE_PARAMS = { SERVICE: 'WMS', VERSION: '1.1.1', LAYERS: 'CP.CadastralParcel,BU.Building', STYLES: '', FORMAT: 'image/png', TRANSPARENT: 'TRUE' };
const IGN = '© Instituto Geográfico Nacional';
const BASES: Record<BaseLayer, () => Layer[]> = {
  pnoa: () => [ignWmts('pnoa-ma', 'OI.OrthoimageCoverage', 'image/jpeg', 20, `PNOA ${IGN}`)],
  pnoaNombres: () => [
    ignWmts('pnoa-ma', 'OI.OrthoimageCoverage', 'image/jpeg', 20, `PNOA ${IGN}`),
    // Capa transparente con viales, nombres y toponimia del IGN, pensada para ir sobre la ortofoto.
    ignWmts('ign-base', 'IGNBaseOrto', 'image/png', 18, `Mapa base ${IGN}`),
  ],
  ignBase: () => [ignWmts('ign-base', 'IGNBaseTodo', 'image/jpeg', 18, `Mapa base ${IGN}`)],
  catastro: () => [
    new ImageLayer({
      source: new ImageWMS({
        url: CATASTRO_WMS,
        params: { ...CATASTRO_PARAMS, TRANSPARENT: 'FALSE' },
        ratio: 1,
        attributions: 'Dirección General del Catastro',
      }),
    }),
  ],
  osm: () => [new TileLayer({ preload: 2, source: new OSM() })],
  blanco: () => [],
};

const COLORS: Record<Role, string> = { parcela: '#1f6feb', edificio: '#d9480f', piscina: '#0ca678', referencia: '#e03131' };

function styleFor(role: Role, selected: boolean) {
  const c = COLORS[role];
  return new Style({
    stroke: new Stroke({ color: c, width: selected ? 3 : 2, lineDash: role === 'referencia' ? [6, 4] : undefined }),
    fill: new Fill({ color: role === 'referencia' ? 'rgba(0,0,0,0)' : `${c}${selected ? '40' : '22'}` }),
  });
}

interface Props {
  items: Item[];
  epsg: number;
  selected?: string;
  markers: [number, number][];
  base: BaseLayer;
  catastro: boolean;
  onSelect: (uid?: string) => void;
  onMapClick?: (p: [number, number]) => void;
  fitKey: number;
}

export function MapView({ items, epsg, selected, markers, base, catastro, onSelect, onMapClick, fitKey }: Props) {
  const div = useRef<HTMLDivElement>(null);
  const map = useRef<OlMap>();
  const vector = useRef(new VectorSource());
  const baseLayer = useRef<LayerGroup>();
  // El Catastro se pide como una sola imagen por vista (menos peticiones que en teselas).
  const catLayer = useRef(
    new ImageLayer({
      source: new ImageWMS({
        url: CATASTRO_WMS,
        params: CATASTRO_PARAMS,
        ratio: 1,
        attributions: 'Dirección General del Catastro',
      }),
      zIndex: 1,
      // El WMS del Catastro solo dibuja parcelas a escala de detalle; a menor zoom
      // devuelve imágenes en blanco que tapan la ortofoto.
      minZoom: 15,
    }),
  );
  const [catStatus, setCatStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [zoom, setZoom] = useState(6);
  const [cursor, setCursor] = useState<string>('');
  const cb = useRef({ onSelect, onMapClick, epsg });
  cb.current = { onSelect, onMapClick, epsg };

  useEffect(() => {
    const m = new OlMap({
      target: div.current!,
      layers: [catLayer.current, new VectorLayer({ source: vector.current, zIndex: 2 })],
      view: new View({ center: transform([-3.7, 40.4], 'EPSG:4326', 'EPSG:3857'), zoom: 6, maxZoom: 21 }),
      controls: [new ScaleLine()],
    });
    m.on('pointermove', (e) => {
      const p = transform(e.coordinate, 'EPSG:3857', `EPSG:${cb.current.epsg}`);
      setCursor(`X ${p[0]!.toFixed(2)}  Y ${p[1]!.toFixed(2)}`);
    });
    m.on('singleclick', (e) => {
      const f = m.forEachFeatureAtPixel(e.pixel, (f) => f, { hitTolerance: 3 });
      cb.current.onSelect((f?.get('uid') as string | undefined) ?? undefined);
      const p = transform(e.coordinate, 'EPSG:3857', `EPSG:${cb.current.epsg}`);
      cb.current.onMapClick?.([p[0]!, p[1]!]);
    });
    const src = catLayer.current.getSource()!;
    src.on('imageloadstart', () => setCatStatus('loading'));
    src.on('imageloadend', () => setCatStatus('ok'));
    let fallback = false;
    src.on('imageloaderror', () => {
      if (!fallback) {
        // Primer fallo: probamos el servicio INSPIRE del Catastro antes de dar error.
        fallback = true;
        src.setUrl(CATASTRO_INSPIRE_WMS);
        src.updateParams(CATASTRO_INSPIRE_PARAMS);
        return;
      }
      setCatStatus('error');
    });
    m.getView().on('change:resolution', () => setZoom(m.getView().getZoom() ?? 0));
    map.current = m;
    return () => m.setTarget(undefined);
  }, []);

  useEffect(() => {
    const m = map.current!;
    if (baseLayer.current) m.removeLayer(baseLayer.current);
    baseLayer.current = new LayerGroup({ layers: BASES[base](), zIndex: 0 });
    m.addLayer(baseLayer.current);
  }, [base]);

  useEffect(() => catLayer.current.setVisible(catastro), [catastro]);

  useEffect(() => {
    const src = vector.current;
    src.clear();
    const proj = `EPSG:${epsg}`;
    const tr = (p: [number, number]) => transform(p, proj, 'EPSG:3857');
    for (const it of items) {
      if (!it.visible) continue;
      const geom = new MultiPolygon(it.polygons.map((p) => [p.exterior, ...p.interiors].map((r) => closeRing(r).map(tr))));
      const f = new Feature({ geometry: geom, uid: it.uid });
      f.setStyle(styleFor(it.role, it.uid === selected));
      src.addFeature(f);
      if (it.uid === selected) {
        it.polygons.forEach((p) =>
          closeRing(p.exterior).slice(0, -1).forEach((v, i) => {
            const vf = new Feature({ geometry: new OlPoint(tr(v)) });
            vf.setStyle(new Style({
              image: new Circle({ radius: 3.5, fill: new Fill({ color: COLORS[it.role] }), stroke: new Stroke({ color: '#fff', width: 1 }) }),
              text: new Text({ text: String(i + 1), offsetX: 9, offsetY: -9, font: '600 12px system-ui', fill: new Fill({ color: '#111' }), stroke: new Stroke({ color: '#fff', width: 3 }) }),
            }));
            src.addFeature(vf);
          }),
        );
      }
    }
    for (const m of markers) {
      const mf = new Feature({ geometry: new OlPoint(tr(m)) });
      mf.setStyle(new Style({ image: new Circle({ radius: 10, stroke: new Stroke({ color: '#e03131', width: 3 }) }) }));
      src.addFeature(mf);
    }
  }, [items, epsg, selected, markers]);

  useEffect(() => {
    const ext = vector.current.getExtent();
    if (fitKey && isFinite(ext[0]!)) map.current?.getView().fit(ext, { padding: [60, 60, 60, 60], maxZoom: 21, duration: 300 });
  }, [fitKey]);

  return (
    <div className="map-wrap">
      <div ref={div} className="map" />
      <div className="cursor">{cursor} · EPSG:{epsg}</div>
      {catastro && (
        <div className={`cat-status ${catStatus === 'error' ? 'err' : ''}`}>
          {zoom < 15
            ? 'Catastro: acércate para verlo'
            : catStatus === 'loading'
              ? 'Catastro: cargando…'
              : catStatus === 'error'
                ? 'Catastro: el servidor no responde (puede estar saturado)'
                : 'Catastro'}
        </div>
      )}
    </div>
  );
}
