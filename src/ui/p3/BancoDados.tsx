import { useMemo, useState } from 'react';
import { carregarFontesBanco, observarCopias, pedirCopia, planilhaDoBanco, type CopiaBanco } from '../../data/banco';
import { INDICADORES, indicador, mesesEntre, montarBanco, nomeCopia, ROTULO_ORIGEM, somarIndicador, type FontesBanco, type RegistroBanco } from '../../domain/banco';
import { rotuloMes } from '../../domain/controle';
import { hojeISO } from '../../domain/datas';
import { mesReferencia } from '../../domain/documentosMensais';
import { UNIDADES } from '../../domain/unidades';
import { db } from '../../lib/firebase';
import { cutucarMotor } from '../../lib/motor';
import { useAoVivo } from '../../lib/useAoVivo';
import { baixarXlsx } from '../../lib/xlsx';
import { Campo } from '../Campo';

// Operações → Banco de dados: tudo o que o portal guarda (produção, flagrantes, Documentos Mensais e RAC), por Cia
// e por mês. Serve para conferir o que falta, consultar qualquer número e baixar a cópia completa.

const ehMes = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
const SIGLA = Object.fromEntries(UNIDADES.map((u) => [u.id, u.id === 'ft' ? 'FT' : u.sigla.replace(' CIA', '')]));
const GRUPOS = [...new Set(INDICADORES.map((i) => i.grupo))];
const fmt = (v: unknown) => (typeof v === 'number' ? String(v).replace('.', ',') : typeof v === 'string' ? v : '—');

