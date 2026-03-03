import fetch from "node-fetch";

const API_URL = process.env.TRANSLATION_API_URL;
const API_KEY  = process.env.TRANSLATION_API_KEY;
const BLOCK    = 3000;

// ─── ASS/SSA tag processor ───────────────────────────────────────────────────

const ASS_TAG_RE = /(\{[^}]*\})/g;

function stripAssTags(text) {
  // Guarda as tags com seus índices para reinserir depois
  const tags = [];
  const clean = text.replace(ASS_TAG_RE, (match, tag, offset) => {
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
  return ASS_TAG_RE.test(text);
}

// ─── SRT line processor ──────────────────────────────────────────────────────

// Divide somente as linhas de texto (ignora índices e timestamps)
const TIMESTAMP_RE = /^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}/;
const INDEX_RE     = /^\d+$/;

function splitSrtLines(srtText) {
  const lines = srtText.split("\n");
  const textLines   = []; // {index, value}
  const skeleton    = []; // "text" | linha literal

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
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
    .map(entry =>
      entry.type === "literal" ? entry.value : (translatedLines[entry.idx] ?? "")
    )
    .join("\n");
}

// ─── Translation core ─────────────────────────────────────────────────────────

export async function translateSrt(srtText, from = "en", to = "pt") {
  if (!API_URL || !API_KEY) {
    throw new Error("Env vars ausentes: TRANSLATION_API_URL / TRANSLATION_API_KEY");
  }

  const { skeleton, textLines } = splitSrtLines(srtText);

  if (textLines.length === 0) return srtText;

  // Detecta se é ASS/SSA
  const isAss = textLines.some(l => hasAssTags(l));

  // Se ASS: extrai tags antes de traduzir
  const strippedLines = isAss ? textLines.map(stripAssTags) : null;
  const cleanLines    = isAss ? strippedLines.map(s => s.clean) : textLines;

  // Junta em blocos para minimizar chamadas à API
  const chunks  = [];
  let   current = "";
  const SEP     = "\n\n";

  for (const line of cleanLines) {
    if ((current + SEP + line).length > BLOCK && current.length > 0) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? current + SEP + line : line;
    }
  }
  if (current) chunks.push(current);

  const translatedChunks = await Promise.all(
    chunks.map(chunk => callLibreTranslate(chunk, from, to))
  );

  const translatedFlat = translatedChunks.join(SEP).split(SEP);

  // Restaura tags ASS se necessário
  const finalLines = isAss
    ? translatedFlat.map((tLine, i) =>
        strippedLines[i] ? restoreAssTags(tLine, strippedLines[i].tags) : tLine
      )
    : translatedFlat;

  return rebuildSrt(skeleton, finalLines);
}

async function callLibreTranslate(text, from, to) {
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: text, source: from, target: to, api_key: API_KEY })
  });

  if (!resp.ok) throw new Error("LibreTranslate error: " + resp.status);

  const data = await resp.json();
  return data.translatedText || "";
}
