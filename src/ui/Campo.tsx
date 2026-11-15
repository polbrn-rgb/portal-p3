import type { ReactNode } from 'react';

/** Asterisco vermelho de campo obrigatório. */
export function Obrigatorio() {
  return (
    <span className="obrigatorio" aria-hidden="true">
      {' '}*
    </span>
  );
}

type Props = { rotulo: ReactNode; erro?: string; obrigatorio?: boolean; className?: string; children: ReactNode };

/**
 * Campo padrão do portal: rótulo (com * se obrigatório), o controle e o erro logo abaixo.
 * Com erro, o campo fica vermelho e a página rola até ele (lib/levarAoErro).
 */
export function Campo({ rotulo, erro, obrigatorio, className, children }: Props) {
  return (
    <label className={['campo', erro ? 'com-erro' : '', className ?? ''].filter(Boolean).join(' ')}>
      <span className="rotulo">
        {rotulo}
        {obrigatorio && <Obrigatorio />}
      </span>
      {children}
      {erro && <span className="erro-campo">{erro}</span>}
    </label>
  );
}
