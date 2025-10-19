import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { analyzeDocuments, generateEmbedding } from "./aiAgent.js";
import { fetchPapers } from "./paperFetcher.js";
import { ChromaClient } from "chromadb";

dotenv.config();

// ✅ PRIORITY 2.1: Validate required environment variables at startup
const requiredEnvVars = ['OPENAI_API_KEY'];
requiredEnvVars.forEach(key => {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    console.error(`Please set ${key} in your .env file`);
    process.exit(1);
  }
});

const app = express();
let PORT = process.env.PORT || 3000;

// Initialize ChromaDB client
let chromaClient;
let chromaInitialized = false;

// Async initialization function for ChromaDB
async function initChromaDB() {
  try {
    chromaClient = new ChromaClient({ 
      path: process.env.CHROMA_URL || "http://localhost:8000" 
    });
    
    // Test connection by getting heartbeat
    console.log("Attempting to connect to ChromaDB...");
    
    // Create or get collection to verify connection
    await chromaClient.getOrCreateCollection({
      name: "research_papers",
    });
    
    chromaInitialized = true;
    console.log("✅ ChromaDB connected successfully!");
  } catch (error) {
    console.error("❌ Error initializing ChromaDB:", error.message);
    console.error("The application will continue without ChromaDB (no persistent storage)");
    chromaInitialized = false;
  }
}

// ✅ PRIORITY 2.2: Restrict CORS to your frontend only
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

app.use(express.json());

