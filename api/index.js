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

  console.log("1. Path: " + path);

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }

  const tokenEnd = path.indexOf("/", 1);
  const token = tokenEnd > 0 ? path.substring(1, tokenEnd) : null;
  if (!token || !VALID_TOKENS.has(token)) {
    console.log("2. Token invalid");
    res.writeHead(403, CORS);
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }

  const innerPath = path.substring(tokenEnd);
  console.log("3. Inner: " + innerPath);

  if (innerPath === "/" || innerPath === "/manifest.json") {
    console.log("4. Manifest OK");
    res.writeHead(200, CORS);
    return res.end(JSON.stringify(manifest));
  }

  // SIMPLES: sempre retorna fallback + tenta IMDB se achar tt
  if (innerPath.indexOf("/subtitles/") === 0 && innerPath.endsWith(".json")) {
    console.log("5. Subtitles path OK");

    // Procura IMDB ID no path (ttXXXXXX)
    let imdbId = null;
    const ttMatch = innerPath.match(/tt\d+/);
    if (ttMatch) {
      imdbId = ttMatch[0];
      console.log("6. Found IMDB: " + imdbId);
    }

    const translated = [];

    // Tenta OpenSubtitles com IMDB se achar
    if (imdbId) {
      try {
        const apiUrl = "https://opensubtitles-v3.strem.io/subtitles/movie/" + imdbId + ".json";
        console.log("7. API: " + apiUrl);

        const apiResp = await fetch(apiUrl);
        console.log("8. Status: " + apiResp.status);

        if (apiResp.ok) {
          const data = await apiResp.json();
          const SUPPORTED = { eng: "en", jpn: "ja", spa: "es", fra: "fr", deu: "de", ita: "it" };
          const candidates = (data.subtitles || []).filter(s => SUPPORTED[s.lang]);

          console.log("9. Candidates: " + candidates.length);

          for (let i = 0; i < Math.min(1, candidates.length); i++) {
            const sub = candidates[i];
            try {
              console.log("10. Downloading: " + sub.url.substring(0, 50));
              const srtResp = await fetch(sub.url);
              const srtText = await srtResp.text();
              const sourceLang = SUPPORTED[sub.lang];
              const ptText = await translateSrt(srtText, sourceLang, "pt");

              translated.push({
                id: sub.id + "-pt",
                url: "data:text/plain;base64," + Buffer.from(ptText).toString("base64"),
                lang: "por",
                title: "[PT-BR] from " + sub.lang.toUpperCase()
              });
              console.log("11. Translated OK");
            } catch (e) {
              console.log("12. Translation failed: " + e.message);
            }
          }
        }
      } catch (e) {
        console.log("13. API error: " + e.message);
      }
    }

    // SEMPRE fallback longo
    console.log("14. Adding fallback");
    translated.push({
      id: "fallback-pt",
      url: "data:text/plain;base64,WzEwMF0KMCoxCiAgMDowMDowMDAgLS0+IDAwOjAwOjAwMDgKTGVnZW5kYSBBVVRPTSBUUkFEVVpJREEgUEItQlIgLSBOb3NlIGVuY29udHJhbSBsZWdlbmRhcyBvYmlnYXRvcmlhcy4KClsxMDBdCjEgMApcbiAwMDowMDowMTAwIC0tPiAwMDowMDowMjAwXG5BbHVuZSB2ZW1lcyBjb20gcXVhbHF1ZXIgbGVnZW5kYSBlbSBwb3J0dWd1ZXMuXG5cblsyMDBdCjIgMFxuXG4gMDA6MDA6MDIwMCAtLT4gMDA6MDA6MDMwMFxuXG5bMzAwXQozIDBcblxuIDAwOjAwOjAzMDAgLS0+IDAwOjAwOjA0MDBcblxuW2VuZF0=",
      lang: "por",
      title: "[PT-BR] Auto Translate Fallback"
    });

    console.log("15. Send: " + translated.length);
    res.writeHead(200, CORS);
    return res.end(JSON.stringify({ subtitles: translated }));
  }

  console.log("16. 404");
  res.writeHead(404, CORS);
  res.end(JSON.stringify({ error: "Not found" }));
}
