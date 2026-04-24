import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists in public so Vite can serve it
const uploadsDir = path.join(process.cwd(), "public", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// --- In-Memory Store for Results ---
const resultsStore = new Map<string, {
  patientId: string;
  status: 'PENDING' | 'COMPLETED';
  severity?: 'LOW' | 'MEDIUM' | 'HIGH';
  condition?: string;
  confidence?: number;
  advice?: string;
  location: string;
  timestamp: string;
  imageUrl?: string;
  hospital?: {
    name: string;
    address: string;
    mapsUrl: string;
  };
}>();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Configure storage for multer
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const patientId = uuidv4();
      const ext = path.extname(file.originalname);
      cb(null, `${patientId}${ext}`);
    }
  });

  const upload = multer({ storage });

  // --- API Routes ---

  // POST /api/upload
  app.post("/api/upload", upload.single("image"), (req, res) => {
    try {
      const { location } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "No image provided" });
      }

      const patientId = path.basename(file.filename, path.extname(file.filename));
      const imageUrl = `/uploads/${file.filename}`;

      // Initialize result as PENDING
      resultsStore.set(patientId, {
        patientId,
        status: 'PENDING',
        location: location || "Unknown Location",
        timestamp: new Date().toISOString(),
        imageUrl
      });

      res.json({ patientId, message: "Upload successful. Awaiting AI analysis..." });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to process image" });
    }
  });

  // GET /api/result/:patientId
  app.get("/api/result/:patientId", (req, res) => {
    const { patientId } = req.params;
    const result = resultsStore.get(patientId);

    if (!result) {
      return res.status(404).json({ error: "Patient record not found" });
    }

    res.json(result);
  });

  // PATCH /api/result/:patientId
  app.patch("/api/result/:patientId", (req, res) => {
    const { patientId } = req.params;
    const updateData = req.body;
    
    const existing = resultsStore.get(patientId);
    if (!existing) return res.status(404).json({ error: "Patient record not found" });

    // Generate hospital info if it's a completion
    let hospital = existing.hospital;
    if (updateData.status === 'COMPLETED' && !hospital) {
      const loc = existing.location;
      hospital = {
        name: `${loc} General Hospital`,
        address: `Main St, ${loc}`,
        mapsUrl: `https://www.google.com/maps/search/hospitals+near+${encodeURIComponent(loc)}`
      };
    }

    const updated = { 
      ...existing, 
      ...updateData, 
      hospital,
      status: updateData.status || 'COMPLETED' 
    };

    resultsStore.set(patientId, updated);

    // Alert System Simulation
    if (updated.severity === 'HIGH') {
      console.warn(`[ALERT] HIGH SEVERITY DETECTED.`);
      console.warn(`[ALERT] Patient ID: ${patientId}`);
      console.warn(`[ALERT] Condition: ${updated.condition}`);
      console.warn(`[ALERT] Location: ${updated.location}`);
      console.warn(`[ALERT] Status: Immediate clinic notification simulated.`);
    }

    res.json(updated);
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
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`LOCAL SERVER: running at http://localhost:${PORT}`);
    console.log(`LOCAL UPLOADS: ${uploadsDir}`);
  });
}

startServer();
