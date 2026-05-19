import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Gemini AI Setup ---
let genAIInstance: GoogleGenAI | null = null;

function getGenAI() {
  if (!genAIInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Gemini API key is not configured. Please add GEMINI_API_KEY to your secrets.");
    }
    genAIInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return genAIInstance;
}

// --- Severity Engine (Internalized for Server Usage) ---
interface AISignals {
  condition: string;
  swelling: boolean;
  redness: boolean;
  spread: 'LOCALIZED' | 'REGIONAL' | 'SYSTEMIC';
  tissueDamage: 'NONE' | 'SURFACE' | 'NECROTIC';
  discoloration: 'MILD' | 'SEVERE';
  streaking: boolean; // lymphangitis - precursor to sepsis
  rapidSpread: boolean;
}

interface PatientSymptomLog {
  fever: boolean;
  difficultyBreathing: boolean;
  extremePain: boolean;
  confusion: boolean;
}

function calculateClinicalSeverity(ai: AISignals, patient: PatientSymptomLog) {
  let score = 0;
  const reasoning: string[] = [];

  const conditionPriorities: Record<string, number> = {
    'Cellulitis': 3,
    'Sepsis Indicator': 4,
    'Sepsis': 4,
    'Septic Shock': 4,
    'Necrotizing Fasciitis': 4,
    'Gangrene': 4,
    'Second Degree Burn': 3,
    'Third Degree Burn': 4,
    'Anaphylaxis': 4,
    'Severe Allergic Reaction': 3,
    'Chickenpox': 2,
    'Skin Abcess': 2,
    'Fungal Infection': 1,
    'Vitiligo': 1,
    'Bruise': 1,
    'Rash': 1,
  };

  const basePriority = conditionPriorities[ai.condition] || 1;
  score = basePriority;
  reasoning.push(`Base clinical priority for "${ai.condition}" is ${basePriority}/4.`);

  if (ai.tissueDamage === 'NECROTIC') {
    score = 4;
    reasoning.push("CRITICAL: Visual evidence of necrotic tissue/gangrene detected.");
  } else if (ai.spread === 'SYSTEMIC' || ai.rapidSpread) {
    score = Math.max(score, 3.5);
    reasoning.push("HIGH: Rapidly advancing or systemic distribution observed.");
  } else if (ai.spread === 'REGIONAL') {
    score += 0.5;
    reasoning.push("Regional spread detected (+0.5).");
  }

  // Sepsis risk factors
  if (ai.streaking) {
    score = Math.max(score, 3.75);
    reasoning.push("CRITICAL ALERT: Lymphangitis (red streaking) detected. This is a primary sign of infection entering the lymphatic/vascular system (Sepsis risk).");
  }

  if (ai.swelling && ai.redness) {
    score += 0.25;
    reasoning.push("Active inflammatory pattern (+0.25).");
  }

  // Systemic Overrides
  if (patient.difficultyBreathing || patient.confusion) {
    score = 4;
    reasoning.push("EMERGENCY OVERRIDE: Respiratory distress or Neurological confusion detected (Organ dysfunction signs).");
  } else if (patient.fever) {
    if (score >= 3 || ai.condition === 'Cellulitis') {
      score = 4;
      reasoning.push("CRITICAL: Localized infection (Cellulitis) combined with systemic fever indicates Sepsis or Bacteremia risk.");
    } else if (score >= 2) {
      score = Math.max(score, 2.5);
      reasoning.push("Moderate escalation: Local infection paired with systemic fever (+0.5).");
    } else {
      score += 0.5;
      reasoning.push("Mild escalation: Fever reported (+0.5).");
    }
  }

  if (patient.extremePain && score < 3) {
    score += 0.25;
    reasoning.push("Pain management escalation (+0.25).");
  }

  let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
  if (score >= 3.75) severity = 'CRITICAL';
  else if (score >= 3) severity = 'HIGH';
  else if (score >= 2) severity = 'MEDIUM';

  return {
    severity,
    emergency: score >= 3.5,
    reasoning
  };
}

