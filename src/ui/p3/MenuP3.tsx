import { MenuLateral } from '../MenuLateral';

export type AbaP3 = 'numerador' | 'pendentes' | 'operacoes' | 'aperfeicoamento' | 'agenda' | 'cfp' | 'sala' | 'painel' | 'admin';

const ITENS: { id: AbaP3; href: string; rotulo: string }[] = [
  { id: 'numerador', href: '#/demandas', rotulo: 'Numerador' },
  { id: 'pendentes', href: '#/pendentes', rotulo: 'Demandas Pendentes' },
  { id: 'operacoes', href: '#/operacoes', rotulo: 'Operações' },
  { id: 'aperfeicoamento', href: '#/aperfeicoamento', rotulo: 'Aperfeiçoamento' },
  { id: 'agenda', href: '#/agenda', rotulo: 'Agenda' },
  { id: 'cfp', href: '#/cfp', rotulo: 'CFP' },
  { id: 'sala', href: '#/sala', rotulo: 'Sala de Operações' },
  { id: 'painel', href: '#/painel', rotulo: 'Painel' },
  { id: 'admin', href: '#/admin', rotulo: '🔒 Administrador' },
];

/** Menu da P/3 (lateral no computador, ☰ no celular). */
export function MenuP3({ ativa, pendentes, operacoes, semAdmin = false }: { ativa: AbaP3; pendentes?: number; operacoes?: number; semAdmin?: boolean }) {
  const contadores: Partial<Record<AbaP3, number | undefined>> = { pendentes, operacoes };
  const itens = ITENS.filter((i) => !(semAdmin && i.id === 'admin')).map((i) => ({ ...i, contador: contadores[i.id] }));
  return <MenuLateral id="menu-p3" rotulo="Seções da P/3" titulo="Portal P3" itens={itens} ativa={ativa} />;
}
