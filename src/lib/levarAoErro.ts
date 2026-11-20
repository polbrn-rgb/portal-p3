// Em todas as páginas: quando falta um dado obrigatório, a tela rola até o primeiro campo com erro
// (o ".erro-campo" que o formulário mostra) e põe o cursor nele. Nada para configurar em cada formulário.

const JANELA_MS = 2000; // só reage a erros que aparecem logo depois de um clique/envio do usuário
let ultimaAcao = 0;
let agendado = 0;
let agendadoEm = 0; // quando o erro apareceu (a ida até ele foi agendada)
let ultimoFoco = 0; // quando o cursor entrou no campo em que está agora

function campoDoErro(erro: Element): HTMLElement | null {
  const caixa = erro.closest('.campo, fieldset, form') ?? erro.parentElement;
  return (
    caixa?.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])',
    ) ?? null
  );
}

const EDITAVEL = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), select, textarea';

/**
 * Depois que o erro apareceu, a pessoa já foi para outro campo e está digitando: não tira o cursor dela nem rola a
 * tela (sem isso, o que ela digita vai parar no campo com erro). Quem enviou com Enter de dentro de um campo
 * (o cursor já estava nele antes) continua sendo levado ao erro.
 */
function digitandoEmOutroCampo(campo: HTMLElement | null): boolean {
  const ativo = document.activeElement;
  return ativo instanceof HTMLElement && ativo !== campo && ativo.matches(EDITAVEL) && ultimoFoco > agendadoEm;
}

/**
 * Rola até o erro e foca o campo. Sem `preferido`, vai ao primeiro erro dentro de "dentro" (ou da página);
 * com ele (o erro que acabou de aparecer), vai a esse. true = achou.
 */
export function levarAoPrimeiroErro(dentro: ParentNode = document, preferido?: Element | null): boolean {
  const erro = preferido?.isConnected ? preferido : dentro.querySelector('.erro-campo');
  if (!erro) return false;
  const campo = campoDoErro(erro);
  if (digitandoEmOutroCampo(campo)) return true;
  const alvo = (erro.closest('.campo, fieldset') as HTMLElement | null) ?? (erro as HTMLElement);
  const suave = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  alvo.scrollIntoView?.({ behavior: suave ? 'smooth' : 'auto', block: 'center' });
  campo?.focus({ preventScroll: true });
  return true;
}

function agendar(dentro: ParentNode, preferido?: Element | null) {
  cancelAnimationFrame(agendado);
  agendadoEm = Date.now();
  // Espera o React desenhar a mensagem de erro.
  agendado = requestAnimationFrame(() => requestAnimationFrame(() => void levarAoPrimeiroErro(dentro, preferido)));
}

function areaDe(alvo: EventTarget | null): ParentNode {
  const el = alvo instanceof Element ? alvo : null;
  return el?.closest('form, .detalhe-item, article, section') ?? document;
}

/** Chamado uma vez em main.tsx. */
export function instalarLevarAoErro(): void {
  document.addEventListener(
    'focusin',
    () => {
      ultimoFoco = Date.now();
    },
    true,
  );
  // Enviar de novo com o mesmo erro (a mensagem já estava na tela): leva até ele de novo.
  document.addEventListener(
    'submit',
    (e) => {
      ultimaAcao = Date.now();
      agendar(areaDe(e.target));
    },
    true,
  );
  document.addEventListener(
    'click',
    (e) => {
      ultimaAcao = Date.now();
      const botao = e.target instanceof Element ? e.target.closest('button') : null;
      // Botões de enviar/salvar que não são "submit" (ex.: Enviar efetivo, Enviar resposta).
      if (botao && botao.type !== 'submit' && botao.classList.contains('destaque')) agendar(areaDe(botao));
    },
    true,
  );
  // Erro que apareceu agora por causa do que o usuário fez (não os que já vêm ao abrir a página).
  new MutationObserver((mudancas) => {
    if (Date.now() - ultimaAcao > JANELA_MS) return;
    for (const m of mudancas) {
      for (const n of Array.from(m.addedNodes)) {
        if (!(n instanceof Element)) continue;
        // Vai ao erro que acabou de aparecer (ex.: "Incluir talão"), não a um erro antigo mais acima.
        const novo = n.matches('.erro-campo') ? n : n.querySelector('.erro-campo');
        if (novo) return agendar(areaDe(n), novo);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}