// Ensure uploads directory exists in public so Vite can serve it
const uploadsDir = path.join(process.cwd(), "public", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// --- In-Memory Store for Results ---
const resultsStore = new Map<string, {
  patientId: string;
  status: 'PENDING' | 'COMPLETED';
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  possibleCondition?: string;
  confidence?: string;
  clinicalSummary?: string;
  recommendedAction?: string;
  emergency?: boolean;
  location: string;
  timestamp: string;
  imageUrl?: string;
  mimeType?: string;
  patientSymptoms?: {
    fever: boolean;
    difficultyBreathing: boolean;
    extremePain: boolean;
    confusion: boolean;
  };
  aiSymptoms?: {
    swelling: boolean;
    redness: boolean;
    spread: 'LOCALIZED' | 'REGIONAL' | 'SYSTEMIC';
    tissueDamage: 'NONE' | 'SURFACE' | 'NECROTIC';
    discoloration: 'MILD' | 'SEVERE';
  };
  triageReasoning?: string[];
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

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

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
      const { location, symptoms } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "No image provided" });
      }

      const patientId = path.basename(file.filename, path.extname(file.filename));
      const imageUrl = `/uploads/${file.filename}`;

      // Parse symptoms if provided (it will be matched to PatientSymptomLog)
      let patientSymptoms = undefined;
      try {
        if (symptoms) {
          patientSymptoms = JSON.parse(symptoms);
        }
      } catch (e) {
        console.error("Failed to parse symptoms", e);
      }

      // Initialize result as PENDING
      resultsStore.set(patientId, {
        patientId,
        status: 'PENDING',
        location: location || "Unknown Location",
        timestamp: new Date().toISOString(),
        imageUrl,
        mimeType: file.mimetype,
        patientSymptoms
      });

      res.json({ patientId, message: "Upload successful. Awaiting AI analysis..." });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to process image" });
    }
  });

  // POST /api/analyze/:patientId
  app.post("/api/analyze/:patientId", async (req, res) => {
    try {
      const { patientId } = req.params;
      const { language } = req.body;
      console.log(`[SERVER] Received analysis request for Patient ID: ${patientId}, Language: ${language}`);
      
      const record = resultsStore.get(patientId);

      if (!record || !record.imageUrl) {
        return res.status(404).json({ error: "Patient record or image not found" });
      }

      const ai = getGenAI();

      const languageNames: Record<string, string> = {
        en: "English",
        hi: "Hindi",
        ta: "Tamil",
        te: "Telugu",
        kn: "Kannada"
      };

      const langName = languageNames[language] || "English";

      const systemInstruction = `You are a medical visual observation engine. Your task is to identify medical signs and provide care instructions.
      
      CELLULITIS VS SEPSIS DIFFERENTIATION:
      - Cellulitis is a localized skin infection (redness, swelling, heat).
      - SEPSIS INDICATORS (Visible on skin): Look for red lines spreading away from the site (streaking/lymphangitis), rapid/indistinct margins, blistering (bullae), or patches of purple/black skin (necrosis).
      - If you see red streaking, flag 'streaking' as true.
      - If the infection covers a massive area or seems to be spreading "while watching", flag 'rapidSpread' as true.

      RULES:
      1. Detect the most likely medical condition. If you see signs of systemic involvement (streaking, necrosis), explicitly mention the risk of Sepsis/Necrotizing Fasciitis.
      2. Identify visual signatures: swelling, redness, spread pattern, streaking, rapid spread, and tissue damage.
      3. CRITICAL: In 'recommendedAction', provide clear, actionable care steps. If sepsis markers are found, the first action MUST be "IMMEDIATE EMERGENCY ROOM EVALUATION".
      4. Do NOT classify severity. Only extract objective observations.
      5. Return response in ${langName} where appropriate.
      6. Output MUST be valid JSON matching the schema.`;

      // Read image file from disk and convert to base64
      const imagePath = path.join(process.cwd(), "public", record.imageUrl);
      if (!fs.existsSync(imagePath)) {
        return res.status(404).json({ error: "Image file not found on server" });
      }

      const imageBuffer = fs.readFileSync(imagePath);
      const base64Data = imageBuffer.toString("base64");
      const mimeType = record.mimeType || "image/jpeg";

      console.log(`[SERVER] Initializing Gemini AI for Patient: ${patientId}, MimeType: ${mimeType}`);
      
      const prompt = `Perform objective visual extraction of this medical image. Respond in ${langName}.`;

      const aiResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType
              }
            }
          ]
        },
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              possibleCondition: { type: Type.STRING },
              confidence: { type: Type.STRING },
              clinicalSummary: { type: Type.STRING },
              recommendedAction: { type: Type.STRING },
              aiSymptoms: {
                type: Type.OBJECT,
                properties: {
                  swelling: { type: Type.BOOLEAN },
                  redness: { type: Type.BOOLEAN },
                  spread: { type: Type.STRING, enum: ["LOCALIZED", "REGIONAL", "SYSTEMIC"] },
                  tissueDamage: { type: Type.STRING, enum: ["NONE", "SURFACE", "NECROTIC"] },
                  discoloration: { type: Type.STRING, enum: ["MILD", "SEVERE"] },
                  streaking: { type: Type.BOOLEAN },
                  rapidSpread: { type: Type.BOOLEAN },
                },
                required: ["swelling", "redness", "spread", "tissueDamage", "discoloration", "streaking", "rapidSpread"]
              }
            },
            required: ["possibleCondition", "confidence", "clinicalSummary", "recommendedAction", "aiSymptoms"]
          }
        }
      });

      const responseText = aiResponse.text;
      if (!responseText) throw new Error("AI engine returned empty response.");

      const aiExtraction = JSON.parse(responseText.replace(/```json/g, "").replace(/```/g, "").trim());

      // --- Severity Engine Execution ---
      const patientSymptomLog: PatientSymptomLog = record.patientSymptoms || {
        fever: false,
        difficultyBreathing: false,
        extremePain: false,
        confusion: false
      };

      const triage = calculateClinicalSeverity(
        { ...aiExtraction.aiSymptoms, condition: aiExtraction.possibleCondition },
        patientSymptomLog
      );

      const finalResult = {
        ...record,
        ...aiExtraction,
        severity: triage.severity,
        emergency: triage.emergency,
        triageReasoning: triage.reasoning,
        status: 'COMPLETED'
      };

      // Generate hospital info
      const loc = record.location || "Unknown Location";
      finalResult.hospital = {
        name: `${loc} General Hospital`,
        address: `Main St, ${loc}`,
        mapsUrl: `https://www.google.com/maps/search/hospitals+near+${encodeURIComponent(loc)}`
      };

      resultsStore.set(patientId, finalResult);
      res.json(finalResult);

    } catch (error: any) {
      console.error("[SERVER] Analysis error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze image" });
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
    
    console.log(`[BACKEND] Received update for Patient ID: ${patientId}, Status: ${updateData.status}`);
    
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
    if (updated.severity === 'HIGH' || updated.severity === 'CRITICAL' || updated.emergency) {
      const type = updated.severity === 'CRITICAL' ? 'CRITICAL EMERGENCY' : 'HIGH SEVERITY';
      console.warn(`[ALERT] ${type} DETECTED.`);
      console.warn(`[ALERT] Patient ID: ${patientId}`);
      console.warn(`[ALERT] Possible Condition: ${updated.possibleCondition}`);
      console.warn(`[ALERT] Emergency Status: ${updated.emergency}`);
      console.warn(`[ALERT] Location: ${updated.location}`);
      console.warn(`[ALERT] Action Required: ${updated.recommendedAction}`);
      console.warn(`[ALERT] Status: Immediate clinic notification and response team dispatch simulated.`);
    }

    res.json(updated);
  });

  // Catch-all for API routes to prevent falling through to Vite's HTML fallback
  app.all("/api/*", (req, res) => {
    console.warn(`[SERVER] 404 - API Route Not Found: ${req.method} ${req.url}`);
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
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
