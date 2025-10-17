import axios from 'axios';
import xml2js from 'xml2js';

const parser = new xml2js.Parser();

async function fetchFromArxiv(query) {
    try {
        console.log('Fetching from arXiv:', query);
        const baseUrl = 'http://export.arxiv.org/api/query';
        const response = await axios.get(baseUrl, {
            params: {
                search_query: `all:${query}`,
                start: 0,
                max_results: 5
            },
            timeout: 10000 // 10 second timeout
        });

        const result = await parser.parseStringPromise(response.data);
        if (!result.feed.entry) {
            console.log('No results found in arXiv');
            return [];
        }

        return result.feed.entry.map(entry => ({
            title: entry.title[0],
            authors: entry.author.map(author => author.name[0]),
            summary: entry.summary[0],
            link: entry.id[0],
            source: 'arxiv'
        }));
    } catch (error) {
        console.error('arXiv API error:', error.message);
        if (error.response) {
            console.error('arXiv API response:', error.response.data);
        }
        return []; // Return empty array instead of throwing
    }
}

async function fetchFromPubMed(query) {
    try {
        console.log('Fetching from PubMed:', query);
        const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
        
        // First get IDs
        const searchResponse = await axios.get(`${baseUrl}/esearch.fcgi`, {
            params: {
                db: 'pubmed',
                term: query,
                retmax: 5,
                format: 'json'
            },
            timeout: 10000 // 10 second timeout
        });

        const ids = searchResponse.data.esearchresult.idlist;
        if (!ids || ids.length === 0) {
            console.log('No results found in PubMed');
            return [];
        }

        // Then fetch details
        const detailsResponse = await axios.get(`${baseUrl}/esummary.fcgi`, {
            params: {
                db: 'pubmed',
                id: ids.join(','),
                retmode: 'json'
            },
            timeout: 10000
        });

        return Object.values(detailsResponse.data.result || {})
            .filter(paper => paper.uid)
            .map(paper => ({
                title: paper.title || 'No title available',
                authors: paper.authors?.map(author => author.name) || [],
                summary: paper.abstract || paper.title || 'No abstract available',
                link: `https://pubmed.ncbi.nlm.nih.gov/${paper.uid}`,
                source: 'pubmed'
            }));
    } catch (error) {
        console.error('PubMed API error:', error.message);
        if (error.response) {
            console.error('PubMed API response:', error.response.data);
        }
        return []; // Return empty array instead of throwing
    }
}

export async function fetchPapers(query, source = 'all') {
    if (!query || typeof query !== 'string') {
        throw new Error('Invalid query parameter');
    }

    query = query.trim();
    if (query.length < 2) {
        throw new Error('Query must be at least 2 characters long');
    }

    console.log(`Fetching papers for "${query}" from ${source}`);
    try {
        let papers = [];
        
        if (source === 'all' || source === 'arxiv') {
            const arxivPapers = await fetchFromArxiv(query);
            papers = [...papers, ...arxivPapers];
        }
        
        if (source === 'all' || source === 'pubmed') {
            const pubmedPapers = await fetchFromPubMed(query);
            papers = [...papers, ...pubmedPapers];
        }

        console.log(`Found ${papers.length} papers in total`);
        return papers;
    } catch (error) {
        console.error('Error fetching papers:', error);
        throw new Error(`Failed to fetch papers: ${error.message}`);
    }
} 