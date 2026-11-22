import { useEffect, useState } from 'react';
import { lerRacBtl, pedirArquivamento, salvarRpm } from '../../data/rac';
import { observarPrintsDoRac, type PrintRac } from '../../data/racPrints';
import {
  faltamNoCompilado,
  lerNumero,
  mesesDoRac,
  nomeRacGeral,
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
import { cutucarMotor } from '../../lib/motor';
import { baixarRacDaUnidade, baixarRacGeral, gerarRacGeral } from '../../lib/racApresentacao';
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
  const [ocupado, setOcupado] = useState<'' | 'rpm' | 'btl' | 'geral' | 'arquivo'>('');
  const [confirmarArquivo, setConfirmarArquivo] = useState(false);
  const [progresso, setProgresso] = useState(0);
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
  // Lista para o compilado: os RAC das unidades + o do Batalhão com a RPM da tela (mesmo sem salvar).
  const paraCompilar = [...racs.filter((r) => r.unidade !== 'btl'), { ...(salvo ?? { ...comRpm, id: '', status: 'rascunho' as const, preenchidoPor: '' }), rpm }];
  const arq = m.arquivo;
  const faltaPrint = conferirPrints(comRpm, prints.valor ?? []);

  async function executar(tipo: 'rpm' | 'btl' | 'geral' | 'arquivo', acao: () => Promise<void>, ok: string) {
    setOcupado(tipo);
    setErro('');
    setAviso('');
    try {
      await acao();
      setAviso(ok);
      if (tipo === 'rpm') setMexeu(false);
    } catch (e) {
      console.error('RAC do Batalhão:', e);
      setErro(
        tipo === 'rpm'
          ? 'Não foi possível gravar a Produtividade RPM. Tente de novo.'
          : tipo === 'arquivo'
            ? 'Não foi possível enviar o RAC GERAL para arquivar. Verifique a conexão e tente de novo.'
            : 'Não foi possível gerar a apresentação. Tente de novo.',
      );
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
        Os números do Batalhão não são digitados: crimes = soma das 6 Cias; produtividade = soma das Cias e da FT (só dos RAC enviados). A P/3 envia os 4
        painéis do Batalhão (só imagem, para os slides) e digita a Produtividade RPM.
      </p>
      {faltam.length > 0 && (
        <p className="mensagem aviso-rac" role="status">
          ⚠️ Ainda não enviaram: {faltam.map(nomeUnidadeRac).join(', ')}. Ficam fora do RAC GERAL e o Batalhão sai com "—" onde faltar a soma.
        </p>
      )}

      <PrintsRac unidade="btl" mes={m.mes} prints={prints.valor ?? []} erroDe={(c) => faltaPrint.find((a) => a.campo === c)?.mensagem} />

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
              () => baixarRacGeral(db, m.mes, paraCompilar, anterior),
              `RAC GERAL gerado${faltam.length ? ` (sem ${faltam.map(nomeUnidadeRac).join(', ')})` : ''}.`,
            )
          }
        >
          {ocupado === 'geral' ? 'Compilando…' : '⬇️ Compilar RAC GERAL (.pptx)'}
        </button>
      </div>
      {previa && <PreviaRac d={comRpm} rpmAnterior={anterior} />}

      <h4 className="titulo-secao">Fechar o mês</h4>
      {arq?.status === 'pronto' && (
        <p className="mensagem aviso" role="status">
          ✅ RAC GERAL arquivado no Drive:{' '}
          <a href={arq.url} target="_blank" rel="noreferrer">
            {arq.nome}
          </a>
          . Os prints saíram do banco; os números ficam como histórico.
        </p>
      )}
      {arq?.status === 'pedido' && (
        <p className="mensagem aviso-rac" role="status">
          ⏳ Arquivando {arq.nome} no Drive… o motor leva até 10 minutos.
        </p>
      )}
      {arq?.status === 'erro' && (
        <p className="mensagem erro" role="alert">
          ❌ Não foi possível arquivar no Drive: {arq.erro}
        </p>
      )}
      {ocupado === 'arquivo' && <p className="pendente-detalhe">Enviando o RAC GERAL… {Math.round(progresso * 100)}%</p>}
      {confirmarArquivo ? (
        <div className="confirmar-linha" role="alertdialog" aria-label="Confirmar fechamento do mês">
          <p>
            Fechar {rotuloMesLongo(m.mes)}? O mês é encerrado (as Cias não alteram mais), o RAC GERAL vai para a pasta de arquivo do Drive e os prints saem
            do banco; os números ficam.{faltam.length ? ` Atenção: ainda não enviaram ${faltam.map(nomeUnidadeRac).join(', ')}.` : ''}
          </p>
          <div className="acoes-linha">
            <button className="botao secundario" type="button" onClick={() => setConfirmarArquivo(false)}>
              Cancelar
            </button>
            <button
              className="botao destaque"
              type="button"
              disabled={!!ocupado}
              onClick={() => {
                setConfirmarArquivo(false);
                void executar(
                  'arquivo',
                  async () => {
                    setProgresso(0);
                    const pptx = await gerarRacGeral(db, m.mes, paraCompilar, anterior);
                    await pedirArquivamento(db, m.mes, nomeRacGeral(m.mes), pptx, setProgresso);
                    cutucarMotor();
                  },
                  'Mês encerrado. O RAC GERAL foi enviado para arquivar no Drive.',
                );
              }}
            >
              Sim, fechar e arquivar
            </button>
          </div>
        </div>
      ) : (
        <div className="acoes-linha">
          <button className="botao secundario" type="button" disabled={!!ocupado || arq?.status === 'pedido'} onClick={() => setConfirmarArquivo(true)}>
            {ocupado === 'arquivo' ? 'Enviando…' : arq?.status === 'pronto' || arq?.status === 'erro' ? '📦 Arquivar de novo no Drive' : '📦 Fechar mês e arquivar no Drive'}
          </button>
        </div>
      )}
    </section>
  );
}
