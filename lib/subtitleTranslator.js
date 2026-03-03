import fetch from "node-fetch";

const API_URL = process.env.TRANSLATION_API_URL; // ex: https://translate.seudominio.com/translate
const API_KEY = process.env.TRANSLATION_API_KEY;

const BLOCK = 3000; // chars por requisição (respeita LT_CHAR_LIMIT)

// Divide o SRT em blocos e traduz em batch
export async function translateSrt(srtText, from = "en", to = "pt") {
  if (!API_URL || !API_KEY) {
    throw new Error("Env vars ausentes: TRANSLATION_API_URL / TRANSLATION_API_KEY");
  }

  const chunks = [];
  for (let i = 0; i < srtText.length; i += BLOCK) {
    chunks.push(srtText.slice(i, i + BLOCK));
  }

  const results = await Promise.all(
    chunks.map(chunk => callLibreTranslate(chunk, from, to))
  );

  return results.join("");
}

async function callLibreTranslate(text, from, to) {
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: text, source: from, target: to, api_key: API_KEY })
  });

  if (!resp.ok) {
    throw new Error("LibreTranslate error: " + resp.status);
  }

  const data = await resp.json();
  return data.translatedText || "";
}
