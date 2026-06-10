// Shared rep ↔ funding-book record matching
(function () {
  'use strict';

  function normalize(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function tokens(name) {
    return normalize(name).split(' ').filter(function (t) { return t.length > 0; });
  }

  function namesMatch(recordName, targetName) {
    let rec = normalize(recordName);
    let target = normalize(targetName);
    if (!rec || !target) return false;
    if (rec === target) return true;

    let targetTokens = tokens(targetName);
    if (targetTokens.length >= 2) {
      return targetTokens.every(function (t) {
        if (t.length <= 1) return true;
        return rec.indexOf(t) > -1;
      });
    }

    if (targetTokens.length === 1) {
      let token = targetTokens[0];
      if (token.length <= 2) return false;
      let recTokens = tokens(recordName);
      if (recTokens.length === 1) return recTokens[0] === token;
      return recTokens[0] === token || recTokens[recTokens.length - 1] === token;
    }

    return false;
  }

  function repTargetName(rep, userId) {
    if (rep && rep.bookName) return rep.bookName;
    if (rep && rep.name) return rep.name;
    return userId || '';
  }

  let ROLE_FIELD_KEYS = {
    package_owner: ['package_owner', 'Package_Owner.name', 'Owner.name'],
    puller: ['puller', 'Puller.name', 're_puller']
  };

  function fieldValues(record, role) {
    let keys = ROLE_FIELD_KEYS[role] || [role];
    let out = [];
    keys.forEach(function (key) {
      let val = record[key];
      if (val && String(val).trim()) out.push(String(val).trim());
    });
    return out;
  }

  function matchRolesFor(rep, options) {
    if (options && options.fundedOnly) return ['package_owner'];
    if (options && options.pullerOnly) return ['puller'];
    if (rep && rep.bookRoles && rep.bookRoles.length) return rep.bookRoles;
    return ['package_owner', 'puller'];
  }

  function recordMatchesRep(record, rep, userId, options) {
    options = options || {};
    let target = repTargetName(rep, userId);
    if (!target) return false;

    let roles = matchRolesFor(rep, options);
    let fields = [];
    roles.forEach(function (role) {
      fields = fields.concat(fieldValues(record, role));
    });

    return fields.some(function (field) {
      return namesMatch(field, target);
    });
  }

  window.CapMuseRepMatch = {
    normalize: normalize,
    namesMatch: namesMatch,
    repTargetName: repTargetName,
    recordMatchesRep: recordMatchesRep
  };
})();
