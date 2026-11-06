# Controle de Treinos MAB Personal

PWA mobile-first em HTML, CSS e JavaScript, com persistência em IndexedDB e backup/restauração em JSON.

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
