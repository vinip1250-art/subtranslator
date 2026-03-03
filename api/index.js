import { translateSrt } from "../lib/subtitleTranslator.js";
import fetch from "node-fetch";

const manifest = {
  id: "org.syncforhub.subtrans",
  version: "1.0.0",
  name: "PT-BR Auto Translate",
  description: "Sempre disponivel",
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

const VALID_TOKENS = new Set([
  process.env.TOKEN_USER_1,
  process.env.TOKEN_USER_2
].filter(Boolean));

function extractToken(path) {
  if (path.length < 3) return null;
  const slash1 = path.indexOf("/", 1);
  if (slash1 === -1) return null;
  return path.substring(1, slash1);
}

export default async function handler(req, res) {
  const url = new URL(req.url, "https://" + req.headers.host);
  const path = url.pathname;

  console.log("Path: " + path);

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }

  const token = extractToken(path);
  if (!token || !VALID_TOKENS.has(token)) {
    console.log("Token invalid: " + token);
    res.writeHead(403, CORS);
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }

  const innerPath = path.replace("/" + token, "");
  console.log("Inner: " + innerPath);

  if (innerPath === "/" || innerPath === "/manifest.json") {
    res.writeHead(200, CORS);
    return res.end(JSON.stringify(manifest));
  }

  if (innerPath.indexOf("/subtitles/") === 0 && innerPath.endsWith(".json")) {
    const dotJsonPos = innerPath.lastIndexOf(".json");
    const fullVideoPart = innerPath.substring(10, dotJsonPos);
    const slashPos = fullVideoPart.indexOf("/");
    const type = fullVideoPart.substring(0, slashPos);
    const videoId = fullVideoPart.substring(slashPos + 1);

    console.log("Type: " + type + " ID: " + videoId.substring(0, 20) + "...");

    const SUPPORTED = { eng: "en", en: "en", jpn: "ja", spa: "es", fra: "fr", deu: "de", ita: "it" };

    let candidateSubs = [];
    try {
      const apiUrl = "https://opensubtitles-v3.strem.io/subtitles/" + type + "/" + videoId + ".json";
      console.log("API: " + apiUrl.substring(0, 60));

      const apiResp = await fetch(apiUrl);
      if (apiResp.ok) {
        const data = await apiResp.json();
        candidateSubs = (data.subtitles || []).filter(function(s) {
          return SUPPORTED[s.lang] !== undefined;
        });
        console.log("Candidates: " + candidateSubs.length);
      }
    } catch (e) {
      console.log("API error: " + e.message);
    }

    const translated = [];
    for (let i = 0; i < Math.min(3, candidateSubs.length); i++) {
      const sub = candidateSubs[i];
      try {
        const sourceLang = SUPPORTED[sub.lang];
        const srtResp = await fetch(sub.url);
        const srtText = await srtResp.text();
        const ptText = await translateSrt(srtText, sourceLang, "pt");

        translated.push({
          id: sub.id + "-pt",
          url: "data:text/plain;base64," + Buffer.from(ptText).toString("base64"),
          lang: "por",
          title: "[PT-BR] (" + sub.lang.toUpperCase() + ")"
        });
        console.log("Translated: " + sub.title);
      } catch (e) {
        console.log("Translate fail: " + e.message);
      }
    }

    if (translated.length === 0) {
      translated.push({
        id: "fallback-pt",
        url: "data:text/plain;base64,WW5hbWFyZXZlIGVzdGUgdmVyaWZpY2Fkb3MuIFVzZSBvdHJhcyBsZWdlbmRhcy4=",
        lang: "por",
        title: "[PT-BR] Sem legendas originais"
      });
    }

    console.log("Send: " + translated.length + " subs");
    res.writeHead(200, CORS);
    return res.end(JSON.stringify({ subtitles: translated }));
  }

  console.log("404");
  res.writeHead(404, CORS);
  res.end(JSON.stringify({ error: "Not found" }));
}
