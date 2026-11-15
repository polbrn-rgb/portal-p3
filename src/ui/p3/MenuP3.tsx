import { MenuLateral } from '../MenuLateral';

export type AbaP3 = 'numerador' | 'pendentes' | 'operacoes' | 'aperfeicoamento' | 'cfp' | 'sala' | 'painel';

const ITENS: { id: AbaP3; href: string; rotulo: string }[] = [
  { id: 'numerador', href: '#/demandas', rotulo: 'Numerador' },
  { id: 'pendentes', href: '#/pendentes', rotulo: 'Demandas Pendentes' },
  { id: 'operacoes', href: '#/operacoes', rotulo: 'Operações' },
  { id: 'aperfeicoamento', href: '#/aperfeicoamento', rotulo: 'Aperfeiçoamento' },
  { id: 'cfp', href: '#/cfp', rotulo: 'CFP' },
  { id: 'sala', href: '#/sala', rotulo: 'Sala de Operações' },
  { id: 'painel', href: '#/painel', rotulo: 'Painel' },
];

/** Menu da P/3 (lateral no computador, ☰ no celular). */
export function MenuP3({ ativa, pendentes, operacoes }: { ativa: AbaP3; pendentes?: number; operacoes?: number }) {
  const contadores: Partial<Record<AbaP3, number | undefined>> = { pendentes, operacoes };
  const itens = ITENS.map((i) => ({ ...i, contador: contadores[i.id] }));
  return <MenuLateral id="menu-p3" rotulo="Seções da P/3" titulo="Portal P3" itens={itens} ativa={ativa} />;
}
