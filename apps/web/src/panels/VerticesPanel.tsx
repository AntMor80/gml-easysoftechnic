import { areaSummary, vertexTable } from '@gml/core';
import type { Item } from '../lib/state';

export function VerticesPanel({ item }: { item?: Item }) {
  if (!item) return <div className="panel"><p className="empty">Selecciona un recinto en el mapa o en la lista.</p></div>;
  const rows = vertexTable([{ id: item.id, polygons: item.polygons }]);
  const sum = areaSummary([{ id: item.id, polygons: item.polygons }]);
  const f = (n: number) => n.toFixed(2).replace('.', ',');
  return (
    <div className="panel">
      <h3>{item.id}</h3>
      <table className="grid">
        <thead><tr><th>Recinto</th><th>Superficie</th><th>Perímetro</th><th>Vért.</th></tr></thead>
        <tbody>{sum.map((s) => <tr key={s.recinto}><td>{s.recinto}</td><td className="n">{f(s.superficie)} m²</td><td className="n">{f(s.perimetro)} m</td><td className="n">{s.vertices}</td></tr>)}</tbody>
      </table>
      <table className="grid">
        <thead><tr><th>N.º</th><th>X</th><th>Y</th><th>Lado</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className={r.anillo === 'interior' ? 'int' : ''}><td>{r.vertice}{r.anillo === 'interior' ? ' (int.)' : ''}</td><td className="n">{f(r.x)}</td><td className="n">{f(r.y)}</td><td className="n">{f(r.lado)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
