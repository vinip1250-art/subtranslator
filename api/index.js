// Idiomas suportados para tradução → PT-BR
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
    candidateSubs = (data.subtitles || []).filter(
      s => SUPPORTED[s.lang] !== undefined
    );
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
    const ptText = await translateSrt(srtText, sourceLang, "pt");

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
