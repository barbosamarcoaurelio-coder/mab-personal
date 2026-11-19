# Controle de Treinos MAB Personal

PWA mobile-first em HTML, CSS e JavaScript, com persistência em IndexedDB e backup/restauração em JSON.

## Versão 4.10.1 — Busca de alimentos

- Removida a opção de consulta à TACO. A busca no Open Food Facts por nome e código de barras, o cadastro manual e os alimentos já salvos continuam disponíveis.

## Versão 4.9.0 — Exportação do Diário Alimentar

- Em **Dieta → Exportar CSV**, toque em **Últimos 7 dias** (inclui hoje) ou informe datas inicial e final, inclusive, e toque em **Preparar CSVs**. Baixe cada arquivo separadamente; os dados são lidos e processados no próprio aparelho.
- `MAB_Diario_Alimentar.csv`: uma linha por alimento registrado. `MAB_Resumo_Diario.csv`: uma linha por data do período, inclusive dias sem registros. Dias fechados usam os mesmos totais congelados exibidos no app. Medidas ausentes ficam vazias; zero registrado permanece zero.
- Cada arquivo começa com uma linha de metadados (data de exportação em UTC, versão e período), seguida pelos cabeçalhos. No Excel, se necessário, use **Dados → De Texto/CSV**, selecione **UTF-8** e delimitador **ponto e vírgula**. Para análise tabular, pule a primeira linha. Os valores numéricos em colunas usam vírgula decimal.
- Proteína por refeição, avaliações de tolerância e atividades são listas JSON dentro de células do resumo. Cada atividade mantém seus próprios dados de modalidade, horário, duração, disposição, recuperação e observações; campos ausentes na lista ficam como `null`.

## Versão 4.8.0 — Bem-estar e atividades no diário

- O diário oferece avaliações opcionais de disposição, saciedade, digestão, fome e energia, com observações editáveis armazenadas no registro diário existente.
- Cada refeição aceita avaliação rápida de tolerância, inclusive durante a montagem da refeição. Esses registros não afetam calorias, macros nem a contagem de refeições.
- Treinos de musculação existentes são exibidos e avaliados diretamente, sem duplicar sessões. Outras atividades podem ser registradas/editadas com data, horário, modalidade, duração e avaliações opcionais de disposição e recuperação.
- Dados complementares são opcionais, reutilizam os stores existentes e mantêm os registros históricos; nenhum campo é exigido para fechar o dia.

## Versão 4.7.1 — Tempo ativo total do mês

- O indicador da tela inicial soma o tempo de musculações e outras atividades registradas no mês local, exibindo o acumulado em `HH:MM:SS`.
- A formatação aceita acumulados acima de 24 horas.

## Versão 4.7.0 — Resumo nutricional ampliado

- Registros alimentares passam a guardar horário local, quantidade consumida e unidade; quando a porção é medida em gramas, o peso consumido também é armazenado. Os campos são opcionais quando a medida não se aplica.
- O resumo diário mostra refeições registradas, proteína por refeição e água em ml. Água é registrada no mesmo store histórico, mas não entra nas calorias nem na contagem de refeições.
- A estimativa energética dos macros explicita a regra proteína/carboidrato 4 kcal/g e gordura 9 kcal/g; calorias informadas nos alimentos e metas continuam separadas.
- Inclusão, edição, exclusão, cópias e backups preservam os snapshots existentes. Os campos novos são opcionais, sem migração destrutiva nem alteração do IndexedDB v3.
- Em dados antigos sem horário ou medida física, o diário não inventa esses valores; ao editar, a quantidade histórica continua identificada como porções.

## Versão 4.6.0 — Registro rápido de refeições

