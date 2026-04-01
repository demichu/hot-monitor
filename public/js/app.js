// ========================================
// HOT MONITOR - Frontend Logic
// ========================================

const API = {
  getKeywords: () => fetch('/api/keywords').then(r => r.json()),
  addKeyword: (keyword, type) => fetch('/api/keywords', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword, type }),
  }).then(r => r.json()),
  toggleKeyword: (id, active) => fetch(`/api/keywords/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  }).then(r => r.json()),
  deleteKeyword: (id) => fetch(`/api/keywords/${id}`, { method: 'DELETE' }).then(r => r.json()),
  getHotspots: (scope) => fetch(`/api/hotspots${scope ? `?scope=${encodeURIComponent(scope)}` : ''}`).then(r => r.json()),
  refreshHotspots: () => fetch('/api/hotspots/refresh', { method: 'POST' }).then(r => r.json()),
  getNotifications: () => fetch('/api/notifications').then(r => r.json()),
  markRead: (id) => fetch(`/api/notifications/${id}/read`, { method: 'POST' }).then(r => r.json()),
  markAllRead: () => fetch('/api/notifications/read-all', { method: 'POST' }).then(r => r.json()),
  getStatus: () => fetch('/api/status').then(r => r.json()),
};

// ---- 状态 ----
let keywords = [];
let hotspots = [];
let notifications = [];
let unreadCount = 0;

// ---- DOM ----
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ---- 初始化 ----
document.addEventListener('DOMContentLoaded', () => {
  initSSE();
  initSpotlight();
  loadKeywords();
  loadHotspots();
  loadNotifications();
  loadStatus();
  bindEvents();
  requestNotificationPermission();
});

// ---- Aceternity Spotlight 光效 ----
function initSpotlight() {
  document.querySelectorAll('[data-spotlight]').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
      card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
    });
  });
}

// ---- SSE 实时通知 ----
function initSSE() {
  const evtSource = new EventSource('/api/notifications/stream');

  evtSource.addEventListener('notification', (e) => {
    const notif = JSON.parse(e.data);
    notifications.unshift(notif);
    unreadCount++;
    renderNotifications();
    updateBadge();
    showToast(notif.title, 'alert');
    sendBrowserNotification(notif);
  });

  evtSource.addEventListener('hotspots_updated', () => {
    loadHotspots();
    showToast('热点列表已更新');
  });

  evtSource.addEventListener('connected', () => {
    console.log('[SSE] Connected');
  });

  evtSource.onerror = () => {
    console.warn('[SSE] Connection lost, reconnecting...');
  };
}

// ---- 数据加载 ----
async function loadKeywords() {
  try {
    const data = await API.getKeywords();
    keywords = data.keywords || [];
    renderKeywords();
  } catch (err) {
    console.error('Load keywords failed:', err);
  }
}

async function loadHotspots() {
  try {
    const data = await API.getHotspots();
    hotspots = data.hotspots || [];
    renderHotspots();
  } catch (err) {
    console.error('Load hotspots failed:', err);
  }
}

async function loadNotifications() {
  try {
    const data = await API.getNotifications();
    notifications = data.notifications || [];
    unreadCount = data.unreadCount || 0;
    renderNotifications();
    updateBadge();
  } catch (err) {
    console.error('Load notifications failed:', err);
  }
}

async function loadStatus() {
  try {
    const data = await API.getStatus();
    const el = $('#twitterStatus');
    if (el) {
      if (data.twitterConfigured) {
        el.textContent = '在线';
        el.classList.add('active');
      } else {
        el.textContent = '待配置';
        el.classList.remove('active');
      }
    }
  } catch (err) {
    console.error('Load status failed:', err);
  }
}

// ---- 渲染：关键词列表 ----
function renderKeywords() {
  const kwList = $('#keywordList');
  const scopeList = $('#scopeList');

  const kws = keywords.filter(k => k.type !== 'scope');
  const scopes = keywords.filter(k => k.type === 'scope');

  kwList.innerHTML = kws.length === 0
    ? '<div class="empty-state" style="padding:20px"><p>暂无监控关键词</p></div>'
    : kws.map(k => renderKeywordItem(k)).join('');

  scopeList.innerHTML = scopes.length === 0
    ? '<div class="empty-state" style="padding:20px"><p>暂无热点范围</p></div>'
    : scopes.map(k => renderKeywordItem(k)).join('');
}

function renderKeywordItem(k) {
  return `
    <div class="keyword-item ${k.active ? '' : 'inactive'}" data-id="${k.id}">
      <span class="kw-text">${escapeHtml(k.keyword)}</span>
      <div class="kw-actions">
        <button class="kw-toggle ${k.active ? 'active' : ''}" data-id="${k.id}" data-active="${k.active}" title="${k.active ? '点击禁用' : '点击启用'}"></button>
        <button class="kw-delete" data-id="${k.id}" title="删除">×</button>
      </div>
    </div>`;
}

// ---- 渲染：热点列表 ----
function renderHotspots() {
  const list = $('#hotspotsList');

  if (!hotspots.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
        </div>
        <p>等待扫描中...</p>
        <span class="empty-hint">添加热点范围后将自动发现热点</span>
      </div>`;
    return;
  }

  let html = '';
  for (const group of hotspots) {
    const items = group.hotspots || [];
    html += `<div class="scope-label">
      ${escapeHtml(group.scope)} · 更新于 ${formatTime(group.updatedAt)}
    </div>`;

    items.forEach((h, i) => {
      const rank = i + 1;
      const heatColor = h.heat > 70 ? 'var(--rose)' : h.heat > 40 ? 'var(--amber)' : 'var(--primary)';
      const tagClass = `tag-${h.category || 'trend'}`;

      html += `
        <div class="hotspot-item">
          <div class="hotspot-rank ${rank <= 3 ? 'top3' : ''}">${String(rank).padStart(2, '0')}</div>
          <div class="hotspot-content">
            <div class="hotspot-title">${escapeHtml(h.title)}</div>
            <div class="hotspot-summary">${escapeHtml(h.summary || '')}</div>
            <div class="hotspot-meta">
              <span class="hotspot-tag ${tagClass}">${(h.category || 'TREND').toUpperCase()}</span>
              <span class="hotspot-heat">
                HEAT ${h.heat || 0}
                <span class="heat-bar"><span class="heat-bar-fill" style="width:${h.heat || 0}%; background:${heatColor}"></span></span>
              </span>
            </div>
            ${h.sources && h.sources.length ? `
              <div class="hotspot-sources-list">
                ${h.sources.slice(0, 3).map(s => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" class="hotspot-source-link" title="${escapeHtml(s.title)}">${escapeHtml(s.source)}</a>`).join('')}
              </div>` : ''}
          </div>
        </div>`;
    });
  }

  list.innerHTML = html;
}

// ---- 热点搜索过滤 ----
function filterHotspots(query) {
  if (!query) {
    renderHotspots();
    return;
  }
  const filtered = hotspots.map(group => ({
    ...group,
    hotspots: (group.hotspots || []).filter(h =>
      (h.title || '').toLowerCase().includes(query) ||
      (h.summary || '').toLowerCase().includes(query)
    ),
  })).filter(group => group.hotspots.length > 0);

  renderHotspotsData(filtered);
}

function renderHotspotsData(data) {
  const list = $('#hotspotsList');
  if (!data.length) {
    list.innerHTML = `<div class="empty-state"><p>无匹配热点</p></div>`;
    return;
  }
  let html = '';
  for (const group of data) {
    const items = group.hotspots || [];
    html += `<div class="scope-label">${escapeHtml(group.scope)} · 更新于 ${formatTime(group.updatedAt)}</div>`;
    items.forEach((h, i) => {
      const rank = i + 1;
      const heatColor = h.heat > 70 ? 'var(--rose)' : h.heat > 40 ? 'var(--amber)' : 'var(--primary)';
      const tagClass = `tag-${h.category || 'trend'}`;
      html += `
        <div class="hotspot-item">
          <div class="hotspot-rank ${rank <= 3 ? 'top3' : ''}">${String(rank).padStart(2, '0')}</div>
          <div class="hotspot-content">
            <div class="hotspot-title">${escapeHtml(h.title)}</div>
            <div class="hotspot-summary">${escapeHtml(h.summary || '')}</div>
            <div class="hotspot-meta">
              <span class="hotspot-tag ${tagClass}">${(h.category || 'TREND').toUpperCase()}</span>
              <span class="hotspot-heat">HEAT ${h.heat || 0}
                <span class="heat-bar"><span class="heat-bar-fill" style="width:${h.heat || 0}%; background:${heatColor}"></span></span>
              </span>
            </div>
            ${h.sources && h.sources.length ? `
              <div class="hotspot-sources-list">
                ${h.sources.slice(0, 3).map(s => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" class="hotspot-source-link" title="${escapeHtml(s.title)}">${escapeHtml(s.source)}</a>`).join('')}
              </div>` : ''}
          </div>
        </div>`;
    });
  }
  list.innerHTML = html;
}

// ---- 渲染：通知列表 ----
function renderNotifications() {
  renderNotifList($('#notificationsList'), notifications.slice(0, 20));
  renderNotifList($('#notifPanelList'), notifications.slice(0, 30));
}

function renderNotifList(container, items) {
  if (!container) return;
  if (!items.length) {
    container.innerHTML = '<div class="empty-state"><p>暂无通知，正在监控中...</p></div>';
    return;
  }

  container.innerHTML = items.map(n => {
    const credClass = n.credibility >= 70 ? 'credibility-high' : n.credibility >= 40 ? 'credibility-mid' : 'credibility-low';
    return `
      <div class="notif-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
        <div class="notif-keyword">[${escapeHtml(n.keyword || '')}]</div>
        <div class="notif-title"><a href="${escapeHtml(n.url || '#')}" target="_blank" rel="noopener noreferrer">${escapeHtml(n.title)}</a></div>
        <div class="notif-snippet">${escapeHtml(n.snippet || '')}</div>
        <div class="notif-meta">
          <span class="notif-credibility ${credClass}">可信度 ${n.credibility || '?'}</span>
          <span>${formatTime(n.createdAt)}</span>
        </div>
      </div>`;
  }).join('');
}

function updateBadge() {
  const badge = $('#notifBadge');
  if (unreadCount > 0) {
    badge.style.display = 'flex';
    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
  } else {
    badge.style.display = 'none';
  }
}

// ---- 事件绑定 ----
function bindEvents() {
  // 添加关键词
  $('#addKeywordBtn').addEventListener('click', () => addKeyword('keyword'));
  $('#keywordInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addKeyword('keyword');
  });

  // 添加热点范围
  $('#addScopeBtn').addEventListener('click', () => addKeyword('scope'));
  $('#scopeInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addKeyword('scope');
  });

  // 刷新热点
  $('#refreshHotspotsBtn').addEventListener('click', async () => {
    const btn = $('#refreshHotspotsBtn');
    btn.querySelector('span').textContent = '扫描中...';
    btn.disabled = true;
    try {
      await API.refreshHotspots();
      showToast('热点刷新已触发，请稍候...');
    } catch (err) {
      showToast('刷新失败', 'alert');
    }
    setTimeout(() => {
      btn.querySelector('span').textContent = '刷新';
      btn.disabled = false;
    }, 3000);
  });

  // 通知面板
  $('#notifBtn').addEventListener('click', () => {
    const panel = $('#notifPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });

  $('#closeNotifPanel').addEventListener('click', () => {
    $('#notifPanel').style.display = 'none';
  });

  // 全部已读
  $('#readAllBtn').addEventListener('click', async () => {
    await API.markAllRead();
    notifications.forEach(n => { n.read = true; });
    unreadCount = 0;
    renderNotifications();
    updateBadge();
  });

  // 热点搜索过滤
  $('#hotspotSearch').addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    filterHotspots(query);
  });

  // 事件委托：关键词操作
  document.addEventListener('click', async (e) => {
    // 切换关键词启用状态
    if (e.target.classList.contains('kw-toggle')) {
      const id = e.target.dataset.id;
      const currentActive = e.target.dataset.active === 'true';
      await API.toggleKeyword(id, !currentActive);
      await loadKeywords();
    }

    // 删除关键词
    if (e.target.classList.contains('kw-delete')) {
      const id = e.target.dataset.id;
      await API.deleteKeyword(id);
      await loadKeywords();
    }

    // 标记通知已读
    if (e.target.closest('.notif-item.unread')) {
      const item = e.target.closest('.notif-item');
      const id = item.dataset.id;
      await API.markRead(id);
      const notif = notifications.find(n => n.id === id);
      if (notif) {
        notif.read = true;
        unreadCount = Math.max(0, unreadCount - 1);
      }
      renderNotifications();
      updateBadge();
    }

    // 点击通知面板外部关闭
    if (!e.target.closest('.notif-panel') && !e.target.closest('.notif-btn')) {
      $('#notifPanel').style.display = 'none';
    }
  });
}

async function addKeyword(type) {
  const input = type === 'scope' ? $('#scopeInput') : $('#keywordInput');
  const keyword = input.value.trim();
  if (!keyword) return;

  try {
    const result = await API.addKeyword(keyword, type);
    if (result.error) {
      showToast(result.error, 'alert');
      return;
    }
    input.value = '';
    await loadKeywords();
    showToast(`已添加: ${keyword}`);
  } catch (err) {
    showToast('添加失败', 'alert');
  }
}

// ---- 浏览器通知 ----
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendBrowserNotification(notif) {
  if ('Notification' in window && Notification.permission === 'granted') {
    const n = new Notification(`🔥 ${notif.keyword || 'Hot Monitor'}`, {
      body: notif.title,
      icon: '/favicon.ico',
      tag: notif.id,
    });
    n.onclick = () => {
      window.focus();
      if (notif.url) window.open(notif.url, '_blank');
    };
  }
}

// ---- Toast ----
function showToast(message, type = 'info') {
  const container = $('#toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'alert' ? 'alert' : ''}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ---- 工具函数 ----
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;

  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
