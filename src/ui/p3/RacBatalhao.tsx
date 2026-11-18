import { useEffect, useState } from 'react';
import { lerRacBtl, salvarRpm } from '../../data/rac';
import { observarPrintsDoRac, type PrintRac } from '../../data/racPrints';
import {
  faltamNoCompilado,
  lerNumero,
  mesesDoRac,
  nomeUnidadeRac,
  racBatalhao,
  rotuloMesLongo,
  RPM,
  rpmVazio,
  totalRpm,
  type LinhaRpm,
  type RacMes,
  type RacSalvo,
  type RpmId,
} from '../../domain/rac';
import { conferirPrints } from '../../domain/racPrints';
import { db } from '../../lib/firebase';
import { useMeuResponsavel } from '../../lib/quemSou';
import { baixarRacDaUnidade, baixarRacGeral } from '../../lib/racApresentacao';
import { useAoVivo } from '../../lib/useAoVivo';
import { PrintsRac, TabelaRac } from '../cia/RacCia';
import { PreviaRac } from '../PreviaRac';

/**
 * Batalhão e RAC GERAL (P/3): o Batalhão é a soma das Cias (crimes) e das Cias + FT (produtividade) que
 * enviaram; a P/3 envia os 4 prints do Batalhão e digita a Produtividade RPM; depois compila tudo num .pptx só.
 */
