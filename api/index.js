import { translateSrt } from "../lib/subtitleTranslator.js";
import fetch from "node-fetch";

const manifest = {
  id: "org.syncforhub.subtrans",
  version: "1.0.0",
  name: "PT-BR Auto Translate",
  description: "Sempre disponível - traduz legendas automaticamente.",
  types: ["movie", "series"],
  catalogs: [],
  resources: ["subtitles"],
  idPrefixes: ["tt"],
  behaviorHints: {
    configurable: true,
    configurationRequired: false,
    noCache: true
  }
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Content-Type": "application/json; charset=utf-8"
};

const VALID_TOKENS = new Set([
  process.env.TOKEN_USER_1,
  process.env.TOKEN_USER_2,
].filter(Boolean));

function extractToken(path) {
  const match = path.match(/^\/([^/]+)\//);
  return match ? match[1] : null;
}

export default async function handler(req, res) {
  const url  = new URL(req.url, `https://${req.headers.host}`);
  const path = url.pathname;

  console.log("Called:", path);

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }

  const token = extractToken(path);
  if (!token || !VALID_TOKENS.has(token)) {
    console.log("Unauthorized token:", token);
    res.writeHead(403, CORS);
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }

  const innerPath = path.replace(`/${token}`, "");
  console.log("Inner path:", innerPath, "Token OK:", token);

  if (innerPath === "/" || innerPath === "/manifest.json") {
    res.writeHead(200, CORS);
    return res.end(JSON.stringify(manifest));
  }

  const subMatch = innerPath.match(/^\/subtitles\/([^/]+)\/([^/]+)\.json$/);
  if (subMatch) {
    const [, type, videoId] = subMatch;
    console.log("Subtitles request:", type, videoId);

    const SUPPORTED = {
      eng: "en", en: "en",
      jpn: "ja", ja: "ja",
      spa: "es", es: "es",
      fra: "fr", fr: "fr",
      deu: "de", de: "de",
      ita: "it", it: "it"
    };

    // Múltiplas fontes de legendas
    const sources = [
      `https://opensubtitles-v3.strem.io/subtitles/${type}/${videoId}.json`,
      `https://api.opensubtitles.com/api/v1/subtitles?query=${encodeURIComponent(videoId)}&languages=en,ja,es,fr,de,it`
    ];

    let candidateSubs = [];
    for (const source of sources) {
      try {
        console.log("Trying source:", source);
        const upstream = await fetch(source, {
          headers: { 
            "Api-Key": "Kzq3e6r5fQb9hP8mW2vT4nX7uY1oA6sJ3" 
          }
        });
        if (upstream.ok) {
          const data = await upstream.json();
          console.log("Source data keys:", Object.keys(data));

          if (data.data && Array.isArray(data.data)) {
            candidateSubs = data.data
              .map(s => ({
                id: s.attributes.files?.[0]?.file_id || s.id,
                lang: s.attributes.language,
                url: s.attributes.files?.[0]?.file_id ? 
                  `https://api.opensubtitles.com/api/v1/download` :
                  s.attributes.url,
                title: s.attributes.release
              }))
              .filter(s => SUPPORTED[s.lang]);
          } else if (data.subtitles) {
            candidateSubs = data.subtitles.filter(s => SUPPORTED[s.lang]);
          }

          if (candidateSubs.length > 0) {
            console.log("Found", candidateSubs.length, "candidate subs");
            break;
          }
        }
      } catch (e) {
        console.error(`Source ${source} error:`, e.message);
      }
    }

    const translated = [];
    for (const sub of candidateSubs.slice(0, 3)) {
      try {
        console.log("Translating sub:", sub.lang, sub.title);
        const sourceLang = SUPPORTED[sub.lang];
        const srtRes = await fetch(sub.url);
        const srtText = await srtRes.text();
        const ptText  = await translateSrt(srtText, sourceLang, "pt");

        translated.push({
          id: sub.id + "-pt",
          url: "data:text/plain;base64," + Buffer.from(ptText).toString("base64"),
          lang: "por",
          title: `[PT-BR] Auto Translate (${sub.lang.toUpperCase()})`
        });
        console.log("✅ Added PT-BR:", sub.title);
      } catch (e) {
        console.error("❌ Translate error:", e.message);
      }
    }

    // Fallback sempre visível
    if (translated.length === 0) {
      translated.push({
        id: "fallback-pt",
        url: "data:text/plain;base64,WW5hbWFyZXZlIGVzdGUgdmVyaWZpY2Fkb3MuIFVzZSBvdHJhcyBsZWdlbmRhcy4=",
        lang: "por",
        title: "[PT-BR] Auto Translate - Sem legendas originais"
      });
    }

    console.log("Returning", translated.length, "subtitles");
    res.writeHead(200, CORS);
    return res.end(JSON.stringify({ subtitles: translated }));
  }

  console.log("404:", innerPath);
  res.writeHead(404, CORS);
  res.end(JSON.stringify({ error: "Not found" }));
}
