/* MAB Personal v2.8 - Rotacao automatica A/B/C/D
   Integrar ao codigo principal e chamar obterProximoTreino() ao renderizar a tela Inicio. */
(function (global) {
  'use strict';

  const ORDEM_PADRAO = ['A', 'B', 'C', 'D'];

  function normalizarCodigo(valor) {
    if (valor == null) return null;
    const texto = String(valor).trim().toUpperCase();
    const match = texto.match(/(?:TREINO\s*)?([A-D])(?:\b|\s|\.|-|$)/i);
    return match ? match[1].toUpperCase() : null;
  }

  function dataDaAtividade(item) {
    const valor = item && (item.concluidoEm || item.finalizadoEm || item.dataHora || item.data || item.createdAt || item.timestamp);
    const tempo = valor instanceof Date ? valor.getTime() : new Date(valor || 0).getTime();
    return Number.isFinite(tempo) ? tempo : 0;
  }

  function atividadeConcluida(item) {
    if (!item) return false;
    if (item.concluido === false || item.finalizado === false) return false;
    const status = String(item.status || '').toLowerCase();
    if (['iniciado', 'em andamento', 'cancelado', 'rascunho'].includes(status)) return false;
    return item.concluido === true || item.finalizado === true ||
      ['concluido', 'concluído', 'finalizado'].includes(status) ||
      Boolean(item.fim || item.finalizadoEm || item.concluidoEm || item.duracao || item.duration);
  }

  function codigoDaAtividade(item) {
    return normalizarCodigo(item && (item.codigoTreino || item.treinoId || item.treino || item.nome || item.titulo || item.descricao));
  }

  function ehMusculacao(item) {
    if (!item) return false;
    const tipo = String(item.tipo || item.categoria || item.atividade || '').toLowerCase();
    return Boolean(codigoDaAtividade(item)) && (!tipo || tipo.includes('muscula') || tipo.includes('treino'));
  }

  function obterUltimoTreinoConcluido(atividades) {
    return (Array.isArray(atividades) ? atividades : [])
      .filter(item => ehMusculacao(item) && atividadeConcluida(item))
      .sort((a, b) => dataDaAtividade(b) - dataDaAtividade(a))
      .map(codigoDaAtividade)
      .find(Boolean) || null;
  }

  function calcularProximoTreino(ultimo, ordem) {
    const sequencia = Array.isArray(ordem) && ordem.length ? ordem.map(normalizarCodigo).filter(Boolean) : ORDEM_PADRAO;
    const codigo = normalizarCodigo(ultimo);
    if (!codigo) return sequencia[0];
    const indice = sequencia.indexOf(codigo);
    return indice < 0 ? sequencia[0] : sequencia[(indice + 1) % sequencia.length];
  }

  function obterProximoTreino(atividades, ordem) {
    return calcularProximoTreino(obterUltimoTreinoConcluido(atividades), ordem);
  }

  global.MABProximoTreino = {
    ORDEM_PADRAO,
    normalizarCodigo,
    obterUltimoTreinoConcluido,
    calcularProximoTreino,
    obterProximoTreino
  };
})(typeof window !== 'undefined' ? window : globalThis);
