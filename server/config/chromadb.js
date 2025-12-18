import { ChromaClient } from "chromadb";

const client = new ChromaClient();

export async function resetCollection(name) {
  try {
    await client.deleteCollection({ name });
  } catch (e) {
    console.error(`Error deleting collection ${name}:`, e);
  }

  return await client.createCollection({
    name,
    embeddingFunction: null,
    dimension: 768
  });
}

export async function get_Collection(name) {
  const col = await client.getCollection({ name });
  return col;
}

export async function delete_Collection(name) {
  try {
    await client.deleteCollection({ name });
  } catch (e) {
    console.error(`Error deleting collection ${name}:`, e);
  }
}