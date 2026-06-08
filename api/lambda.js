const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

const BUCKET = 'capmuse-data-882611632216';
const s3 = new S3Client({ region: 'us-east-1' });

exports.handler = async (event) => {
  try {
    const record = JSON.parse(event.body || '{}');
    if (!record || !record.record_id) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid payload - record_id required' }) };
    }

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
