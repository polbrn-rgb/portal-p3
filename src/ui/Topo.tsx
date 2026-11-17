import type { ReactNode } from 'react';

/** Brasão do 8º BPM/M (public/8bpmm.png). Se o arquivo faltar, some sem quebrar o topo. */
const BRASAO = '/8bpmm.png';

export function Topo({ children }: { children?: ReactNode }) {
  return (
    <header className="topo">
      <div className="topo-marca">
        <img
          className="topo-brasao"
          src={BRASAO}
          alt="Brasão do 8º BPM/M"
          onError={(e) => {
            e.currentTarget.hidden = true;
          }}
        />
        <div>
          <h1>Portal P3</h1>
          <p>P/3 · 8º BPM/M</p>
        </div>
      </div>
      {children}
    </header>
  );
}
