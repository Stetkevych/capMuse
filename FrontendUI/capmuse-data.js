// Shared funding-book loader — single fetch, session cache, stale-while-revalidate
(function () {
  let BUCKET = 'https://capmuse-data-882611632216.s3.amazonaws.com';
  let CACHE_KEY = 'capmuse:funding_book_live:v4';
  let PIPELINE_CACHE_KEY = 'capmuse:pipeline_csv:v1';
  let CACHE_TTL = 5 * 60 * 1000;
  let inflight = null;
  let pipelineInflight = null;

  function parseRecords(raw) {
    if (!raw || !raw.length) return [];
    return raw.filter(function (r) { return r.company || r.Deal_Name; });
  }

  function readCache(allowStale) {
    try {
      let cached = sessionStorage.getItem(CACHE_KEY);
      if (!cached) return null;
      let parsed = JSON.parse(cached);
      if (!parsed || !parsed.data || !parsed.ts) return null;
      if (!allowStale && Date.now() - parsed.ts > CACHE_TTL) return null;
      return parsed.data;
    } catch (e) {
      return null;
    }
  }

  function writeCache(data) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data }));
    } catch (e) {}
  }

  function fetchFresh() {
    return fetch(BUCKET + '/funding_book_live.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.length) writeCache(data);
        return data;
      })
      .catch(function () { return null; });
  }

  function getRawDeals() {
    if (inflight) return inflight;

    let cached = readCache();
    if (cached) {
      inflight = Promise.resolve(cached);
      fetchFresh().then(function (fresh) {
        if (fresh && fresh.length) {
          writeCache(fresh);
          window.dispatchEvent(new CustomEvent('capmuse:deals-updated', { detail: fresh }));
        }
      });
      return inflight;
    }

    inflight = fetchFresh().then(function (data) {
      if (data && data.length) return data;
      let stale = readCache(true);
      return stale || [];
    });
    return inflight;
  }

  function readPipelineCache() {
    try {
      let cached = sessionStorage.getItem(PIPELINE_CACHE_KEY);
      if (!cached) return null;
      let parsed = JSON.parse(cached);
      if (!parsed || !parsed.data || !parsed.ts) return null;
      if (Date.now() - parsed.ts > CACHE_TTL) return null;
      return parsed.data;
    } catch (e) {
      return null;
    }
  }

  function writePipelineCache(data) {
    try {
      sessionStorage.setItem(PIPELINE_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data }));
    } catch (e) {}
  }

  function splitCsvRow(line) {
    let result = [], cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      let c = line[i];
      if (c === '"') inQ = !inQ;
      else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    result.push(cur.trim());
    return result;
  }

  function parsePipelineCsv(text) {
    if (!text) return [];
    let lines = [], current = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      let ch = text[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === '\n' && !inQuotes) { lines.push(current.replace(/\r$/, '')); current = ''; }
      else current += ch;
    }
    if (current.trim()) lines.push(current.replace(/\r$/, ''));
    if (lines.length < 2) return [];
    let headers = splitCsvRow(lines[0]), rows = [];
    for (let j = 1; j < lines.length; j++) {
      if (!lines[j].trim()) continue;
      let vals = splitCsvRow(lines[j]);
      let obj = {};
      for (let k = 0; k < headers.length; k++) obj[headers[k]] = vals[k] || '';
      rows.push(obj);
    }
    return rows;
  }

  function fetchPipelineFresh() {
    return fetch(BUCKET + '/pipeline.csv')
      .then(function (r) { return r.ok ? r.text() : null; })
      .then(function (text) {
        let rows = parsePipelineCsv(text || '');
        if (rows.length) writePipelineCache(rows);
        return rows;
      })
      .catch(function () { return []; });
  }

  function getPipelineRows() {
    if (pipelineInflight) return pipelineInflight;

    let cached = readPipelineCache();
    if (cached) {
      pipelineInflight = Promise.resolve(cached);
      fetchPipelineFresh().then(function (fresh) {
        if (fresh && fresh.length) {
          writePipelineCache(fresh);
          window.dispatchEvent(new CustomEvent('capmuse:pipeline-updated', { detail: fresh }));
        }
      });
      return pipelineInflight;
    }

    pipelineInflight = fetchPipelineFresh().then(function (data) {
      return data || [];
    });
    return pipelineInflight;
  }

  window.CapMuseData = {
    getRawDeals: getRawDeals,
    getPipelineRows: getPipelineRows,
    prefetch: function () {
      getRawDeals();
      getPipelineRows();
    }
  };
})();
