/**
 * Numeração com dois aparelhos salvando no mesmo instante: a regra do contador ("último + 1") barra quem leu o
 * número velho com permission-denied, e o Firebase só repete sozinho conflito (aborted), não esse erro.
 * Aqui a gravação é tentada de novo (lê o contador atualizado). Permissão negada de verdade falha igual no fim.
 */
export async function repetirSeConcorrencia<T>(gravar: () => Promise<T>, tentativas = 10): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await gravar();
    } catch (e) {
      if (i >= tentativas || (e as { code?: string })?.code !== 'permission-denied') throw e;
      await new Promise((ok) => setTimeout(ok, 50 + Math.random() * 150 * i));
    }
  }
}
