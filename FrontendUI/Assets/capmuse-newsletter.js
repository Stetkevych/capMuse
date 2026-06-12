// Lender Inbox — newsletter page
(function () {
  'use strict';

  let feedEl = document.getElementById('emailFeed');
  if (!feedEl) return;

  let API_BASE = 'https://capmuse-kyll.onrender.com';
  let PAGE_SIZE = 50;
  let _emails = [];
  let _detailCache = {};
  let _loading = false;
  let _loadingMore = false;
  let _hasMore = false;
  let _nextSkip = 0;
  let expandedId = null;
  let subjectQuery = '';
  let _tagFilter = 'all';
  let _searchTimer = null;

  let EMAIL_IFRAME_SANDBOX = 'allow-same-origin allow-popups allow-popups-to-escape-sandbox';

  let TAG_RULES = [
    { tag: 'Offer',     keywords: ['offer', 'factor rate', 'mca offer', 'advance offer'] },
    { tag: 'Approval',  keywords: ['approved', 'approval', 'congratulations', 'funded'] },
    { tag: 'Decline',   keywords: ['decline', 'unable to move forward', 'not approved', 'denied'] },
    { tag: 'Update',    keywords: ['update', 'revised', 'change', 'new terms', 'stacking'] },
    { tag: 'Renewal',   keywords: ['renewal', 'renew', 'refinance'] },
    { tag: 'Rate Sheet',keywords: ['rate sheet', 'pricing update', 'program update'] }
  ];

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function initials(name) {
    return (name || '?').split(' ').map(function (w) { return w[0] || ''; }).slice(0, 2).join('').toUpperCase() || '?';
  }

  function tagSlug(tag) {
    return String(tag).toLowerCase().replace(/\s+/g, '-');
  }

  function autoTag(subject, preview) {
    let text = ((subject || '') + ' ' + (preview || '')).toLowerCase();
    let tags = [];
    TAG_RULES.forEach(function (rule) {
      if (rule.keywords.some(function (k) { return text.indexOf(k) > -1; })) {
        tags.push(rule.tag);
      }
    });
    return tags.length ? tags : ['General'];
  }

  function fmtDate(iso) {
    if (!iso) return '';
    let d = new Date(iso);
    let now = new Date();
    let diffMin = Math.floor((now - d) / 60000);
    let diffH = Math.floor(diffMin / 60);
    let diffD = Math.floor(diffH / 24);
    if (diffMin < 60) return diffMin <= 1 ? 'Just now' : diffMin + 'm ago';
    if (diffH < 24) return diffH + 'h ago';
    if (diffD === 1) return 'Yesterday';
    if (diffD < 7) return diffD + 'd ago';
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }

  function linkifyHtml(html) {
    return String(html || '').replace(/<a\b([^>]*?)>/gi, function (_, attrs) {
      let next = attrs;
      if (!/target\s*=/i.test(next)) next += ' target="_blank"';
      if (!/rel\s*=/i.test(next)) next += ' rel="noopener noreferrer"';
      return '<a' + next + '>';
    });
  }

  function prepareEmailDocument(html) {
    let body = linkifyHtml(html || '');
    let emailStyles =
      'body{margin:0;padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a;background:#fff;}' +
      'img{max-width:100%;height:auto;border:0;display:inline-block;}' +
      'a{color:#2563eb;text-decoration:underline;cursor:pointer;}' +
      'table{max-width:100%;}td,th{word-break:break-word;}';

    if (/^\s*<!DOCTYPE|^\s*<html[\s>]/i.test(body)) {
      if (!/<base\b/i.test(body)) {
        body = body.replace(/<head([^>]*)>/i, '<head$1><base target="_blank"><meta name="referrer" content="no-referrer">');
      }
      if (!/<meta\s+charset/i.test(body)) {
        body = body.replace(/<head([^>]*)>/i, '<head$1><meta charset="utf-8">');
      }
      if (body.indexOf('img{max-width') === -1) {
        body = body.replace(/<\/head>/i, '<style>' + emailStyles + '</style></head>');
      }
      return body;
    }

    return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer">' +
      '<base target="_blank"><style>' + emailStyles + '</style></head><body>' + body + '</body></html>';
  }

  function mountEmailBody(container, email) {
    if (!container || !email) return;
    if (email.bodyType === 'html' && email.body) {
      container.innerHTML = '<iframe class="nl-iframe" title="Email body"></iframe>';
      let frame = container.querySelector('.nl-iframe');
      frame.setAttribute('sandbox', EMAIL_IFRAME_SANDBOX);
      frame.srcdoc = prepareEmailDocument(email.body);
      return;
    }
    container.innerHTML = '<div class="nl-detail-text">' + esc(email.body || email.preview) + '</div>';
  }

  function fetchEmailDetail(id) {
    if (_detailCache[id]) return Promise.resolve(_detailCache[id]);
    let local = _emails.find(function (e) { return String(e.id) === String(id); });
    return fetch(API_BASE + '/newsletter/emails/' + encodeURIComponent(id))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        let email = data.email || data;
        _detailCache[id] = email;
        return email;
      })
      .catch(function () { return local; });
  }

  function matchesSubjectFilter(email) {
    if (!subjectQuery) return true;
    return (email.subject || '').toLowerCase().indexOf(subjectQuery.toLowerCase()) > -1;
  }

  function matchesTagFilter(email) {
    if (!_tagFilter || _tagFilter === 'all') return true;
    if (_tagFilter === 'unread') return !!email.unread;
    return (email.tags || []).some(function (t) { return tagSlug(t) === _tagFilter; });
  }

  function visibleEmails() {
    return _emails.filter(function (e) { return matchesSubjectFilter(e) && matchesTagFilter(e); });
  }

  function unreadCount() {
    return _emails.filter(function (e) { return e.unread; }).length;
  }

  function updateMeta() {
    let metaEl = document.getElementById('nlMeta');
    if (!metaEl) return;
    let shown = visibleEmails().length;
    let unread = unreadCount();
    let text = shown + ' email' + (shown === 1 ? '' : 's');
    if (subjectQuery) text += ' matching "' + subjectQuery + '"';
    let dotHtml = unread > 0
      ? '<span class="chip-dot" aria-hidden="true"></span>' + unread + ' unread'
      : text;
    metaEl.innerHTML = unread > 0
      ? '<span class="chip-dot" aria-hidden="true"></span>' + unread + ' unread &nbsp;·&nbsp; ' + shown + ' total'
      : text;
  }

  function updateLoadMoreBtn() {
    let btn = document.getElementById('loadMoreBtn');
    if (!btn) return;
    btn.hidden = !_hasMore || _loading || _loadingMore;
    btn.disabled = _loadingMore;
    btn.textContent = _loadingMore ? 'Loading…' : 'Load older emails';
  }

  function renderSkeleton() {
    let html = '<div class="nl-skeleton">';
    for (let i = 0; i < 5; i++) {
      html +=
        '<div class="nl-skel-card">' +
          '<div class="nl-skel-row">' +
            '<div class="nl-skel-avatar"></div>' +
            '<div class="nl-skel-lines">' +
              '<div class="nl-skel-line"></div>' +
              '<div class="nl-skel-line nl-skel-line--sm"></div>' +
            '</div>' +
          '</div>' +
          '<div class="nl-skel-body">' +
            '<div class="nl-skel-line"></div>' +
            '<div class="nl-skel-line nl-skel-line--xs"></div>' +
          '</div>' +
        '</div>';
    }
    html += '</div>';
    feedEl.innerHTML = html;
  }

  function renderFeed() {
    let emails = visibleEmails();

    if (_loading && !_emails.length) {
      renderSkeleton();
      updateLoadMoreBtn();
      updateMeta();
      return;
    }

    if (!emails.length) {
      feedEl.innerHTML =
        '<div class="nl-state">' +
          '<div class="nl-state-icon">' +
            '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="4" width="16" height="13" rx="2"/><path d="M2 7l8 5 8-5" stroke-linecap="round"/></svg>' +
          '</div>' +
          '<div class="nl-state-title">No emails found</div>' +
          '<div class="nl-state-sub">' + (subjectQuery ? 'Try a different search keyword.' : _tagFilter !== 'all' ? 'No emails match this filter.' : 'Your inbox is empty or still connecting.') + '</div>' +
        '</div>';
      updateLoadMoreBtn();
      updateMeta();
      return;
    }

    feedEl.innerHTML = emails.map(function (e) {
      let isExpanded = expandedId === e.id;
      let unreadCls = e.unread ? ' unread' : '';
      let expandedCls = isExpanded ? ' expanded' : '';

      let tagsHtml = (e.tags || []).map(function (t) {
        return '<span class="nl-tag" data-tag="' + esc(tagSlug(t)) + '">' + esc(t) + '</span>';
      }).join('');

      let cardHtml =
        '<div class="nl-card' + unreadCls + expandedCls + '" data-id="' + esc(e.id) + '" role="button" tabindex="0" aria-expanded="' + isExpanded + '" aria-label="' + esc(e.subject || 'Email') + '">' +
          '<div class="nl-card-top">' +
            '<div class="nl-sender-wrap">' +
              '<div class="nl-avatar" aria-hidden="true">' + initials(e.sender) + '</div>' +
              '<div class="nl-sender-info">' +
                '<div class="nl-sender">' + esc(e.sender) + '</div>' +
                '<div class="nl-email">' + esc(e.email) + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="nl-meta">' +
              (e.unread ? '<span class="nl-unread-dot" aria-label="Unread"></span>' : '') +
              '<span class="nl-date">' + esc(fmtDate(e.date)) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="nl-subject">' + esc(e.subject) + '</div>' +
          '<div class="nl-preview">' + esc(e.preview) + '</div>' +
          '<div class="nl-tags">' + tagsHtml + '</div>' +
        '</div>';

      let detailHtml = '';
      if (isExpanded) {
        let detailTagsHtml = (e.tags || []).map(function (t) {
          return '<span class="nl-tag" data-tag="' + esc(tagSlug(t)) + '">' + esc(t) + '</span>';
        }).join('');

        detailHtml =
          '<div class="nl-detail">' +
            '<div class="nl-detail-head">' +
              '<div class="nl-detail-sender-row">' +
                '<div class="nl-detail-avatar" aria-hidden="true">' + initials(e.sender) + '</div>' +
                '<div class="nl-detail-meta">' +
                  '<div class="nl-detail-subject">' + esc(e.subject) + '</div>' +
                  '<div class="nl-detail-from">' + esc(e.sender) + ' &lt;' + esc(e.email) + '&gt; · ' + esc(fmtDate(e.date)) + '</div>' +
                '</div>' +
              '</div>' +
              '<button type="button" class="nl-detail-close" data-close="' + esc(e.id) + '" aria-label="Close email">&#10005;</button>' +
            '</div>' +
            (detailTagsHtml ? '<div class="nl-detail-tags">' + detailTagsHtml + '</div>' : '') +
            '<div class="nl-detail-body" data-email-id="' + esc(e.id) + '">' +
              '<div class="nl-detail-text">Loading…</div>' +
            '</div>' +
          '</div>';
      }

      return cardHtml + detailHtml;
    }).join('');

    if (expandedId) {
      let bodyHost = feedEl.querySelector('.nl-detail-body[data-email-id="' + expandedId + '"]');
      if (bodyHost) {
        fetchEmailDetail(expandedId).then(function (full) {
          if (String(expandedId) !== String((full || {}).id)) return;
          mountEmailBody(bodyHost, full);
        });
      }
    }

    feedEl.querySelectorAll('.nl-card').forEach(function (card) {
      function open() {
        let id = card.getAttribute('data-id');
        let email = _emails.find(function (e) { return String(e.id) === id; });
        if (email && email.unread) {
          email.unread = false;
          markRead(id);
        }
        expandedId = expandedId === id ? null : id;
        renderFeed();
      }
      card.addEventListener('click', open);
      card.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
      });
    });

    feedEl.querySelectorAll('.nl-detail-close').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        expandedId = null;
        renderFeed();
      });
    });

    updateLoadMoreBtn();
    updateMeta();
  }

  function mergeEmails(batch) {
    batch.forEach(function (e) {
      if (!_emails.some(function (x) { return String(x.id) === String(e.id); })) {
        _emails.push(e);
      }
    });
  }

  function loadEmails(append) {
    if (_loading || _loadingMore) return;
    if (append) _loadingMore = true;
    else {
      _loading = true;
      _emails = [];
      _nextSkip = 0;
      expandedId = null;
    }
    renderFeed();

    let url = API_BASE + '/newsletter/emails?limit=' + PAGE_SIZE + '&skip=' + (append ? _nextSkip : 0);
    if (subjectQuery) url += '&subject=' + encodeURIComponent(subjectQuery);

    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        let batch = (data.emails || []).map(function (e) {
          e.tags = autoTag(e.subject, e.preview);
          return e;
        });
        if (append) mergeEmails(batch);
        else _emails = batch;
        _hasMore = !!data.hasMore;
        _nextSkip = typeof data.nextSkip === 'number' ? data.nextSkip : _nextSkip + PAGE_SIZE;
        _loading = false;
        _loadingMore = false;
        renderFeed();
      })
      .catch(function (err) {
        console.warn('[Newsletter]', err.message);
        _loading = false;
        _loadingMore = false;
        if (!_emails.length) {
          feedEl.innerHTML =
            '<div class="nl-state">' +
              '<div class="nl-state-icon"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10" cy="10" r="8"/><path d="M10 6v4M10 14h.01" stroke-linecap="round"/></svg></div>' +
              '<div class="nl-state-title">Could not load emails</div>' +
              '<div class="nl-state-sub">' + esc(err.message) + '</div>' +
            '</div>';
        }
        updateLoadMoreBtn();
        updateMeta();
      });
  }

  function markRead(id) {
    fetch(API_BASE + '/newsletter/emails/' + encodeURIComponent(id) + '/read', { method: 'PATCH' })
      .catch(function () {});
  }

  /* Public API for tag filter chips */
  window.NL = {
    setTagFilter: function (filter) {
      _tagFilter = filter || 'all';
      expandedId = null;
      renderFeed();
    }
  };

  let searchEl = document.getElementById('nlSubjectSearch');
  if (searchEl) {
    searchEl.addEventListener('input', function () {
      let val = searchEl.value.trim();
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(function () {
        subjectQuery = val;
        loadEmails(false);
      }, 350);
    });
  }

  let refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      _detailCache = {};
      loadEmails(false);
    });
  }

  let loadMoreBtn = document.getElementById('loadMoreBtn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', function () {
      loadEmails(true);
    });
  }

  loadEmails(false);
})();
