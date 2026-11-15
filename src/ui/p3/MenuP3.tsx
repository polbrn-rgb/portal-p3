import { MenuLateral } from '../MenuLateral';

export type AbaP3 = 'pendentes' | 'numerador' | 'painel' | 'cfp' | 'sala' | 'aperfeicoamento';

const ITENS: { id: AbaP3; href: string; rotulo: string }[] = [
  { id: 'pendentes', href: '#/pendentes', rotulo: 'Demandas Pendentes' },
  { id: 'numerador', href: '#/demandas', rotulo: 'Numerador' },
  { id: 'painel', href: '#/painel', rotulo: 'Painel' },
  { id: 'cfp', href: '#/cfp', rotulo: 'CFP' },
  { id: 'sala', href: '#/sala', rotulo: 'Sala Op.' },
  { id: 'aperfeicoamento', href: '#/aperfeicoamento', rotulo: 'Aperfeiçoamento' },
];

/** Menu da P/3 (lateral no computador, ☰ no celular). */
export function MenuP3({ ativa, pendentes }: { ativa: AbaP3; pendentes?: number }) {
  const itens = ITENS.map((i) => (i.id === 'pendentes' ? { ...i, contador: pendentes } : i));
  return <MenuLateral id="menu-p3" rotulo="Seções da P/3" titulo="Portal P3" itens={itens} ativa={ativa} />;
}
