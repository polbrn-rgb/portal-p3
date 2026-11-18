import { useEffect, useState } from 'react';
import { corVariacao, nomeUnidadeRac, rotuloMesLongo, tabelasDoRac, textoVariacao, type RacDados, type Tabela } from '../domain/rac';
import { planoDeSlides, TITULO_DO_SLIDE } from '../domain/racPptx';
import { idPrint, type SlotPrint } from '../domain/racPrints';
import type { UnidadeId } from '../domain/unidades';
import { lerImagemPrint } from '../data/racPrints';
import { db } from '../lib/firebase';

/** Pré-visualização na tela, slide a slide, na mesma ordem e com o mesmo conteúdo do .pptx. */
export function PreviaRac({ d }: { d: RacDados }) {
  const tabelas = tabelasDoRac(d);
  const [imagens, setImagens] = useState<Partial<Record<SlotPrint, string>>>({});
  const plano = planoDeSlides(d);

  useEffect(() => {
    let vivo = true;
    if (d.unidade === 'btl') return;
    const u = d.unidade as UnidadeId;
    for (const p of plano)
      if (p.print) {
        const slot = p.print;
        lerImagemPrint(db, idPrint(d.mes, u, slot))
          .then((b64) => vivo && setImagens((x) => ({ ...x, [slot]: `data:image/jpeg;base64,${b64}` })))
          .catch(() => undefined);
      }
    return () => {
      vivo = false;
    };
    // recarrega só ao trocar de unidade/mês
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.unidade, d.mes]);

  return (
    <div className="previa-rac" aria-label={`Pré-visualização do RAC – ${nomeUnidadeRac(d.unidade)}`}>
      {plano.map((p, i) => {
        const t = p.tabela ? tabelas.find((x) => x.id === p.tabela) : undefined;
        const titulo = p.trocarTitulo?.[1] ?? t?.titulo ?? TITULO_DO_SLIDE[p.base] ?? '';
        return (
          <div key={i} className={`slide-rac${p.titulo || (!t && !p.print) ? ' slide-capa' : ''}`}>
            <span className="slide-num">{i + 1}</span>
            {p.titulo ? (
              <div className="slide-capa-texto">
                <strong>
                  RAC – {nomeUnidadeRac(d.unidade)} - {rotuloMesLongo(d.mes)}
                </strong>
                <span>NÍVEL I</span>
              </div>
            ) : !t && !p.print ? (
              <div className="slide-capa-texto">
                <strong>{titulo}</strong>
              </div>
            ) : (
              <>
                <h4 className="slide-titulo">{titulo}</h4>
                {t && <TabelaSlide t={t} />}
                {p.print &&
                  (imagens[p.print] ? (
                    <img className="slide-print" src={imagens[p.print]} alt={`Print: ${titulo}`} />
                  ) : (
                    <p className="slide-sem-print">Print não enviado</p>
                  ))}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TabelaSlide({ t }: { t: Tabela }) {
  return (
    <div className="tabela-rolagem">
      <table className="tabela-slide" aria-label={`Slide ${t.titulo}`}>
        <thead>
          <tr>
            {t.cabecalho.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.linhas.map((l) => (
            <tr key={l.rotulo}>
              <th scope="row">{l.rotulo}</th>
              {l.valores.map((v, i) => (
                <td key={i}>{v ?? '—'}</td>
              ))}
              {t.tipoVar && (
                <td className="var-slide" style={{ background: `#${corVariacao(l.variacao ?? null, t.tipoVar) ?? 'BFBFBF'}` }}>
                  {textoVariacao(l.variacao ?? null)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
