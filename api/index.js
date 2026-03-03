import { translateSrt } from "../lib/subtitleTranslator.js";
import fetch from "node-fetch";

const manifest = {
  id: "org.syncforhub.subtrans",
  version: "1.0.1",
  name: "PT-BR Auto Translate",
  description: "Traduz legendas automaticamente para PT-BR",
  types: ["movie", "series"],
  catalogs: [],
  resources: ["subtitles"],
  idPrefixes: ["tt"]
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

const VALID_TOKENS = new Set(
  [process.env.TOKEN_USER_1, process.env.TOKEN_USER_2].filter(Boolean)
);

// Linguagens suportadas para busca no OpenSubtitles
const SUPPORTED_LANGS = { eng: "en", jpn: "ja", spa: "es", fra: "fr", deu: "de", ita: "it" };

// ─── Handler principal ────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const url = new URL(req.url, "https://" + req.headers.host);
  const path = url.pathname;

  console.log("[subtrans] path:", path);

  if (req.method === "OPTIONS") {
    res.writeHead(204, { ...CORS });
    return res.end();
  }

  // Extrai token do início do path: /{token}/...
  const tokenEnd = path.indexOf("/", 1);
  const token = tokenEnd > 0 ? path.substring(1, tokenEnd) : null;

  if (!token || !VALID_TOKENS.has(token)) {
    console.log("[subtrans] Token inválido:", token);
    res.writeHead(403, { ...CORS, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }

  const innerPath = path.substring(tokenEnd); // ex: /manifest.json, /subtitles/movie/tt123.json
  console.log("[subtrans] innerPath:", innerPath);

  // ── Manifest ──────────────────────────────────────────────────────────────
  if (innerPath === "/" || innerPath === "/manifest.json") {
    res.writeHead(200, { ...CORS, "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify(manifest));
  }

  // ── Endpoint de tradução on-the-fly: /{token}/translate ───────────────────
  // O Stremio faz GET nesta URL para baixar o arquivo de legenda traduzido
  if (innerPath === "/translate") {
    const subUrl = url.searchParams.get("url");
    const from   = url.searchParams.get("from") || "en";

    if (!subUrl) {
      res.writeHead(400, { ...CORS, "Content-Type": "text/plain" });
      return res.end("Missing url param");
    }

    try {
      console.log("[subtrans] Baixando legenda:", subUrl.substring(0, 80));
      const srtResp = await fetch(subUrl);
      if (!srtResp.ok) throw new Error("Download falhou: " + srtResp.status);

      const srtText = await srtResp.text();
      console.log("[subtrans] Traduzindo", srtText.length, "chars de", from, "-> pt");

      const ptText = await translateSrt(srtText, from, "pt");

      res.writeHead(200, {
        ...CORS,
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=86400"
      });
      return res.end(ptText);
    } catch (err) {
      console.error("[subtrans] Erro ao traduzir:", err.message);
      // Retorna legenda de erro válida em SRT
      const errorSrt = "1\n00:00:00,000 --> 00:00:05,000\n[PT-BR] Erro ao traduzir legenda.\n";
      res.writeHead(200, { ...CORS, "Content-Type": "text/plain; charset=utf-8" });
      return res.end(errorSrt);
    }
  }

  // ── Subtitles ─────────────────────────────────────────────────────────────
  // Rotas: /subtitles/movie/{id}.json
  //        /subtitles/series/{id}:{season}:{episode}.json
  if (innerPath.startsWith("/subtitles/") && innerPath.endsWith(".json")) {
    console.log("[subtrans] Subtitles request");

    // Detecta tipo: movie ou series
    const isMovie  = innerPath.includes("/subtitles/movie/");
    const isSeries = innerPath.includes("/subtitles/series/");

    // Extrai imdbId
    const ttMatch = innerPath.match(/tt\d+/);
    const imdbId  = ttMatch ? ttMatch[0] : null;

    // Para séries, extrai season e episode do padrão tt123456:1:2
    let season = null, episode = null;
    if (isSeries) {
      const seMatch = innerPath.match(/tt\d+:(\d+):(\d+)/);
      if (seMatch) {
        season  = seMatch[1];
        episode = seMatch[2];
      }
    }

    console.log("[subtrans] imdbId:", imdbId, "season:", season, "ep:", episode);

    const baseUrl  = "https://" + req.headers.host + "/" + token;
    const subtitles = [];

    if (imdbId) {
      try {
        // Monta URL correta para OpenSubtitles
        let apiUrl;
        if (isSeries && season && episode) {
          apiUrl = `https://opensubtitles-v3.strem.io/subtitles/series/${imdbId}:${season}:${episode}.json`;
        } else {
          apiUrl = `https://opensubtitles-v3.strem.io/subtitles/movie/${imdbId}.json`;
        }

        console.log("[subtrans] OpenSubtitles API:", apiUrl);
        const apiResp = await fetch(apiUrl);
        console.log("[subtrans] OpenSubtitles status:", apiResp.status);

        if (apiResp.ok) {
          const data = await apiResp.json();
          const candidates = (data.subtitles || []).filter(s => SUPPORTED_LANGS[s.lang]);

          console.log("[subtrans] Candidatos:", candidates.length);

          // Tenta traduzir os 2 primeiros candidatos (para ter fallback)
          for (let i = 0; i < Math.min(2, candidates.length); i++) {
            const sub = candidates[i];
            const from = SUPPORTED_LANGS[sub.lang];

            // URL aponta para o endpoint /translate deste próprio addon
            const translateUrl =
              `${baseUrl}/translate?url=${encodeURIComponent(sub.url)}&from=${from}`;

            subtitles.push({
              id:   sub.id + "-pt-" + i,
              url:  translateUrl,
              lang: "por",
              title: `[PT-BR] traduzido de ${sub.lang.toUpperCase()}`
            });
          }

          console.log("[subtrans] Legendas montadas:", subtitles.length);
        }
      } catch (err) {
        console.error("[subtrans] OpenSubtitles error:", err.message);
      }
    }

    // Se não encontrou nada, retorna lista vazia (melhor que fallback com SRT ruim)
    if (subtitles.length === 0) {
      console.log("[subtrans] Nenhuma legenda encontrada para", imdbId);
    }

    res.writeHead(200, { ...CORS, "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({ subtitles }));
  }

  console.log("[subtrans] 404:", innerPath);
  res.writeHead(404, { ...CORS, "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}
