import fetch from "node-fetch";

// ─── Config ───────────────────────────────────────────────────────────────────

const BLOCK        = 1000;  // MUDADO: Chunks bem pequenos para tradução ultra rápida
const MAX_CHARS    = 40000; // MUDADO: Limite menor para garantir que termine em <10s na Vercel
const CONCURRENCY  = 1;     
const RETRY_DELAY  = 1000;  
const MAX_RETRIES  = 2;

// ... (Funções de processamento ASS e SRT permanecem as mesmas) ...

async function callLibreTranslate(text, from, to, apiUrl, apiKey) {
  let lastErr;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, RETRY_DELAY));
      console.log(`[subtrans] retry ${attempt} para chunk`);
    }

    try {
      const resp = await fetch(apiUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ q: text, source: from, target: to, api_key: apiKey }),
        // Timeout de 8s para dar tempo da função retornar algo antes dos 10s da Vercel
        signal:  AbortSignal.timeout(8000)  
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`HTTP ${resp.status}`);
      }

      const data = await resp.json();
      return data.translatedText;
    } catch (err) {
      lastErr = err;
      console.warn(`[subtrans] Chunk falhou (tentativa ${attempt + 1}):`, err.message);
    }
  }
  throw lastErr;
}

// ... (Restante do arquivo translateSrt e translateChunks permanece igual à versão anterior) ...