- Cards das refeições começam recolhidos; o cabeçalho mantém kcal e macros, e cada alimento continua editável/excluível.
- **+ Registrar Refeição** permite escolher uma categoria e montar vários alimentos em uma lista temporária. Quantidades e totais são atualizados antes de salvar; os registros e novos alimentos só são gravados juntos ao tocar em **Salvar Refeição**. Cancelar descarta a lista.
- Pesquisa textual por nome no Open Food Facts complementa a busca local e a leitura por código de barras já existente. Produtos selecionados podem ser conferidos e corrigidos; nutrientes ausentes permanecem vazios e precisam ser preenchidos. Cadastro manual segue disponível sem conexão ou sem resultados.
- Pesquisar envia o termo digitado à Open Food Facts; a integração não envia dados do diário ou dados pessoais. A consulta é opcional e limitada a 8 resultados, com timeout de 8 segundos.
- O indicador **Tempo ativo hoje** exibe `hh:mm:ss` e soma treinos e outras atividades registrados na data local.
- IndexedDB v3 e snapshots nutricionais históricos preservados.

## Roadmap

- **Migração para Banco em Nuvem (Cloudflare D1 + Workers - Offline-First)** *(Planejado / Aguardando credenciais)*:
  - Objetivo: persistência na nuvem sem risco de expiração do IndexedDB no Safari/iOS e sincronização entre múltiplos dispositivos, mantendo o funcionamento 100% offline durante o treino.
  - Fase 1 (Infraestrutura & D1): setup do `wrangler.toml`, criação do banco D1 e migração do schema SQL relacional (espelhando os stores atuais com campos de controle: `user_id`, `updated_at`, `is_deleted`).
  - Fase 2 (API Serverless): endpoints no Cloudflare Worker (`/api/sync/push`, `/api/sync/pull` e importador do JSON de backup) com autenticação leve.
  - Fase 3 (Sync Engine Local): camada de sincronização bidirecional no cliente com estratégia *Last-Write-Wins* ativada ao recuperar conexão (`online`) ou finalizar treinos/avaliações.
  - Fase 4 (UI/UX): indicador de status de sincronização (nuvem verde/amarela/vermelha) e gerenciamento de conta/sincronização na tela de Configurações.
  - Fase 5 (Deploy & Validação): testes em modo avião/reconexão e publicação unificada no Cloudflare Pages/Workers.

- **Próximo (avaliação aprovada)**: chat de consultoria com IA focado em musculação, após estabilizar a versão atual com o feedback dos testadores.
  - Fase 1: Chat UI no app + proxy seguro (Cloudflare Worker gratuito, chave fora do código) + contexto automático do aluno (peso, treino ativo, cargas recentes, sono, RPE) + avaliação de resultados e sugestões em texto.
  - Fase 2: IA propondo criação/ajuste de treinos com tela de confirmação antes de gravar no plano A/B/C/D.

- **Melhorias de Interface e Análise (Evolução & Início)** *(Aguardando solicitação para execução)*:
  1. **Seleção de tipo de avaliação corporal (+Avaliação na aba Evolução)**:
     - Ao clicar em "+ Avaliação", exibir diálogo inicial para escolha entre "Apenas Peso" ou "Bioimpedância Completa".
     - Opção "Apenas Peso": formulário simplificado apenas com data e peso corporal (kg).
     - Opção "Bioimpedância Completa": formulário completo contendo peso, composição corporal (% gordura, músculo esquelético, massa gorda) e circunferências corporais (tronco e membros).
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

## Versão 4.5.0 — Código de barras na alimentação

