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

    const aiResponse = await ai.models.generateContent({
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

    const aiExtraction = JSON.parse(responseText.replace(/```json/g, "").replace(/```/g, "").trim());

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
