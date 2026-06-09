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
    var rec = normalize(recordName);
    var target = normalize(targetName);
    if (!rec || !target) return false;
    if (rec === target) return true;

    var targetTokens = tokens(targetName);
    if (targetTokens.length >= 2) {
      return targetTokens.every(function (t) {
        if (t.length <= 1) return true;
        return rec.indexOf(t) > -1;
      });
    }

    if (targetTokens.length === 1) {
      var first = targetTokens[0];
      var recTokens = tokens(recordName);
      if (recTokens.length === 1) return recTokens[0] === first;
      return false;
    }

    return false;
  }

  function repTargetName(rep, userId) {
    if (rep && rep.bookName) return rep.bookName;
    if (rep && rep.name) return rep.name;
    return userId || '';
  }

  var ROLE_FIELD_KEYS = {
    package_owner: ['package_owner', 'Package_Owner.name', 'Owner.name'],
    puller: ['puller', 'Puller.name', 're_puller']
  };

  function fieldValues(record, role) {
    var keys = ROLE_FIELD_KEYS[role] || [role];
    var out = [];
    keys.forEach(function (key) {
      var val = record[key];
      if (val && String(val).trim()) out.push(String(val).trim());
    });
    return out;
  }

  function matchRolesFor(rep, options) {
    if (rep && rep.bookRoles && rep.bookRoles.length) return rep.bookRoles;
    if (options && options.fundedOnly) return ['package_owner'];
    return ['package_owner', 'puller'];
  }

  function recordMatchesRep(record, rep, userId, options) {
    options = options || {};
    var target = repTargetName(rep, userId);
    if (!target) return false;

    var roles = matchRolesFor(rep, options);
    var fields = [];
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