- **Dieta → + Adicionar → Ler código de barras**: câmera traseira em overlay, duas leituras consecutivas para confirmar e opção **Digitar código**. Permissão negada/ausência de câmera oferece digitação com aviso. A câmera para ao fechar, sair da rota ou ocultar o app.
- Busca primeiro no cadastro local por código, inclusive offline. Produtos novos consultam a [Open Food Facts](https://world.openfoodfacts.org/) com timeout de 8 segundos. Uma tela de conferência mostra nome, marca e nutrientes editáveis; nada é cadastrado antes de **Confirmar alimento**.
- Somente o código de barras é enviado à Open Food Facts (sem credenciais, referência da página, imagens, diário, metas ou dados pessoais). Não há analytics nem outros serviços de consulta. O Service Worker não intercepta nem armazena respostas desse domínio.
- Falha de rede, produto ausente ou modo offline abre o cadastro manual com o código preenchido e aviso claro. O alimento salvo será encontrado localmente na próxima leitura. Alimentos sem código continuam funcionando.
- Campo de código opcional, somente dígitos, com aviso não bloqueante de EAN/UPC inválido. Dados incompletos não viram zero: precisam ser preenchidos na conferência. Valores suspeitos por 100 g ou divergentes dos macros geram aviso para conferir o rótulo.
- Leitura nativa apenas se suportar EAN-13, EAN-8, UPC-A e UPC-E; nos demais casos, ZXing WASM **3.1.7**, distribuído localmente em `vendor/zxing` (MIT e ZXing-C++ Apache-2.0, licenças incluídas). JS e WASM são pré-armazenados para leitura offline; sem CDN. Pacote npm fixado, integridade SHA-512 verificada antes da cópia.
- IndexedDB permanece em **v3**. `source`, `brand` e `offFetchedAt` são opcionais e acompanham o backup JSON; snapshots das refeições permanecem inalterados.
- Requer HTTPS (ou localhost) e permissão de câmera. No iPhone, permitir a câmera tanto no Safari quanto no app adicionado à Tela de Início. **Validação física em iPhone standalone ainda necessária**; testes simulados não comprovam a câmera real fora do Safari.
- Testes: `node --experimental-vm-modules --test tests/*.test.mjs` — 43 aprovados, incluindo normalização, limites nutricionais, EAN/UPC, timeout, câmera simulada, cancelamento e backup.
- Navegador: leitura de EAN-13 com WASM real e vídeo sintético, consulta real à API, conferência antes de gravar, campos incompletos/escape de texto, busca local sem rede, cadastro manual com código, legado sem código e cancelamento da consulta verificados. Overlay em 390px sem estouro, fonte de 16px e controles de pelo menos 44px.
- Com o servidor desligado, recarga do diário, inicialização do WASM e busca local por código continuaram funcionando. Backup/restauração real preservou os novos campos; metas, fechamento/reabertura, totais do card e formulário/detalhes de atividades também foram verificados.

## Versão 4.4.0 — Diário de alimentação

- Nova aba **Dieta** e card **DIETA · HOJE** após Próximo treino: metas, calorias e macros compartilhando os mesmos totais.
- Seis refeições por data local, cadastro manual de alimentos, favoritos/recentes, busca, porções com prévia, edição/exclusão e cópia da refeição de ontem. Valores aceitam vírgula.
- Cada registro guarda um snapshot nutricional; editar o cadastro do alimento não muda o histórico.
- Metas em kcal e gramas, aviso não bloqueante de divergência dos macros (4/4/9 kcal/g), barras e pizza SVG.
- Fechamento/reabertura de dia com metas e totais congelados, saldo **consumido − meta** e últimos sete fechamentos. Gasto dos treinos/atividades é estimado e apenas informativo, sem descontar do saldo; horários são convertidos para data local.
- IndexedDB v3 com migração aditiva. Backup inclui o diário; restauração em modo substituir preserva stores ausentes e metas alimentares ao importar backups antigos.
- Totalmente offline, sem rede, leitura de código de barras ou bibliotecas adicionais. O campo barcode fica reservado para versão futura.
- Testes: `node --experimental-vm-modules --test tests/*.test.mjs` — 27 testes aprovados.
- Validação no navegador: migração real v2→v3 preservando os 11 stores anteriores, backup antigo sem apagar diário/metas, seis abas em 390px (alvos de 63×44px, sem estouro), totais iguais no card/diário, snapshots, edição, cópia, exclusão e fechamento/reabertura. Recarga e gravação offline verificadas com o servidor desligado. Formulário de atividade, check-in de musculação e detalhes por botão/clique na linha preservados.
- Validar também em iPhone/Android reais o teclado, safe-area, GPS, tela ativa e compartilhamento nativo; a verificação de navegador não substitui esses testes físicos.

## Versão 4.3.6 — Encerramento e tempos da musculação

- **Fechar sem salvar** e **✕** dispensam o resumo sem concluir o treino. O resumo não reabre automaticamente nessa sessão; **Finalizar** continua disponível.
- **Atividades recentes** e **Ver detalhes** agora mostram o mesmo tempo total. O detalhe e a imagem compartilhada também mostram aquecimento, execução e descanso. Dados indisponíveis aparecem como **—**, sem alterar o histórico salvo.

## Versão 4.3.5 — Compartilhamento simplificado

- Removido o botão separado Baixar PNG. O painel mantém Instagram / WhatsApp e Salvar imagem; sem compartilhamento nativo, Salvar imagem continua permitindo baixar o arquivo.

## Versão 4.3.4 — Imagem da atividade para compartilhar

- Em Atividades recentes → Ver detalhes, o botão laranja **Compartilhar atividade** fica entre Editar e Excluir, tanto na musculação quanto nas demais modalidades.
- Gera localmente um PNG com o conteúdo completo do popup (inclusive a parte fora da área visível), identidade MAB, métricas e imagens, sem os botões de controle e sem alterar registros. A prévia permite revisar as informações antes de enviá-las.
- Instagram / WhatsApp abre o compartilhamento nativo de arquivos quando suportado; os destinos dependem dos apps instalados e do sistema. No iPhone, o toque de compartilhar acontece após a imagem estar pronta, preservando o gesto exigido pelo navegador.
- Salvar imagem abre as opções nativas quando disponíveis; para o rolo da câmera, escolha Salvar Imagem/Fotos ou toque e segure a prévia. **Baixar PNG salva um arquivo**, não grava automaticamente na galeria. Sem Web Share de arquivos, download e prévia continuam disponíveis.
- Sobre atualizado para 4.3.4 com o resumo deste compartilhamento, da tela ativa desde o aquecimento e dos ajustes recentes de avaliação corporal, rodízio e som.
- Renderização com html2canvas 1.4.1 (MIT), distribuído localmente em `vendor/html2canvas`, disponível no cache offline; nenhuma imagem da atividade é enviada a serviços de renderização.
- Testes: `node --experimental-vm-modules --test tests/*.test.mjs`. A lista de destinos e o salvamento em Fotos precisam também de validação nos aparelhos reais.

## Versão 4.3.3 — Tela ativa desde o aquecimento

- Todos os treinos de musculação (A–G) compartilham o mesmo controle de tela ativa, desde o aquecimento até concluir ou descartar a sessão, incluindo exercícios e descansos.
- Ao retornar ao app, recarregar ou navegar entre abas internas com uma sessão em andamento, a proteção é solicitada novamente quando necessário. Nenhum dado ou cálculo do treino foi alterado.
- Requer HTTPS e suporte à Screen Wake Lock API (Safari/iOS e Chrome/Android atualizados). O app precisa permanecer visível; bloqueio manual, economia de bateria e restrições do sistema não podem ser anulados pelo PWA. Se a solicitação falhar, o app informa que a tela pode bloquear, sem indicar proteção inexistente.
- Testes automatizados do controle: `node --experimental-vm-modules --test tests/screen-wake-lock.test.mjs`. A validação física do bloqueio automático deve ser feita em iPhone e Android.

## Versão 4.2.1 — Persistência de medidas corporais e avaliação rápida

- **Preservação de medidas corporais anteriores**: ao registrar apenas o peso corporal pela aba Evolução (`+ Avaliação -> Apenas Peso`), o quadro de "Medidas corporais" mantém as últimas informações de circunferências e membros registradas anteriormente, preservando também a data exata da última medição física.
- **Fluxo de avaliação rápido e cirúrgico**: seleção clara entre registro rápido de peso corporal e bioimpedância/avaliação corporal completa.

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
