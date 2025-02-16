import express, { Request, Response } from "express";
import { createBrowserAgent, BrowserAgent } from "./index.js";

const app = express();
app.use(express.json());

let browserAgent: BrowserAgent | null = null;

// Initialize the browser agent
async function initializeBrowserAgent() {
  if (!browserAgent) {
    browserAgent = await createBrowserAgent();
  }
  return browserAgent;
}

interface SearchRequest {
  query: string;
}

// Handle search requests
app.post("/search", async (req: Request<{}, {}, SearchRequest>, res: Response) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    const agent = await initializeBrowserAgent();
    const publicUrl = await agent.performSearch(query);
    
    res.json({ 
      status: "success", 
      message: "Search started",
      publicUrl 
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ 
      error: "Failed to perform search",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get the current public URL
app.get("/url", async (_req: Request, res: Response) => {
  try {
    const agent = await initializeBrowserAgent();
    const publicUrl = await agent.getPublicUrl();
    res.json({ publicUrl });
  } catch (error) {
    console.error("URL fetch error:", error);
    res.status(500).json({ 
      error: "Failed to get public URL",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Browser agent server running at http://localhost:${port}`);
}); 