/**
 * One-time repair: when package_owner was copied from puller but the real
 * Package Owner in Zoho is House, restore package_owner to House.
 *
 * Usage: node scripts/repair-package-owners.js
 * Requires AWS credentials with S3 read/write on capmuse-data bucket.
 */
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const BUCKET = 'capmuse-data-882611632216';
const KEY = 'funding_book_live.json';

function normKey(name) {
  return String(name || '').toLowerCase().replace(/\./g, '').trim();
}

function isHouseName(name) {
  const n = normKey(name);
  return !n || n === 'house';
}

function coalesceName(value) {
  if (value == null) return '';
  if (typeof value === 'object' && value.name) return String(value.name).trim();
  return String(value).trim();
}

function fundingBookOwner(record) {
  return coalesceName(
    record.funding_book_owner ||
    record.Funding_Book_Owner ||
    record['Funding_Book_Owner.name'] ||
    record.Owner ||
    record['Owner.name']
  );
}

function resolvePackageOwner(record) {
  const lookup = coalesceName(
    record['Package_Owner.name'] ||
    (record.Package_Owner && record.Package_Owner.name) ||
    record.package_owner_name
  );
  if (lookup) return lookup;

  const flat = coalesceName(record.package_owner);
  const puller = coalesceName(record.puller);
  const fbOwner = fundingBookOwner(record);

  if (flat && puller && flat.toLowerCase() === puller.toLowerCase() && isHouseName(fbOwner)) {
    return fbOwner;
  }

  return flat;
}

async function main() {
  const s3 = new S3Client({ region: 'us-east-1' });
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }));
  const data = JSON.parse(await obj.Body.transformToString());

  let fixed = 0;
  const gabrielQuebec = '3793076000678779021';

  for (const record of data) {
    const before = coalesceName(record.package_owner);
    let owner = resolvePackageOwner(record);

    // Gabriel Sulca: only Quebec is Package Owner in Zoho; other puller deals are House
    const puller = coalesceName(record.puller);
    if (
      puller === 'Gabriel Sulca' &&
      before === 'Gabriel Sulca' &&
      record.record_id !== gabrielQuebec &&
      !coalesceName(record['Package_Owner.name'])
    ) {
      owner = 'House .';
    }

    if (owner && owner !== before) {
      record.package_owner = owner;
      record['Package_Owner.name'] = owner;
      fixed++;
      console.log('fixed', record.record_id, before, '->', owner, '|', record.company);
    }
  }

  if (!fixed) {
    console.log('No records needed repair.');
    return;
  }

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: KEY,
    Body: JSON.stringify(data),
    ContentType: 'application/json',
  }));

  console.log(`Repaired ${fixed} records in s3://${BUCKET}/${KEY}`);
}

main().catch(function (err) {
  console.error(err.message);
  process.exit(1);
});
