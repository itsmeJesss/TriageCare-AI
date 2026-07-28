import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

// Memory & Disk fallback storage is used when S3 is not configured or fails
const useFallback = !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_S3_BUCKET_NAME;

// Temporary directories for local/Vercel serverless persistence
const TMP_DIR = path.join('/tmp', 'aura_triage_storage');
const TMP_RECORDS_DIR = path.join(TMP_DIR, 'records');
const TMP_IMAGES_DIR = path.join(TMP_DIR, 'images');

function ensureTmpDirs() {
  try {
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
    if (!fs.existsSync(TMP_RECORDS_DIR)) fs.mkdirSync(TMP_RECORDS_DIR, { recursive: true });
    if (!fs.existsSync(TMP_IMAGES_DIR)) fs.mkdirSync(TMP_IMAGES_DIR, { recursive: true });
  } catch (err) {
    console.warn('[STORAGE] Failed to create /tmp directories:', err);
  }
}
ensureTmpDirs();

// In-process fallback store
export const fallbackRecords = new Map<string, any>();
export const fallbackImages = new Map<string, { buffer: Buffer, mimeType: string }>();

let s3Instance: AWS.S3 | null = null;
export function getS3(): AWS.S3 {
  if (!s3Instance) {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || 'us-east-1';
    
    if (!accessKeyId || !secretAccessKey) {
      throw new Error("AWS Credentials (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY) are not set.");
    }
    s3Instance = new AWS.S3({
      accessKeyId,
      secretAccessKey,
      region
    });
  }
  return s3Instance;
}

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || '';

export interface PatientRecord {
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
  patientSymptoms?: any;
  aiSymptoms?: any;
  triageReasoning?: string[];
  hospital?: any;
}

export async function uploadImage(buffer: Buffer, mimeType: string): Promise<{ url: string, key: string }> {
  const patientId = uuidv4();
  const fileExt = mimeType.split('/')[1] || 'jpg';
  const key = `uploads/${patientId}.${fileExt}`;

  if (useFallback) {
    return saveImageFallback(key, buffer, mimeType);
  }

  try {
    const s3 = getS3();
    await s3.putObject({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }).promise();

    return { url: key, key };
  } catch (err: any) {
    console.warn(`[S3] Upload to S3 failed (${err.message}). Falling back to local/tmp storage.`);
    return saveImageFallback(key, buffer, mimeType);
  }
}

function saveImageFallback(key: string, buffer: Buffer, mimeType: string) {
  fallbackImages.set(key, { buffer, mimeType });
  try {
    ensureTmpDirs();
    const safeKeyName = key.replace(/[\/\\]/g, '_');
    fs.writeFileSync(path.join(TMP_IMAGES_DIR, safeKeyName), buffer);
    fs.writeFileSync(path.join(TMP_IMAGES_DIR, safeKeyName + '.meta'), JSON.stringify({ mimeType }));
    console.log(`[STORAGE-FALLBACK] Saved image to disk & memory for key: ${key}`);
  } catch (err) {
    console.warn('[STORAGE-FALLBACK] Disk write failed:', err);
  }
  return { url: key, key };
}

export async function getSignedUrl(key: string): Promise<string> {
  if (useFallback) {
    return `/api/local-image?key=${encodeURIComponent(key)}`;
  }

  try {
    const s3 = getS3();
    return await s3.getSignedUrlPromise('getObject', {
      Bucket: BUCKET_NAME,
      Key: key,
      Expires: 3600 // 1 hour
    });
  } catch (err: any) {
    console.warn(`[S3] Failed to get signed URL from S3 (${err.message}). Using local route.`);
    return `/api/local-image?key=${encodeURIComponent(key)}`;
  }
}

export function getImageKeyFromUrl(key: string): string {
  if (key && key.startsWith('http')) {
    try {
      const urlObj = new URL(key);
      let pathStr = decodeURIComponent(urlObj.pathname);
      if (pathStr.startsWith('/')) {
        pathStr = pathStr.substring(1);
      }
      if (BUCKET_NAME && pathStr.startsWith(BUCKET_NAME + '/')) {
        pathStr = pathStr.substring(BUCKET_NAME.length + 1);
      }
      return pathStr;
    } catch (e) {
      console.error("[S3] Failed to parse key from URL:", key, e);
    }
  }
  return key;
}

export async function saveRecord(record: PatientRecord) {
  const recordToSave = { ...record };
  if (recordToSave.imageUrl) {
    recordToSave.imageUrl = getImageKeyFromUrl(recordToSave.imageUrl);
  }

  if (useFallback) {
    saveRecordFallback(recordToSave);
    return;
  }

  try {
    const s3 = getS3();
    await s3.putObject({
      Bucket: BUCKET_NAME,
      Key: `records/${recordToSave.patientId}.json`,
      Body: JSON.stringify(recordToSave),
      ContentType: 'application/json'
    }).promise();
  } catch (err: any) {
    console.warn(`[S3] Save record to S3 failed (${err.message}). Falling back to local/tmp storage.`);
    saveRecordFallback(recordToSave);
  }
}

function saveRecordFallback(recordToSave: PatientRecord) {
  fallbackRecords.set(recordToSave.patientId, recordToSave);
  try {
    ensureTmpDirs();
    fs.writeFileSync(
      path.join(TMP_RECORDS_DIR, `${recordToSave.patientId}.json`),
      JSON.stringify(recordToSave)
    );
    console.log(`[STORAGE-FALLBACK] Saved patient record for ID: ${recordToSave.patientId}`);
  } catch (err) {
    console.warn('[STORAGE-FALLBACK] Disk write failed for record:', err);
  }
}

export async function getRecord(patientId: string): Promise<PatientRecord | null> {
  // Check memory fallback first
  if (fallbackRecords.has(patientId)) {
    return fallbackRecords.get(patientId);
  }

  // Check disk fallback second
  try {
    const filePath = path.join(TMP_RECORDS_DIR, `${patientId}.json`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const rec = JSON.parse(data);
      fallbackRecords.set(patientId, rec);
      return rec;
    }
  } catch (e) {
    console.warn('[STORAGE-FALLBACK] Error reading record from disk:', e);
  }

  if (useFallback) return null;

  // Try S3
  try {
    const s3 = getS3();
    const data = await s3.getObject({
      Bucket: BUCKET_NAME,
      Key: `records/${patientId}.json`
    }).promise();
    return JSON.parse(data.Body?.toString() || '{}');
  } catch (e) {
    return null;
  }
}

export async function getImage(key: string): Promise<Buffer> {
  const cleanKey = getImageKeyFromUrl(key);

  // Check memory fallback
  if (fallbackImages.has(cleanKey)) {
    return fallbackImages.get(cleanKey)!.buffer;
  }

  // Check disk fallback
  try {
    const safeKeyName = cleanKey.replace(/[\/\\]/g, '_');
    const imgPath = path.join(TMP_IMAGES_DIR, safeKeyName);
    if (fs.existsSync(imgPath)) {
      const buf = fs.readFileSync(imgPath);
      return buf;
    }
  } catch (e) {
    console.warn('[STORAGE-FALLBACK] Error reading image from disk:', e);
  }

  if (useFallback) {
    throw new Error(`[STORAGE-FALLBACK] Image key ${cleanKey} not found in fallback storage.`);
  }

  // Try S3
  try {
    const s3 = getS3();
    const data = await s3.getObject({
      Bucket: BUCKET_NAME,
      Key: cleanKey
    }).promise();
    return data.Body as Buffer;
  } catch (err: any) {
    throw new Error(`Failed to retrieve image ${cleanKey} from S3 or fallback storage.`);
  }
}

