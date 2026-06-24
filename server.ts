import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import cors from "cors";

// Import handlers from our Vercel-ready API folder
// Note: In local dev, we manually route these.
import uploadHandler from "./api/upload.ts";
import healthHandler from "./api/health.ts";
import analyzeHandler from "./api/analyze.ts";
import resultHandler from "./api/result.ts";
import localImageHandler from "./api/local-image.ts";

let __filename = "";
let __dirname = "";
try {
  __filename = fileURLToPath(import.meta.url);
  __dirname = path.dirname(__filename);
} catch (e) {
  // CommonJS fallback or safe default
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  // Add CORS
  app.use(cors());

  // Monitor response headers and status codes for API routes
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      const originalSend = res.send;
      res.send = function (body) {
        console.log(`[MONITOR] Outgoing API Response: ${req.method} ${req.path} -> Status ${res.statusCode}, Content-Type: ${res.get('Content-Type')}`);
        return originalSend.apply(this, [body]);
      };
    }
    next();
  });

  // Middleware for API routes (Selective Body Parsing)
  app.use((req, res, next) => {
    // Log every API request
    if (req.path.startsWith('/api')) {
      console.log(`[SERVER] API Request: ${req.method} ${req.path}`);
    }

    // Skip body parsing for uploads to let Busboy handle it directly
    if (req.path === "/api/upload" || req.path === "/api/upload/") {
      return next();
    }
    
    // For other API routes, parse JSON
    if (req.path.startsWith('/api')) {
      return express.json()(req, res, next);
    }
    
    next();
  });

  // Adapt Vercel handlers to Express for local dev
  const adapt = (handler: any) => async (req: any, res: any) => {
    try {
      console.log(`[ADAPTER] Calling handler for ${req.path}`);
      await handler(req, res);
    } catch (err: any) {
      console.error("[ADAPTER] API Handler Error:", err);
      if (!res.headersSent) {
        res.status(500).json({ 
          error: "Internal Server Error", 
          details: err.message,
          path: req.path
        });
      }
    }
  };

  // Health
  app.get("/api/health", adapt(healthHandler));

  // Local Image Retrieval Fallback
  app.get("/api/local-image", adapt(localImageHandler));

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
  const distPath = path.join(process.cwd(), "dist");
  const isRunningTs = process.argv[1] ? process.argv[1].endsWith("server.ts") : false;
  const useVite = process.env.NODE_ENV !== "production" || !fs.existsSync(path.join(distPath, "index.html")) || isRunningTs;

  if (useVite) {
    console.log("[SERVER] Starting in development mode with Vite middleware.");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("[SERVER] Starting in production mode serving static files.");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Development server running at http://localhost:${PORT}`);
    console.log(`API routes (Vercel-compatible) are mapped for local development.`);
  });
}

startServer();
