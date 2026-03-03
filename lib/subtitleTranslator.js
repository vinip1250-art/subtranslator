import fetch from "node-fetch";

// ─── Config ───────────────────────────────────────────────────────────────────

const BLOCK        = 1500;  // Reduzido para chunks menores e mais rápidos
const MAX_CHARS    = 100000; // Aumentado levemente para legendas maiores
const CONCURRENCY  = 1;     // MUDADO: 1 por vez para evitar "Aborted" no DDNS
const RETRY_DELAY  = 2000;  
const MAX_RETRIES  = 3;     // MUDADO: Mais uma tentativa de segurança

// ─── ASS/SSA tag processor ────────────────────────────────────────────────────

const ASS_TAG_RE = /(\{[^}]*\})/g;

function stripAssTags(text) {
  const tags = [];
  const clean = text.replace(ASS_TAG_RE, (match, tag) => {
    tags.push({ tag, placeholder: `§${tags.length}§` });
    return `§${tags.length - 1}§`;
  });
  return { clean, tags };
}

function restoreAssTags(translatedText, tags) {
  let result = translatedText;
  for (const { tag, placeholder } of tags) {
    result = result.replace(placeholder, tag);
  }
  return result;
}

function hasAssTags(text) {
  ASS_TAG_RE.lastIndex = 0;
  return ASS_TAG_RE.test(text);
}

// ─── SRT line processor ───────────────────────────────────────────────────────

const TIMESTAMP_RE = /^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}/;
const INDEX_RE     = /^\d+$/;

function splitSrtLines(srtText) {
  const lines    = srtText.split("\n");
  const textLines = [];
  const skeleton  = [];

  for (const line of lines) {
    if (INDEX_RE.test(line.trim()) || TIMESTAMP_RE.test(line.trim()) || line.trim() === "") {
      skeleton.push({ type: "literal", value: line });
    } else {
      skeleton.push({ type: "text", idx: textLines.length });
      textLines.push(line);
    }
  }

  return { skeleton, textLines };
}

function rebuildSrt(skeleton, translatedLines) {
  return skeleton
    .map(entry => entry.type === "literal" ? entry.value : (translatedLines[entry.idx] ?? ""))
    .join("\n");
}

// ─── HTTP helper com retry ────────────────────────────────────────────────────

async function callLibreTranslate(text, from, to, apiUrl, apiKey) {
  let lastErr;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, RETRY_DELAY * attempt));
      console.log(`[subtrans] retry ${attempt} para chunk`);
    }

    try {
      const resp = await fetch(apiUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ q: text, source: from, target: to, api_key: apiKey }),
        // MUDADO: Timeout aumentado para 30s para evitar o erro 'aborted'
        signal:  AbortSignal.timeout(30000)  
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        throw new Error(`HTTP ${resp.status}: ${body.substring(0, 100)}`);
      }

      const data = await resp.json();
      if (!data.translatedText) throw new Error("Resposta sem translatedText");

      return data.translatedText;
    } catch (err) {
      lastErr = err;
      console.warn(`[subtrans] Chunk falhou (tentativa ${attempt + 1}):`, err.message);
      // Se o erro for timeout/abort, o retry tentará novamente
    }
  }

  throw lastErr;
}

// ─── Processa chunks com concorrência limitada ────────────────────────────────

async function translateChunks(chunks, from, to, apiUrl, apiKey) {
  const results = new Array(chunks.length);

  // MUDADO: Loop agora respeita estritamente a concorrência configurada
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    console.log(`[subtrans] Traduzindo chunks ${i + 1}-${Math.min(i + CONCURRENCY, chunks.length)} de ${chunks.length}`);

    const batchResults = await Promise.all(
      batch.map(chunk => callLibreTranslate(chunk, from, to, apiUrl, apiKey))
    );

    for (let j = 0; j < batchResults.length; j++) {
      results[i + j] = batchResults[j];
    }

    // Pequena pausa entre batches para não sobrecarregar a API
    if (i + CONCURRENCY < chunks.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

// ─── Exportação principal ─────────────────────────────────────────────────────

export async function translateSrt(srtText, from = "en", to = "pt") {
  const API_URL = process.env.TRANSLATION_API_URL;
  const API_KEY = process.env.TRANSLATION_API_KEY;

  if (!API_URL || !API_KEY) {
    throw new Error("Env vars ausentes: TRANSLATION_API_URL / TRANSLATION_API_KEY");
  }

  const apiUrl = API_URL.endsWith("/translate") ? API_URL : API_URL.replace(/\/$/, "") + "/translate";

  // Limita tamanho
  const text = srtText.length > MAX_CHARS ? srtText.substring(0, MAX_CHARS) : srtText;
  
  const { skeleton, textLines } = splitSrtLines(text);
  if (textLines.length === 0) return text;

  const isAss        = textLines.some(l => hasAssTags(l));
  const strippedLines = isAss ? textLines.map(stripAssTags) : null;
  const cleanLines    = isAss ? strippedLines.map(s => s.clean) : textLines;

  const SEP     = "\n\n";
  const chunks  = [];
  let   current = "";

  for (const line of cleanLines) {
    const candidate = current ? current + SEP + line : line;
    if (candidate.length > BLOCK && current.length > 0) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);

  console.log(`[subtrans] Total: ${cleanLines.length} linhas, ${chunks.length} chunks`);

  const translatedChunks = await translateChunks(chunks, from, to, apiUrl, API_KEY);
  const translatedFlat   = translatedChunks.join(SEP).split(SEP);

  const finalLines = isAss
    ? translatedFlat.map((tLine, i) =>
        strippedLines[i] ? restoreAssTags(tLine, strippedLines[i].tags) : tLine
      )
    : translatedFlat;

  return rebuildSrt(skeleton, finalLines);
}
