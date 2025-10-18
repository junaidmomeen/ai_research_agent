import { useState } from 'react';
import { FaSearch, FaHistory } from 'react-icons/fa';
import './App.css';

function App() {
    const [query, setQuery] = useState('');
    const [source, setSource] = useState('all');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState([]);
    const [error, setError] = useState(null);

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!query.trim()) {
            setError('Please enter a search query');
            return;
        }
        
        setLoading(true);
        setError(null);
        setResults([]);

        try {
            const response = await fetch('/api/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: query.trim(), source }),
            });

            if (!response.ok) {
                throw new Error('Search failed');
            }

            const data = await response.json();
            if (!data.papers || data.papers.length === 0) {
                setError('No results found. Try a different search term.');
                return;
            }

            setResults(data.papers.map((paper, index) => ({
                ...paper,
                summary: data.summaries[index] || 'Summary not available'
            })));
        } catch (err) {
            setError('Failed to fetch results. Please try again.');
            console.error('Search error:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-black text-white py-4 px-3 md:px-4">
            <div className="flex justify-center">
                <div className="w-full lg:w-10/12 xl:w-8/12">
                    <h1 className="text-center text-2xl font-bold mb-4">AI Research Assistant</h1>
                    <form onSubmit={handleSearch} className="mb-4">
                        <div className="flex flex-wrap -mx-2 items-center">
                            <div className="w-full md:w-8/12 px-2 mb-2 md:mb-0">
                                <input
                                    type="text"
                                    placeholder="Search for research papers..."
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    disabled={loading}
                                    className="w-full p-3 border border-gray-700 bg-gray-800 text-white rounded-md text-lg"
                                />
                            </div>
                            <div className="w-full md:w-2/12 px-2 mb-2 md:mb-0">
                                <select
                                    value={source}
                                    onChange={(e) => setSource(e.target.value)}
                                    disabled={loading}
                                    className="w-full p-3 border border-gray-700 bg-gray-800 text-white rounded-md text-lg"
                                >
                                    <option value="all">All Sources</option>
                                    <option value="arxiv">arXiv</option>
                                    <option value="pubmed">PubMed</option>
                                </select>
                            </div>
                            <div className="w-full md:w-2/12 px-2">
                                <button 
                                    type="submit" 
                                    className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-md text-lg flex items-center justify-center"
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                    ) : (
                                        <>
                                            <FaSearch className="mr-2" />
                                            Search
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </form>

                    {error && (
                        <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded relative text-center mb-4" role="alert">
                            {error}
                        </div>
                    )}

                    {results.length > 0 && (
                        <div className="results-container">
                            {results.map((paper, index) => (
                                <div key={index} className="bg-gray-800 shadow-md rounded-lg p-4 mb-4">
                                    <h2 className="text-xl font-semibold mb-2">{paper.title}</h2>
                                    <h3 className="text-gray-400 text-sm mb-3">
                                        {paper.authors.join(', ')}
                                    </h3>
                                    <p className="text-gray-300 mb-4">
                                        <strong className="font-bold">Summary:</strong><br />
                                        {paper.summary}
                                    </p>
                                    <a 
                                        href={paper.link} 
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-block bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md mt-2"
                                    >
                                        Read Full Paper
                                    </a>
                                    <div className="text-gray-400 text-sm text-right mt-2">
                                        Source: {paper.source}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;