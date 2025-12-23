import {Ollama} from "ollama";

const ollama1 = new Ollama({
  host: process.env.OLLAMA_BASE_URL,
});

export async function embed(text) {
  const res = await ollama1.embeddings({
    model: "nomic-embed-text",
    prompt: text
  });

  console.log("Embedding response:", res.embedding);
  return res.embedding;
}
