# Controle de Treinos MAB Personal

PWA mobile-first em HTML, CSS e JavaScript, com persistência em IndexedDB e backup/restauração em JSON.

## Roadmap

- **Próximo (avaliação aprovada)**: chat de consultoria com IA focado em musculação, após estabilizar a versão atual com o feedback dos testadores.
  - Fase 1: Chat UI no app + proxy seguro (Cloudflare Worker gratuito, chave fora do código) + contexto automático do aluno (peso, treino ativo, cargas recentes, sono, RPE) + avaliação de resultados e sugestões em texto.
  - Fase 2: IA propondo criação/ajuste de treinos com tela de confirmação antes de gravar no plano A/B/C/D.

- **Melhorias de Interface e Análise (Evolução & Início)** *(Aguardando solicitação para execução)*:
  1. **Seleção de tipo de avaliação corporal (+Avaliação na aba Evolução)**:
     - Ao clicar em "+ Avaliação", exibir diálogo inicial para escolha entre "Apenas Peso" ou "Bioimpedância Completa".
     - Opção "Apenas Peso": formulário simplificado apenas com data e peso corporal (kg).
     - Opção "Bioimpedância Completa": formulário completo contendo peso, composição corporal (% gordura, massa magra, massa gorda) e circunferências corporais (tronco e membros).
  2. **Gráfico de atividades registradas na aba Evolução (Substituição de 'Outras atividades')**:
     - Remover o quadro estático de listagem e botão "+ Registrar" de outras atividades da aba Evolução (mantendo o registro centralizado na aba Início).
     - Incluir gráfico consolidado de atividades registradas (semelhante ao gráfico de evolução corporal), com seletor de métricas:
       - Tempo ativo total (minutos por dia/semana).
       - Calorias estimadas/gastas (kcal).
       - Distância percorrida (km).
       - Frequência por modalidade (Musculação vs. Cardio/Outras).
       - Carga de treino (Duração × RPE).
  3. **Quadro de atividades recentes com rolagem na aba Início**:
     - Manter o histórico carregando as últimas 10 atividades executadas (musculação e outras atividades).
     - Limitar a altura visível em tela para exibir aproximadamente 5 itens simultâneos, adicionando rolagem vertical interna (`overflow-y: auto`) para navegar pelas 10 atividades sem ocupar a tela inteira.
  4. **Gráfico de estímulo muscular na aba Evolução (Substituição de 'Séries concluídas por grupo muscular')**:
     - Substituir a tabela textual por um gráfico visual limpo e intuitivo de barras (horizontais ou verticais).
     - Adicionar filtro de período selecionável: "Últimos 7 dias" ou "Mês atual / 30 dias".
     - Métricas do gráfico selecionáveis ou combinadas:
       - Volume de séries concluídas (séries principais vs. estímulos secundários).
       - Quantidade de treinos/sessões em que o músculo foi trabalhado.
       - Total de repetições realizadas.
       - Soma de Kg levantados (Volume Load: soma de repetições × kg).
       - Esforço médio por grupo muscular (RIR médio ou RPE da sessão).

## Versão 4.1.0 — Rota no mapa

- Atividades com GPS (Caminhada/Corrida, Bicicleta) gravam o trajeto e exibem a rota no mapa (OpenStreetMap, sem custo e sem chave), com marcadores de início e fim; sem internet, mostra a linha do trajeto sem o fundo do mapa.
- Velocidade média exibida durante e após a atividade; a modalidade Caminhada passa a ser Caminhada/Corrida, com MET estimado pela velocidade média quando há GPS.

## Versão 4.0.0 — Atividades ao vivo e detalhe da execução

- "+ Registrar outra atividade" oferece Iniciar agora (cronômetro) ou Registrar atividade passada.
- Cronômetro ao vivo com estimativa de calorias por MET da modalidade e GPS opcional (caminhada, corrida e bicicleta; a tela precisa ficar ligada).
- Ao finalizar, o mesmo resumo da musculação: estimativa MAB, valor do dispositivo (Polar, Garmin...), esforço (RPE), fadiga e desconforto.
- Toque em uma atividade recente na tela Início para ver o detalhe: tempo total, média por exercício, calorias, estrelas de esforço/fadiga e mapa muscular colorido.
- Exportação por período com atalhos de intervalo (7 dias, 30 dias, mês ou tudo).
- Check-in pré-treino renomeado para Disposição e Sono.

