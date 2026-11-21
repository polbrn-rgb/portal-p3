// Gráficos do portal (painéis): uma série só, em CSS. O valor escrito na ponta serve de tabela e o title de dica.

export type Barra = { rotulo: string; valor: number };

const texto = (v: number, formatar?: (v: number) => string) => (formatar ? formatar(v) : String(v));

/** Barras horizontais com o valor na ponta. */
export function Barras({ titulo, dados, formatar }: { titulo: string; dados: Barra[]; formatar?: (v: number) => string }) {
  const maior = Math.max(1, ...dados.map((d) => d.valor));
  return (
    <figure className="cartao grupo grafico" aria-label={titulo}>
      <figcaption>{titulo}</figcaption>
      {dados.length === 0 ? (
        <p className="vazio">Sem dados.</p>
      ) : (
        <ul className="barras">
          {dados.map((d) => (
            <li key={d.rotulo} title={`${d.rotulo}: ${texto(d.valor, formatar)}`}>
              <span className="barra-rotulo">{d.rotulo}</span>
              <span className="barra-trilho">
                <span className="barra" style={{ width: `${(d.valor / maior) * 100}%` }} />
                <span className="barra-valor">{texto(d.valor, formatar)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

/**
 * Colunas (meses, dias...), valor em cima. Com muitas colunas (dias do mês) só o maior e o destacado levam o número
 * escrito; os outros mostram ao passar o dedo/mouse.
 */
export function Colunas({ titulo, dados, destaque, formatar }: { titulo: string; dados: Barra[]; destaque?: number; formatar?: (v: number) => string }) {
  const maior = Math.max(1, ...dados.map((d) => d.valor));
  const muitas = dados.length > 16;
  const iMaior = dados.findIndex((d) => d.valor === maior);
  return (
    <figure className="cartao grupo grafico" aria-label={titulo}>
      <figcaption>{titulo}</figcaption>
      <ol className={`colunas${muitas ? ' colunas-muitas' : ''}`} style={{ gridTemplateColumns: `repeat(${dados.length}, minmax(0, 1fr))` }}>
        {dados.map((d, i) => (
          <li key={d.rotulo} title={`${d.rotulo}: ${texto(d.valor, formatar)}`} className={i === destaque ? 'atual' : ''}>
            <span className="coluna-valor">{d.valor && (!muitas || i === iMaior || i === destaque) ? texto(d.valor, formatar) : ''}</span>
            <span className="coluna" style={{ height: `${(d.valor / maior) * 100}%` }} />
            <span className="coluna-rotulo">{!muitas || i % 5 === 0 || i === destaque ? d.rotulo : ''}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
