function normKey(name) {
  return String(name || '').toLowerCase().replace(/\./g, '').trim();
}

function isHouseName(name) {
  const n = normKey(name);
  return n === 'house';
}

function coalesceName(value) {
  if (value == null) return '';
  if (typeof value === 'object' && value.name) return String(value.name).trim();
  return String(value).trim();
}

/** Zoho Package Owner lookup only — never puller or Funding Book Owner. */
function packageOwnerLookup(record) {
  const candidates = [
    record['Package_Owner.name'],
    record.Package_Owner,
    record.package_owner_name,
    record.Package_Owner_Name,
  ].map(coalesceName).filter(Boolean);

  if (!candidates.length) return '';
  const named = candidates.find((c) => !isHouseName(c));
  return named || candidates[0];
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
  const lookup = packageOwnerLookup(record);
  if (lookup) return lookup;

  const flat = coalesceName(record.package_owner);
  const puller = coalesceName(record.puller || record.Puller || record['Puller.name']);
  const fbOwner = fundingBookOwner(record);

  // Puller copied into package_owner while real Package Owner is House
  if (flat && puller && flat.toLowerCase() === puller.toLowerCase() && fbOwner && isHouseName(fbOwner)) {
    return fbOwner;
  }

  return flat;
}

function normalizeFundingBookRecord(record) {
  if (!record || typeof record !== 'object') return record;

  const owner = resolvePackageOwner(record);
  record.package_owner = owner;

  if (owner) {
    record['Package_Owner.name'] = owner;
  }

  return record;
}

function mergeFundingBookRecord(existing, incoming) {
  normalizeFundingBookRecord(incoming);

  if (!existing) return incoming;

  const merged = { ...existing, ...incoming };
  const owner = resolvePackageOwner(incoming) || coalesceName(existing.package_owner);
  merged.package_owner = owner;
  if (owner) merged['Package_Owner.name'] = owner;

  return merged;
}

module.exports = {
  isHouseName,
  packageOwnerLookup,
  resolvePackageOwner,
  normalizeFundingBookRecord,
  mergeFundingBookRecord,
};
