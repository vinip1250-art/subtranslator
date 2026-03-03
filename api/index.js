import { translateSrt } from "../lib/subtitleTranslator.js";
import fetch from "node-fetch";

const manifest = {
  id: "org.syncforhub.subtrans",
  version: "1.0.0",
  name: "PT-BR Auto Translate (Syncforhub)",
  description: "Traduz legendas de outros idiomas para PT-BR.",
  types: ["movie", "series"],
  catalogs: [],
  resources: ["subtitles"],
  idPrefixes: ["tt"]
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Content-Type": "application/json; charset=utf-8"
};

// Tokens autorizados (adicione quantos quiser, um por usuário)
const VALID_TOKENS = new Set([
  process.env.TOKEN_USER_1,
  process.env.TOKEN_USER_2,
  // process.env.TOKEN_USER_3, ...
].filter(Boolean));

function extractToken(path) {
  // Espera paths como /:token/manifest.json ou /:token/subtitles/...
  const match = path.match(/^\/([^/]+)\//);
  return match ? match[1] : null;
}

export default async function handler(req, res) {
  const url  = new URL(req.url, `https://${req.headers.host}`);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }

  // Extrai e valida token
  const token = extractToken(path);
  if (!token || !VALID_TOKENS.has(token)) {
    res.writeHead(403, CORS);
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }

  // Remove o prefixo do token para roteamento interno
  const innerPath = path.replace(`/${token}`, "");

  // GET /manifest.json
  if (innerPath === "/" || innerPath === "/manifest.json") {
    res.writeHead(200, CORS);
    return res.end(JSON.stringify(manifest));
  }

  // GET /subtitles/:type/:id.json
  const subMatch = innerPath.match(/^\/subtitles\/([^/]+)\/([^/]+)\.json$/);
  if (subMatch) {
    const [, type, id] = subMatch;

    const SUPPORTED = {
      eng: "en", en: "en",
      jpn: "ja", ja: "ja",
      spa: "es", es: "es",
      fra: "fr", fr: "fr",
      deu: "de", de: "de",
      ita: "it", it: "it"
    };

    let candidateSubs = [];
    try {
      const upstream = await fetch(
        `https://opensubtitles-v3.strem.io/subtitles/${type}/${id}.json`
      );
      if (upstream.ok) {
        const data = await upstream.json();
        candidateSubs = (data.subtitles || []).filter(s => SUPPORTED[s.lang]);
      }
    } catch (e) {
      console.error("OpenSubs fetch error", e.message);
    }

    const translated = [];
    for (const sub of candidateSubs.slice(0, 3)) {
      try {
        const sourceLang = SUPPORTED[sub.lang];
        const srtRes = await fetch(sub.url);
        const srtText = await srtRes.text();
        const ptText  = await translateSrt(srtText, sourceLang, "pt");

        translated.push({
          id: sub.id + "-pt",
          url: "data:text/plain;base64," + Buffer.from(ptText).toString("base64"),
          lang: "por",
          title: `${sub.title || "Legenda"} [PT-BR via ${sub.lang.toUpperCase()}]`
        });
      } catch (e) {
        console.error("Translate error", e.message);
      }
    }

    res.writeHead(200, CORS);
    return res.end(JSON.stringify({ subtitles: translated }));
  }

  res.writeHead(404, CORS);
  res.end(JSON.stringify({ error: "Not found" }));
}