export function BancoDados() {
  const hoje = hojeISO();
  const [de, setDe] = useState(`${hoje.slice(0, 4)}-01`);
  const [ate, setAte] = useState(mesReferencia());
  const [fontes, setFontes] = useState<{ de: string; ate: string; f: FontesBanco } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [indicadorId, setIndicadorId] = useState('producao.pessoasAbordadas');
  const [gerando, setGerando] = useState<'' | 'baixar' | 'drive'>('');
  const [aviso, setAviso] = useState('');
  const copias = useAoVivo<CopiaBanco[]>((ok, e) => observarCopias(db, ok, e), [], 'Não foi possível carregar as cópias.');

  const valido = ehMes(de) && ehMes(ate) && de <= ate;
  const meses = fontes ? mesesEntre(fontes.de, fontes.ate) : [];
  const registros = useMemo(() => (fontes ? montarBanco(fontes.f, mesesEntre(fontes.de, fontes.ate), hoje) : []), [fontes, hoje]);
  const guardados = registros.reduce((s, r) => s + Object.keys(r.valores).length, 0);

  async function carregar() {
    if (!valido) {
      setErro('Escolha o período: o mês inicial não pode ser depois do final.');
      return;
    }
    setErro('');
    setCarregando(true);
    try {
      setFontes({ de, ate, f: await carregarFontesBanco(db, de, ate) });
    } catch {
      setErro('Não foi possível carregar o banco. Verifique a conexão e tente de novo.');
    }
    setCarregando(false);
  }

  // A planilha completa: banco, cobertura, catálogo, lançamentos da produção e o histórico.
  async function gerar(destino: 'baixar' | 'drive') {
    if (!fontes) return;
    setGerando(destino);
    setErro('');
    setAviso('');
    try {
      const xlsx = await planilhaDoBanco(db, fontes.de, fontes.ate, hoje);
      if (destino === 'baixar') baixarXlsx(nomeCopia(fontes.de, fontes.ate), xlsx);
      else {
        await pedirCopia(db, { de: fontes.de, ate: fontes.ate, xlsx, automatica: false });
        cutucarMotor();
        setAviso('Cópia enviada: o motor guarda na pasta “Portal P3 - Banco de dados” do Drive em alguns minutos.');
      }
    } catch {
      setErro('Não foi possível gerar a planilha. Verifique a conexão e tente de novo.');
    }
    setGerando('');
  }

  const reg = (mes: string, u: string) => registros.find((r) => r.mes === mes && r.unidadeId === u);
  const ind = indicador(indicadorId);

  return (
    <section className="painel">
      <div className="painel-cabecalho">
        <h2>Banco de dados</h2>
        <div className="acoes-linha acoes-quebra">
          <button className="botao secundario" type="button" disabled={!fontes || !!gerando} onClick={() => void gerar('baixar')}>
            {gerando === 'baixar' ? 'Gerando…' : 'Baixar banco completo (Excel)'}
          </button>
          <button className="botao secundario" type="button" disabled={!fontes || !!gerando} onClick={() => void gerar('drive')}>
            {gerando === 'drive' ? 'Enviando…' : 'Guardar cópia no Drive'}
          </button>
        </div>
      </div>
      <p className="item-info">
        Tudo o que o portal guarda, separado por Cia e por mês: a produção dos pelotões (somada do que a Sala de Operações lança por dia), os flagrantes
        por natureza, os Documentos Mensais enviados pelas Cias e o RAC. São {INDICADORES.length} indicadores, cada um com um código fixo (aba
        “Catálogo” da planilha). Cada lançamento, correção e exclusão também fica no histórico, que não pode ser alterado nem apagado.
      </p>
      <div className="cartao grupo">
        <div className="grade-2">
          <Campo rotulo="De (mês)">
            <input type="month" value={de} onChange={(e) => setDe(e.target.value)} />
          </Campo>
          <Campo rotulo="Até (mês)">
            <input type="month" value={ate} onChange={(e) => setAte(e.target.value)} />
          </Campo>
        </div>
        <div className="acoes-linha">
          <button className="botao destaque" type="button" disabled={carregando} onClick={carregar}>
            {carregando ? 'Carregando…' : 'Carregar período'}
          </button>
        </div>
      </div>
      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}
      {aviso && <p className="mensagem aviso">{aviso}</p>}

      {fontes && (
        <>
          <p className="mensagem aviso" role="status">
            {rotuloMes(fontes.de)} a {rotuloMes(fontes.ate)}: {guardados} valores guardados ({fontes.f.producao.length} lançamentos de produção,{' '}
            {fontes.f.envios.length} envios de Documentos Mensais, {fontes.f.racs.filter((r) => r.status === 'enviado').length} RAC enviados).
          </p>

          <h3 className="titulo-secao">O que já está no banco</h3>
          <p className="item-info">
            Produção: ✅ todos os turnos lançados · ⚠️ turnos faltando · — sem lançamentos. Docs: enviados / esperados no mês.
          </p>
          <div className="tabela-rolagem">
            <table className="tabela-icc tabela-producao" aria-label="Cobertura do banco por mês e Cia">
              <thead>
                <tr>
                  <th scope="col">Mês</th>
                  {UNIDADES.map((u) => (
                    <th key={u.id} scope="col">
                      {SIGLA[u.id]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {meses.map((mes) => (
                  <tr key={mes}>
                    <th scope="row">{rotuloMes(mes)}</th>
                    {UNIDADES.map((u) => (
                      <td key={u.id}>
                        <Cobertura r={reg(mes, u.id)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="titulo-secao">Consultar um indicador</h3>
          <Campo rotulo="Indicador" className="campo-largo">
            <select value={indicadorId} onChange={(e) => setIndicadorId(e.target.value)}>
              {GRUPOS.map((g) => (
                <optgroup key={g} label={g}>
                  {INDICADORES.filter((i) => i.grupo === g).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.rotulo}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Campo>
          {ind && (
            <p className="item-info">
              Origem: {ROTULO_ORIGEM[ind.origem]} · código <code>{ind.id}</code>
            </p>
          )}
          <div className="tabela-rolagem">
            <table className="tabela-icc tabela-producao" aria-label="Valores do indicador por mês e Cia">
              <thead>
                <tr>
                  <th scope="col">Mês</th>
                  {UNIDADES.map((u) => (
                    <th key={u.id} scope="col">
                      {SIGLA[u.id]}
                    </th>
                  ))}
                  {ind?.tipo === 'numero' && <th scope="col">8º BPM/M</th>}
                </tr>
              </thead>
              <tbody>
                {meses.map((mes) => {
                  const doMes = registros.filter((r) => r.mes === mes);
                  return (
                    <tr key={mes}>
                      <th scope="row">{rotuloMes(mes)}</th>
                      {UNIDADES.map((u) => (
                        <td key={u.id}>{fmt(reg(mes, u.id)?.valores[indicadorId])}</td>
                      ))}
                      {ind?.tipo === 'numero' && <td className="linha-total">{fmt(somarIndicador(doMes, indicadorId))}</td>}
                    </tr>
                  );
                })}
                {ind?.tipo === 'numero' && meses.length > 1 && (
                  <tr>
                    <th scope="row">Total do período</th>
                    {UNIDADES.map((u) => (
                      <td key={u.id} className="linha-total">
                        {fmt(somarIndicador(registros.filter((r) => r.unidadeId === u.id), indicadorId))}
                      </td>
                    ))}
                    <td className="linha-total">{fmt(somarIndicador(registros, indicadorId))}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3 className="titulo-secao">Cópias de segurança no Drive</h3>
      <p className="item-info">
        Todo mês, depois do prazo do último Documento Mensal, o portal guarda sozinho a cópia do mês de referência (na primeira vez que a P/3 abrir o
        portal). Para guardar outro período, carregue-o acima e use “Guardar cópia no Drive”.
      </p>
      {copias.erro && <p className="mensagem erro">{copias.erro}</p>}
      {!copias.carregando && !copias.valor?.length && <p className="vazio">Nenhuma cópia guardada ainda.</p>}
      <ul className="lista lista-copias" aria-label="Cópias de segurança">
        {(copias.valor ?? []).map((c) => (
          <li key={c.id} className="item-pendente">
            <span className="item-topo">
              <strong>{c.de === c.ate ? rotuloMes(c.de) : `${rotuloMes(c.de)} a ${rotuloMes(c.ate)}`}</strong>
              <span className={`selo selo-doc-${c.status === 'pronto' ? 'gravado' : c.status === 'erro' ? 'erro' : 'enviado'}`}>
                {c.status === 'pronto' ? '✅ No Drive' : c.status === 'erro' ? '❌ Erro' : '⏳ Enviando'}
              </span>
            </span>
            <span className="pendente-detalhe">
              {c.automatica ? 'Automática' : 'Pedida pela P/3'}
              {c.url && (
                <>
                  {' · '}
                  <a href={c.url} target="_blank" rel="noreferrer">
                    Abrir no Drive
                  </a>
                </>
              )}
            </span>
            {c.erro && <span className="mensagem erro">{c.erro}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Cobertura({ r }: { r?: RegistroBanco }) {
  if (!r) return <>—</>;
  const s = r.situacao;
  const prod = s.producaoCompleta === null ? '—' : s.producaoCompleta ? '✅' : `⚠️ ${s.turnosSemLancamento}`;
  const titulo =
    s.producaoCompleta === null ? 'Sem lançamentos de produção' : s.producaoCompleta ? 'Produção completa' : `${s.turnosSemLancamento} turno(s) sem lançamento`;
  return (
    <span className="celula-cobertura">
      <span title={titulo}>Prod {prod}</span>
      <span>
        Docs {s.documentosEnviados.length}/{s.documentosEsperados.length}
      </span>
      <span>RAC {s.racEnviado ? '✅' : '—'}</span>
    </span>
  );
}
