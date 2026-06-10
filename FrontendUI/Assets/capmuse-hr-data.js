// HR data — DOB and Anniversary from BirthdaysAndAniversary.csv
(function () {
  'use strict';

  let CSV_URL = 'Assets/BirthdaysAndAniversary.csv';
  let HR_ROWS = null;
  let loadPromise = null;

  let CSV_NAME_MAP = {
    matthew: 'Matthew',
    matthewM: 'Matthew Mejia',
    anderson: 'Erik Anderson',
    colin: 'Colin O',
    dominic: 'Dominic B',
    santi: 'Santiago',
    pina: 'Cristian',
    diaz: 'Anthony Diaz',
    gimmy: 'Gimmy Cipriani',
    frank: 'Frank Padilla',
    daniel: 'Daniel Pineda',
    nikholas: 'Nikholas Lazo',
    nicholas: 'Nicholas',
    jonathan: 'Jonathan M',
    gabriel: 'Gabriel',
    gabe: 'Gabriel',
    juan: 'Juan',
    joseph: 'Joseph',
    jamar: 'Jamar Johnson',
    kevin: 'Kevin Cohen',
    edward: 'Edward',
    guillermo: 'Guillermo',
    emilio: 'Emilio',
    evan: 'Evan',
    ivan: 'Ivan',
    kip: 'Kip',
    ken: 'Ken',
    careem: 'Careem',
    rio: 'Rio',
    ray: 'Ray',
    michael: 'Michael'
  };

  function normName(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function isMissing(val) {
    let v = String(val || '').trim();
    return !v || v === '-';
  }

  function parseCsvLine(line) {
    let out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      let ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  function parseCsv(text) {
    let lines = String(text || '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return [];
    let headers = parseCsvLine(lines[0]);
    let nameIdx = headers.indexOf('Column 1');
    let dobIdx = headers.indexOf('DOB');
    let annIdx = headers.indexOf('Anniversary');
    if (nameIdx < 0) nameIdx = 0;
    if (dobIdx < 0) dobIdx = 1;
    if (annIdx < 0) annIdx = 2;

    let rows = [];
    for (let i = 1; i < lines.length; i++) {
      let cols = parseCsvLine(lines[i]);
      let name = (cols[nameIdx] || '').trim();
      if (!name) continue;
      rows.push({
        name: name,
        nameKey: normName(name),
        dob: isMissing(cols[dobIdx]) ? null : String(cols[dobIdx]).trim(),
        anniversary: isMissing(cols[annIdx]) ? null : String(cols[annIdx]).trim()
      });
    }
    return rows;
  }

  function parseMDYDate(str) {
    if (!str || isMissing(str)) return null;
    let parts = String(str).trim().split('/');
    if (parts.length !== 3) return null;
    let mo = parseInt(parts[0], 10);
    let day = parseInt(parts[1], 10);
    let yr = parseInt(parts[2], 10);
    if (!mo || !day || !yr) return null;
    let d = new Date(yr, mo - 1, day);
    if (d.getFullYear() !== yr || d.getMonth() !== mo - 1 || d.getDate() !== day) return null;
    return d;
  }

  function todayAtMidnight() {
    let n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  function elapsedYearsMonths(fromDate, toDate) {
    if (!fromDate || !toDate || fromDate.getTime() > toDate.getTime()) return null;
    let years = toDate.getFullYear() - fromDate.getFullYear();
    let months = toDate.getMonth() - fromDate.getMonth();
    if (toDate.getDate() < fromDate.getDate()) months--;
    if (months < 0) {
      years--;
      months += 12;
    }
    if (years < 0) return null;
    return { years: years, months: months };
  }

  function formatAge(dobDate) {
    let el = elapsedYearsMonths(dobDate, todayAtMidnight());
    if (!el) return null;
    return el.years;
  }

  function formatTenure(anniversaryDate) {
    let today = todayAtMidnight();
    if (anniversaryDate.getTime() > today.getTime()) return null;
    let el = elapsedYearsMonths(anniversaryDate, today);
    if (!el) return null;
    if (el.years === 0 && el.months === 0) return '< 1 mo';
    let moLbl = el.months === 1 ? ' mo' : ' mos';
    if (el.years === 0) return el.months + moLbl;
    let yrLbl = el.years === 1 ? ' yr' : ' yrs';
    if (el.months === 0) return el.years + yrLbl;
    return el.years + yrLbl + ' ' + el.months + moLbl;
  }

  function findRowByName(name) {
    if (!HR_ROWS || !name) return null;
    let key = normName(name);
    for (let i = 0; i < HR_ROWS.length; i++) {
      if (HR_ROWS[i].nameKey === key) return HR_ROWS[i];
    }
    return null;
  }

  function resolveCsvName(rep, userId) {
    if (rep && rep.csvName) return rep.csvName;
    if (userId && CSV_NAME_MAP[userId]) return CSV_NAME_MAP[userId];
    if (rep && rep.bookName) {
      let byBook = findRowByName(rep.bookName);
      if (byBook) return byBook.name;
    }
    if (rep && rep.name) {
      let byName = findRowByName(rep.name);
      if (byName) return byName.name;
    }
    return null;
  }

  function getHrStatsForRep(rep, userId) {
    if (!HR_ROWS) return { age: null, timeInCompany: null };
    let csvName = resolveCsvName(rep, userId);
    if (!csvName) return { age: null, timeInCompany: null };

    let row = findRowByName(csvName);
    if (!row) return { age: null, timeInCompany: null };

    let dobDate = row.dob ? parseMDYDate(row.dob) : null;
    let annDate = row.anniversary ? parseMDYDate(row.anniversary) : null;

    return {
      age: dobDate ? formatAge(dobDate) : null,
      timeInCompany: annDate ? formatTenure(annDate) : null
    };
  }

  function load() {
    if (HR_ROWS) return Promise.resolve(HR_ROWS);
    if (loadPromise) return loadPromise;

    loadPromise = fetch(CSV_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HR CSV fetch failed');
        return res.text();
      })
      .then(function (text) {
        HR_ROWS = parseCsv(text);
        window.dispatchEvent(new CustomEvent('capmuse:hr-data-loaded'));
        return HR_ROWS;
      })
      .catch(function () {
        HR_ROWS = [];
        window.dispatchEvent(new CustomEvent('capmuse:hr-data-loaded'));
        return HR_ROWS;
      });

    return loadPromise;
  }

  function prefetch() {
    load();
  }

  window.CapMuseHrData = {
    load: load,
    prefetch: prefetch,
    getHrStatsForRep: getHrStatsForRep,
    CSV_NAME_MAP: CSV_NAME_MAP
  };
})();
