import { useState, type InputHTMLAttributes } from 'react';

/** Campo de senha com o botão 👁 para mostrar/ocultar o que foi digitado. */
export function InputSenha({ rotulo = 'Senha', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { rotulo?: string }) {
  const [ver, setVer] = useState(false);
  return (
    <span className="campo-senha">
      {/* aria-label: sem ele, o nome do campo viraria "Senha Mostrar senha" (o botão está dentro do rótulo). */}
      <input {...props} aria-label={rotulo} type={ver ? 'text' : 'password'} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button
        type="button"
        className="botao-ver-senha"
        aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={ver}
        title={ver ? 'Ocultar senha' : 'Mostrar senha'}
        onClick={(e) => {
          e.preventDefault();
          setVer((v) => !v);
        }}
      >
        {ver ? '🙈' : '👁'}
      </button>
    </span>
  );
}
