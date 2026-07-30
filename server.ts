import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import app from "./api/app";

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
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
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
