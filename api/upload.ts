import { VercelRequest, VercelResponse } from '@vercel/node';
import Busboy from 'busboy';
import { uploadImage, saveRecord, PatientRecord } from './_lib/s3.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

function sendJSON(res: any, status: number, data: any) {
  if (res.headersSent) return;
  const jsonString = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(jsonString)
  });
  res.end(jsonString);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log(`[UPLOAD] Handler started. Method: ${req.method}`);
  
  if (req.method !== 'POST') {
    sendJSON(res, 405, { error: 'Method not allowed' });
    return;
  }

  return new Promise((resolve, reject) => {
    const busboy = typeof Busboy === 'function' 
      ? Busboy({ headers: req.headers }) 
      : (Busboy as any).default({ headers: req.headers });
    let imageBuffer: Buffer | null = null;
    let mimeType = '';
    let filename = '';
    const fields: Record<string, string> = {};
    let isFinished = false;

    busboy.on('file', (fieldname, file, info) => {
      const { filename: fname, mimeType: mtype } = info;
      console.log(`[UPLOAD] Receiving file: ${fname} (${mtype})`);
      filename = fname;
      mimeType = mtype;
      const chunks: any[] = [];
      file.on('data', (data) => chunks.push(data));
      file.on('end', () => {
        imageBuffer = Buffer.concat(chunks);
        console.log(`[UPLOAD] File buffer complete. Size: ${imageBuffer.length} bytes`);
      });
    });

    busboy.on('field', (fieldname, val) => {
      console.log(`[UPLOAD] Received field: ${fieldname}`);
      fields[fieldname] = val;
    });

    busboy.on('finish', async () => {
      if (isFinished) return;
      isFinished = true;
      console.log(`[UPLOAD] Busboy finish triggered`);

      try {
        if (!imageBuffer) {
          // Retry logic (sometimes finish fires slightly before end of stream)
          let retries = 0;
          while (!imageBuffer && retries < 20) {
            await new Promise(r => setTimeout(r, 50));
            retries++;
          }
        }

        if (!imageBuffer) {
          console.error('[UPLOAD] Error: No image buffer captured after retries');
          sendJSON(res, 400, { error: 'No image provided or file too large/truncated' });
          return resolve(true);
        }

        console.log(`[UPLOAD] Processing S3 upload...`);
        const { key } = await uploadImage(imageBuffer, mimeType);
        
        const patientId = key.split('/')[1].split('.')[0];
        console.log(`[UPLOAD] Image saved to S3. Key: ${key}. Generated Patient ID: ${patientId}`);

        let patientSymptoms = undefined;
        if (fields.symptoms) {
          try {
            patientSymptoms = JSON.parse(fields.symptoms);
          } catch (e) {
            console.error('[UPLOAD] Failed to parse symptoms field:', e);
          }
        }

        const record: PatientRecord = {
          patientId,
          status: 'PENDING',
          location: fields.location || 'Unknown Location',
          timestamp: new Date().toISOString(),
          imageUrl: key,
          mimeType: mimeType,
          patientSymptoms
        };

        console.log(`[UPLOAD] Saving record to S3...`);
        await saveRecord(record);

        console.log(`[UPLOAD] Success. Returning response.`);
        sendJSON(res, 200, { patientId, message: "Upload successful. Awaiting AI analysis..." });
        resolve(true);
      } catch (error: any) {
        console.error('[UPLOAD] Handler internal error:', error);
        sendJSON(res, 500, { error: "S3 Error", details: error.message });
        resolve(true);
      }
    });

    busboy.on('error', (err) => {
      console.error('[UPLOAD] Busboy parsing error:', err);
      sendJSON(res, 500, { error: 'Failed to parse form' });
      resolve(true);
    });

    req.on('error', (err) => {
      console.error('[UPLOAD] Request stream error:', err);
      sendJSON(res, 500, { error: 'Request stream error' });
      resolve(true);
    });

    console.log(`[UPLOAD] Piping request to Busboy...`);
    req.pipe(busboy);
  });
}
