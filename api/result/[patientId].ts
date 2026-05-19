import { VercelRequest, VercelResponse } from '@vercel/node';
import { getRecord, saveRecord, getSignedUrl } from '../_lib/s3';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { patientId } = req.query;
  const id = Array.isArray(patientId) ? patientId[0] : patientId;

  if (!id) return res.status(400).json({ error: 'Patient ID is required' });

  if (req.method === 'GET') {
    try {
      const record = await getRecord(id);
      if (!record) return res.status(404).json({ error: "Patient record not found" });
      
      // Convert internal key to signed URL for the frontend
      if (record.imageUrl && !record.imageUrl.startsWith('http')) {
        record.imageUrl = await getSignedUrl(record.imageUrl);
      }
      
      res.status(200).json(record);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
    return;
  }

  if (req.method === 'PATCH') {
    try {
      const updateData = req.body;
      const existing = await getRecord(id);
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

      await saveRecord(updated);

      // Alert logic (simulated in logs for serverless)
      if (updated.severity === 'HIGH' || updated.severity === 'CRITICAL' || updated.emergency) {
        console.warn(`[ALERT] HIGH SEVERITY for ${id}: ${updated.possibleCondition}`);
      }

      res.status(200).json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
