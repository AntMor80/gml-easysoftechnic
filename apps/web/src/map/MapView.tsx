import { useEffect, useRef, useState } from 'react';
import OlMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import TileWMS from 'ol/source/TileWMS';
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

export type BaseLayer = 'pnoa' | 'osm' | 'mtn';

const BASES: Record<BaseLayer, () => TileLayer> = {
  pnoa: () => new TileLayer({ source: new TileWMS({ url: 'https://www.ign.es/wms-inspire/pnoa-ma', params: { LAYERS: 'OI.OrthoimageCoverage', FORMAT: 'image/jpeg' }, attributions: 'PNOA © Instituto Geográfico Nacional' }) }),
  osm: () => new TileLayer({ source: new OSM() }),
  mtn: () => new TileLayer({ source: new TileWMS({ url: 'https://www.ign.es/wms-inspire/mapa-raster', params: { LAYERS: 'mtn_rasterizado', FORMAT: 'image/png' }, attributions: 'MTN © Instituto Geográfico Nacional' }) }),
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
  const baseLayer = useRef<TileLayer>();
  const catLayer = useRef(
    new TileLayer({
      source: new TileWMS({ url: 'https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx', params: { LAYERS: 'Catastro', FORMAT: 'image/png', TRANSPARENT: true }, attributions: 'Dirección General del Catastro' }),
      zIndex: 1,
    }),
  );
  const [cursor, setCursor] = useState<string>('');
  const cb = useRef({ onSelect, onMapClick, epsg });
  cb.current = { onSelect, onMapClick, epsg };

  useEffect(() => {
    const m = new OlMap({
      target: div.current!,
      layers: [catLayer.current, new VectorLayer({ source: vector.current, zIndex: 2 })],
      view: new View({ center: transform([-3.7, 40.4], 'EPSG:4326', 'EPSG:3857'), zoom: 6, maxZoom: 22 }),
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
    map.current = m;
    return () => m.setTarget(undefined);
  }, []);

  useEffect(() => {
    const m = map.current!;
    if (baseLayer.current) m.removeLayer(baseLayer.current);
    baseLayer.current = BASES[base]();
    baseLayer.current.setZIndex(0);
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
    </div>
  );
}
