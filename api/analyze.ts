import { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from "@google/genai";
import { getRecord, saveRecord, getImage, getSignedUrl } from './_lib/s3';
import { calculateClinicalSeverity } from './_lib/severity';

// Utility to get Gemini instance (identical to server.ts logic)
let genAIInstance: GoogleGenAI | null = null;
function getGenAI() {
  if (!genAIInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Gemini API key is not configured.");
    genAIInstance = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });
  }
  return genAIInstance;
}

// Helper to perform content generation with retry and fallback for high-demand spikes (503/429/etc)
async function generateContentWithRetryAndFallback(ai: GoogleGenAI, params: any) {
  // Use gemini-3.1-flash-lite as the primary model since it's the absolute fastest and lowest latency model,
  // falling back to gemini-3.5-flash and gemini-flash-latest to ensure maximum reliability and speed.
  const modelsToTry = ["gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-flash-latest"];
  let lastError: any = null;

  for (const modelName of modelsToTry) {
    let skipModel = false;
    // Try both with and without response schema
    const configsToTry = [
      { useSchema: true },
      { useSchema: false }
    ];

    for (const configOpt of configsToTry) {
      if (skipModel) {
        console.warn(`[GEMINI] Skipping remaining configs for model ${modelName} due to transient service error.`);
        break;
      }

      const maxRetries = 2; // Keep at 2 retries per config variant to avoid overall timeout
      let delay = 500; // start with 500ms delay for snappier fallback if needed

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[GEMINI] Attempting content generation with model: ${modelName} (Attempt ${attempt}/${maxRetries}, Schema: ${configOpt.useSchema})`);
          
          // Clone parameters minimally so we do not stringify massive base64 image data
          const currentParams = {
            ...params,
            model: modelName,
            config: params.config ? { ...params.config } : undefined
          };

          if (!configOpt.useSchema) {
            if (currentParams.config) {
              const cleanedConfig = { ...currentParams.config };
              delete cleanedConfig.responseSchema;
              cleanedConfig.systemInstruction = (cleanedConfig.systemInstruction || "") + 
                "\nCRITICAL: You must return the response as a valid, parsable JSON object matching the schema exactly. Wrap it inside standard ```json <object> ``` block.";
              currentParams.config = cleanedConfig;
            }
          }

          const response = await ai.models.generateContent(currentParams);
          console.log(`[GEMINI] Success! Model: ${modelName}, Schema: ${configOpt.useSchema}`);
          return response;
        } catch (error: any) {
          lastError = error;
          const errorMessage = error.message || "";
          console.error(`[GEMINI] Error with ${modelName} (Attempt ${attempt}/${maxRetries}, Schema: ${configOpt.useSchema}):`, errorMessage);
          
          const isTransient = 
            errorMessage.includes("503") || 
            errorMessage.includes("UNAVAILABLE") || 
            errorMessage.includes("high demand") || 
            errorMessage.includes("ResourceExhausted") || 
            errorMessage.includes("status: 503") ||
            errorMessage.includes("status: 429") ||
            (error.status && (error.status === 503 || error.status === 429));

          if (isTransient) {
            if (attempt < maxRetries) {
              // Add custom random Jitter to prevent concurrent collisions on demand spikes
              const jitter = Math.floor(Math.random() * 300) + 100;
              const sleepTime = delay + jitter;
              console.warn(`[GEMINI] Transient error detected. Retrying in ${sleepTime}ms...`);
              await new Promise((resolve) => setTimeout(resolve, sleepTime));
              delay *= 1.5; // exponential backoff
            } else {
              console.warn(`[GEMINI] Max retries reached for transient error on ${modelName}. Skipping model entirely.`);
              skipModel = true;
              break;
            }
          } else {
            // Not a transient error (e.g. invalid request, validation, etc.)
            // Break directly to try the other config
            break;
          }
        }
      }
    }
  }

  throw lastError || new Error("All model attempts failed after exhaustive retry and fallback.");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { patientId } = req.query;
  const id = Array.isArray(patientId) ? patientId[0] : patientId;
  const { language } = req.body;

  if (!id) return res.status(400).json({ error: 'Patient ID is required' });

  try {
    const record = await getRecord(id);
    if (!record || !record.imageUrl) {
      return res.status(404).json({ error: "Patient record or image not found" });
    }

    const ai = getGenAI();

    const languageNames: Record<string, string> = {
      en: "English", hi: "Hindi", ta: "Tamil", te: "Telugu", kn: "Kannada"
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

    const imageBuffer = await getImage(record.imageUrl);
    const base64Data = imageBuffer.toString("base64");
    const mimeType = record.mimeType || "image/jpeg";
    
    const prompt = `Perform objective visual extraction of this medical image. Respond in ${langName}.`;

    const aiResponse = await generateContentWithRetryAndFallback(ai, {
      model: "gemini-3.5-flash",
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { data: base64Data, mimeType: mimeType } }
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

    let cleanedText = responseText.trim();
    if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    }
    
    let aiExtraction: any;
    try {
      aiExtraction = JSON.parse(cleanedText.trim());
    } catch (parseErr: any) {
      console.error("[ANALYZE] Direct JSON parse failed, trying to find brackets:", parseErr);
      // Fallback: extract the outer-most JSON object using standard brace matching if garbage is mixed
      const startIdx = cleanedText.indexOf('{');
      const endIdx = cleanedText.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) {
        aiExtraction = JSON.parse(cleanedText.slice(startIdx, endIdx + 1));
      } else {
        throw parseErr;
      }
    }

    const patientSymptomLog = record.patientSymptoms || {
      fever: false, difficultyBreathing: false, extremePain: false, confusion: false
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

    const loc = record.location || "Unknown Location";
    finalResult.hospital = {
      name: `${loc} General Hospital`,
      address: `Main St, ${loc}`,
      mapsUrl: `https://www.google.com/maps/search/hospitals+near+${encodeURIComponent(loc)}`
    };

    // Convert internal key to signed URL for the frontend
    if (finalResult.imageUrl) {
      finalResult.imageUrl = await getSignedUrl(finalResult.imageUrl);
    }

    await saveRecord(finalResult);
    res.status(200).json(finalResult);

  } catch (error: any) {
    console.error("[ANALYZE] Error:", error);
    res.status(500).json({ error: error.message || "Failed to analyze image" });
  }
}
