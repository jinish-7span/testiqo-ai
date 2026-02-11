import { Pinecone } from "@pinecone-database/pinecone";

if (!process.env.PINECONE_API_KEY) {
    throw new Error("Missing PINECONE_API_KEY");
}

export const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});

export const getIndex = () => {
    const indexName = process.env.PINECONE_INDEX_NAME;
    if (!indexName) throw new Error("Missing PINECONE_INDEX_NAME");
    return pinecone.index(indexName);
};
