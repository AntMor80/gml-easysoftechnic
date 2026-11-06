import type { Issue, Polygon } from '@gml/core';

export type Role = 'parcela' | 'edificio' | 'piscina' | 'referencia';

export interface Item {
  uid: string;
  /** Referencia catastral o identificador. */
  id: string;
  role: Role;
  polygons: Polygon[];
  source: string;
  visible: boolean;
  /** Atributos de edificio (plantas, estado, uso…). */
  attrs?: Record<string, string | number | undefined>;
}

export interface State {
  epsg: number;
  items: Item[];
  selected?: string;
  issues: { uid: string; issues: Issue[] }[];
  messages: { kind: 'info' | 'error'; text: string; at: number }[];
}

export type Action =
  | { type: 'add'; items: Item[] }
  | { type: 'update'; uid: string; patch: Partial<Item> }
  | { type: 'remove'; uid: string }
  | { type: 'select'; uid?: string }
  | { type: 'epsg'; epsg: number }
  | { type: 'issues'; issues: State['issues'] }
  | { type: 'message'; kind: 'info' | 'error'; text: string }
  | { type: 'clearMessages' }
  | { type: 'expireMessages'; before: number };

export const initialState: State = { epsg: 25830, items: [], issues: [], messages: [] };

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'add':
      return { ...s, items: [...s.items, ...a.items], selected: a.items[0]?.uid ?? s.selected };
    case 'update':
      return { ...s, items: s.items.map((i) => (i.uid === a.uid ? { ...i, ...a.patch } : i)) };
    case 'remove':
      return { ...s, items: s.items.filter((i) => i.uid !== a.uid), selected: s.selected === a.uid ? undefined : s.selected, issues: s.issues.filter((i) => i.uid !== a.uid) };
    case 'select':
      return { ...s, selected: a.uid };
    case 'epsg':
      return { ...s, epsg: a.epsg };
    case 'issues':
      return { ...s, issues: a.issues };
    case 'message':
      return { ...s, messages: [...s.messages.slice(-2), { kind: a.kind, text: a.text, at: Date.now() }] };
    case 'clearMessages':
      return { ...s, messages: [] };
    case 'expireMessages':
      return s.messages.some((m) => m.at < a.before) ? { ...s, messages: s.messages.filter((m) => m.at >= a.before) } : s;
  }
}

let n = 0;
export const uid = () => `it${Date.now().toString(36)}${(n++).toString(36)}`;
