import { describe, expect, it } from 'vitest';
import { catastroUrl, parseCatastroData, parseCatastroParcels, parseCatastroPoint, writeParcelGml } from '../src/index.js';

describe('servicios del Catastro', () => {
  it('construye las direcciones y rechaza datos no válidos', () => {
    expect(catastroUrl({ kind: 'colindantes', refcat: '1234567vk1213s0001ab', epsg: 25830 })).toContain('STOREDQUERIE_ID=GetNeighbourParcel');
    expect(catastroUrl({ kind: 'colindantes', refcat: '1234567vk1213s0001ab', epsg: 25830 })).toContain('refcat=1234567VK1213S&');
    expect(catastroUrl({ kind: 'datos', refcat: '1234567VK1213S' })).toContain('Consulta_DNPRC?Provincia=&Municipio=&RC=1234567VK1213S');
    expect(catastroUrl({ kind: 'punto', x: 465511.2, y: 4175163.5, epsg: 25830 })).toContain('Coordenada_X=465511.2');
    expect(() => catastroUrl({ kind: 'parcela', refcat: "1234'; DROP", epsg: 25830 })).toThrow();
  });

  it('lee las parcelas del WFS (mismo formato INSPIRE que el GML de parcela)', () => {
    const sq = (x: number) => ({ exterior: [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]] as [number, number][], interiors: [] });
    const xml = writeParcelGml(
      [{ id: '1111111VK1111S', namespace: 'ES.SDGC.CP', polygons: [sq(0)] }, { id: '2222222VK1111S', namespace: 'ES.SDGC.CP', polygons: [sq(10)] }],
      { epsg: 25830 },
    );
    const ps = parseCatastroParcels(xml);
    expect(ps.map((p) => p.refcat)).toEqual(['1111111VK1111S', '2222222VK1111S']);
    expect(ps[0]!.area).toBe(100);
    expect(() => parseCatastroParcels('<ows:ExceptionReport><ows:Exception><ows:ExceptionText>Referencia no encontrada</ows:ExceptionText></ows:Exception></ows:ExceptionReport>')).toThrow('Referencia no encontrada');
  });

  it('lee los datos públicos de un inmueble', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?><consulta_dnp xmlns="http://www.catastro.meh.es/"><control><cudnp>1</cudnp><cucons>1</cucons><cucul>0</cucul></control>
<bico><bi><idbi><cn>UR</cn><rc><pc1>1234567</pc1><pc2>VK1213S</pc2><car>0001</car><cc1>A</cc1><cc2>B</cc2></rc></idbi>
<ldt>CL MAYOR 24 BELMEZ DE LA MORALEDA (JAEN)</ldt><debi><luso>V</luso><sfc>126</sfc><cpt>100,000000</cpt><ant>1998</ant></debi></bi>
<finca><ldt>CL MAYOR 24</ldt><dff><ssf>203</ssf></dff></finca></bico></consulta_dnp>`;
    expect(parseCatastroData(xml, '1234567VK1213S0001AB')).toMatchObject({ direccion: 'CL MAYOR 24 BELMEZ DE LA MORALEDA (JAEN)', uso: 'Residencial', superficieConstruida: 126, anoConstruccion: 1998, clase: 'Urbano', superficie: 203 });
    const err = `<consulta_dnp><control><cuerr>1</cuerr></control><lerr><err><cod>43</cod><des>LA REFERENCIA CATASTRAL NO EXISTE</des></err></lerr></consulta_dnp>`;
    expect(() => parseCatastroData(err, 'X')).toThrow('NO EXISTE');
  });

  it('lee la referencia catastral de un punto', () => {
    const xml = `<consulta_coordenadas><coordenadas><coord><pc><pc1>1234567</pc1><pc2>VK1213S</pc2></pc><geo><xcen>465511</xcen><ycen>4175163</ycen><srs>EPSG:25830</srs></geo><ldt>CL MAYOR 24</ldt></coord></coordenadas></consulta_coordenadas>`;
    expect(parseCatastroPoint(xml)).toEqual({ refcat: '1234567VK1213S', direccion: 'CL MAYOR 24' });
  });
});
