import OpenAI from 'openai';

// This will hold the initialized OpenAI client
let openaiClient = null;

// This function initializes the client only when it's first needed
function getClient() {
    if (!openaiClient) {
        if (!process.env.OPENAI_API_KEY) {
            // This error will be thrown if the .env file is still not loaded correctly
            throw new Error("CRITICAL: OPENAI_API_KEY is not set in the environment. Please check your .env file and restart the server.");
        }
        openaiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }
    return openaiClient;
}

// Function to generate embeddings for a given text
export async function generateEmbedding(text) {
    try {
        if (!text || typeof text !== 'string') {
            throw new Error("Input for embedding must be a non-empty string.");
        }

        const openai = getClient();

        const embeddingResponse = await openai.embeddings.create({
            model: "text-embedding-ada-002",
            input: text,
        });

        return embeddingResponse.data[0].embedding;
    } catch (error) {
        console.error("Error generating embedding:", error);
        throw error; // Re-throw to be handled by the caller
    }
}

// Main function to analyze documents
export async function analyzeDocuments(documents) {
    try {
        if (!Array.isArray(documents)) {
            throw new Error("Input must be an array of documents");
        }

        console.log('Processing', documents.length, 'documents with GPT-4o-mini');

        // Use Promise.all to process all documents in parallel
        const summaries = await Promise.all(documents.map((doc, index) => {
            return generateSummary(doc, index);
        }));

        return summaries;

    } catch (error) {
        console.error("Error in AI analysis:", error);
        return documents.map(doc => `Failed to generate summary for "${doc.title}".`);
    }
}

// Helper function to generate a summary for a single document
async function generateSummary(doc, index) {
    try {
        const textToSummarize = doc.summary || doc.title || (typeof doc === 'string' ? doc : '');

        if (!textToSummarize || typeof textToSummarize !== 'string' || textToSummarize.length < 50) {
            console.log(`Document ${index} has insufficient content, returning original text.`);
            return textToSummarize || "No content available to summarize.";
        }

        console.log(`Summarizing document ${index} ("${doc.title}") with GPT-4o-mini...`);

        // Get the client using our lazy-loader function
        const openai = getClient();

        const chatCompletion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are an expert research assistant. Your task is to provide a detailed and well-defined summary of the following research paper abstract. Focus on the key findings, methodology, and conclusions. The summary should be comprehensive enough for a researcher to quickly grasp the paper's core contributions.`
                },
                {
                    role: "user",
                    content: textToSummarize
                }
            ],
            temperature: 0.5,
            max_tokens: 256,
        });

        const summary = chatCompletion.choices[0].message.content.trim();
        console.log(`Document ${index} summarized successfully.`);
        return summary;

    } catch (docError) {
        console.error(`Error processing document ${index} ("${doc.title}"):`, docError);
        return `Error generating summary for "${doc.title}".`;
    }
}