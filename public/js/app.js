// ========================================
// HOT MONITOR - Frontend Logic
// ========================================

const API = {
  getKeywords: () => fetch('/api/keywords').then(r => r.json()),
  addKeyword: (keyword) => fetch('/api/keywords', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword, type: 'keyword' }),
  }).then(r => r.json()),
  toggleKeyword: (id, active) => fetch(`/api/keywords/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  }).then(r => r.json()),
  deleteKeyword: (id) => fetch(`/api/keywords/${id}`, { method: 'DELETE' }).then(r => r.json()),
  getNotifications: () => fetch('/api/notifications').then(r => r.json()),
  markRead: (id) => fetch(`/api/notifications/${id}/read`, { method: 'POST' }).then(r => r.json()),
  markAllRead: () => fetch('/api/notifications/read-all', { method: 'POST' }).then(r => r.json()),
  getStats: () => fetch('/api/stats').then(r => r.json()),
  runMonitor: (keywordIds) => fetch('/api/monitor/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywordIds }),
  }).then(r => r.json()),
};

// ---- 状态 ----
let keywords = [];
let notifications = [];
let unreadCount = 0;
let sortMode = 'time-desc';
let filterKeywords = new Set(); // empty = show all
let filterRead = '';
let filterCredibility = '';
let filterTime = '';

// ---- DOM ----
const $ = (sel) => document.querySelector(sel);

// ---- 初始化 ----
document.addEventListener('DOMContentLoaded', () => {
  initSSE();
  initSpotlight();
  loadKeywords();
  loadNotifications();
  loadStats();
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
    loadStats();
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
    keywords = (data.keywords || []).filter(k => k.type !== 'scope');
    renderKeywords();
  } catch (err) {
    console.error('Load keywords failed:', err);
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

async function loadStats() {
  try {
    const stats = await API.getStats();
    $('#radarTotal').textContent = stats.totalHotspots || 0;
    $('#radarToday').textContent = stats.todayNew || 0;
    $('#radarKeywords').textContent = stats.keywordCount || 0;
    $('#radarUnread').textContent = stats.unread || 0;
  } catch (err) {
    console.error('Load stats failed:', err);
  }
}

// ---- 渲染：关键词列表 ----
function renderKeywords() {
  const kwList = $('#keywordList');

  kwList.innerHTML = keywords.length === 0
    ? '<div class="empty-state" style="padding:20px"><p>暂无监控关键词</p></div>'
    : keywords.map(k => `
    <div class="keyword-item ${k.active ? '' : 'inactive'}" data-id="${k.id}">
      <span class="kw-text">${escapeHtml(k.keyword)}</span>
      <div class="kw-actions">
        <button class="kw-toggle ${k.active ? 'active' : ''}" data-id="${k.id}" data-active="${k.active}" title="${k.active ? '点击禁用' : '点击启用'}"></button>
        <button class="kw-delete" data-id="${k.id}" title="删除">×</button>
      </div>
    </div>`).join('');
}

// ---- 筛选与排序 ----
function getFilteredNotifications() {
  let items = [...notifications];

  if (filterKeywords.size > 0) {
    items = items.filter(n => filterKeywords.has(n.keyword));
  }
  if (filterRead === 'unread') {
    items = items.filter(n => !n.read);
  } else if (filterRead === 'read') {
    items = items.filter(n => n.read);
  }
  if (filterCredibility === 'high') {
    items = items.filter(n => (n.credibility || 0) >= 70);
  } else if (filterCredibility === 'mid') {
    items = items.filter(n => {
      const c = n.credibility || 0;
      return c >= 40 && c < 70;
    });
  } else if (filterCredibility === 'low') {
    items = items.filter(n => (n.credibility || 0) < 40);
  }
  if (filterTime) {
    const now = Date.now();
    const ranges = { '1h': 3600000, '24h': 86400000, '3d': 259200000 };
    const range = ranges[filterTime];
    if (range) {
      items = items.filter(n => now - new Date(n.createdAt).getTime() < range);
    }
  }

  if (sortMode === 'time-asc') {
    items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  } else if (sortMode === 'credibility') {
    items.sort((a, b) => (b.credibility || 0) - (a.credibility || 0));
  } else if (sortMode !== 'keyword-group') {
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  return items;
}

function getAllKeywordNames() {
  const kwSet = new Set();
  notifications.forEach(n => { if (n.keyword) kwSet.add(n.keyword); });
  keywords.forEach(k => kwSet.add(k.keyword));
  return [...kwSet].sort();
}

function updateKwFilterBtnLabel() {
  const btn = $('#keywordFilterBtn');
  if (filterKeywords.size === 0) {
    btn.textContent = '全部关键词 ▾';
    btn.classList.remove('filter-active');
  } else if (filterKeywords.size === 1) {
    btn.textContent = [...filterKeywords][0] + ' ▾';
    btn.classList.add('filter-active');
  } else {
    btn.textContent = `${filterKeywords.size}个关键词 ▾`;
    btn.classList.add('filter-active');
  }
}

function renderKwFilterPanel(searchTerm) {
  const list = $('#kwFilterList');
  const all = getAllKeywordNames();
  const filtered = searchTerm ? all.filter(kw => kw.toLowerCase().includes(searchTerm.toLowerCase())) : all;

  list.innerHTML = filtered.length === 0
    ? '<div class="kw-filter-empty">无匹配关键词</div>'
    : filtered.map(kw => `
      <label class="kw-filter-item">
        <input type="checkbox" value="${escapeHtml(kw)}" ${filterKeywords.has(kw) ? 'checked' : ''}>
        <span>${escapeHtml(kw)}</span>
      </label>`).join('');
}

// ---- 渲染：热点流（通知列表）----
function renderNotifications() {
  const container = $('#notificationsList');
  const panelList = $('#notifPanelList');
  const filtered = getFilteredNotifications();

  updateKwFilterBtnLabel();

  if (sortMode === 'keyword-group') {
    renderGroupedNotifList(container, filtered);
  } else {
    renderNotifList(container, filtered.slice(0, 50));
  }
  renderNotifList(panelList, filtered.slice(0, 50));
}

function renderGroupedNotifList(container, items) {
  if (!container) return;
  if (!items.length) {
    renderNotifList(container, []);
    return;
  }

  const groups = {};
  items.forEach(n => {
    const key = n.keyword || '未分类';
    if (!groups[key]) groups[key] = [];
    groups[key].push(n);
  });

  container.innerHTML = Object.entries(groups).map(([keyword, notifs]) => `
    <div class="notif-group">
      <div class="notif-group-header">${escapeHtml(keyword)} <span class="notif-group-count">(${notifs.length})</span></div>
      ${notifs.map(n => renderNotifItemHTML(n)).join('')}
    </div>
  `).join('');
}

function renderNotifItemHTML(n) {
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
}

function renderNotifList(container, items) {
  if (!container) return;
  if (!items.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
        </div>
        <p>暂无匹配结果</p>
        <span class="empty-hint">尝试调整筛选条件</span>
      </div>`;
    return;
  }

  container.innerHTML = items.map(n => renderNotifItemHTML(n)).join('');
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
  $('#addKeywordBtn').addEventListener('click', () => addKeyword());
  $('#keywordInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addKeyword();
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

  // 排序与筛选
  $('#sortSelect').addEventListener('change', (e) => { sortMode = e.target.value; renderNotifications(); });
  $('#readFilter').addEventListener('change', (e) => { filterRead = e.target.value; renderNotifications(); });
  $('#credFilter').addEventListener('change', (e) => { filterCredibility = e.target.value; renderNotifications(); });
  $('#timeFilter').addEventListener('change', (e) => { filterTime = e.target.value; renderNotifications(); });

  // 关键词筛选面板
  $('#keywordFilterBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = $('#kwFilterPanel');
    const visible = panel.style.display !== 'none';
    panel.style.display = visible ? 'none' : 'block';
    if (!visible) {
      $('#kwFilterSearch').value = '';
      renderKwFilterPanel('');
      $('#kwFilterSearch').focus();
    }
  });

  $('#kwFilterSearch').addEventListener('input', (e) => {
    renderKwFilterPanel(e.target.value);
  });

  $('#kwFilterList').addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') {
      const kw = e.target.value;
      if (e.target.checked) {
        filterKeywords.add(kw);
      } else {
        filterKeywords.delete(kw);
      }
    }
  });

  $('#kwFilterSelectAll').addEventListener('click', () => {
    filterKeywords = new Set(getAllKeywordNames());
    renderKwFilterPanel($('#kwFilterSearch').value);
  });

  $('#kwFilterClearAll').addEventListener('click', () => {
    filterKeywords.clear();
    renderKwFilterPanel($('#kwFilterSearch').value);
  });

  $('#kwFilterDone').addEventListener('click', () => {
    $('#kwFilterPanel').style.display = 'none';
    renderNotifications();
  });

  // 一键重置所有筛选
  $('#resetFiltersBtn').addEventListener('click', () => {
    sortMode = 'time-desc';
    filterKeywords.clear();
    filterRead = '';
    filterCredibility = '';
    filterTime = '';
    $('#sortSelect').value = 'time-desc';
    $('#readFilter').value = '';
    $('#credFilter').value = '';
    $('#timeFilter').value = '';
    renderNotifications();
    showToast('已重置所有筛选');
  });

  // 立即监控
  $('#runNowBtn').addEventListener('click', async () => {
    const activeKws = keywords.filter(k => k.active);
    if (!activeKws.length) {
      showToast('没有激活的关键词', 'alert');
      return;
    }
    const btn = $('#runNowBtn');
    btn.disabled = true;
    btn.textContent = '监控中...';
    try {
      const result = await API.runMonitor(activeKws.map(k => k.id));
      if (result.error) {
        showToast(result.error, 'alert');
      } else {
        showToast('已启动监控，结果将通过实时流推送');
      }
    } catch (err) {
      showToast('启动失败', 'alert');
    } finally {
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> 立即监控';
        loadStats();
      }, 2000);
    }
  });

  // 事件委托：关键词操作 + 通知
  document.addEventListener('click', async (e) => {
    if (e.target.classList.contains('kw-toggle')) {
      const id = e.target.dataset.id;
      const currentActive = e.target.dataset.active === 'true';
      await API.toggleKeyword(id, !currentActive);
      await loadKeywords();
    }

    if (e.target.classList.contains('kw-delete')) {
      const id = e.target.dataset.id;
      await API.deleteKeyword(id);
      await loadKeywords();
    }

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

    if (!e.target.closest('.notif-panel') && !e.target.closest('.notif-btn')) {
      $('#notifPanel').style.display = 'none';
    }

    if (!e.target.closest('.kw-filter-panel') && !e.target.closest('#keywordFilterBtn')) {
      const panel = $('#kwFilterPanel');
      if (panel.style.display !== 'none') {
        panel.style.display = 'none';
        renderNotifications();
      }
    }
  });
}

async function addKeyword() {
  const input = $('#keywordInput');
  const keyword = input.value.trim();
  if (!keyword) return;

  try {
    const result = await API.addKeyword(keyword);
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
