const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

const BUCKET = 'capmuse-data-882611632216';
const s3 = new S3Client({ region: 'us-east-1' });

function normalizeDate(d) {
  if (!d) return '';
  // MM-DD-YYYY → YYYY-MM-DD
  const m = d.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[1]}-${m[2]}`;
  return d;
}

exports.handler = async (event) => {
  try {
    const record = JSON.parse(event.body || '{}');
    if (!record || !record.record_id) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid payload - record_id required' }) };
    }

    // Reject empty records (no company or funding)
    if (!record.company && !record.funding) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Empty record rejected - company or funding required' }) };
    }

    // Normalize date to YYYY-MM-DD
    if (record.date_funded) record.date_funded = normalizeDate(record.date_funded);

    record.received_at = new Date().toISOString();

    // Load existing
    let existing = [];
    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: 'funding_book_live.json' }));
      const text = await obj.Body.transformToString();
      existing = JSON.parse(text);
    } catch { }

    // Upsert by record_id
    const idx = existing.findIndex(r => r.record_id === record.record_id);
    if (idx > -1) existing[idx] = record;
    else existing.push(record);

    // Save
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: 'funding_book_live.json',
      Body: JSON.stringify(existing),
      ContentType: 'application/json',
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, record_id: record.record_id, total_records: existing.length }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