export function RacBatalhao({ m, racs }: { m: RacMes; racs: RacSalvo[] }) {
  const btl = racBatalhao(racs, m.mes);
  const salvo = racs.find((r) => r.unidade === 'btl');
  const faltam = faltamNoCompilado(racs, m.mes);
  const meses = mesesDoRac(m.mes);
  const prints = useAoVivo<PrintRac[]>((ok, e) => observarPrintsDoRac(db, m.mes, 'btl', ok, e), [m.mes]);
  const [anterior, setAnterior] = useState<Record<RpmId, LinhaRpm> | undefined>(undefined);
  const [rpm, setRpm] = useState<Record<RpmId, LinhaRpm>>(() => salvo?.rpm ?? rpmVazio());
  const [mexeu, setMexeu] = useState(false);
  const [previa, setPrevia] = useState(false);
  const [ocupado, setOcupado] = useState<'' | 'rpm' | 'btl' | 'geral'>('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const responsavel = useMeuResponsavel();

  // RPM do RAC do Batalhão do mês anterior: preenche a coluna do mês anterior e é a base do TOTAL GERAL.
  useEffect(() => {
    let vivo = true;
    lerRacBtl(db, meses.mesAnterior)
      .then((r) => {
        if (!vivo || !r?.rpm) return;
        const ant = r.rpm;
        setAnterior(ant);
        setRpm((x) => Object.fromEntries(RPM.map((l) => [l.id, { ...x[l.id], mesAnterior: x[l.id].mesAnterior ?? ant[l.id].atual }])) as Record<RpmId, LinhaRpm>);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [meses.mesAnterior]);

  const comRpm = { ...btl, rpm };
  const alertas = conferirPrints(comRpm, prints.valor ?? []);
  const faltaPrint = alertas.filter((a) => a.nivel === 'erro');
  const divergencias = alertas.filter((a) => a.nivel === 'aviso');

  async function executar(tipo: 'rpm' | 'btl' | 'geral', acao: () => Promise<void>, ok: string) {
    setOcupado(tipo);
    setErro('');
    setAviso('');
    try {
      await acao();
      setAviso(ok);
      if (tipo === 'rpm') setMexeu(false);
    } catch (e) {
      console.error('RAC do Batalhão:', e);
      setErro(tipo === 'rpm' ? 'Não foi possível gravar a Produtividade RPM. Tente de novo.' : 'Não foi possível gerar a apresentação. Tente de novo.');
    }
    setOcupado('');
  }

  const celula = (id: RpmId, k: keyof LinhaRpm, rotulo: string, sugestao?: number | null) => (
    <td key={k}>
      <div className="campo celula-rac">
        <input
          inputMode="numeric"
          autoComplete="off"
          aria-label={rotulo}
          placeholder={sugestao === null || sugestao === undefined ? '' : String(sugestao)}
          value={rpm[id][k] ?? ''}
          onChange={(e) => {
            setMexeu(true);
            setRpm({ ...rpm, [id]: { ...rpm[id], [k]: lerNumero(e.target.value) } });
          }}
        />
      </div>
    </td>
  );
  const longo = (x: string) => rotuloMesLongo(x).split('/')[0];

  return (
    <section className="cartao grupo formulario-rac" aria-label={`Batalhão e RAC GERAL de ${rotuloMesLongo(m.mes)}`}>
      <h3 className="titulo-secao">Batalhão e RAC GERAL</h3>
      <p className="pendente-detalhe">
        Crimes do Batalhão = soma das 6 Cias; produtividade = soma das Cias e da FT (só dos RAC enviados). A P/3 envia os 4 painéis do Batalhão e digita a
        Produtividade RPM.
      </p>
      {faltam.length > 0 && (
        <p className="mensagem aviso-rac" role="status">
          ⚠️ Ainda não enviaram: {faltam.map(nomeUnidadeRac).join(', ')}. Ficam fora do RAC GERAL e o Batalhão sai com "—" onde faltar a soma.
        </p>
      )}

      <PrintsRac unidade="btl" mes={m.mes} prints={prints.valor ?? []} erroDe={(c) => faltaPrint.find((a) => a.campo === c)?.mensagem} />
      {divergencias.map((a) => (
        <p key={a.id} className="mensagem aviso-rac">
          ⚠️ {a.mensagem}
        </p>
      ))}

      <TabelaRac
        titulo="PRODUTIVIDADE RPM"
        fonte="FONTE QMO · TOTAL GERAL em branco: o portal calcula (TOTAL do mês anterior + mês)"
        cabecalho={['Indicadores', longo(meses.mesAnterior), longo(meses.atual), 'TOTAL GERAL']}
      >
        {RPM.map((r) => (
          <tr key={r.id}>
            <th scope="row">{r.rotulo}</th>
            {celula(r.id, 'mesAnterior', `${r.rotulo} ${longo(meses.mesAnterior)}`)}
            {celula(r.id, 'atual', `${r.rotulo} ${longo(meses.atual)}`)}
            {celula(r.id, 'totalGeral', `${r.rotulo} TOTAL GERAL`, totalRpm({ ...rpm[r.id], totalGeral: null }, anterior?.[r.id]))}
          </tr>
        ))}
      </TabelaRac>
      <div className="acoes-linha">
        <button
          className="botao secundario"
          type="button"
          disabled={!!ocupado || !mexeu}
          onClick={() => void executar('rpm', () => salvarRpm(db, m.mes, rpm, responsavel ?? ''), 'Produtividade RPM gravada.')}
        >
          {ocupado === 'rpm' ? 'Gravando…' : 'Salvar Produtividade RPM'}
        </button>
      </div>

      {erro && (
        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="mensagem aviso" role="status">
          {aviso}
        </p>
      )}

      <div className="acoes-linha acoes-quebra">
        <button className="botao secundario" type="button" aria-expanded={previa} onClick={() => setPrevia(!previa)}>
          {previa ? 'Fechar pré-visualização' : '👁️ Pré-visualizar Batalhão'}
        </button>
        <button
          className="botao secundario"
          type="button"
          disabled={!!ocupado}
          onClick={() => void executar('btl', () => baixarRacDaUnidade(db, comRpm, 'Batalhão', anterior), 'RAC do Batalhão gerado.')}
        >
          {ocupado === 'btl' ? 'Gerando…' : '⬇️ Baixar RAC do Batalhão'}
        </button>
        <button
          className="botao destaque"
          type="button"
          disabled={!!ocupado}
          onClick={() =>
            void executar(
              'geral',
              () => baixarRacGeral(db, m.mes, [...racs.filter((r) => r.unidade !== 'btl'), { ...(salvo ?? { ...comRpm, id: '', status: 'rascunho', preenchidoPor: '' }), rpm }], anterior),
              `RAC GERAL gerado${faltam.length ? ` (sem ${faltam.map(nomeUnidadeRac).join(', ')})` : ''}.`,
            )
          }
        >
          {ocupado === 'geral' ? 'Compilando…' : '⬇️ Compilar RAC GERAL (.pptx)'}
        </button>
      </div>
      {previa && <PreviaRac d={comRpm} rpmAnterior={anterior} />}
    </section>
  );
}
