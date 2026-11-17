import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { assinaturaDe, enviarEmailAtalho, observarAssinaturas, observarEmails, reenviarEmail, ultimosEnderecos } from '../../data/emails';
import { hojeISO } from '../../domain/datas';
import type { DadosDemanda } from '../../domain/demanda';
import {
  EMAIL_FUNCIONAL,
  ID_ASSINATURA_CHEFE,
  montarHtmlEmail,
  validarEmail,
  type AnexoEmail,
  type Assinatura,
  type AtalhoEmail as TipoAtalho,
  type DadosEmail,
  type EmailEnviado,
  type ErrosEmail,
} from '../../domain/email';
import { erroDoPdf } from '../../domain/pendente';
import { db } from '../../lib/firebase';
import { cutucarMotor } from '../../lib/motor';
import { useAoVivo } from '../../lib/useAoVivo';
import { useListas } from '../../lib/useListas';
import { Campo } from '../Campo';

type Props = {
  atalho: TipoAtalho;
  refId: string;
  /** Textos que já vêm prontos (a P/3 pode mudar). */
  inicial: { ao: string; assunto: string; corpo: (assunto: string) => string };
  /** Linha do Numerador que dá o nº da mensagem. */
  demanda: (assunto: string, transmissor: string, hoje: string) => DadosDemanda;
  /** Planilha do Drive que pode ir junto, em Excel. */
  planilha?: { id: string; nome: string };
};

/**
 * Atalho de e-mail: monta a mensagem eletrônica no padrão da P/3, mostra a prévia e envia pelo Gmail da P/3
 * (o motor manda em até 5 minutos). Ao enviar, lança a MSG ELETRÔNICA no Numerador, que dá o número.
 */
export function AtalhoEmail({ atalho, refId, inicial, demanda, planilha }: Props) {
  const listas = useListas();
  const assinaturas = useAoVivo<Assinatura[]>((ok, erro) => observarAssinaturas(db, ok, erro), [], 'Não foi possível carregar as assinaturas.');
  const enviados = useAoVivo<EmailEnviado[]>((ok, erro) => observarEmails(db, atalho, refId, ok, erro), [atalho, refId]);
  const [aberto, setAberto] = useState(false);

  return (
    <div className="cartao grupo atalho-email">
      <div className="atalho-email-topo">
        <strong>✉️ E-mail</strong>
        {!aberto && (
          <button className="botao secundario" type="button" onClick={() => setAberto(true)}>
            Montar e-mail
          </button>
        )}
      </div>
      {aberto && (
        <FormAtalho
          atalho={atalho}
          refId={refId}
          inicial={inicial}
          demanda={demanda}
          planilha={planilha}
          responsaveis={listas.responsaveis.map((i) => i.valor)}
          assinaturas={assinaturas.valor ?? []}
          aoTerminar={() => setAberto(false)}
        />
      )}
      {enviados.valor && enviados.valor.length > 0 && <HistoricoEmails lista={enviados.valor} />}
    </div>
  );
}

