MAB PERSONAL v2.8 - AJUSTE DO PROXIMO TREINO

Regra implementada:
A -> B -> C -> D -> A, continuamente.

Criterios:
- Usa somente a musculacao concluida mais recente.
- Outras atividades nao alteram a sequencia.
- Treino apenas iniciado, cancelado ou em rascunho nao avanca a sequencia.
- Sem historico de musculacao concluida, sugere Treino A.

Integracao na tela Inicio:
1. Carregue proximo-treino-hotfix.js depois do codigo que recupera as atividades.
2. Ao renderizar o card, use:
   const codigo = MABProximoTreino.obterProximoTreino(atividades);
3. Localize o treino ativo correspondente no plano A/B/C/D e mostre seu nome.
4. Depois de salvar uma musculacao como concluida, renderize novamente a tela Inicio.

Exemplo:
- Historico mais recente: Musculacao - Treino B
- Card esperado: Treino C
