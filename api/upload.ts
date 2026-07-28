import { VercelRequest, VercelResponse } from '@vercel/node';
import Busboy from 'busboy';
import { uploadImage, saveRecord, PatientRecord } from './_lib/s3';

export const config = {
  api: {
    bodyParser: false,
  },
};

function sendJSON(res: any, status: number, data: any) {
  if (res.headersSent) return;
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    console.log(`[UPLOAD] sendJSON using status().json(): Status=${status}`);
    res.status(status).json(data);
  } else {
    console.log(`[UPLOAD] sendJSON using writeHead(): Status=${status}`);
    const jsonString = JSON.stringify(data);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(jsonString)
    });
    res.end(jsonString);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log(`[UPLOAD] Handler started. Method: ${req.method}`);
  
  if (req.method !== 'POST') {
    sendJSON(res, 405, { error: 'Method not allowed' });
    return;
  }

  return new Promise((resolve, reject) => {
    let busboy;
    try {
      busboy = typeof Busboy === 'function' 
        ? Busboy({ headers: req.headers }) 
        : (Busboy as any).default({ headers: req.headers });
    } catch (err: any) {
      console.error('[UPLOAD] Busboy initialization failed:', err);
      sendJSON(res, 400, { error: 'Invalid request format or missing multipart headers', details: err.message });
      return resolve(true);
    }

    let imageBuffer: Buffer | null = null;
    let mimeType = '';
    let filename = '';
    const fields: Record<string, string> = {};
    let isFinished = false;
    const filePromises: Promise<void>[] = [];

    busboy.on('file', (fieldname, file, infoOrFilename, encoding, mimetype) => {
      let fname = '';
      let mtype = '';
      if (infoOrFilename && typeof infoOrFilename === 'object') {
        fname = (infoOrFilename as any).filename || '';
        mtype = (infoOrFilename as any).mimeType || (infoOrFilename as any).mimetype || '';
      } else {
        fname = typeof infoOrFilename === 'string' ? infoOrFilename : '';
        mtype = mimetype || '';
      }

      console.log(`[UPLOAD] Receiving file: ${fname} (${mtype})`);
      filename = fname;
      mimeType = mtype;
      const chunks: any[] = [];

      const filePromise = new Promise<void>((resolveFile) => {
        file.on('data', (data) => chunks.push(data));
        file.on('end', () => {
          imageBuffer = Buffer.concat(chunks);
          console.log(`[UPLOAD] File buffer complete. Size: ${imageBuffer.length} bytes`);
          resolveFile();
        });
        file.on('error', (err) => {
          console.error(`[UPLOAD] File stream error:`, err);
          resolveFile(); // resolve to let the flow continue and handle gracefully
        });
      });
      filePromises.push(filePromise);
    });

    busboy.on('field', (fieldname, val) => {
      console.log(`[UPLOAD] Received field: ${fieldname}`);
      fields[fieldname] = val;
    });

    console.log(`[UPLOAD] Setting up Busboy handlers...`);
    
    // Safety timeout for busboy processing on serverless functions
    const timeoutTimer = setTimeout(() => {
      if (!isFinished) {
        isFinished = true;
        console.error('[UPLOAD] Busboy processing timed out.');
        sendJSON(res, 504, { error: 'Upload request processing timed out. Please try again with a smaller file.' });
        resolve(true);
      }
    }, 25000);

    const cleanup = () => {
      clearTimeout(timeoutTimer);
    };

    busboy.on('finish', async () => {
      if (isFinished) return;
      isFinished = true;
      cleanup();
      console.log(`[UPLOAD] Busboy finish triggered`);

      try {
        // Wait for all file streams to completely buffer
        await Promise.all(filePromises);

        if (!imageBuffer) {
          console.error('[UPLOAD] Error: No image buffer captured after processing');
          sendJSON(res, 400, { error: 'No image file found in the request. Please attach an image.' });
          return resolve(true);
        }

        console.log(`[UPLOAD] Processing image storage...`);
        const { key } = await uploadImage(imageBuffer, mimeType || 'image/jpeg');
        
        const patientId = key.split('/')[1].split('.')[0];
        console.log(`[UPLOAD] Image saved. Key: ${key}. Generated Patient ID: ${patientId}`);

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
          mimeType: mimeType || 'image/jpeg',
          patientSymptoms
        };

        console.log(`[UPLOAD] Saving record...`);
        await saveRecord(record);

        console.log(`[UPLOAD] Success. Returning response.`);
        sendJSON(res, 200, { patientId, message: "Upload successful. Awaiting AI analysis..." });
        resolve(true);
      } catch (error: any) {
        console.error('[UPLOAD] Handler internal error:', error);
        sendJSON(res, 500, { error: "Storage Error", details: error.message });
        resolve(true);
      }
    });

    busboy.on('error', (err) => {
      if (isFinished) return;
      isFinished = true;
      cleanup();
      console.error('[UPLOAD] Busboy parsing error:', err);
      sendJSON(res, 400, { error: 'Failed to parse uploaded form data', details: err.message });
      resolve(true);
    });

    req.on('error', (err) => {
      if (isFinished) return;
      isFinished = true;
      cleanup();
      console.error('[UPLOAD] Request stream error:', err);
      sendJSON(res, 500, { error: 'Request stream error', details: err.message });
      resolve(true);
    });

    // Check if Vercel serverless environment pre-parsed req.body
    if (req.body && Buffer.isBuffer(req.body)) {
      console.log(`[UPLOAD] req.body is Buffer (${req.body.length} bytes), writing to busboy`);
      busboy.end(req.body);
    } else if (req.body && typeof req.body === 'string') {
      console.log(`[UPLOAD] req.body is string (${req.body.length} chars), writing to busboy`);
      busboy.end(Buffer.from(req.body, 'utf-8'));
    } else {
      console.log(`[UPLOAD] Piping req stream to busboy`);
      req.pipe(busboy);
    }
  });
}
