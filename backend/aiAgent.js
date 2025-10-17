// Simple text summarization function
function extractSentences(text, maxSentences = 3) {
    // Split text into sentences (basic implementation)
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    
    // If text is short enough, return as is
    if (sentences.length <= maxSentences) {
        return text;
    }

    // Score sentences based on position and length
    const scoredSentences = sentences.map((sentence, index) => ({
        text: sentence.trim(),
        score: (sentences.length - index) + (sentence.split(' ').length / 20),
        index
    }));

    // Sort by score and take top sentences
    const topSentences = scoredSentences
        .sort((a, b) => b.score - a.score)
        .slice(0, maxSentences)
        .sort((a, b) => a.index - b.index);

    return topSentences.map(s => s.text).join(' ');
}

export async function analyzeDocuments(documents) {
    try {
        if (!Array.isArray(documents)) {
            throw new Error("Input must be an array of documents");
        }

        console.log('Processing', documents.length, 'documents');

        return documents.map((doc, index) => {
            try {
                const textToSummarize = doc.summary || doc.title || (typeof doc === 'string' ? doc : '');
                
                if (!textToSummarize || typeof textToSummarize !== 'string') {
                    throw new Error("Invalid document format: no valid text found to summarize");
                }

                if (textToSummarize.length < 100) {
                    console.log(`Document ${index} too short, returning original`);
                    return textToSummarize;
                }

                console.log(`Summarizing document ${index}, length: ${textToSummarize.length}`);
                const summary = extractSentences(textToSummarize);
                console.log(`Document ${index} summarized successfully`);
                
                return summary;
            } catch (docError) {
                console.error(`Error processing document ${index}:`, docError);
                return "Error generating summary: " + docError.message;
            }
        });
    } catch (error) {
        console.error("Error in summarization:", error);
        return [];
    }
}
