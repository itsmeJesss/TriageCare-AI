import { VercelRequest, VercelResponse } from '@vercel/node';
import { fallbackImages, getImageKeyFromUrl } from './_lib/s3';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const { key } = req.query;
  const imageKey = Array.isArray(key) ? key[0] : key;

  if (!imageKey) {
    return res.status(400).json({ error: 'Image key is required' });
  }

  const cleanKey = getImageKeyFromUrl(imageKey);
  const data = fallbackImages.get(cleanKey);

  if (!data) {
    console.error(`[LOCAL-IMAGE] Key not found details: ${cleanKey}`);
    return res.status(404).json({ error: 'Image not found in fallback storage' });
  }

  res.setHeader('Content-Type', data.mimeType || 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  
  return res.status(200).send(data.buffer);
}
