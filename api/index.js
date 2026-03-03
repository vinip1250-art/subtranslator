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
  const match = path.match(/^/([^/]+)//);
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

  // ✅ REGEX CORRIGIDO - captura qualquer videoId até .json
  const subMatch = innerPath.match(/^/subtitles/([^/]+)/(.+?).json$/);
  if (subMatch) {
    const [, type, videoId] = subMatch;
    console.log("✅ Subtitles request:", type, videoId.substring(0, 30) + "...");

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
      // Fonte 1: Stremio OpenSubtitles V3
      const stremioUrl = `https://opensubtitles-v3.strem.io/subtitles/${type}/${videoId}.json`;
      console.log("Trying Stremio OpenSubtitles:", stremioUrl.substring(0, 60) + "...");
      
      const upstream = await fetch(stremioUrl);
      if (upstream.ok) {
        const data = await upstream.json();
        candidateSubs = (data.subtitles || []).filter(s => SUPPORTED[s.lang]);
      }
    } catch (e) {
      console.error("Stremio source error:", e.message);
    }

    const translated = [];
    for (const sub of candidateSubs.slice(0, 3)) {
      try {
        console.log("Translating:", sub.lang, sub.title?.substring(0, 30) + "...");
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
        console.log("✅ Added PT-BR:", sub.title?.substring(0, 30) + "...");
      } catch (e) {
        console.error("❌ Translate error:", e.message);
      }
    }

    // ✅ FALLBACK SEMPRE VISÍVEL
    if (translated.length === 0) {
      console.log("No subs found, adding fallback");
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