// Remove Content-Security-Policy header to prevent blocking errors
app.use((req, res, next) => {
  res.removeHeader("Content-Security-Policy");
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ✅ PRIORITY 2.3: Rate limiting for search endpoint
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per 15-minute window
  message: { 
    error: 'Too many search requests. Please try again in 15 minutes.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  handler: (req, res) => {
    console.log(`⚠️ Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many search requests. Please try again in 15 minutes.',
      retryAfter: '15 minutes'
    });
  }
});

// ✅ PRIORITY 1.1: Input validation middleware
const validateSearchInput = (req, res, next) => {
  const { query, source } = req.body;
  
  // Check if query exists
  if (!query) {
    return res.status(400).json({ error: "Query parameter is required" });
  }
  
  // Check if query is a string
  if (typeof query !== 'string') {
    return res.status(400).json({ error: "Query must be a string" });
  }
  
  // Trim whitespace
  req.body.query = query.trim();
  
  // Check minimum length
  if (req.body.query.length < 2) {
    return res.status(400).json({ 
      error: "Query must be at least 2 characters long" 
    });
  }
  
  // Check maximum length (prevent abuse)
  if (req.body.query.length > 200) {
    return res.status(400).json({ 
      error: "Query too long (maximum 200 characters)" 
    });
  }
  
  // Validate source parameter if provided
  if (source && !['all', 'arxiv', 'pubmed'].includes(source)) {
    return res.status(400).json({ 
      error: "Invalid source. Must be 'all', 'arxiv', or 'pubmed'" 
    });
  }
  
  next();
};

// Routes - Apply rate limiting and validation to search endpoint
app.post("/api/search", searchLimiter, validateSearchInput, async (req, res) => {
  try {
    console.log("Search request body:", req.body);
    const { query, source } = req.body;

    let relevantPapers = [];
    let relevantSummaries = [];
    let newPapers = [];
    let newSummaries = [];

    // Step 1: Query ChromaDB for existing relevant papers
    if (chromaInitialized && chromaClient) {
      try {
        const collection = await chromaClient.getOrCreateCollection({
          name: "research_papers",
        });

        console.log("Generating embedding for query...");
        const queryEmbedding = await generateEmbedding(query);

        let where = {};
        if (source && source !== 'all') {
          where = { source: source };
        }

        console.log("Querying ChromaDB for similar documents with where clause:", where);
        const chromaResults = await collection.query({
          queryEmbeddings: [queryEmbedding],
          nResults: 5,
          where: where,
          include: ['documents', 'metadatas', 'distances']
        });

        // Process ChromaDB results
        if (chromaResults && chromaResults.ids && chromaResults.ids[0] && chromaResults.ids[0].length > 0) {
          chromaResults.ids[0].forEach((id, index) => {
            const metadata = chromaResults.metadatas[0][index];
            const document = chromaResults.documents[0][index];
            const distance = chromaResults.distances[0][index];
            
            relevantPapers.push({
              title: metadata.title,
              authors: metadata.authors,
              source: metadata.source,
              summary: document,
              relevanceScore: (1 - distance).toFixed(2) // Convert distance to similarity
            });
            relevantSummaries.push(document);
          });
          console.log(`✅ Found ${relevantPapers.length} relevant papers in ChromaDB`);
        } else {
          console.log("No existing papers found in ChromaDB");
        }
      } catch (chromaQueryError) {
        console.error("ChromaDB query error:", chromaQueryError.message);
        // Continue without ChromaDB results
      }
    } else {
      console.log("ChromaDB not initialized - skipping retrieval from database");
    }

    // Step 2: Fetch new papers from external sources
    console.log(`Fetching papers for query: "${query}" from source: ${source || 'all'}`);
    const fetchedPapers = await fetchPapers(query, source);
    console.log(`Fetched ${fetchedPapers.length} papers from external sources`);

    // Step 3: Deduplicate - filter out papers already in ChromaDB
    const existingPaperTitles = new Set(
      relevantPapers.map(p => p.title.toLowerCase().trim())
    );
    
    newPapers = fetchedPapers.filter(
      fp => !existingPaperTitles.has(fp.title.toLowerCase().trim())
    );

    console.log(`${newPapers.length} new papers found after deduplication`);

    // Step 4: Analyze new papers and add to ChromaDB
    if (newPapers.length > 0) {
      console.log(`Generating AI summaries for ${newPapers.length} new papers...`);
      newSummaries = await analyzeDocuments(newPapers);
      console.log(`✅ Generated ${newSummaries.length} summaries`);

      // Add new papers to ChromaDB
      if (chromaInitialized && chromaClient) {
        try {
          const collection = await chromaClient.getOrCreateCollection({
            name: "research_papers",
          });

          // Generate embeddings for new summaries
          const embeddings = await Promise.all(
            newSummaries.map(summary => generateEmbedding(summary))
          );

          await collection.add({
            ids: newPapers.map((_, i) => `paper_${Date.now()}_${i}`),
            embeddings: embeddings,
            documents: newSummaries,
            metadatas: newPapers.map((paper) => ({
              title: paper.title,
              authors: paper.authors,
              source: paper.source,
              addedAt: new Date().toISOString()
            })),
          });
          
          console.log(`✅ Successfully added ${newPapers.length} new papers to ChromaDB`);
        } catch (chromaAddError) {
          console.error("ChromaDB add error:", chromaAddError.message);
          console.error("Papers will still be returned but not stored permanently");
        }
      } else {
        console.log("⚠️ ChromaDB not available - papers will not be stored permanently");
      }
    }

    // Step 5: Combine and return all results
    const allPapers = [...relevantPapers, ...newPapers];
    const allSummaries = [...relevantSummaries, ...newSummaries];

    console.log(`✅ Search completed successfully - returning ${allPapers.length} total papers`);
    
    res.json({
      papers: allPapers,
      summaries: allSummaries,
      total: allPapers.length,
      fromCache: relevantPapers.length,
      newlyFetched: newPapers.length,
      chromaStatus: chromaInitialized ? "connected" : "disconnected"
    });

  } catch (error) {
    console.error("❌ Search error:", error);
    res.status(500).json({
      error: "Failed to process search request",
      details: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    chromaDB: chromaInitialized ? "connected" : "disconnected",
    port: PORT
  });
});

// ChromaDB status endpoint
app.get("/api/chroma-status", async (req, res) => {
  if (!chromaInitialized) {
    return res.json({
      status: "disconnected",
      message: "ChromaDB is not initialized"
    });
  }

  try {
    const collection = await chromaClient.getOrCreateCollection({
      name: "research_papers",
    });
    const count = await collection.count();
    
    res.json({
      status: "connected",
      documentsStored: count,
      collectionName: "research_papers"
    });
  } catch (error) {
    res.json({
      status: "error",
      message: error.message
    });
  }
});

app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

// Root route
app.get("/", (req, res) => {
  res.json({
    message: "AI Research Agent API",
    status: "running",
    version: "1.0.0",
    chromaDB: chromaInitialized ? "connected" : "disconnected",
    endpoints: {
      search: "POST /api/search",
      health: "GET /api/health",
      chromaStatus: "GET /api/chroma-status"
    },
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});

// Start server with retry logic
const startServer = async (retries = 5) => {
  try {
    const server = app.listen(PORT, async () => {
      console.log("\n" + "=".repeat(50));
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log("=".repeat(50) + "\n");

      // Initialize ChromaDB after server starts
      await initChromaDB();
      
      console.log("\n" + "=".repeat(50));
      console.log("✅ Server is ready to accept requests!");
      console.log("=".repeat(50) + "\n");
    });

    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.log(`⚠️ Port ${PORT} is busy, trying alternative port...`);
        server.close();
        PORT++;
        startServer(retries - 1);
      } else {
        console.error("❌ Server error:", error);
      }
    });
  } catch (error) {
    if (retries > 0 && error.code === "EADDRINUSE") {
      console.log(`Retrying with port ${PORT + 1}...`);
      PORT++;
      await startServer(retries - 1);
    } else {
      console.error("❌ Failed to start server:", error);
      process.exit(1);
    }
  }
};

startServer();