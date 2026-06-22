import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

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
    // Note: We use public-read if we want direct URLs, or handle signed URLs
    // For simplicity with the existing frontend which uses /uploads/..., 
    // we'll store the key and retrieve it.
  }).promise();

  // In a real S3 setup, we might use a CDN or signed URL. 
  // For the Vercel migration, we'll store the object and can potentially 
  // serve it via a proxy or signed URL.
  // The original app used `/uploads/${filename}` which was served from public/uploads.
  // We'll return a special marker or just the key.
  return { 
    url: key, // We'll handle this in the result/analyze endpoints
    key 
  };
}

export async function getSignedUrl(key: string): Promise<string> {
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
  const s3 = getS3();
  const cleanKey = getImageKeyFromUrl(key);
  const data = await s3.getObject({
    Bucket: BUCKET_NAME,
    Key: cleanKey
  }).promise();
  return data.Body as Buffer;
}
