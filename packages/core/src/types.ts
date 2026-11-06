/** Punto en coordenadas proyectadas (x = Este, y = Norte) o geográficas (x = lon, y = lat). */
export type Point = [number, number];
/** Anillo: secuencia de puntos. En este motor siempre se guarda cerrado (primer punto = último). */
export type Ring = Point[];
/** Polígono: primer anillo exterior, el resto interiores (islas o patios). */
export interface Polygon {
  exterior: Ring;
  interiors: Ring[];
}
/** Polilínea abierta o cerrada, tal como llega de un CAD. */
export type LineString = Point[];

/** Códigos EPSG admitidos por el Catastro para GML. */
export type CatastroEpsg = 25828 | 25829 | 25830 | 25831 | 32627 | 32628 | 4258 | 4326;

export type ParcelNamespace = 'ES.SDGC.CP' | 'ES.LOCAL.CP';

export interface Parcel {
  /** Referencia catastral (14 o 20 caracteres) o identificador local. */
  id: string;
  namespace: ParcelNamespace;
  /** Uno o varios polígonos (parcelas formadas por varios recintos). */
  polygons: Polygon[];
  /** Superficie declarada en m². Si falta, se calcula de la geometría. */
  area?: number;
  label?: string;
}

export type ConditionOfConstruction = 'functional' | 'declined' | 'ruin';
export type CurrentUse =
  | '1_residential'
  | '2_agriculture'
  | '3_industrial'
  | '4_1_office'
  | '4_2_retail'
  | '4_3_publicServices';

export interface Building {
  /** Normalmente la referencia catastral de la parcela (14 caracteres). */
  id: string;
  polygons: Polygon[];
  numberOfFloorsAboveGround: number;
  conditionOfConstruction: ConditionOfConstruction;
  currentUse?: CurrentUse;
  /** Fecha ISO (AAAA-01-01 según criterio del Catastro). */
  dateOfConstruction?: string;
  /** Superficie construida (grossFloorArea) en m². */
  grossFloorArea?: number;
  numberOfBuildingUnits?: number;
  numberOfDwellings?: number;
}

/** Otra construcción (piscina, etc.), sin recintos interiores. */
export interface OtherConstruction {
  id: string;
  polygons: Polygon[];
}

export type Severity = 'error' | 'warning';

export interface Issue {
  code: string;
  severity: Severity;
  message: string;
  /** Índice del polígono y del anillo afectados, si aplica. */
  polygon?: number;
  ring?: number;
  point?: Point;
}
