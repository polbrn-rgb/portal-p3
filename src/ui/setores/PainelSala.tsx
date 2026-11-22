import { type FormEvent, useEffect, useState } from 'react';
import { observarPlanilhasProntas, observarResultado, salvarResultado, type OperacaoComPlanilha } from '../../data/resultados';
import { formatarData, hojeISO } from '../../domain/datas';
import { gruposDeCampos, operacoesDoDia, valoresPreenchidos, type Resultado } from '../../domain/resultado';
import { db } from '../../lib/firebase';
import { cutucarMotor } from '../../lib/motor';
import { useAoVivo } from '../../lib/useAoVivo';
import { quemSou } from '../../lib/quemSou';
import { Campo } from '../Campo';

const CHAVE_NOME = 'portalp3.sala.nome';

function lerNome(): string {
  try {
    return localStorage.getItem(CHAVE_NOME) ?? '';
  } catch {
    return '';
  }
}

/** Sala de Operações: escolhe o dia e a operação e lança os resultados (o motor grava na planilha). */
export function PainelSala() {
  const [dia, setDia] = useState(hojeISO);
  const [escolhida, setEscolhida] = useState('');
  const planilhas = useAoVivo<OperacaoComPlanilha[]>((ok, erro) => observarPlanilhasProntas(db, ok, erro), []);
  const doDia = operacoesDoDia(planilhas.valor ?? [], dia);
  const operacao = doDia.find((o) => o.numero === escolhida) ?? (doDia.length === 1 ? doDia[0] : undefined);

  return (
    <section className="painel painel-estreito">
      <div className="painel-cabecalho">
        <h2>Resultados das operações</h2>
      </div>
      <div className="cartao grupo">
        <div className="grade">
          <label className="campo">
            Data da operação
            <input
              type="date"
              value={dia}
              onChange={(e) => {
                setDia(e.target.value);
                setEscolhida('');
              }}
            />
          </label>
          <label className="campo">
            Operação
            <select value={operacao?.numero ?? ''} onChange={(e) => setEscolhida(e.target.value)} disabled={!doDia.length}>
              <option value="">{doDia.length ? 'Selecione…' : 'Nenhuma operação com planilha neste dia'}</option>
              {doDia.map((o) => (
                <option key={o.numero} value={o.numero}>
                  Nº {o.numero} · {o.planilha.saida}
                </option>
              ))}
            </select>
          </label>
        </div>
        {planilhas.erro && <p className="mensagem erro">{planilhas.erro}</p>}
      </div>
      {operacao && <LancarResultado key={`${operacao.numero}_${dia}`} operacao={operacao} dia={dia} />}
    </section>
  );
}

function LancarResultado({ operacao, dia }: { operacao: OperacaoComPlanilha; dia: string }) {
  const { numero, planilha } = operacao;
  const salvo = useAoVivo<Resultado | null>((ok, erro) => observarResultado(db, numero, dia, ok, erro), [numero, dia]);
  const [protocolo, setProtocolo] = useState('');
  const [valores, setValores] = useState<Record<string, string>>({});
  const [nome, setNome] = useState(() => quemSou() ?? lerNome());
  const [erro, setErro] = useState('');
  const [faltando, setFaltando] = useState<{ protocolo?: string; nome?: string }>({});
  const [salvando, setSalvando] = useState(false);
  const [carregou, setCarregou] = useState(false);

  // Abre com o que já foi lançado (para corrigir).
  useEffect(() => {
    if (carregou || salvo.carregando) return;
    if (salvo.valor) {
      setProtocolo(salvo.valor.protocoloResultado);
      setValores(Object.fromEntries(Object.entries(salvo.valor.valores).map(([k, v]) => [k, String(v)])));
    }
    setCarregou(true);
  }, [salvo.carregando, salvo.valor, carregou]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const { valores: numeros, erro: erroValores } = valoresPreenchidos(valores);
    const f = {
      ...(!protocolo.trim() ? { protocolo: 'Informe o protocolo do resultado (Sicoordop).' } : {}),
      ...(!nome.trim() ? { nome: 'Informe quem está lançando.' } : {}),
    };
    setFaltando(f);
    setErro(erroValores);
    if (erroValores || f.protocolo || f.nome) return;
    setSalvando(true);
    try {
      try {
        localStorage.setItem(CHAVE_NOME, nome.trim());
      } catch {
        /* sem armazenamento: segue */
      }
      await salvarResultado(db, { numero, dia, protocoloResultado: protocolo, valores: numeros, salvoPor: nome });
      cutucarMotor();
    } catch {
      setErro('Não foi possível salvar. Verifique a conexão e tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  const r = salvo.valor;
  return (
    <form className="formulario-resultado" onSubmit={salvar} noValidate>
      <div className="cartao grupo">
        {planilha.observacao && <p className="pendente-detalhe">Observações: {planilha.observacao}</p>}
        <div className="grade">
          <label className="campo">
            Nº protocolo - Mapa Força
            <input value={operacao.protocolos[dia] || 'Sem protocolo informado pela P/3'} readOnly />
          </label>
          <Campo rotulo="Nº protocolo - Resultado" erro={faltando.protocolo && !protocolo.trim() ? faltando.protocolo : undefined} obrigatorio>
            <input value={protocolo} placeholder="Nº do Sicoordop" onChange={(e) => setProtocolo(e.target.value)} />
          </Campo>
        </div>
      </div>

      {gruposDeCampos(planilha.campos ?? []).map((g) => (
        <fieldset key={`${g.grupo}_${g.campos[0].linha}`} className="cartao grupo">
          <legend>{g.grupo || 'Indicadores'}</legend>
          <div className="grade-indicadores">
            {g.campos.map((c) => (
              <label key={c.linha} className="campo">
                {c.rotulo}
                <input
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  value={valores[c.linha] ?? ''}
                  onChange={(e) => setValores((v) => ({ ...v, [c.linha]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="cartao grupo">
        <Campo rotulo="Lançado por" erro={faltando.nome && !nome.trim() ? faltando.nome : undefined} obrigatorio>
          <input value={nome} readOnly={Boolean(quemSou())} placeholder="Posto/graduação e nome" onChange={(e) => setNome(e.target.value)} />
        </Campo>
      </div>

      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}
      {r && !erro && (
        <p className={`mensagem ${r.erro ? 'erro' : 'aviso'}`} role="status">
          {r.gravado
            ? `Gravado na planilha (dia ${formatarData(dia)}).`
            : r.erro
              ? `Salvo, mas a planilha recusou: ${r.erro}. O sistema tenta de novo a cada 10 minutos.`
              : 'Salvo. Gravando na planilha…'}
        </p>
      )}

      <div className="barra-acoes">
        <button className="botao destaque" type="submit" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar resultados'}
        </button>
      </div>
    </form>
  );
}