function FormAtalho(
  p: Props & { responsaveis: string[]; assinaturas: Assinatura[]; aoTerminar: () => void },
) {
  const [dados, setDados] = useState<DadosEmail>(() => ({
    para: '',
    cc: EMAIL_FUNCIONAL,
    ao: p.inicial.ao,
    assunto: p.inicial.assunto,
    corpo: p.inicial.corpo(p.inicial.assunto),
    transmissor: '',
    anexarPlanilha: Boolean(p.planilha),
  }));
  const [erros, setErros] = useState<ErrosEmail>({});
  const [pdf, setPdf] = useState<File | null>(null);
  const [erroPdf, setErroPdf] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroGeral, setErroGeral] = useState('');
  const hoje = hojeISO();

  // Para/Cc da última vez que este atalho foi usado.
  useEffect(() => {
    void ultimosEnderecos(db, p.atalho).then((u) => u && setDados((d) => ({ ...d, para: d.para || u.para, cc: u.cc })));
  }, [p.atalho]);

  const chefe = p.assinaturas.find((a) => a.id === ID_ASSINATURA_CHEFE);
  const transmissor = dados.transmissor ? assinaturaDe(p.assinaturas, dados.transmissor) : undefined;
  const faltaAssinatura = !chefe
    ? 'Falta a assinatura do Ch Seç Op (Administrador → Assinaturas de e-mail).'
    : dados.transmissor && !transmissor
      ? `Falta a assinatura de ${dados.transmissor} (Administrador → Assinaturas de e-mail).`
      : '';

  const previa = useMemo(
    () =>
      montarHtmlEmail(
        { data: hoje, numeroMensagem: `8BPMM-____/03/${hoje.slice(2, 4)}`, ao: dados.ao, assunto: dados.assunto, corpo: dados.corpo },
        { chefe: chefe?.imagem ?? '', transmissor: transmissor?.imagem ?? '' },
      ),
    [hoje, dados.ao, dados.assunto, dados.corpo, chefe, transmissor],
  );

  const mudar = <K extends keyof DadosEmail>(k: K, v: DadosEmail[K]) => {
    setDados((d) => ({ ...d, [k]: v }));
    setConfirmar(false);
  };

  function conferir(e: FormEvent) {
    e.preventDefault();
    const encontrados = validarEmail(dados);
    const problemaPdf = erroDoPdf(pdf);
    setErros(encontrados);
    setErroPdf(problemaPdf);
    setErroGeral(faltaAssinatura);
    if (Object.keys(encontrados).length > 0 || problemaPdf || faltaAssinatura) return;
    setConfirmar(true);
  }

  async function enviar() {
    setEnviando(true);
    setErroGeral('');
    try {
      const anexos: AnexoEmail[] = p.planilha && dados.anexarPlanilha ? [{ tipo: 'planilha', ...p.planilha }] : [];
      await enviarEmailAtalho(db, {
        atalho: p.atalho,
        refId: p.refId,
        email: dados,
        demanda: p.demanda(dados.assunto.trim(), dados.transmissor, hoje),
        anexos,
        pdf,
      });
      cutucarMotor();
      p.aoTerminar();
    } catch {
      setErroGeral('Não foi possível enviar. Confira a internet e tente de novo.');
      setEnviando(false);
    }
  }

  return (
    <form className="form-atalho-email" onSubmit={conferir} noValidate>
      <Campo rotulo="Para" obrigatorio erro={erros.para}>
        <input type="text" inputMode="email" autoComplete="off" value={dados.para} placeholder="cpam11…@policiamilitar.sp.gov.br" onChange={(e) => mudar('para', e.target.value)} />
      </Campo>
      <Campo rotulo="Cc" erro={erros.cc}>
        <input type="text" inputMode="email" autoComplete="off" value={dados.cc} onChange={(e) => mudar('cc', e.target.value)} />
      </Campo>
      <p className="ajuda-pendentes">Mais de um endereço: separe por vírgula. Fica salvo para a próxima vez.</p>
      <Campo rotulo="Ao" obrigatorio erro={erros.ao}>
        <input type="text" value={dados.ao} onChange={(e) => mudar('ao', e.target.value)} />
      </Campo>
      <Campo rotulo="Assunto" obrigatorio erro={erros.assunto}>
        <input type="text" value={dados.assunto} onChange={(e) => mudar('assunto', e.target.value)} />
      </Campo>
      <Campo rotulo="Texto" obrigatorio erro={erros.corpo}>
        <textarea rows={4} value={dados.corpo} onChange={(e) => mudar('corpo', e.target.value)} />
      </Campo>
      <Campo rotulo="Transmitido por" obrigatorio erro={erros.transmissor}>
        <select value={dados.transmissor} onChange={(e) => mudar('transmissor', e.target.value)}>
          <option value="">Escolha…</option>
          {p.responsaveis.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </Campo>

      <fieldset className="grupo-anexos">
        <legend>Anexos</legend>
        {p.planilha && (
          <label className="opcao">
            <input type="checkbox" checked={dados.anexarPlanilha} onChange={(e) => mudar('anexarPlanilha', e.target.checked)} />
            Planilha do EAP (Excel)
          </label>
        )}
        <Campo rotulo="PDF (opcional, até 10 MB)" erro={erroPdf}>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setPdf(f);
              setErroPdf(erroDoPdf(f));
              setConfirmar(false);
            }}
          />
        </Campo>
      </fieldset>

      <details className="previa-email" open>
        <summary>Prévia (o nº sai do Numerador ao enviar)</summary>
        <div className="previa-email-corpo" dangerouslySetInnerHTML={{ __html: previa }} />
      </details>

      {faltaAssinatura && <p className="mensagem aviso">{faltaAssinatura}</p>}
      {erroGeral && erroGeral !== faltaAssinatura && (
        <p className="mensagem erro" role="alert">
          {erroGeral}
        </p>
      )}

      {confirmar ? (
        <div className="confirmar-envio" role="alert">
          <p>
            Vai lançar a <strong>MSG ELETRÔNICA</strong> no Numerador e enviar pelo Gmail da P/3 para {dados.para.trim()}. Confirma?
          </p>
          <div className="acoes-linha">
            <button className="botao destaque" type="button" onClick={() => void enviar()} disabled={enviando}>
              {enviando ? 'Enviando…' : 'Sim, enviar'}
            </button>
            <button className="botao secundario" type="button" onClick={() => setConfirmar(false)} disabled={enviando}>
              Voltar
            </button>
          </div>
        </div>
      ) : (
        <div className="acoes-linha">
          <button className="botao destaque" type="submit">
            Enviar e-mail
          </button>
          <button className="botao secundario" type="button" onClick={p.aoTerminar}>
            Cancelar
          </button>
        </div>
      )}
    </form>
  );
}

function situacao(e: EmailEnviado): string {
  if (e.status === 'enviado') {
    const quando = e.enviadoEm ? new Date(e.enviadoEm) : null;
    return quando ? `Enviado em ${quando.toLocaleDateString('pt-BR')} às ${quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Enviado';
  }
  if (e.status === 'erro') return `Erro: ${e.erro || 'desconhecido'}`;
  return 'Na fila (sai em até 5 minutos)…';
}

function HistoricoEmails({ lista }: { lista: EmailEnviado[] }) {
  return (
    <ul className="historico-emails">
      {lista.map((e) => (
        <li key={e.id} className={`email-${e.status}`}>
          <strong>MSG {e.numeroMensagem}</strong>
          <span className="pendente-detalhe">para {e.para.join(', ')}</span>
          <span>{situacao(e)}</span>
          {e.status === 'erro' && (
            <button className="botao-link" type="button" onClick={() => void reenviarEmail(db, e.id).then(() => cutucarMotor())}>
              Tentar de novo
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
