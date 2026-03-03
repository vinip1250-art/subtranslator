import { translateSrt } from "../lib/subtitleTranslator.js";
import fetch from "node-fetch";

const manifest = {
  id: "org.syncforhub.subtrans",
  version: "1.0.0",
  name: "Sub EN→PT-BR",
  description: "Traduz legendas em inglês para português automaticamente.",
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

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const path = url.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }

  // GET /manifest.json
  if (path === "/" || path === "/manifest.json") {
    res.writeHead(200, CORS);
    return res.end(JSON.stringify(manifest));
  }

  // GET /subtitles/:type/:id.json
  const subMatch = path.match(/^\/subtitles\/([^/]+)\/([^/]+)\.json$/);
  if (subMatch) {
    const [, type, id] = subMatch;

    const openSubsUrl =
      `https://opensubtitles-v3.strem.io/subtitles/${type}/${id}.json`;

    let englishSubs = [];
    try {
      const upstream = await fetch(openSubsUrl);
      if (upstream.ok) {
        const data = await upstream.json();
        englishSubs = (data.subtitles || []).filter(
          s => s.lang === "eng" || s.lang === "en"
        );
      }
    } catch (e) {
      console.error("OpenSubs fetch error", e.message);
    }

    const translated = [];
    for (const sub of englishSubs.slice(0, 3)) { // max 3 para não estourar timeout
      try {
        const srtRes = await fetch(sub.url);
        const srtText = await srtRes.text();
        const ptText = await translateSrt(srtText);

        translated.push({
          id: sub.id + "-pt",
          url: "data:text/plain;base64," + Buffer.from(ptText).toString("base64"),
          lang: "por",
          title: (sub.title || "Legenda") + " [PT-BR]"
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
