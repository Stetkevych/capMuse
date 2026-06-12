/* ═══════════════════════════════════════════════════════════════
   capmuse-notifications.js — Bell panel, present unlock, toasts
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  let panelEl, panelListEl, panelCountEl, claimAllBtn, bellBtn, pipEl;
  let presentOverlay, presentGift, presentReveal, presentMsg, presentSub, presentClaimBtn, presentCloseBtn, presentStage;
  let presentAchievement = null;
  let presentQueue = [];
  let presentShowing = false;
  let presentCloseTimer = null;
  let presentUiReady = false;
  let deferredLoginPresentAchievements = null;
  let SESSION_KEY = 'capmuse-ach-present-session';
  let SESSION_SCAN_KEY = 'capmuse-ach-scan-session';
  let inited = false;

  function getUserId() {
    return window.CapMuseAuth && window.CapMuseAuth.getUserId
      ? window.CapMuseAuth.getUserId()
      : null;
  }

  function repIdsMatch(a, b) {
    if (!a || !b) return false;
    if (window.ensureRepProfile) {
      return window.ensureRepProfile(a) === window.ensureRepProfile(b);
    }
    return String(a).toLowerCase() === String(b).toLowerCase();
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function notificationsCssHref() {
    let base = 'Assets/capmuse-notifications.css';
    let scripts = document.getElementsByTagName('script');
    let i;
    for (i = scripts.length - 1; i >= 0; i--) {
      if ((scripts[i].src || '').indexOf('capmuse-notifications.js') > -1) {
        return scripts[i].src.replace(/capmuse-notifications\.js.*$/, 'capmuse-notifications.css');
      }
    }
    return base;
  }

  function injectStyles() {
    return new Promise(function (resolve) {
      let existing = document.getElementById('capmuse-notifications-css');
      if (existing) {
        if (existing.getAttribute('data-loaded') === '1') resolve();
        else existing.addEventListener('load', resolve);
        return;
      }
      let link = document.createElement('link');
      link.id = 'capmuse-notifications-css';
      link.rel = 'stylesheet';
      link.href = notificationsCssHref();
      link.onload = function () {
        link.setAttribute('data-loaded', '1');
        resolve();
      };
      link.onerror = resolve;
      document.head.appendChild(link);
    });
  }

  function runConfetti(durationMs) {
    durationMs = durationMs || 2200;
    let canvas = document.createElement('canvas');
    canvas.className = 'cm-confetti-canvas';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    let ctx = canvas.getContext('2d');
    let colors = ['#F59E0B', '#EF4444', '#22C55E', '#3B82F6', '#A855F7', '#FCD34D'];
    let pieces = [];
    let n;
    for (n = 0; n < 120; n++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height * 0.5 - canvas.height * 0.2,
        w: 6 + Math.random() * 6,
        h: 4 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 5,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.2
      });
    }
    let start = Date.now();
    function frame() {
      let elapsed = Date.now() - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let p;
      for (n = 0; n < pieces.length; n++) {
        p = pieces[n];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (elapsed < durationMs) {
        window.requestAnimationFrame(frame);
      } else {
        canvas.remove();
      }
    }
    window.requestAnimationFrame(frame);
  }

  function showClaimToast(achievement) {
    let toast = document.createElement('div');
    toast.className = 'cm-claim-toast';
    let gemHtml = window.CapMuseAchievements && window.CapMuseAchievements.renderGemIcon
      ? window.CapMuseAchievements.renderGemIcon(achievement.rarity)
      : '';
    toast.innerHTML =
      '<span class="cm-claim-toast-icon">' + gemHtml + '</span>' +
      '<span>Achievement claimed: <strong>' + esc(achievement.name) + '</strong></span>';
    document.body.appendChild(toast);
    window.requestAnimationFrame(function () { toast.classList.add('show'); });
    window.setTimeout(function () {
      toast.classList.remove('show');
      window.setTimeout(function () { toast.remove(); }, 350);
    }, 3200);
  }

  function refreshProfileAchievements() {
    if (window.CapMuseProfileAchievements && window.CapMuseProfileAchievements.refreshOpen) {
      window.CapMuseProfileAchievements.refreshOpen();
    }
  }

  function updatePip() {
    if (!pipEl || !window.CapMuseAchievements) return;
    let uid = getUserId();
    if (!uid) {
      pipEl.classList.remove('cm-notif-pip-active');
      return;
    }
    let unclaimed = window.CapMuseAchievements.getUnclaimedForRep(uid);
    if (unclaimed.length) pipEl.classList.add('cm-notif-pip-active');
    else pipEl.classList.remove('cm-notif-pip-active');
  }

  function renderPanel() {
    if (!panelListEl || !window.CapMuseAchievements) return;
    let uid = getUserId();
    if (!uid) {
      panelListEl.innerHTML = '<div class="cm-notif-empty">Sign in to see your notifications.</div>';
      if (panelCountEl) panelCountEl.textContent = '';
      if (claimAllBtn) claimAllBtn.hidden = true;
      return;
    }
    let all = window.CapMuseAchievements.getAllForRep(uid);
    let unclaimed = all.filter(function (a) { return !a.claimed; });
    if (panelCountEl) {
      panelCountEl.textContent = unclaimed.length
        ? unclaimed.length + ' to claim'
        : (all.length ? all.length + ' total' : '');
    }
    if (claimAllBtn) claimAllBtn.hidden = unclaimed.length < 1;
    if (!all.length) {
      panelListEl.innerHTML = '<div class="cm-notif-empty">No achievement notifications yet.</div>';
      updatePip();
      return;
    }
    panelListEl.innerHTML = all.map(function (ach) {
      let unread = !ach.claimed;
      let actions = unread
        ? '<div class="cm-notif-actions"><button type="button" class="cm-notif-claim-btn" data-claim-id="' + esc(ach.id) + '">Claim</button></div>'
        : '<div class="cm-notif-actions"><span class="cm-notif-claimed-tag">Claimed</span></div>';
      let gemHtml = window.CapMuseAchievements.renderGemIcon
        ? window.CapMuseAchievements.renderGemIcon(ach.rarity)
        : '';
      return '<div class="cm-notif-item' + (unread ? ' unread' : '') + '" data-ach-id="' + esc(ach.id) + '">' +
        '<div class="cm-notif-icon rarity-' + esc(ach.rarity) + '">' + gemHtml + '</div>' +
        '<div class="cm-notif-body">' +
          '<div class="cm-notif-name">' + esc(ach.name) + '</div>' +
          '<div class="cm-notif-desc">' + esc(ach.description) + '</div>' +
          actions +
        '</div>' +
      '</div>';
    }).join('');
    updatePip();
  }

  function setPanelOpen(open) {
    if (!panelEl) return;
    panelEl.classList.toggle('open', open);
    panelEl.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) {
      panelEl.style.opacity = '';
      panelEl.style.visibility = '';
      panelEl.style.pointerEvents = '';
    } else {
      panelEl.style.opacity = '0';
      panelEl.style.visibility = 'hidden';
      panelEl.style.pointerEvents = 'none';
    }
  }

  function togglePanel() {
    if (!panelEl) return;
    let open = !panelEl.classList.contains('open');
    setPanelOpen(open);
    if (open) renderPanel();
  }

  function closePanel() {
    setPanelOpen(false);
  }

  function claimAchievement(achievementId) {
    let uid = getUserId();
    if (!uid || !window.CapMuseAchievements) return null;
    let result = window.CapMuseAchievements.claim(uid, achievementId);
    if (result) {
      showClaimToast(result);
      renderPanel();
      refreshProfileAchievements();
    }
    return result;
  }

  function showClaimAllToast(count) {
    let toast = document.createElement('div');
    toast.className = 'cm-claim-toast';
    toast.innerHTML =
      '<span class="cm-claim-toast-icon">🎉</span>' +
      '<span>Claimed <strong>' + count + '</strong> achievements</span>';
    document.body.appendChild(toast);
    window.requestAnimationFrame(function () { toast.classList.add('show'); });
    window.setTimeout(function () {
      toast.classList.remove('show');
      window.setTimeout(function () { toast.remove(); }, 350);
    }, 3200);
  }

  function claimAllAchievements() {
    let uid = getUserId();
    if (!uid || !window.CapMuseAchievements) return;
    let unclaimed = window.CapMuseAchievements.getUnclaimedForRep(uid);
    if (!unclaimed.length) return;
    let claimed = [];
    unclaimed.forEach(function (ach) {
      let result = window.CapMuseAchievements.claim(uid, ach.id);
      if (result) claimed.push(result);
    });
    if (!claimed.length) return;
    if (claimed.length === 1) showClaimToast(claimed[0]);
    else showClaimAllToast(claimed.length);
    renderPanel();
    refreshProfileAchievements();
  }

  function buildPresentModal() {
    if (document.getElementById('cmPresentOverlay')) {
      presentOverlay = document.getElementById('cmPresentOverlay');
      return;
    }
    let html =
      '<div id="cmPresentOverlay" class="cm-present-overlay" role="dialog" aria-modal="true" aria-labelledby="cmPresentMsg" hidden>' +
        '<div class="cm-present-card">' +
          '<button type="button" class="cm-present-close" id="cmPresentClose" aria-label="Close">&times;</button>' +
          '<div class="cm-present-stage" id="cmPresentStage">' +
            '<div class="cm-present-gift" id="cmPresentGift" role="button" tabindex="0" aria-label="Open gift">' +
              '<div class="cm-present-lid"></div>' +
              '<div class="cm-present-box"></div>' +
            '</div>' +
            '<div class="cm-present-reveal" id="cmPresentReveal">' +
              '<div class="cm-present-trophy" id="cmPresentTrophy"></div>' +
              '<div class="cm-present-msg" id="cmPresentMsg"></div>' +
              '<div class="cm-present-sub" id="cmPresentSub"></div>' +
            '</div>' +
          '</div>' +
          '<p class="cm-present-hint" id="cmPresentHint">Tap the gift to open your achievement</p>' +
          '<div class="cm-present-actions" id="cmPresentActions" hidden>' +
            '<button type="button" class="cm-present-claim" id="cmPresentClaim">Claim</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.insertAdjacentHTML('beforeend', html);
    presentOverlay = document.getElementById('cmPresentOverlay');
    presentGift = document.getElementById('cmPresentGift');
    presentReveal = document.getElementById('cmPresentReveal');
    presentMsg = document.getElementById('cmPresentMsg');
    presentSub = document.getElementById('cmPresentSub');
    presentClaimBtn = document.getElementById('cmPresentClaim');
    presentCloseBtn = document.getElementById('cmPresentClose');
    presentStage = document.getElementById('cmPresentStage');

    presentGift.addEventListener('click', openPresentGift);
    presentGift.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPresentGift();
      }
    });
    presentClaimBtn.addEventListener('click', function () {
      if (!presentAchievement) return;
      claimAchievement(presentAchievement.id);
      closePresentModal();
      processPresentQueue();
    });
    presentCloseBtn.addEventListener('click', function () {
      if (presentAchievement && window.CapMuseAchievements) {
        let uid = getUserId();
        if (uid) window.CapMuseAchievements.dismissPresent(uid, presentAchievement.id);
      }
      closePresentModal();
      renderPanel();
      processPresentQueue();
    });
    presentOverlay.addEventListener('click', function (e) {
      if (e.target === presentOverlay && presentReveal && presentReveal.classList.contains('visible')) {
        presentCloseBtn.click();
      }
    });
  }

  function resetPresentVisual() {
    if (!presentGift || !presentReveal) return;
    presentGift.classList.remove('opened', 'opening');
    presentGift.hidden = false;
    presentReveal.classList.remove('visible');
    document.getElementById('cmPresentHint').hidden = false;
    document.getElementById('cmPresentActions').hidden = true;
  }

  function showPresentModal(achievement) {
    if (!achievement || !presentOverlay) return;
    if (presentCloseTimer) {
      window.clearTimeout(presentCloseTimer);
      presentCloseTimer = null;
    }
    presentAchievement = achievement;
    resetPresentVisual();
    let trophyEl = document.getElementById('cmPresentTrophy');
    trophyEl.className = 'cm-present-trophy' + (achievement.rarity ? ' rarity-' + achievement.rarity : '');
    trophyEl.innerHTML = window.CapMuseAchievements && window.CapMuseAchievements.renderGemIcon
      ? window.CapMuseAchievements.renderGemIcon(achievement.rarity)
      : '';
    presentMsg.textContent = 'Congratulations! New achievement unlocked: ' + achievement.name;
    presentSub.textContent = achievement.description;
    presentOverlay.hidden = false;
    window.requestAnimationFrame(function () {
      presentOverlay.classList.add('open');
    });
    presentShowing = true;
  }

  function openPresentGift() {
    if (!presentGift || presentGift.classList.contains('opened')) return;
    presentGift.classList.add('opening');
    window.setTimeout(function () {
      presentGift.classList.add('opened');
      runConfetti(2400);
      window.setTimeout(function () {
        presentGift.hidden = true;
        presentReveal.classList.add('visible');
        document.getElementById('cmPresentHint').hidden = true;
        document.getElementById('cmPresentActions').hidden = false;
        if (presentAchievement && window.CapMuseAchievements) {
          let uid = getUserId();
          if (uid) window.CapMuseAchievements.markPresentShown(uid, presentAchievement.id);
        }
      }, 480);
    }, 200);
  }

  function closePresentModal() {
    if (!presentOverlay) return;
    presentOverlay.classList.remove('open');
    presentShowing = false;
    presentAchievement = null;
    if (presentCloseTimer) window.clearTimeout(presentCloseTimer);
    presentCloseTimer = window.setTimeout(function () {
      presentCloseTimer = null;
      // Only hide if another present did not take over in the meantime.
      if (!presentShowing) {
        presentOverlay.hidden = true;
        resetPresentVisual();
        maybeFinishLoginPresents();
      }
    }, 260);
  }

  let loginSessionCompleteCallback = null;

  function maybeFinishLoginPresents() {
    if (!loginSessionCompleteCallback) return;
    if (presentShowing || presentQueue.length) return;
    let cb = loginSessionCompleteCallback;
    loginSessionCompleteCallback = null;
    cb();
  }

  function processPresentQueue() {
    if (presentShowing || !presentQueue.length) {
      maybeFinishLoginPresents();
      return;
    }
    let next = presentQueue.shift();
    showPresentModal(next);
  }

  function queuePresents(achievements) {
    if (!achievements || !achievements.length) return 0;
    let queued = 0;
    let i;
    for (i = 0; i < achievements.length; i++) {
      if (!achievements[i].presentShown) {
        presentQueue.push(achievements[i]);
        queued++;
      }
    }
    processPresentQueue();
    return queued;
  }

  function flushDeferredLoginPresents() {
    if (!deferredLoginPresentAchievements) return;
    let achievements = deferredLoginPresentAchievements;
    deferredLoginPresentAchievements = null;
    let queued = queuePresents(achievements);
    if (queued > 0) markLoginPresentsShown();
  }

  function queueLoginPresents(achievements) {
    if (!presentUiReady) {
      deferredLoginPresentAchievements = achievements;
      return;
    }
    let queued = queuePresents(achievements);
    if (queued > 0) markLoginPresentsShown();
  }

  function sessionPresentKey() {
    let uid = getUserId();
    return uid ? SESSION_KEY + ':' + uid : SESSION_KEY;
  }

  function isLoginPage() {
    if (document.body && document.body.classList.contains('login-page')) return true;
    let page = (window.location.pathname.split('/').pop() || '').toLowerCase();
    return page === 'login.html';
  }

  function shouldShowLoginPresents() {
    try {
      return sessionStorage.getItem(sessionPresentKey()) !== '1';
    } catch (e) {
      return true;
    }
  }

  function loginPresentOptions() {
    let eligible = isLoginPage() && shouldShowLoginPresents();
    return {
      showPresent: eligible,
      includeUnpresented: eligible
    };
  }

  function markLoginPresentsShown() {
    try {
      sessionStorage.setItem(sessionPresentKey(), '1');
    } catch (e) { /* ignore */ }
  }

  function sessionScanKey() {
    let uid = getUserId();
    return uid ? SESSION_SCAN_KEY + ':' + uid : SESSION_SCAN_KEY;
  }

  function shouldRunLoginPresentScan() {
    if (!isLoginPage()) return false;
    try {
      return sessionStorage.getItem(sessionScanKey()) !== '1';
    } catch (e) {
      return true;
    }
  }

  function markLoginPresentScanDone() {
    try {
      sessionStorage.setItem(sessionScanKey(), '1');
    } catch (e) { /* ignore */ }
  }

  function runLoginPresentScanOnce() {
    if (!shouldRunLoginPresentScan()) return;
    scanAndNotify(loginPresentOptions());
    markLoginPresentScanDone();
    maybeFinishLoginPresents();
  }

  function runLoginPresentSession(onComplete) {
    onComplete = typeof onComplete === 'function' ? onComplete : function () {};
    loginSessionCompleteCallback = onComplete;

    if (!isLoginPage()) {
      maybeFinishLoginPresents();
      return;
    }

    if (shouldRunLoginPresentScan()) {
      scanAndNotify(loginPresentOptions());
      markLoginPresentScanDone();
    } else if (shouldShowLoginPresents()) {
      scanAndNotify(loginPresentOptions());
    }

    maybeFinishLoginPresents();
  }

  function scanAndNotify(options) {
    options = options || {};
    if (!window.CapMuseAchievements) return;
    let uid = getUserId();
    if (!uid) return;

    let result = window.CapMuseAchievements.scan(uid);
    let toShow = result.newlyUnlocked.slice();

    if (options.includeUnpresented) {
      let unpresented = window.CapMuseAchievements.getUnclaimedForRep(uid).filter(function (a) {
        return !a.presentShown;
      });
      unpresented.forEach(function (ach) {
        let exists = toShow.some(function (t) { return t.id === ach.id; });
        if (!exists) toShow.push(ach);
      });
    }

    renderPanel();
    updatePip();

    if (toShow.length && options.showPresent) {
      queueLoginPresents(toShow);
    }

    if (result.newlyUnlocked.length) {
      window.dispatchEvent(new CustomEvent('capmuse:achievement-unlocked', {
        detail: { repId: uid, achievements: result.newlyUnlocked }
      }));
    }
  }

  function wireBell() {
    bellBtn = document.querySelector('.topbar-right .top-btn[aria-label="Notifications"]');
    if (!bellBtn) return;
    bellBtn.id = 'cmNotifBtn';
    bellBtn.classList.add('cm-notif-btn');
    pipEl = bellBtn.querySelector('.notif-pip');

    let wrap = bellBtn.parentElement;
    if (wrap && !wrap.classList.contains('cm-notif-wrap')) {
      wrap.classList.add('cm-notif-wrap');
      wrap.style.position = 'relative';
    }

    if (!document.getElementById('cmNotifPanel')) {
      let panel = document.createElement('div');
      panel.id = 'cmNotifPanel';
      panel.className = 'cm-notif-panel';
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-label', 'Notifications');
      panel.setAttribute('aria-hidden', 'true');
      panel.style.opacity = '0';
      panel.style.visibility = 'hidden';
      panel.style.pointerEvents = 'none';
      panel.innerHTML =
        '<div class="cm-notif-panel-head">' +
          '<div class="cm-notif-panel-title">Notifications</div>' +
          '<div class="cm-notif-panel-head-right">' +
            '<button type="button" class="cm-notif-claim-all" id="cmNotifClaimAll" hidden>Claim all</button>' +
            '<div class="cm-notif-panel-count" id="cmNotifCount"></div>' +
          '</div>' +
        '</div>' +
        '<div class="cm-notif-list" id="cmNotifList"></div>';
      wrap.appendChild(panel);
      panelEl = panel;
      panelListEl = document.getElementById('cmNotifList');
      panelCountEl = document.getElementById('cmNotifCount');
      claimAllBtn = document.getElementById('cmNotifClaimAll');

      panel.addEventListener('click', function (e) {
        let allBtn = e.target.closest('#cmNotifClaimAll');
        if (allBtn) {
          e.stopPropagation();
          claimAllAchievements();
          return;
        }
        let btn = e.target.closest('[data-claim-id]');
        if (btn) {
          e.stopPropagation();
          claimAchievement(btn.getAttribute('data-claim-id'));
        }
      });
    }

    bellBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      togglePanel();
    });
    document.addEventListener('click', function (e) {
      if (panelEl && !panelEl.contains(e.target) && e.target !== bellBtn && !bellBtn.contains(e.target)) {
        closePanel();
      }
    });
  }

  function bindGlobalListeners() {
    window.addEventListener('capmuse:rep-stats-updated', function (e) {
      if (!isLoginPage() || !shouldRunLoginPresentScan()) return;
      let uid = getUserId();
      if (uid && e.detail && repIdsMatch(e.detail.userId, uid)) {
        runLoginPresentScanOnce();
      }
    });

    window.addEventListener('capmuse:achievement-claimed', function () {
      renderPanel();
    });
  }

  function runStartupScan() {
    if (!isLoginPage() || !shouldRunLoginPresentScan()) return;
    let tryScan = function () {
      let uid = getUserId();
      if (uid && window.REPS && window.REPS[uid] && window.REPS[uid]._liveData) {
        runLoginPresentScanOnce();
      }
    };
    if (window.ensureLiveDeps) {
      window.ensureLiveDeps().then(tryScan).catch(tryScan);
    } else {
      window.setTimeout(tryScan, 400);
    }
  }

  function init() {
    if (inited) return;
    if (!window.CapMuseAchievements) return;
    inited = true;
    bindGlobalListeners();
    injectStyles().then(function () {
      buildPresentModal();
      presentUiReady = true;
      flushDeferredLoginPresents();
      wireBell();
      closePanel();
      renderPanel();
      if (!isLoginPage()) {
        runStartupScan();
      }
    });
  }

  window.CapMuseNotifications = {
    init: init,
    scanAndNotify: scanAndNotify,
    runLoginPresentSession: runLoginPresentSession,
    renderPanel: renderPanel,
    claimAchievement: claimAchievement,
    claimAllAchievements: claimAllAchievements,
    showClaimToast: showClaimToast
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
