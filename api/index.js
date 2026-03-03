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

export default async function handler(req, res) {
  const url = new URL(req.url, "https://" + req.headers.host);
  const path = url.pathname;

  console.log("Path: " + path);

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }

  // Extrair token simples
  const tokenEnd = path.indexOf("/", 1);
  const token = tokenEnd > 0 ? path.substring(1, tokenEnd) : null;
  if (!token || !VALID_TOKENS.has(token)) {
    console.log("Token invalid");
    res.writeHead(403, CORS);
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }

  const innerPath = path.substring(tokenEnd);
  console.log("Inner: " + innerPath);

  if (innerPath === "/" || innerPath === "/manifest.json") {
    res.writeHead(200, CORS);
    return res.end(JSON.stringify(manifest));
  }

  // Parsing ROBUSTO para subtitles
  if (innerPath.indexOf("/subtitles/") === 0 && innerPath.endsWith(".json")) {
    const endPos = innerPath.lastIndexOf(".json");
    const pathAfterSubtitles = innerPath.substring(10, endPos);

    // Type eh sempre ate o primeiro /
    const firstSlash = pathAfterSubtitles.indexOf("/");
    const type = pathAfterSubtitles.substring(0, firstSlash);
    const videoId = pathAfterSubtitles.substring(firstSlash + 1);

    console.log("Type: [" + type + "] ID: [" + videoId.substring(0, 30) + "]");

    const SUPPORTED = { eng: "en", en: "en", jpn: "ja", spa: "es", fra: "fr", deu: "de", ita: "it" };

    let candidateSubs = [];
    try {
      const apiUrl = "https://opensubtitles-v3.strem.io/subtitles/" + type + "/" + videoId + ".json";
      console.log("API call: " + apiUrl.substring(0, 70));

      const apiResp = await fetch(apiUrl);
      console.log("API status: " + apiResp.status);

      if (apiResp.ok) {
        const data = await apiResp.json();
        candidateSubs = (data.subtitles || []).filter(function(s) {
          return SUPPORTED[s.lang] !== undefined;
        });
        console.log("Found candidates: " + candidateSubs.length);
      } else {
        console.log("API failed: " + apiResp.status);
      }
    } catch (e) {
      console.log("API error: " + e.message);
    }

    const translated = [];
    for (let i = 0; i < Math.min(3, candidateSubs.length); i++) {
      const sub = candidateSubs[i];
      try {
        const sourceLang = SUPPORTED[sub.lang];
        console.log("Downloading sub: " + sub.lang + " " + sub.url.substring(0, 50));

        const srtResp = await fetch(sub.url);
        const srtText = await srtResp.text();
        const ptText = await translateSrt(srtText, sourceLang, "pt");

        translated.push({
          id: sub.id + "-pt",
          url: "data:text/plain;base64," + Buffer.from(ptText).toString("base64"),
          lang: "por",
          title: "[PT-BR] (" + sub.lang.toUpperCase() + ")"
        });
        console.log("Translated OK: " + sub.title);
      } catch (e) {
        console.log("Translation failed: " + e.message);
      }
    }

    // Fallback SEMPRESempre
    if (translated.length === 0) {
      console.log("Using fallback");
      translated.push({
        id: "fallback-pt",
        url: "data:text/plain;base64,WzEwMF0KMCoxCiAgMDowMDowMDAgLS0+IDAwOjAwOjAwMDgKWW5hbWFyZXZlIGVzdGUgdmVyaWZpY2Fkb3MuIFVzZSBvdHJhcyBsZWdlbmRhcy4KClsxMDBdCjEgMApcbiAwMDowMDowMTAwIC0tPiAwMDowMDowMjAwXG5cblsyMDBdCjIgMFxuXG4gMDA6MDA6MDIwMCAtLT4gMDA6MDA6MDMwMFxuXG5bMzAwXQozIDBcblxuIDAwOjAwOjAzMDAgLS0+IDAwOjAwOjA0MDBcblxuW2VuZF0=",
        lang: "por",
        title: "[PT-BR] Fallback - Sem legendas originais"
      });
    }

    console.log("Final count: " + translated.length);
    res.writeHead(200, CORS);
    return res.end(JSON.stringify({ subtitles: translated }));
  }

  console.log("Not subtitles path");
  res.writeHead(404, CORS);
  res.end(JSON.stringify({ error: "Not found" }));
}
