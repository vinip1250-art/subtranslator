# Stremio Sub EN→PT-BR Translator

Addon Stremio serverless para Vercel que traduz legendas inglês → português.

## Deploy

```bash
vercel deploy --prod
```

## URL do manifesto para instalar no Stremio

```
https://SEU-PROJETO.vercel.app/manifest.json
```

## Variáveis de ambiente (Vercel Dashboard)

| Variável              | Exemplo                                       |
|-----------------------|-----------------------------------------------|
| TRANSLATION_API_URL   | https://translate.seudominio.com/translate    |
| TRANSLATION_API_KEY   | chave gerada pelo ltmanage                    |

## Como funciona

1. Stremio chama /subtitles/:type/:id.json
2. O addon busca legendas em inglês no OpenSubtitles (via strem.io)
3. Traduz cada legenda usando o LibreTranslate no seu VPS
4. Retorna as legendas em PT-BR como data URI base64
