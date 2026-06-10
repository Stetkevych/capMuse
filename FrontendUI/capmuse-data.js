// Shared funding-book loader — single fetch, session cache, stale-while-revalidate
(function () {
  let BUCKET = 'https://capmuse-data-882611632216.s3.amazonaws.com';
  let CACHE_KEY = 'capmuse:funding_book_live:v4';
  let CACHE_TTL = 5 * 60 * 1000;
  let inflight = null;

  function parseRecords(raw) {
    if (!raw || !raw.length) return [];
    return raw.filter(function (r) { return r.company || r.Deal_Name; });
  }

  function readCache() {
    try {
      let cached = sessionStorage.getItem(CACHE_KEY);
      if (!cached) return null;
      let parsed = JSON.parse(cached);
      if (!parsed || !parsed.data || !parsed.ts) return null;
      if (Date.now() - parsed.ts > CACHE_TTL) return null;
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
      return data || [];
    });
    return inflight;
  }

  window.CapMuseData = {
    getRawDeals: getRawDeals,
    prefetch: function () { getRawDeals(); }
  };
})();
