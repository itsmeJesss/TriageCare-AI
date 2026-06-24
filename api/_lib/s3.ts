import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

// Memory fallback storage is used when S3 is not configured
const useFallback = !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_S3_BUCKET_NAME;

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
  if (useFallback) {
    const patientId = uuidv4();
    const fileExt = mimeType.split('/')[1] || 'jpg';
    const key = `uploads/${patientId}.${fileExt}`;
    fallbackImages.set(key, { buffer, mimeType });
    console.log(`[S3-FALLBACK] Uploaded image in-memory key: ${key}`);
    return { 
      url: key,
      key 
    };
  }

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_S3_BUCKET_NAME) {
    throw new Error("AWS credentials or S3 bucket name not configured in environment variables.");
  }

  const patientId = uuidv4();
  const fileExt = mimeType.split('/')[1] || 'jpg';
  const key = `uploads/${patientId}.${fileExt}`;

  const s3 = getS3();
  await s3.putObject({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  }).promise();

  return { 
    url: key, 
    key 
  };
}

export async function getSignedUrl(key: string): Promise<string> {
  if (useFallback) {
    console.log(`[S3-FALLBACK] Generating local retrieval URL for key: ${key}`);
    return `/api/local-image?key=${encodeURIComponent(key)}`;
  }

  const s3 = getS3();
  return s3.getSignedUrlPromise('getObject', {
    Bucket: BUCKET_NAME,
    Key: key,
    Expires: 3600 // 1 hour
  });
}

export function getImageKeyFromUrl(key: string): string {
  if (key && key.startsWith('http')) {
    try {
      const urlObj = new URL(key);
      let path = decodeURIComponent(urlObj.pathname);
      if (path.startsWith('/')) {
        path = path.substring(1);
      }
      if (BUCKET_NAME && path.startsWith(BUCKET_NAME + '/')) {
        path = path.substring(BUCKET_NAME.length + 1);
      }
      return path;
    } catch (e) {
      console.error("[S3] Failed to parse key from URL:", key, e);
    }
  }
  return key;
}

export async function saveRecord(record: PatientRecord) {
  if (useFallback) {
    const recordToSave = { ...record };
    if (recordToSave.imageUrl) {
      recordToSave.imageUrl = getImageKeyFromUrl(recordToSave.imageUrl);
    }
    fallbackRecords.set(recordToSave.patientId, recordToSave);
    console.log(`[S3-FALLBACK] Saved patient record in-memory for ID: ${recordToSave.patientId}`);
    return;
  }

  const s3 = getS3();
  const recordToSave = { ...record };
  if (recordToSave.imageUrl) {
    recordToSave.imageUrl = getImageKeyFromUrl(recordToSave.imageUrl);
  }
  
  await s3.putObject({
    Bucket: BUCKET_NAME,
    Key: `records/${recordToSave.patientId}.json`,
    Body: JSON.stringify(recordToSave),
    ContentType: 'application/json'
  }).promise();
}

export async function getRecord(patientId: string): Promise<PatientRecord | null> {
  if (useFallback) {
    const record = fallbackRecords.get(patientId);
    if (!record) {
      console.log(`[S3-FALLBACK] Patient record not found in-memory for ID: ${patientId}`);
      return null;
    }
    console.log(`[S3-FALLBACK] Retrieved patient record from-memory for ID: ${patientId}`);
    return record;
  }

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
  if (useFallback) {
    const cleanKey = getImageKeyFromUrl(key);
    const data = fallbackImages.get(cleanKey);
    if (!data) {
      throw new Error(`[S3-FALLBACK] Image key ${cleanKey} not found in fallback storage.`);
    }
    return data.buffer;
  }

  const s3 = getS3();
  const cleanKey = getImageKeyFromUrl(key);
  const data = await s3.getObject({
    Bucket: BUCKET_NAME,
    Key: cleanKey
  }).promise();
  return data.Body as Buffer;
}

