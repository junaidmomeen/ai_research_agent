import axios from "axios";
import xml2js from "xml2js";  // Required for parsing arXiv XML data

export async function fetchResearchPapers(query) {
    console.log(`Fetching papers for query: ${query}`);

    const arxivUrl = `http://export.arxiv.org/api/query?search_query=${query}&start=0&max_results=5`;
    const pubmedUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${query}&retmode=json`;

    try {
        const arxivResponse = await axios.get(arxivUrl);
        const pubmedResponse = await axios.get(pubmedUrl);

        const papers = [
            ...extractArxivData(arxivResponse.data),
            ...extractPubMedData(pubmedResponse.data),
        ];

        return papers;
    } catch (error) {
        console.error("Error fetching research papers:", error);
        return [];
    }
}

function extractArxivData(xmlString) {
    const parser = new xml2js.Parser({ explicitArray: false });
    let papers = [];

    parser.parseString(xmlString, (err, result) => {
        if (err) {
            console.error("Error parsing arXiv XML:", err);
            return;
        }

        if (result.feed && result.feed.entry) {
            papers = result.feed.entry.map(entry => ({
                title: entry.title,
                summary: entry.summary
            }));
        }
    });

    return papers;
}

function extractPubMedData(jsonResponse) {
    if (!jsonResponse.esearchresult.idlist || jsonResponse.esearchresult.idlist.length === 0) {
        console.warn("No articles found in PubMed");
        return [];
    }
    
    return jsonResponse.esearchresult.idlist.map(id => ({
        title: `PubMed Article ID: ${id}`,
        summary: "Summary not available"
    }));
}