## Versão 3.0.13 — Aquecimento opcional

- Após o check-in (sono/disposição), uma etapa de aquecimento opcional com timer e tipo (caminhada leve, bicicleta, mobilidade, alongamento ou livre), com opção de pular direto para a musculação.
- O tempo de aquecimento é gravado na sessão e não entra na duração da musculação.
- Aquecimento incluído nos relatórios TXT e CSV (warmup_type, warmup_seconds, warmup_skipped).

## Versão 3.0.12 — Referência anterior restaurada

- A linha "Anterior" (reps/KG/RIR da última execução) volta a aparecer ao abrir cada exercício, inclusive ao navegar com Próximo/Anterior.
- Removido bloqueio legado da camada de estabilidade que impedia a atualização da referência sem salvar a série.

## Versão 3.0.11 — Bip de descanso confiável

- Bip de fim de descanso mais confiável no iPhone: desbloqueio de áudio no toque, retomada automática ao voltar ao app e gatilho por verificação contínua.
- O bip toca junto com a música, sem pausá-la (no iPhone, a chave lateral de silêncio precisa estar desativada para ouvi-lo).
- Vibração no Android ao fim do descanso e nota de orientação nas Configurações.

## Versão 3.0.10 — Lembrete de backup

- Ao concluir um treino, se o último backup tiver 7 dias ou mais (ou nunca tiver sido feito), o app oferece exportar o JSON na hora.
- Configurações mostram há quanto tempo foi o último backup neste aparelho.

## Versão 3.0.9 — Teclado e sincronia do sono

- Campos de sono em hh:mm abrem o teclado completo no iPhone, permitindo digitar os dois pontos (ex.: 6:40).
- O sono informado no check-in pré-treino também alimenta o registro diário de Sono e recuperação da mesma data.

## Versão 3.0.8 — Sono em hh:mm e RPE explicado

- Sono pré-treino e registro diário aceitam horas e minutos (ex.: 7:30), com médias exibidas como 7h30.
- Esforço geral da sessão (RPE) com legenda simples: 1 = muito leve · 10 = esforço máximo.

## Versão 3.0.7 — Dicas de medição

- Orientações de onde posicionar a fita métrica nos campos de abdômen, cintura e quadril, tanto na nova avaliação quanto na edição.

## Versão 3.0.6 — Performance e recuperação

- Check-in opcional de disposição e sono antes da musculação.
- RPE, fadiga e desconfortos opcionais no resumo pós-treino.
- Registro diário de sono e recuperação.
- Avaliações corporais com medidas bilaterais e edição/exclusão individual preservadas.
- Classificação muscular e séries concluídas por grupo, sem alterar A/B/C/D ou o plano.
- Relatórios TXT e CSV com campos ausentes distintos de zero.
- Migração aditiva do IndexedDB; backups JSON da v3.0.5 continuam importáveis.

## Executar localmente

O Service Worker exige HTTP/HTTPS. Na pasta do projeto, execute:

```bash
python3 -m http.server 8080
```

Abra `http://localhost:8080` no navegador.

## Publicar

Publique todos os arquivos mantendo a estrutura em uma hospedagem HTTPS, como GitHub Pages, Cloudflare Pages, Netlify ou Azure Static Web Apps.

## Instalar no iPhone

1. Abra a URL publicada no Safari.
2. Toque em Compartilhar.
3. Escolha Adicionar à Tela de Início.
4. Abra o ícone MAB Personal.

## Dados

Os dados ficam no IndexedDB do navegador/aparelho. Use Configurações e Dados para exportar e importar um backup JSON.

O relatório de análise por período oferece TXT e CSV. Os campos não preenchidos são exportados vazios/não informados, e somente séries marcadas como concluídas são consideradas efetivas.

## Observações

- Esta versão não sincroniza com nuvem.
- A remoção dos dados do Safari pode apagar o banco local.
- Faça backups periódicos.
- Alertas em segundo plano variam conforme o suporte do navegador; os cronômetros são recalculados por timestamp quando o app volta ao primeiro plano.
- A v3.0.6 não sincroniza dados com serviços externos; cada registro permanece no armazenamento local do navegador.
