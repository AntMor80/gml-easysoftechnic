// Genera con el motor TypeScript los GML de referencia que el complemento debe reproducir.
import { writeParcelGml, writeBuildingGml } from '../../../packages/core/src/index.ts';

const ts = '2026-01-01T00:00:00';
const sq = { exterior: [[0, 0], [0, 10.005], [10.12345, 10], [10, 0]] as [number, number][], interiors: [[[2, 2], [4, 2], [4, 4], [2, 4]]] as [number, number][][] };
const tri = { exterior: [[20, 0], [30, 0], [25, 7.5]] as [number, number][], interiors: [] };
const out = {
  parcel: writeParcelGml(
    [
      { id: '1234567VK1213S', namespace: 'ES.SDGC.CP', polygons: [sq, tri] },
      { id: 'A&B', namespace: 'ES.LOCAL.CP', polygons: [tri] },
    ],
    { epsg: 25830, coordDecimals: 2, areaDecimals: 1, timeStamp: ts },
  ),
  building: writeBuildingGml(
    [{ id: 'EDIF1', polygons: [sq], numberOfFloorsAboveGround: 2, conditionOfConstruction: 'functional', currentUse: '1_residential', dateOfConstruction: '1998-01-01', grossFloorArea: 180.4, numberOfDwellings: 1 }],
    [{ id: 'EDIF1', polygons: [tri] }],
    { epsg: 25830, coordDecimals: 2, timeStamp: ts },
  ),
};
console.log(JSON.stringify(out));
