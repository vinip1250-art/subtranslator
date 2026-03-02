# Stremio Sub EN->PT-BR Translator

Addon Stremio que traduz legendas em ingles para portugues (PT-BR) automaticamente.

## Deploy no Vercel

1. Instale a Vercel CLI: `npm i -g vercel`
2. Rode `vercel` na raiz do projeto
3. Configure as variaveis de ambiente no dashboard:
   - `TRANSLATION_API_URL` - URL da API de traducao (ex: LibreTranslate, DeepL)
   - `TRANSLATION_API_KEY` - Chave de autenticacao da API

## Instalacao no Stremio

Cole a URL do manifesto no Stremio:
`https://seu-projeto.vercel.app/api/index/manifest.json`

## APIs de Traducao suportadas

- **LibreTranslate** (gratuito e self-hosted): https://libretranslate.com
- **DeepL API** (plano gratuito disponivel): https://www.deepl.com/pro-api
