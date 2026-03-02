import { addonBuilder, getRouter } from "stremio-addon-sdk";
import fetch from "node-fetch";
import { translateSubtitle } from "../lib/subtitleTranslator.js";

const manifest = {
  id: "org.syncforhub.subtrans",
  version: "1.0.0",
  name: "Sub EN->PT-BR Translator",
  description: "Traduza legendas em ingles para portugues automaticamente.",
  types: ["movie", "series"],
  catalogs: [],
  resources: ["subtitles"],
  idPrefixes: ["tt"]
};

const builder = new addonBuilder(manifest);

builder.defineSubtitlesHandler(async ({ type, id, extra }) => {
  const { subtitles } = extra || {};

  if (!subtitles || !Array.isArray(subtitles)) {
    return { subtitles: [] };
  }

  const englishSubs = subtitles.filter(s => s.lang === "eng" || s.lang === "en");

  const translated = [];
  for (const sub of englishSubs) {
    try {
      const res = await fetch(sub.url);
      const originalText = await res.text();
      const translatedText = await translateSubtitle(originalText);

      translated.push({
        id: sub.id + "-pt",
        url: "data:text/plain;base64," + Buffer.from(translatedText).toString("base64"),
        lang: "por",
        title: (sub.title || "") + " [PT-BR]",
        type: sub.type || "srt"
      });
    } catch (e) {
      console.error("Subtitle translate error", e.message);
    }
  }

  return { subtitles: translated };
});

const router = getRouter(builder.getInterface());

export default async function handler(req, res) {
  router(req, res, () => {
    res.status(404).end("Not found");
  });
}
