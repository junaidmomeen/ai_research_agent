import { ChromaClient } from "chromadb";

const client = new ChromaClient();
const collection = client.getCollection("research_summaries");

export async function saveSummary(title, summary) {
    await collection.add({ id: title, content: summary });
}

export async function getSummaries() {
    return await collection.get();
}
