// Landing page — Latest News from newsletter inbox
(function () {
  'use strict';

  let listEl = document.getElementById('dashNewsList');
  if (!listEl) return;

  let API_BASE = 'https://capmuse-kyll.onrender.com';
  let NEWS_DISPLAY_LIMIT = 6;
  let NEWS_FETCH_LIMIT = 50;
  let _emails = [];
  let _loading = false;
  let _overlay = null;
  let _cardEl = null;
  let subjectQuery = '';
  let _searchTimer = null;
  let _dismissed = loadDismissedIds();

  function dismissStorageKey() {
    let userId = (window.CapMuseAuth && window.CapMuseAuth.getUserId)
      ? window.CapMuseAuth.getUserId()
      : null;
    return 'capmuse-dash-news-dismissed:' + (userId || 'anonymous');
  }

  function loadDismissedIds() {
    try {
      let raw = localStorage.getItem(dismissStorageKey());
      if (!raw) return new Set();
      let arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return new Set();
      return new Set(arr.map(String));
    } catch (e) {
      return new Set();
    }
  }

  function saveDismissedIds() {
    try {
      localStorage.setItem(dismissStorageKey(), JSON.stringify(Array.from(_dismissed)));
    } catch (e) {}
  }

  function isDismissed(id) {
    return _dismissed.has(String(id));
  }

  function dismissEmail(id) {
    if (!id) return;
    _dismissed.add(String(id));
    saveDismissedIds();
    renderList();
  }

  let TAG_RULES = [
    { tag: 'Offer', keywords: ['offer', 'factor rate', 'mca offer', 'advance offer'] },
    { tag: 'Approval', keywords: ['approved', 'approval', 'congratulations', 'funded'] },
    { tag: 'Decline', keywords: ['decline', 'unable to move forward', 'not approved', 'denied'] },
    { tag: 'Update', keywords: ['update', 'revised', 'change', 'new terms', 'stacking'] },
    { tag: 'Renewal', keywords: ['renewal', 'renew', 'refinance'] },
    { tag: 'Rate Sheet', keywords: ['rate sheet', 'pricing update', 'program update'] }
  ];

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function initials(name) {
    return (name || '?').split(' ').map(function (w) { return w[0] || ''; }).slice(0, 2).join('').toUpperCase() || '?';
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

  function fmtNewsDate(iso) {
    if (!iso) return '';
    let d = new Date(iso);
    let now = new Date();
    let diffMin = Math.floor((now - d) / 60000);
    let diffH = Math.floor(diffMin / 60);
    let diffD = Math.floor(diffH / 24);
    if (diffMin < 60) return diffMin <= 1 ? 'Now' : diffMin + 'm';
    if (diffH < 24) return diffH + 'h';
    if (diffD === 1) return 'Yest.';
    if (diffD < 7) return diffD + 'd';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  }

  function fmtFullDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  let EMAIL_IFRAME_SANDBOX = 'allow-same-origin allow-popups allow-popups-to-escape-sandbox';

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

  function renderEmailBody(email, bodyEl) {
    if (email.bodyType === 'html' && email.body) {
      bodyEl.innerHTML = '<iframe class="news-email-iframe" title="Email body"></iframe>';
      let frame = bodyEl.querySelector('.news-email-iframe');
      frame.setAttribute('sandbox', EMAIL_IFRAME_SANDBOX);
      frame.srcdoc = prepareEmailDocument(email.body);
      frame.onload = function () {
        try {
          let doc = frame.contentDocument;
          if (!doc || !doc.documentElement) return;
          let h = Math.max(doc.documentElement.scrollHeight, doc.body ? doc.body.scrollHeight : 0);
          if (h > 200) {
            frame.style.height = Math.min(h + 32, window.innerHeight * 0.94 - 200) + 'px';
          }
        } catch (e) {}
      };
      return;
    }
    bodyEl.innerHTML = '<div class="news-email-text">' + esc(email.body || email.preview) + '</div>';
  }

  function fetchEmailDetail(id) {
    return fetch(API_BASE + '/newsletter/emails/' + encodeURIComponent(id))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        return data.email || data;
      });
  }

  function matchesSubject(email) {
    if (!subjectQuery) return true;
    return (email.subject || '').toLowerCase().indexOf(subjectQuery.toLowerCase()) > -1;
  }

  function visibleEmails() {
    let filtered = _emails.filter(function (e) {
      return !isDismissed(e.id) && matchesSubject(e);
    });
    if (!subjectQuery) return filtered.slice(0, NEWS_DISPLAY_LIMIT);
    return filtered;
  }

  function renderLoading() {
    let html = '';
    let i;
    for (i = 0; i < NEWS_DISPLAY_LIMIT; i++) {
      html += '<article class="news-item news-item--empty" aria-hidden="true">' +
        '<time class="news-date"></time>' +
        '<div class="news-copy"><p class="news-headline"></p><p class="news-summary"></p></div>' +
        '</article>';
    }
    listEl.innerHTML = html;
  }

  function renderEmpty(message) {
    listEl.innerHTML =
      '<div class="news-empty">' +
        '<p class="news-empty-title">' + (subjectQuery ? 'No matches' : 'No news yet') + '</p>' +
        '<p class="news-empty-sub">' + esc(message || 'Lender emails will appear here when the inbox is connected.') + '</p>' +
      '</div>';
  }

  function renderList() {
    let items = visibleEmails();
    if (!items.length) {
      renderEmpty(subjectQuery ? 'No subjects match "' + subjectQuery + '".' : 'No emails in the inbox right now.');
      return;
    }

    listEl.innerHTML = items.map(function (e) {
      let unreadCls = e.unread ? ' news-item--unread' : '';
      let senderLine = e.sender ? esc(e.sender) + ' — ' : '';
      let firstTag = (e.tags && e.tags.length) ? e.tags[0] : 'General';
      let tagSlug = firstTag.toLowerCase().replace(/\s+/g, '-');
      return (
        '<article class="news-item' + unreadCls + '" role="button" tabindex="0" data-email-id="' + esc(e.id) + '" aria-label="Read email: ' + esc(e.subject) + '">' +
          '<button type="button" class="news-dismiss" data-email-id="' + esc(e.id) + '" aria-label="Remove from Latest News" title="Remove from Latest News">&#10005;</button>' +
          '<time class="news-date" datetime="' + esc(e.date) + '">' + esc(fmtNewsDate(e.date)) + '</time>' +
          '<div class="news-copy">' +
            '<div class="news-meta-row"><span class="news-tag" data-tag="' + esc(tagSlug) + '">' + esc(firstTag) + '</span></div>' +
            '<p class="news-headline">' + esc(e.subject) + '</p>' +
            '<p class="news-summary">' + senderLine + esc(e.preview) + '</p>' +
          '</div>' +
        '</article>'
      );
    }).join('');

    listEl.querySelectorAll('.news-dismiss').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        dismissEmail(btn.getAttribute('data-email-id'));
      });
    });

    listEl.querySelectorAll('.news-item[data-email-id]').forEach(function (item) {
      item.addEventListener('click', function () {
        openEmail(item.getAttribute('data-email-id'));
      });
      item.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          openEmail(item.getAttribute('data-email-id'));
        }
      });
    });
  }

  function ensureModal() {
    if (_overlay) return;

    _overlay = document.createElement('div');
    _overlay.id = 'dashNewsEmailOverlay';
    _overlay.className = 'news-email-overlay';
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-modal', 'true');
    _overlay.setAttribute('aria-labelledby', 'dashNewsEmailSubject');
    _overlay.hidden = true;
    _overlay.innerHTML =
      '<div class="news-email-card">' +
        '<div class="news-email-card-header">' +
          '<div class="news-email-sender-row">' +
            '<div class="news-email-avatar" id="dashNewsEmailAvatar"></div>' +
            '<div class="news-email-meta">' +
              '<div class="news-email-subject" id="dashNewsEmailSubject"></div>' +
              '<div class="news-email-from" id="dashNewsEmailFrom"></div>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="news-email-close" id="dashNewsEmailClose" aria-label="Close">&#10005;</button>' +
        '</div>' +
        '<div class="news-email-tags" id="dashNewsEmailTags"></div>' +
        '<div class="news-email-body" id="dashNewsEmailBody"></div>' +
      '</div>';

    document.body.appendChild(_overlay);
    _cardEl = _overlay.querySelector('.news-email-card');

    _overlay.addEventListener('click', function (ev) {
      if (ev.target === _overlay) closeEmail();
    });
    document.getElementById('dashNewsEmailClose').addEventListener('click', closeEmail);
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && _overlay && !_overlay.hidden) closeEmail();
    });
  }

  function openEmail(id) {
    let email = _emails.find(function (e) { return String(e.id) === String(id); });
    if (!email) return;

    ensureModal();

    if (email.unread) {
      email.unread = false;
      markRead(email.id);
      renderList();
    }

    document.getElementById('dashNewsEmailAvatar').textContent = initials(email.sender);
    document.getElementById('dashNewsEmailSubject').textContent = email.subject || '(No subject)';
    document.getElementById('dashNewsEmailFrom').textContent =
      (email.sender || 'Unknown') + (email.email ? ' <' + email.email + '>' : '') + ' · ' + fmtFullDate(email.date);

    let tagsEl = document.getElementById('dashNewsEmailTags');
    tagsEl.innerHTML = (email.tags || []).map(function (t) {
      let slug = t.toLowerCase().replace(/\s+/g, '-');
      return '<span class="news-email-tag" data-tag="' + esc(slug) + '">' + esc(t) + '</span>';
    }).join('');

    let bodyEl = document.getElementById('dashNewsEmailBody');
    bodyEl.innerHTML = '<div class="news-email-loading">Loading email…</div>';

    _overlay.hidden = false;
    requestAnimationFrame(function () {
      _overlay.classList.add('open');
    });
    document.body.style.overflow = 'hidden';

    fetchEmailDetail(id)
      .then(function (full) {
        if (full.tags) email.tags = full.tags;
        else full.tags = email.tags;
        Object.assign(email, full);
        renderEmailBody(full, bodyEl);
      })
      .catch(function () {
        renderEmailBody(email, bodyEl);
      });
  }

  function closeEmail() {
    if (!_overlay) return;
    _overlay.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(function () {
      if (_overlay) _overlay.hidden = true;
      let bodyEl = document.getElementById('dashNewsEmailBody');
      if (bodyEl) bodyEl.innerHTML = '';
    }, 200);
  }

  function markRead(id) {
    fetch(API_BASE + '/newsletter/emails/' + encodeURIComponent(id) + '/read', { method: 'PATCH' })
      .catch(function () {});
  }

  function loadEmails() {
    _loading = true;
    renderLoading();

    let url = API_BASE + '/newsletter/emails?limit=' + NEWS_FETCH_LIMIT;
    if (subjectQuery) url += '&subject=' + encodeURIComponent(subjectQuery);

    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        _emails = (data.emails || []).map(function (e) {
          e.tags = autoTag(e.subject, e.preview);
          return e;
        });
        _loading = false;
        renderList();
      })
      .catch(function (err) {
        console.warn('[Dashboard News]', err.message);
        _loading = false;
        renderEmpty('Could not load emails. Check the newsletter connection.');
      });
  }

  let searchEl = document.getElementById('dashNewsSearch');
  if (searchEl) {
    searchEl.addEventListener('input', function () {
      let val = searchEl.value.trim();
      clearTimeout(_searchTimer);
      subjectQuery = val;
      if (!_loading) renderList();
      _searchTimer = setTimeout(function () {
        subjectQuery = val;
        loadEmails();
      }, 350);
    });
  }

  loadEmails();
})();
