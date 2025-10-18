import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { analyzeDocuments, generateEmbedding } from "./aiAgent.js";
import { fetchPapers } from "./paperFetcher.js";
import { ChromaClient } from "chromadb";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize ChromaDB client
let chromaClient;
let chromaInitialized = false;

// Async initialization function for ChromaDB
async function initChromaDB() {
  try {
    chromaClient = new ChromaClient({ 
      path: "http://localhost:8000" 
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

// Middleware
app.use(cors());
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

// Routes
app.post("/api/search", async (req, res) => {
  try {
    console.log("Search request body:", req.body);
    const { query, source } = req.body;

    if (!query) {
      return res.status(400).json({ error: "Query parameter is required" });
    }

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

        console.log("Querying ChromaDB for similar documents...");
        const chromaResults = await collection.query({
          queryEmbeddings: [queryEmbedding],
          nResults: 5,
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