import fetch from "node-fetch";

const API_URL = process.env.TRANSLATION_API_URL;
const API_KEY  = process.env.TRANSLATION_API_KEY;

export async function translateSubtitle(srtText, from = "en", to = "pt") {
  if (!API_URL || !API_KEY) {
    throw new Error("Missing env vars: TRANSLATION_API_URL / TRANSLATION_API_KEY");
  }

  const resp = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + API_KEY
    },
    body: JSON.stringify({ from, to, text: srtText })
  });

  if (!resp.ok) {
    throw new Error("Translation API error: " + resp.status);
  }

  const data = await resp.json();

  if (!data || !data.translated) {
    throw new Error("Invalid translation API response");
  }

  return data.translated;
}
