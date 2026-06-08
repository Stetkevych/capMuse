const express = require('express');
const cors = require('cors');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

const app = express();
const PORT = process.env.PORT || 3001;
const BUCKET = 'capmuse-data-882611632216';
const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'CapMuse API', timestamp: new Date().toISOString() });
});

// POST /api/ingest — receive JSON payload, append to a dataset in S3
app.post('/api/ingest', async (req, res) => {
  try {
    const { dataset, records } = req.body;
    if (!dataset) return res.status(400).json({ error: 'dataset name required' });
    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'records array required' });
    }

    const filename = `${dataset}.json`;

    // Load existing data
    let existing = [];
    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: filename }));
      const text = await obj.Body.transformToString();
      existing = JSON.parse(text);
    } catch { /* file doesn't exist yet */ }

    // Append new records
    const updated = [...existing, ...records];

    // Save back to S3
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: filename,
      Body: JSON.stringify(updated),
      ContentType: 'application/json',
    }));

    res.json({ success: true, dataset, added: records.length, total: updated.length });
  } catch (err) {
    console.error('[Ingest]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/replace — replace entire dataset
app.post('/api/replace', async (req, res) => {
  try {
    const { dataset, records } = req.body;
    if (!dataset) return res.status(400).json({ error: 'dataset name required' });
    if (!records || !Array.isArray(records)) return res.status(400).json({ error: 'records array required' });

    const filename = `${dataset}.json`;
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: filename,
      Body: JSON.stringify(records),
      ContentType: 'application/json',
    }));

    res.json({ success: true, dataset, total: records.length });
  } catch (err) {
    console.error('[Replace]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/csv — receive JSON records and save as CSV to S3
app.post('/api/csv', async (req, res) => {
  try {
    const { dataset, records } = req.body;
    if (!dataset) return res.status(400).json({ error: 'dataset name required' });
    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'records array required' });
    }

    const headers = Object.keys(records[0]);
    const csvRows = [headers.join(',')];
    records.forEach(r => {
      csvRows.push(headers.map(h => {
        const val = String(r[h] || '').replace(/"/g, '""');
        return val.includes(',') || val.includes('"') || val.includes('\n') ? `"${val}"` : val;
      }).join(','));
    });

    const filename = `${dataset}.csv`;
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: filename,
      Body: csvRows.join('\n'),
      ContentType: 'text/csv',
    }));

    res.json({ success: true, dataset, filename, rows: records.length });
  } catch (err) {
    console.error('[CSV]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data/:dataset — retrieve a dataset
app.get('/api/data/:dataset', async (req, res) => {
  try {
    const filename = `${req.params.dataset}.json`;
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: filename }));
    const text = await obj.Body.transformToString();
    res.json(JSON.parse(text));
  } catch (err) {
    if (err.name === 'NoSuchKey') return res.status(404).json({ error: 'Dataset not found' });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/webhook — generic webhook receiver, saves payload with timestamp
app.post('/api/webhook', async (req, res) => {
  try {
    const payload = req.body;
    const timestamp = new Date().toISOString();
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);

    let webhooks = [];
    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: 'webhooks.json' }));
      const text = await obj.Body.transformToString();
      webhooks = JSON.parse(text);
    } catch { }

    webhooks.push({ id, timestamp, payload });
    if (webhooks.length > 1000) webhooks = webhooks.slice(-1000);

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: 'webhooks.json',
      Body: JSON.stringify(webhooks),
      ContentType: 'application/json',
    }));

    res.json({ success: true, id, timestamp });
  } catch (err) {
    console.error('[Webhook]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`CapMuse API running on port ${PORT}`);
});
