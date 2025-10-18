import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { analyzeDocuments } from "./aiAgent.js";
import { fetchPapers } from "./paperFetcher.js";
import { ChromaClient } from "chromadb";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize ChromaDB client
let chromaClient;
try {
  chromaClient = new ChromaClient();
} catch (error) {
  console.error("Error initializing ChromaDB:", error);
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

    console.log("Fetching papers for query:", query, "from source:", source);
    const papers = await fetchPapers(query, source);

    if (!papers || papers.length === 0) {
      return res
        .status(404)
        .json({ error: "No papers found", papers: [], summaries: [] });
    }

    console.log(`Found ${papers.length} papers, generating summaries...`);
    const summaries = await analyzeDocuments(papers);

    // Only try to store in ChromaDB if it's initialized
    if (chromaClient) {
      try {
        const collection = await chromaClient.createCollection({
          name: "research_papers",
        });

        await collection.add({
          ids: papers.map((_, i) => `paper_${i}`),
          documents: summaries,
          metadatas: papers.map((paper) => ({
            title: paper.title,
            authors: paper.authors,
            source: paper.source, // Corrected from source to paper.source
          })),
        });
      } catch (chromaError) {
        console.error("ChromaDB storage error:", chromaError);
        // Continue even if ChromaDB fails
      }
    }

    console.log("Successfully processed request");
    res.json({
      papers,
      summaries,
      total: papers.length,
    });
  } catch (error) {
    console.error("Search error details:", error);
    res.status(500).json({
      error: "Failed to process search request",
      details: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

// Add root route
app.get("/", (req, res) => {
  res.json({
    message: "AI Research Agent API",
    status: "running",
    endpoints: {
      search: "POST /api/search",
      health: "GET /api/health",
    },
  });
});
// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});

// Start server with retry logic
const startServer = async (retries = 5) => {
  try {
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    });

    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.log(`Port ${PORT} is busy, trying alternative port...`);
        server.close();
        startServer(retries - 1);
      } else {
        console.error("Server error:", error);
      }
    });
  } catch (error) {
    if (retries > 0 && error.code === "EADDRINUSE") {
      console.log(`Retrying with port ${PORT + 1}...`);
      process.env.PORT = PORT + 1;
      await startServer(retries - 1);
    } else {
      console.error("Failed to start server:", error);
      process.exit(1);
    }
  }
};

startServer();
