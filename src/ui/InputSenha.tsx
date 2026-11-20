import { useState, type InputHTMLAttributes } from 'react';

/** Campo de senha com o botão 👁 para mostrar/ocultar o que foi digitado. */
export function InputSenha(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [ver, setVer] = useState(false);
  return (
    <span className="campo-senha">
      <input {...props} type={ver ? 'text' : 'password'} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
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
