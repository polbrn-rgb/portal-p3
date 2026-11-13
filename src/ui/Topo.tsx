import type { ReactNode } from 'react';

export function Topo({ children }: { children?: ReactNode }) {
  return (
    <header className="topo">
      <div>
        <h1>Portal P3</h1>
        <p>P/3 · 8º BPM/M</p>
      </div>
      {children}
    </header>
  );
}
