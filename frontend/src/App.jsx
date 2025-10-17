import { useState } from 'react';
import { Container, Row, Col, Form, Button, Card, Spinner } from 'react-bootstrap';
import { FaSearch, FaHistory } from 'react-icons/fa';
import 'bootstrap/dist/css/bootstrap.min.css';
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
        <Container fluid className="py-4 px-3 px-md-4">
            <Row className="justify-content-center">
                <Col xs={12} lg={10} xl={8}>
                    <h1 className="text-center">AI Research Assistant</h1>
                    <Form onSubmit={handleSearch} className="mb-4">
                        <Row className="g-2 align-items-center">
                            <Col xs={12} md={8}>
                                <Form.Control
                                    type="text"
                                    placeholder="Search for research papers..."
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    disabled={loading}
                                    className="form-control-lg"
                                />
                            </Col>
                            <Col xs={12} md={2}>
                                <Form.Select
                                    value={source}
                                    onChange={(e) => setSource(e.target.value)}
                                    disabled={loading}
                                    className="form-control-lg"
                                >
                                    <option value="all">All Sources</option>
                                    <option value="arxiv">arXiv</option>
                                    <option value="pubmed">PubMed</option>
                                </Form.Select>
                            </Col>
                            <Col xs={12} md={2}>
                                <Button 
                                    variant="primary" 
                                    type="submit" 
                                    className="w-100 btn-lg"
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <Spinner animation="border" size="sm" />
                                    ) : (
                                        <>
                                            <FaSearch className="me-2" />
                                            Search
                                        </>
                                    )}
                                </Button>
                            </Col>
                        </Row>
                    </Form>

                    {error && (
                        <div className="alert alert-danger text-center" role="alert">
                            {error}
                        </div>
                    )}

                    {results.length > 0 && (
                        <div className="results-container">
                            {results.map((paper, index) => (
                                <Card key={index} className="mb-4">
                                    <Card.Body>
                                        <Card.Title>{paper.title}</Card.Title>
                                        <Card.Subtitle className="mb-3 text-muted">
                                            {paper.authors.join(', ')}
                                        </Card.Subtitle>
                                        <Card.Text>
                                            <strong>Summary:</strong><br />
                                            {paper.summary}
                                        </Card.Text>
                                        <Button 
                                            variant="outline-primary" 
                                            href={paper.link} 
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-2"
                                        >
                                            Read Full Paper
                                        </Button>
                                    </Card.Body>
                                    <Card.Footer className="text-muted text-end">
                                        Source: {paper.source}
                                    </Card.Footer>
                                </Card>
                            ))}
                        </div>
                    )}
                </Col>
            </Row>
        </Container>
    );
}

export default App;