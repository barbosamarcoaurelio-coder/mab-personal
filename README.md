# Controle de Treinos MAB Personal

PWA mobile-first em HTML, CSS e JavaScript, com persistência em IndexedDB e backup/restauração em JSON.

## Roadmap

- **Próximo (avaliação aprovada)**: chat de consultoria com IA focado em musculação, após estabilizar a versão atual com o feedback dos testadores.
  - Fase 1: Chat UI no app + proxy seguro (Cloudflare Worker gratuito, chave fora do código) + contexto automático do aluno (peso, treino ativo, cargas recentes, sono, RPE) + avaliação de resultados e sugestões em texto.
  - Fase 2: IA propondo criação/ajuste de treinos com tela de confirmação antes de gravar no plano A/B/C/D.

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
