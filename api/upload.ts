import { VercelRequest, VercelResponse } from '@vercel/node';
import Busboy from 'busboy';
import { uploadImage, saveRecord, PatientRecord } from './_lib/s3';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const busboy = Busboy({ headers: req.headers });
  let imageBuffer: Buffer | null = null;
  let mimeType = '';
  let filename = '';
  const fields: Record<string, string> = {};

  return new Promise((resolve, reject) => {
    busboy.on('file', (fieldname, file, info) => {
      const { filename: fname, mimeType: mtype } = info;
      filename = fname;
      mimeType = mtype;
      const chunks: any[] = [];
      file.on('data', (data) => chunks.push(data));
      file.on('end', () => {
        imageBuffer = Buffer.concat(chunks);
      });
    });

    busboy.on('field', (fieldname, val) => {
      fields[fieldname] = val;
    });

    busboy.on('finish', async () => {
      // Ensure we have the buffer (wait a bit if needed, though 'finish' should guarantee it)
      if (!imageBuffer) {
        // Small retry/delay if finish fires too early
        let retries = 0;
        while (!imageBuffer && retries < 10) {
          await new Promise(r => setTimeout(r, 50));
          retries++;
        }
      }

      try {
        if (!imageBuffer) {
          res.status(400).json({ error: 'No image provided' });
          return resolve(true);
        }

        const { key } = await uploadImage(imageBuffer, mimeType);
        
        // Use filename without extension as patientId if possible, 
        // or just generate one (uploadImage returns uuid based key)
        const patientId = key.split('/')[1].split('.')[0];

        let patientSymptoms = undefined;
        if (fields.symptoms) {
          try {
            patientSymptoms = JSON.parse(fields.symptoms);
          } catch (e) {}
        }

        const record: PatientRecord = {
          patientId,
          status: 'PENDING',
          location: fields.location || 'Unknown Location',
          timestamp: new Date().toISOString(),
          imageUrl: key, // We store the S3 key
          mimeType: mimeType,
          patientSymptoms
        };

        await saveRecord(record);

        res.status(200).json({ patientId, message: "Upload successful. Awaiting AI analysis..." });
        resolve(true);
      } catch (error: any) {
        console.error('Upload handler error:', error);
        res.status(500).json({ error: error.message || 'Failed to process upload' });
        resolve(true);
      }
    });

    busboy.on('error', (err) => {
      console.error('Busboy error:', err);
      res.status(500).json({ error: 'Failed to parse form' });
      resolve(true);
    });

    if (req.body) {
       // Should not happen with bodyParser: false, but for safety
       busboy.end(req.body);
    } else {
       req.pipe(busboy);
    }
  });
}
