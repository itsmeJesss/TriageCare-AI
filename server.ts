import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import fs from "fs";

// Import handlers from our Vercel-ready API folder
// Note: In local dev, we manually route these.
import uploadHandler from "./api/upload.ts";
import healthHandler from "./api/health.ts";
import analyzeHandler from "./api/analyze/[patientId].ts";
import resultHandler from "./api/result/[patientId].ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for API routes (Selective)
  app.use((req, res, next) => {
    if (req.path === "/api/upload") {
      next(); // Don't parse body for uploads
    } else {
      express.json()(req, res, next);
    }
  });

  // Adapt Vercel handlers to Express for local dev
  const adapt = (handler: any) => async (req: any, res: any) => {
    try {
      // Vercel Request and Response are slightly different from Express, 
      // but for these simple handlers they are mostly compatible 
      // or we can shim missing stuff.
      await handler(req, res);
    } catch (err: any) {
      console.error("API Error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  };

  // Health
  app.get("/api/health", adapt(healthHandler));

  // Upload (uses Busboy, needs bodyParser disabled)
  // We use the same 'adapt' but we don't use express.json() for this one 
  // actually app.use(express.json()) is global above. 
  // Vercel handlers like upload.ts have config.api.bodyParser: false
  // Our adapt just passes req/res. 
  app.post("/api/upload", adapt(uploadHandler));

  // Analyze
  app.post("/api/analyze/:patientId", (req, res) => {
    req.query = { ...req.query, patientId: req.params.patientId };
    return adapt(analyzeHandler)(req, res);
  });

  // Result
  app.get("/api/result/:patientId", (req, res) => {
    req.query = { ...req.query, patientId: req.params.patientId };
    return adapt(resultHandler)(req, res);
  });

  app.patch("/api/result/:patientId", (req, res) => {
    req.query = { ...req.query, patientId: req.params.patientId };
    return adapt(resultHandler)(req, res);
  });

  // Catch-all for API
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Development server running at http://localhost:${PORT}`);
    console.log(`API routes (Vercel-compatible) are mapped for local development.`);
  });
}

startServer();
