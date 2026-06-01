import { aiChat } from "../lib/ai.js";
import { buildBotProfile } from "../lib/botProfile.js";

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function splitSentences(value) {
  const text = normalizeWhitespace(value);
  const matches = text.match(/[^.!?]+[.!?]+(?:["')\]]+)?/g);
  if (matches?.length) return matches.map((sentence) => normalizeWhitespace(sentence)).filter(Boolean);
  return text ? [text.endsWith(".") ? text : `${text}.`] : [];
}

function exactThreeSentences(value) {
  const sentences = splitSentences(value).slice(0, 3);

  while (sentences.length < 3) {
    sentences.push("The source does not provide enough additional accessible detail for a fuller summary.");
  }

  return sentences.join(" ");
}

export async function summarizeDocument(document) {
  const sourceText = normalizeWhitespace(document.text).slice(0, 12_000);
  const title = normalizeWhitespace(document.title || "Untitled source").slice(0, 300);

  const messages = [
    {
      role: "system",
      content: buildBotProfile()
    },
    {
      role: "system",
      content: "Summarize the provided source in exactly 3 complete sentences. Use only information supported by the source text. Do not use bullets, headings, markdown, citations, or extra commentary."
    },
    {
      role: "user",
      content: `Source type: ${document.sourceType}\nTitle: ${title}\nURL: ${document.url}\nContent:\n${sourceText}`
    }
  ];

  const result = await aiChat({
    messages,
    meta: {
      sourceType: document.sourceType,
      host: (() => {
        try {
          return new URL(document.url).hostname;
        } catch {
          return "unknown";
        }
      })()
    }
  });

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    content: exactThreeSentences(result.content)
  };
}
