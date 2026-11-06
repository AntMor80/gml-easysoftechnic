import TileLayer from 'ol/layer/Tile';
import ImageLayer from 'ol/layer/Image';
import TileWMS from 'ol/source/TileWMS';
import ImageWMS from 'ol/source/ImageWMS';
import XYZ from 'ol/source/XYZ';
import WMSCapabilities from 'ol/format/WMSCapabilities';
import type Layer from 'ol/layer/Layer';

/** Capas que se pueden poner encima del mapa de fondo. */
export type OverlayId = 'historica' | 'relieve' | 'curvas' | 'limites';

export const OVERLAY_LABELS: Record<OverlayId, string> = {
  historica: 'Ortofoto histórica',
  relieve: 'Relieve sombreado',
  curvas: 'Curvas de nivel',
  limites: 'Límites municipales',
};

const IGN = '© Instituto Geográfico Nacional';
export const HISTORIC_WMS = 'https://www.ign.es/wms/pnoa-historico';

/**
 * Vuelos disponibles si no se puede leer la lista del servidor. El primero
 * (vuelo americano serie B, 1956-57) es el que suele pedirse para acreditar la
 * antigüedad de una edificación.
 */
export const HISTORIC_FALLBACK: { name: string; title: string }[] = [
  { name: 'AMS_1956-1957', title: 'Vuelo americano 1956-1957' },
  { name: 'Interministerial_1973-1986', title: 'Interministerial 1973-1986' },
  { name: 'Nacional_1981-1986', title: 'Nacional 1981-1986' },
  { name: 'OLISTAT', title: 'OLISTAT 1997-1998' },
  { name: 'SIGPAC', title: 'SIGPAC 1997-2003' },
  ...Array.from({ length: 2023 - 2004 + 1 }, (_, i) => ({ name: `PNOA${2004 + i}`, title: `PNOA ${2004 + i}` })),
];

/** Lee del servidor del IGN la lista real de vuelos históricos. */
export async function loadHistoricFlights(): Promise<{ name: string; title: string }[]> {
  try {
    const res = await fetch(`${HISTORIC_WMS}?SERVICE=WMS&REQUEST=GetCapabilities`);
    const caps = new WMSCapabilities().read(await res.text()) as {
      Capability?: { Layer?: { Layer?: { Name?: string; Title?: string }[] } };
    };
    const layers = (caps.Capability?.Layer?.Layer ?? []).filter((l) => l.Name);
    if (!layers.length) return HISTORIC_FALLBACK;
    return layers.map((l) => ({ name: l.Name!, title: l.Title || l.Name! }));
  } catch {
    return HISTORIC_FALLBACK;
  }
}

export function historicLayer(name: string): ImageLayer<ImageWMS> {
  return new ImageLayer({
    zIndex: 0.5,
    source: new ImageWMS({
      url: HISTORIC_WMS,
      params: { SERVICE: 'WMS', VERSION: '1.1.1', LAYERS: name, STYLES: '', FORMAT: 'image/jpeg' },
      ratio: 1,
      attributions: `Ortofoto histórica ${IGN}`,
    }),
  });
}

export function makeOverlay(id: Exclude<OverlayId, 'historica'>): Layer {
  switch (id) {
    case 'relieve':
      return new TileLayer({
        zIndex: 0.6,
        opacity: 0.45,
        source: new XYZ({
          url: 'https://servicios.idee.es/wmts/mdt?request=GetTile&service=WMTS&VERSION=1.0.0&Layer=Relieve&Style=default&Format=image/jpeg&TileMatrixSet=GoogleMapsCompatible&TileMatrix={z}&TileRow={y}&TileCol={x}',
          maxZoom: 16,
          attributions: `Relieve ${IGN}`,
        }),
      });
    case 'curvas':
      return new TileLayer({
        zIndex: 0.7,
        minZoom: 12,
        source: new TileWMS({
          url: 'https://servicios.idee.es/wms-inspire/mdt',
          params: { VERSION: '1.1.1', LAYERS: 'EL.ContourLine', FORMAT: 'image/png', TRANSPARENT: 'TRUE' },
          attributions: `Curvas de nivel ${IGN}`,
        }),
      });
    case 'limites':
      return new TileLayer({
        zIndex: 0.8,
        source: new TileWMS({
          url: 'https://www.ign.es/wms-inspire/unidades-administrativas',
          params: { VERSION: '1.1.1', LAYERS: 'AU.AdministrativeBoundary', FORMAT: 'image/png', TRANSPARENT: 'TRUE' },
          attributions: `Límites administrativos ${IGN}`,
        }),
      });
  }
}
