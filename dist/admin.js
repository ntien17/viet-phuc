(() => {
  'use strict';

  // Định dạng tiền tệ VND & escape HTML an toàn
  const money = n => new Intl.NumberFormat('vi-VN').format(n || 0) + '₫';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Bảng mã màu sản phẩm đồng bộ với Storefront
  const colorSwatches = {
    'Đỏ trầm': '#762F38',
    'Trắng ngà': '#F3EEE2',
    'Nâu đất': '#805D48',
    'Hồng sen': '#DD8A99',
    'Đen': '#352C28',
    'Hồng phấn': '#EAC5C9',
    'Xanh nhạt': '#A9C9CB'
  };

  // Bộ icon SVG đồng bộ
  const icons = {
    check: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    x: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    truck: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
    rotate: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>`,
    boxIn: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    refund: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M14.5 9.5a2.5 2.5 0 0 0-5 0c0 2 5 1.5 5 4a2.5 2.5 0 0 1-5 0"/><path d="M12 6v12"/></svg>`,
    arrowRight: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
    emptyBox: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
    alert: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    eye: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
    eyeOff: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`
  };

  // Ánh xạ Enum Schema V2 -> Nhãn tiếng Việt hiển thị trên UI
  const ORDER_STATUS_LABELS = {
    pending: 'Chờ xác nhận',
    confirmed: 'Đã xác nhận',
    packing: 'Đang đóng gói',
    shipping: 'Đang giao',
    delivered: 'Đã giao',
    delivery_failed: 'Giao thất bại',
    returning: 'Đang hoàn hàng',
    returned: 'Đã hoàn hàng',
    cancelled: 'Đã hủy',
  };
  const PAYMENT_STATUS_LABELS = {
    unpaid: 'Chưa thanh toán',
    pending: 'Chờ thanh toán',
    paid: 'Thanh toán thành công',
    failed: 'Thanh toán thất bại',
    partially_refunded: 'Đã hoàn một phần',
    refunded: 'Đã hoàn tiền',
  };
  const SETTLEMENT_LABELS = {
    unsettled: 'Chưa đối soát',
    pending: 'Đang đối soát',
    settled: 'Đã đối soát',
  };
  const RETURN_STATUS_LABELS = {
    pending: 'Chờ xử lý',
    approved: 'Đã chấp nhận',
    rejected: 'Bị từ chối',
    completed: 'Đã hoàn tất',
  };
  const orderStatusText = s => ORDER_STATUS_LABELS[s] || RETURN_STATUS_LABELS[s] || s || 'Chờ xác nhận';
  const paymentStatusText = s => PAYMENT_STATUS_LABELS[s] || s || 'Chưa thanh toán';
  const settlementText = s => SETTLEMENT_LABELS[s] || s || 'Chưa đối soát';
  let businessConfig = { shipping: { standardFee: 30000, remoteFee: 45000 }, codFee: 0, paymentFee: 0, returnWindowDays: 7 };
  const defaultShippingFee = () => businessConfig?.shipping?.standardFee ?? 30000;
  const remoteShippingFee = () => businessConfig?.shipping?.remoteFee ?? 45000;
  const formatDate = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString('vi-VN');
  };
  const categoryNameOf = p => {
    const cat = (dbState.categories || []).find(c => c.id === p.categoryId);
    return cat ? cat.name : (p.category || '');
  };
  const getVariantStock = sku => dbState.stock?.[sku] ?? 0;

  // Trạng thái ứng dụng Admin
  let currentAdmin = null;
  let currentTab = 'orders';
  let dbRevision = 0;
  let dbState = { categories: [], products: [], orders: [], returns: [], stock: {}, visits: 0, cartEvents: 0 };
  let isSaving = false;
  let selectedOrderId = null;
  let activeDialogResolve = null;

  // Helpers Stock theo SKU V2
  const getAvailableStock = (id, size) => {
    const p = (dbState.products || []).find(x => x.id === id);
    const v = p?.variants?.find(x => x.size === size);
    if (v && Object.prototype.hasOwnProperty.call(dbState.stock || {}, v.sku)) {
      return dbState.stock[v.sku];
    }
    return dbState.stock?.[`${id}|${size}`] ?? 0;
  };

  // Toast Notification thống nhất
  function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `admin-toast ${type}`;
    const iconSvg = type === 'success' ? icons.check : (type === 'danger' ? icons.alert : icons.rotate);
    toast.innerHTML = `<span style="display:inline-flex;flex-shrink:0;">${iconSvg}</span><span>${esc(msg)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.2s ease';
      setTimeout(() => toast.remove(), 220);
    }, 3200);
  }

  // Custom Confirm & Prompt Dialog (thay thế confirm() và prompt() mặc định)
  function closeDialog(result = null) {
    const container = document.getElementById('custom-dialog-container');
    if (container) container.innerHTML = '';
    if (activeDialogResolve) {
      const resolve = activeDialogResolve;
      activeDialogResolve = null;
      resolve(result);
    }
  }

  function showConfirmDialog({ title, message, confirmText = 'Xác nhận', cancelText = 'Hủy', danger = false }) {
    return new Promise(resolve => {
      if (activeDialogResolve) activeDialogResolve(false);
      activeDialogResolve = resolve;
      const container = document.getElementById('custom-dialog-container');
      container.innerHTML = `
        <div class="dialog-overlay" data-dialog-close>
          <div class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onclick="event.stopPropagation()">
            <div class="dialog-header">
              <h4 id="dialog-title">${esc(title)}</h4>
              <button type="button" class="drawer-close" data-dialog-close aria-label="Đóng">&times;</button>
            </div>
            <div class="dialog-body">${esc(message)}</div>
            <div class="dialog-footer">
              <button type="button" class="btn btn-outline btn-sm" data-dialog-close>${esc(cancelText)}</button>
              <button type="button" class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'} btn-sm" id="dialog-confirm-btn">${esc(confirmText)}</button>
            </div>
          </div>
        </div>
      `;
      container.querySelectorAll('[data-dialog-close]').forEach(el => {
        el.addEventListener('click', () => closeDialog(false));
      });
      const confirmBtn = document.getElementById('dialog-confirm-btn');
      confirmBtn?.addEventListener('click', () => closeDialog(true));
      confirmBtn?.focus();
    });
  }

  function showPromptDialog({ title, message, placeholder = '', defaultValue = '', confirmText = 'Xác nhận' }) {
    return new Promise(resolve => {
      if (activeDialogResolve) activeDialogResolve(null);
      activeDialogResolve = resolve;
      const container = document.getElementById('custom-dialog-container');
      container.innerHTML = `
        <div class="dialog-overlay" data-dialog-close>
          <div class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onclick="event.stopPropagation()">
            <div class="dialog-header">
              <h4 id="dialog-title">${esc(title)}</h4>
              <button type="button" class="drawer-close" data-dialog-close aria-label="Đóng">&times;</button>
            </div>
            <form id="dialog-prompt-form">
              <div class="dialog-body">
                <p style="margin-bottom: 12px;">${esc(message)}</p>
                <textarea id="dialog-prompt-input" class="form-control" rows="3" placeholder="${esc(placeholder)}" required>${esc(defaultValue)}</textarea>
              </div>
              <div class="dialog-footer">
                <button type="button" class="btn btn-outline btn-sm" data-dialog-close>Hủy bỏ</button>
                <button type="submit" class="btn btn-danger-solid btn-sm">${esc(confirmText)}</button>
              </div>
            </form>
          </div>
        </div>
      `;
      container.querySelectorAll('[data-dialog-close]').forEach(el => {
        el.addEventListener('click', () => closeDialog(null));
      });
      const input = document.getElementById('dialog-prompt-input');
      input?.focus();
      input?.select();
      document.getElementById('dialog-prompt-form')?.addEventListener('submit', e => {
        e.preventDefault();
        closeDialog(input.value.trim());
      });
    });
  }

  // Mobile Sidebar helpers
  function toggleMobileSidebar(open) {
    const sidebar = document.getElementById('admin-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (!sidebar || !backdrop) return;
    sidebar.classList.toggle('open', open);
    backdrop.classList.toggle('open', open);
  }

  function updateAdminProfileDisplay(username) {
    const display = document.getElementById('admin-user-display');
    const initials = document.getElementById('admin-avatar-initials');
    if (display) display.textContent = username;
    if (initials) initials.textContent = String(username || 'AD').slice(0, 2).toUpperCase();
  }

  // Kết nối Backend API (giữ nguyên endpoint & xác thực)
  async function checkSession() {
    try {
      const res = await fetch('/api/admin/session', { cache: 'no-store' });
      const data = await res.json();
      if (data && data.loggedIn) {
        currentAdmin = data.user || 'admin';
        updateAdminProfileDisplay(currentAdmin);
        showDashboardView();
        await loadDatabase();
      } else {
        showAuthView();
      }
    } catch {
      showAuthView();
    }
  }

  async function login(username, password) {
    const errorEl = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit-btn');
    errorEl.style.display = 'none';
    if (submitBtn) {
      submitBtn.classList.add('is-loading');
      submitBtn.textContent = 'Đang xác thực...';
    }

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VP-Requested': '1' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Đăng nhập thất bại.');
      }
      currentAdmin = data.user || 'admin';
      updateAdminProfileDisplay(currentAdmin);
      showToast('Đăng nhập quản trị thành công!', 'success');
      showDashboardView();
      await loadDatabase();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      if (submitBtn) {
        submitBtn.classList.remove('is-loading');
        submitBtn.textContent = 'Đăng nhập hệ thống';
      }
    }
  }

  let adminEventSource = null;
  let adminSseTimer = null;

  function disconnectAdminEvents() {
    if (adminSseTimer) { clearTimeout(adminSseTimer); adminSseTimer = null; }
    if (adminEventSource) { adminEventSource.close(); adminEventSource = null; }
  }

  function connectAdminEvents() {
    if (adminEventSource || typeof EventSource === 'undefined') return;
    adminEventSource = new EventSource('/api/admin/events');
    adminEventSource.addEventListener('db_update', e => {
      try {
        const data = JSON.parse(e.data || '{}');
        if (typeof data.revision === 'number' && data.revision === dbRevision) return;
      } catch (_) {}
      if (isSaving) return;
      if (adminSseTimer) clearTimeout(adminSseTimer);
      adminSseTimer = setTimeout(() => {
        if (!isSaving && currentAdmin) loadDatabase();
      }, 200);
    });
  }

  async function logout() {
    disconnectAdminEvents();
    try {
      await fetch('/api/admin/logout', { method: 'POST', headers: { 'X-VP-Requested': '1' } });
    } catch (_) {}
    currentAdmin = null;
    closeOrderDetail();
    toggleMobileSidebar(false);
    showToast('Đã đăng xuất khỏi trang quản trị.');
    showAuthView();
  }

  function showAuthView() {
    disconnectAdminEvents();
    document.getElementById('auth-view').style.display = 'flex';
    document.getElementById('dashboard-view').style.display = 'none';
  }

  function showDashboardView() {
    document.getElementById('auth-view').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'flex';
    connectAdminEvents();
  }

  // CSDL State Sync qua Admin API
  async function loadDatabase() {
    const syncBadge = document.getElementById('sync-status');
    const syncText = document.getElementById('sync-text');
    const refreshIcon = document.getElementById('refresh-icon');
    syncBadge.className = 'sync-badge syncing';
    syncText.textContent = 'Đang đồng bộ...';
    refreshIcon?.classList.add('spin-icon');

    try {
      const res = await fetch('/api/admin/bootstrap', { cache: 'no-store' });
      if (res.status === 401) {
        showAuthView();
        return;
      }
      if (!res.ok) throw new Error('Không thể nạp dữ liệu từ máy chủ.');
      const data = await res.json();
      dbRevision = data.revision;
      dbState = data.state;
      if (data.config) businessConfig = data.config;
      syncBadge.className = 'sync-badge';
      syncText.textContent = `CSDL JSON V2 (rev ${dbRevision}): Đã đồng bộ`;
      populateProductCategories();
      renderCurrentTab();
    } catch (err) {
      syncBadge.className = 'sync-badge error';
      syncText.textContent = 'Mất kết nối CSDL';
      showToast(err.message, 'danger');
    } finally {
      refreshIcon?.classList.remove('spin-icon');
    }
  }

  async function adminActionRequest(method, url, payload = {}) {
    if (isSaving) throw new Error('Đang lưu dữ liệu, vui lòng thao tác chậm lại.');
    isSaving = true;
    const syncBadge = document.getElementById('sync-status');
    const syncText = document.getElementById('sync-text');
    syncBadge.className = 'sync-badge syncing';
    syncText.textContent = 'Đang lưu vào JSON...';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-VP-Requested': '1' },
        body: JSON.stringify({ ...payload, revision: dbRevision })
      });
      if (res.status === 401) {
        showAuthView();
        throw new Error('Phiên đăng nhập Admin đã hết hạn.');
      }
      const data = await res.json();
      if (res.status === 409 && data.state) {
        dbRevision = data.revision;
        dbState = data.state;
        renderCurrentTab();
        if (selectedOrderId) renderOrderDetail(selectedOrderId);
        throw new Error(data.message || 'Dữ liệu vừa được cập nhật ở phiên khác. Đã đồng bộ lại.');
      }
      if (!res.ok) {
        throw new Error(data.message || 'Máy chủ không thể thực hiện thao tác.');
      }
      dbRevision = data.revision;
      if (data.state) dbState = data.state;

      syncBadge.className = 'sync-badge';
      syncText.textContent = `CSDL JSON V2 (rev ${dbRevision}): Đã lưu`;
      renderCurrentTab();
      if (selectedOrderId) renderOrderDetail(selectedOrderId);
      return data;
    } catch (err) {
      syncBadge.className = 'sync-badge error';
      syncText.textContent = 'Lỗi lưu dữ liệu';
      throw err;
    } finally {
      isSaving = false;
    }
  }

  // Chuyển Tab
  function switchTab(tabName) {
    currentTab = tabName;
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.style.display = 'none';
    });
    const activePane = document.getElementById(`pane-${tabName}`);
    if (activePane) activePane.style.display = 'block';

    const meta = {
      orders: ['Quản lý Đơn hàng', 'Theo dõi, duyệt đơn, vận chuyển và xử lý hoàn tiền'],
      dashboard: ['Tổng quan & Cảnh báo', 'Chỉ số vận hành, biểu đồ và cảnh báo thời gian thực từ JSON'],
      returns: ['Đổi trả & Bảo hành', 'Tiếp nhận yêu cầu, đối chiếu hạn 7 ngày, kiểm tra hàng và hoàn nhập kho'],
      inventory: ['Quản lý Tồn kho SKU', 'Nhập/xuất/điều chỉnh tồn kho theo SKU và theo dõi nhật ký kho'],
      products: ['Danh mục & Sản phẩm', 'Quản lý danh mục, sản phẩm, biến thể màu/size và mã SKU chuẩn'],
      customers: ['Quản lý Khách hàng', 'Danh sách, chi tiết lịch sử đơn hàng và khóa/mở khóa tài khoản'],
      reconciliation: ['Thanh toán & Hoàn tiền', 'Giao dịch mô phỏng, hoàn tiền và đối soát COD'],
      shipping: ['Quản lý Vận chuyển', 'Cập nhật đơn vị vận chuyển giả lập, mã vận đơn và trạng thái giao nhận'],
      promotions: ['Quản lý Khuyến mãi', 'Tạo mã giảm giá, giới hạn lượt dùng và thống kê áp dụng'],
      policies: ['Chính sách & Nội dung', 'Chỉnh sửa chính sách cửa hàng, nội dung hiển thị và lịch sử phiên bản'],
      reports: ['Báo cáo & Thống kê', 'Doanh thu, đơn hàng, sản phẩm, khách hàng, xuất CSV và nhật ký Admin']
    };
    const [title, sub] = meta[tabName] || ['Quản trị', ''];
    document.getElementById('current-tab-title').textContent = title;
    const subEl = document.getElementById('current-tab-subtitle');
    if (subEl) subEl.textContent = sub;

    toggleMobileSidebar(false);
    renderCurrentTab();
  }

  function renderCurrentTab() {
    updateBadges();
    const mod = window.VPAdminModules;
    if (currentTab === 'orders') renderOrdersTable();
    else if (mod && typeof mod[currentTab] === 'function') mod[currentTab]();
    else if (currentTab === 'dashboard') renderDashboard();
    else if (currentTab === 'returns') renderReturnsTable();
    else if (currentTab === 'inventory') renderInventoryTable();
    else if (currentTab === 'products') renderProductsTable();
    else if (currentTab === 'reconciliation') renderReconciliationTable();
  }

  function updateBadges() {
    const orders = dbState.orders || [];
    const pendingOrders = orders.filter(o => o.orderStatus === 'pending').length;
    const pendingBadge = document.getElementById('pending-orders-badge');
    if (pendingBadge) pendingBadge.textContent = pendingOrders;

    const returnOrders = (dbState.returns || []).filter(r => r.status !== 'completed' && r.status !== 'rejected').length;
    const returnsBadge = document.getElementById('returns-badge');
    if (returnsBadge) returnsBadge.textContent = returnOrders;
  }

  // Status Badge Class Helpers (ánh xạ từ Enum V2)
  function getStatusBadgeHtml(status) {
    const label = orderStatusText(status);
    let cls = 'pending';
    if (status === 'confirmed' || status === 'packing' || status === 'approved') cls = 'confirmed';
    else if (status === 'shipping') cls = 'shipping';
    else if (status === 'delivered' || status === 'completed') cls = 'delivered';
    else if (status === 'delivery_failed' || status === 'rejected') cls = 'failed';
    else if (status === 'returning') cls = 'returning';
    else if (status === 'returned') cls = 'returned';
    else if (status === 'cancelled') cls = 'cancelled';
    return `<span class="status-pill ${cls}">${esc(label)}</span>`;
  }

  function getPaymentBadgeHtml(pStatus) {
    const label = paymentStatusText(pStatus);
    let cls = 'unpaid';
    if (pStatus === 'paid' || pStatus === 'Thanh toán thành công') cls = 'paid';
    else if (pStatus === 'failed' || pStatus === 'Thanh toán thất bại') cls = 'failed';
    else if (pStatus === 'Chờ hoàn tiền') cls = 'refunding';
    else if (pStatus === 'refunded' || pStatus === 'partially_refunded' || pStatus === 'Đã hoàn tiền' || pStatus === 'Đã hoàn toàn bộ') cls = 'refunded';
    return `<span class="payment-pill ${cls}">${esc(label)}</span>`;
  }

  function renderEmptyRow(colspan, title, desc, actionBtnHtml = '') {
    return `
      <tr>
        <td colspan="${colspan}">
          <div class="empty-state">
            <div class="empty-state-icon">${icons.emptyBox}</div>
            <h4>${esc(title)}</h4>
            <p>${esc(desc)}</p>
            ${actionBtnHtml}
          </div>
        </td>
      </tr>
    `;
  }

  // TAB 1: ORDERS TABLE
  function renderOrdersTable() {
    const orders = (dbState.orders || []).slice().reverse();
    const search = (document.getElementById('order-search')?.value || '').trim().toLowerCase();
    const filterStatus = document.getElementById('filter-order-status')?.value || 'all';
    const filterPayment = document.getElementById('filter-order-payment')?.value || 'all';
    const filterMethod = document.getElementById('filter-order-method')?.value || 'all';
    const filterDate = document.getElementById('filter-order-date')?.value || '';

    const hasActiveFilter = Boolean(search || filterStatus !== 'all' || filterPayment !== 'all' || filterMethod !== 'all' || filterDate);
    const resetBtn = document.getElementById('btn-reset-order-filters');
    if (resetBtn) resetBtn.style.display = hasActiveFilter ? 'inline-flex' : 'none';

    const filtered = orders.filter(o => {
      if (search) {
        const matchesId = (o.id || '').toLowerCase().includes(search);
        const matchesReceiver = (o.receiver || '').toLowerCase().includes(search);
        const matchesPhone = (o.phone || '').toLowerCase().includes(search);
        if (!matchesId && !matchesReceiver && !matchesPhone) return false;
      }
      if (filterDate && !(o.createdAt || '').startsWith(filterDate)) return false;
      const statusLabel = orderStatusText(o.orderStatus);
      const payLabel = paymentStatusText(o.paymentStatus);
      if (filterStatus !== 'all' && statusLabel !== filterStatus && o.orderStatus !== filterStatus) return false;
      if (filterPayment !== 'all') {
        if (filterPayment === 'Đã hoàn tiền' && (o.paymentStatus === 'refunded' || o.paymentStatus === 'partially_refunded')) {
          // match
        } else if (payLabel !== filterPayment && o.paymentStatus !== filterPayment) {
          return false;
        }
      }
      if (filterMethod !== 'all' && o.paymentMethod !== filterMethod) return false;
      return true;
    });

    const countText = document.getElementById('orders-count-text');
    if (countText) countText.textContent = `Hiển thị ${filtered.length} / ${orders.length} đơn hàng`;

    const tbody = document.getElementById('orders-table-body');
    if (!tbody) return;

    if (!filtered.length) {
      tbody.innerHTML = renderEmptyRow(
        10,
        orders.length ? 'Không tìm thấy đơn hàng phù hợp' : 'Chưa có đơn hàng nào',
        orders.length
          ? 'Thử thay đổi từ khóa tìm kiếm hoặc đặt lại các bộ lọc đang chọn.'
          : 'Các đơn hàng mới được đặt từ cửa hàng Việt Phục sẽ hiển thị tại đây.',
        hasActiveFilter ? `<button type="button" class="btn btn-outline btn-sm" id="empty-reset-order-filters">Xóa bộ lọc</button>` : ''
      );
      document.getElementById('empty-reset-order-filters')?.addEventListener('click', resetOrderFilters);
      return;
    }

    tbody.innerHTML = filtered.map(o => {
      const itemsSummary = o.items.map(i => `${esc(i.name)} <span style="color:var(--text-muted)">(${esc(i.size)} × ${i.qty})</span>`).join('<br>');
      return `
        <tr>
          <td><span class="order-code">${esc(o.id)}</span></td>
          <td style="color: var(--text-muted); font-size: 12px; white-space: nowrap;">${esc(formatDate(o.createdAt))}</td>
          <td>
            <strong style="color: var(--text-main);">${esc(o.receiver || 'Chưa có tên')}</strong><br>
            <span style="font-size: 12px; color: var(--text-muted);">${esc(o.phone || 'Chưa có SĐT')}</span>
          </td>
          <td style="max-width: 210px; font-size: 12.5px; color: var(--text-main);">${esc(o.address || 'Chưa có địa chỉ')}</td>
          <td style="font-size: 12.5px; line-height: 1.45;">${itemsSummary}</td>
          <td>
            <strong style="color: var(--text-main);">${money(o.total)}</strong><br>
            <small style="color: var(--text-muted);">${o.paymentMethod === 'COD' ? 'Thu hộ COD' : 'Trực tuyến'}</small>
          </td>
          <td>${getStatusBadgeHtml(o.orderStatus)}</td>
          <td><span style="font-size: 12px; color: var(--text-muted);">${esc(o.shipment?.trackingCode || orderStatusText(o.orderStatus))}</span></td>
          <td>${getPaymentBadgeHtml(o.paymentStatus)}</td>
          <td class="text-right">
            <button type="button" class="btn btn-outline btn-sm" data-action="open-order-detail" data-id="${esc(o.id)}">
              <span>Xử lý đơn</span>
              ${icons.arrowRight}
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function resetOrderFilters() {
    const searchEl = document.getElementById('order-search');
    const statusEl = document.getElementById('filter-order-status');
    const payEl = document.getElementById('filter-order-payment');
    const methodEl = document.getElementById('filter-order-method');
    if (searchEl) searchEl.value = '';
    if (statusEl) statusEl.value = 'all';
    if (payEl) payEl.value = 'all';
    if (methodEl) methodEl.value = 'all';
    renderOrdersTable();
  }

  // Stepper trực quan cho Order Detail Drawer
  function buildOrderStepper(o) {
    const st = o.orderStatus;
    const isCancelled = st === 'cancelled';
    const isFailFlow = ['delivery_failed', 'returning', 'returned'].includes(st);

    let step = 1;
    if (st === 'confirmed' || st === 'packing') step = 2;
    else if (st === 'shipping') step = 3;
    else if (st === 'delivered') step = 4;

    if (isCancelled || isFailFlow) {
      return `
        <div class="order-stepper">
          <div class="stepper-node done"><span class="stepper-dot">1</span><span>Tạo đơn</span></div>
          <div class="stepper-node ${isFailFlow ? 'done' : 'error'}"><span class="stepper-dot">2</span><span>Xác nhận</span></div>
          <div class="stepper-node ${isFailFlow ? 'error' : ''}"><span class="stepper-dot">3</span><span>${isFailFlow ? esc(orderStatusText(st)) : 'Vận chuyển'}</span></div>
          <div class="stepper-node ${st === 'returned' || isCancelled ? 'error' : ''}"><span class="stepper-dot">4</span><span>${isCancelled ? 'Đã hủy' : 'Hoàn kho'}</span></div>
        </div>
      `;
    }

    const labels = ['Tạo đơn', 'Xác nhận', 'Đang giao', 'Hoàn tất'];
    return `
      <div class="order-stepper">
        ${labels.map((label, idx) => {
          const num = idx + 1;
          const cls = num < step ? 'done' : (num === step ? (step === 4 ? 'done' : 'current') : '');
          return `<div class="stepper-node ${cls}"><span class="stepper-dot">${cls === 'done' ? '✓' : num}</span><span>${label}</span></div>`;
        }).join('')}
      </div>
    `;
  }

  // ORDER DETAIL DRAWER (Schema V2)
  function renderOrderDetail(orderId) {
    selectedOrderId = orderId;
    const o = (dbState.orders || []).find(x => x.id === orderId);
    const container = document.getElementById('order-drawer-container');
    if (!o || !container) return;

    const subtotal = o.subtotal ?? o.items.reduce((s, i) => s + ((i.unitPrice ?? i.price) * i.qty), 0);
    const shippingFee = o.shippingFee ?? defaultShippingFee();

    const isOnline = o.paymentMethod === 'online';
    const isPaid = o.paymentStatus === 'paid';
    const canShip = !isOnline || isPaid;

    const paidAmount = (o.transactions || []).filter(t => t.status === 'success').reduce((s, t) => s + t.amount, 0);
    const refundedAmount = (o.refunds || []).filter(r => r.status === 'success').reduce((s, r) => s + r.amount, 0);
    const refundableAmount = Math.max(0, paidAmount - refundedAmount);
    const canRefund = refundableAmount > 0 && ['cancelled', 'returned'].includes(o.orderStatus);

    let actionControlsHtml = '';
    const st = o.orderStatus;

    if (st === 'pending') {
      actionControlsHtml = `
        <div class="action-buttons">
          <button type="button" class="btn btn-primary" data-action="order-step" data-step="confirmed" data-id="${esc(o.id)}">
            ${icons.check} Xác nhận đơn hàng
          </button>
          <button type="button" class="btn btn-danger" data-action="order-cancel" data-id="${esc(o.id)}">
            ${icons.x} Hủy đơn hàng này
          </button>
        </div>
      `;
    } else if (st === 'confirmed' || st === 'packing') {
      if (!canShip) {
        actionControlsHtml = `
          <div class="action-alert alert-danger">
            <strong>CHẶN BÀN GIAO VẬN CHUYỂN:</strong> Đơn hàng thanh toán trực tuyến chưa hoàn tất thanh toán (Hiện tại: <strong>${esc(paymentStatusText(o.paymentStatus))}</strong>).
            Theo quy định, chỉ bàn giao hàng cho đơn vị vận chuyển sau khi khách đã thanh toán thành công.
          </div>
          <div class="action-buttons">
            <button type="button" class="btn btn-dark" disabled title="Khách chưa thanh toán online thành công">
              ${icons.truck} Bàn giao vận chuyển (Đã khóa)
            </button>
            <button type="button" class="btn btn-danger" data-action="order-cancel" data-id="${esc(o.id)}">
              ${icons.x} Hủy đơn
            </button>
          </div>
        `;
      } else {
        actionControlsHtml = `
          <div class="action-buttons">
            <button type="button" class="btn btn-primary" data-action="order-step" data-step="shipping" data-id="${esc(o.id)}">
              ${icons.truck} Bàn giao cho đơn vị vận chuyển
            </button>
            <button type="button" class="btn btn-danger" data-action="order-cancel" data-id="${esc(o.id)}">
              ${icons.x} Hủy đơn
            </button>
          </div>
        `;
      }
    } else if (st === 'shipping') {
      actionControlsHtml = `
        <div class="action-alert alert-warning">
          Đơn hàng đang trên đường vận chuyển tới khách hàng. Vui lòng cập nhật kết quả giao nhận bên dưới:
        </div>
        <div class="action-buttons">
          <button type="button" class="btn btn-primary" data-action="order-step" data-step="delivered" data-id="${esc(o.id)}">
            ${icons.check} Giao hàng thành công
          </button>
          <button type="button" class="btn btn-danger" data-action="order-step" data-step="delivery_failed" data-id="${esc(o.id)}">
            ${icons.x} Giao hàng thất bại
          </button>
        </div>
      `;
    } else if (st === 'delivery_failed') {
      actionControlsHtml = `
        <div class="action-alert alert-danger">
          <strong>Đơn giao thất bại:</strong> Khách không nhận hàng hoặc không liên lạc được. Vui lòng chuyển sang quy trình hoàn hàng về kho.
        </div>
        <div class="action-buttons">
          <button type="button" class="btn btn-primary" data-action="order-step" data-step="returning" data-id="${esc(o.id)}">
            ${icons.rotate} Xác nhận hàng đang chuyển hoàn về kho
          </button>
        </div>
      `;
    } else if (st === 'returning') {
      actionControlsHtml = `
        <div class="action-alert alert-warning">
          <strong>Hàng đang chuyển hoàn:</strong> Đơn vị giao nhận đang chuyển trả kiện hàng về lại kho Việt Phục.
        </div>
        <div class="action-buttons">
          <button type="button" class="btn btn-primary" data-action="order-step" data-step="returned" data-id="${esc(o.id)}">
            ${icons.boxIn} Đã nhận lại hàng hoàn & Nhập kho
          </button>
        </div>
      `;
    } else if (st === 'returned') {
      actionControlsHtml = `
        <div class="action-alert alert-success">
          Đơn hàng đã được hoàn trả về kho và số lượng sản phẩm đã được cộng lại vào tồn khả dụng.
        </div>
      `;
    } else if (st === 'delivered') {
      actionControlsHtml = `
        <div class="action-alert alert-success">
          Đơn hàng đã giao thành công tới khách hàng.
        </div>
      `;
    } else if (st === 'cancelled') {
      actionControlsHtml = `
        <div class="action-alert alert-warning">
          Đơn hàng đã bị hủy. Số lượng giữ hàng đã được giải phóng về kho.
        </div>
      `;
    }

    let refundSectionHtml = '';
    if (canRefund) {
      refundSectionHtml = `
        <div class="drawer-section" style="border-color: var(--danger-border); background: var(--danger-bg);">
          <div class="drawer-section-title" style="color: var(--danger); border-bottom-color: var(--danger-border);">
            <span>YÊU CẦU HOÀN TIỀN CHO KHÁCH (MÔ PHỎNG)</span>
            <span class="payment-pill refunding">Có thể hoàn: ${money(refundableAmount)}</span>
          </div>
          <p style="font-size: 13px; margin-bottom: 12px; color: var(--text-main);">
            Số tiền đã thanh toán còn lại có thể hoàn trả: <strong>${money(refundableAmount)}</strong>
          </p>
          <button type="button" class="btn btn-danger-solid" data-action="order-refund" data-id="${esc(o.id)}" data-amount="${refundableAmount}">
            ${icons.refund} Xác nhận đã hoàn tiền (${money(refundableAmount)})
          </button>
        </div>
      `;
    } else if (o.paymentStatus === 'refunded' || o.paymentStatus === 'partially_refunded') {
      refundSectionHtml = `
        <div class="drawer-section" style="border-color: var(--success-border); background: var(--success-bg);">
          <div class="drawer-section-title" style="color: var(--success); border-bottom-color: var(--success-border);">
            <span>TIẾN TRÌNH HOÀN TIỀN</span>
            <span class="payment-pill paid">${esc(paymentStatusText(o.paymentStatus))}</span>
          </div>
          <p style="font-size: 13px; color: var(--success);">
            Đã hoàn tiền mô phỏng tổng cộng <strong>${money(refundedAmount)}</strong>.
          </p>
        </div>
      `;
    }

    const cr = o.cancelRequest;
    let cancelRequestSectionHtml = '';
    if (cr) {
      const crStatusLabel = cr.status === 'pending' ? 'Chờ Admin xử lý' : (cr.status === 'approved' ? 'Đã chấp nhận hủy' : 'Đã từ chối');
      cancelRequestSectionHtml = `
        <div class="drawer-section" style="border-color: var(--warning-border); background: var(--warning-bg);">
          <div class="drawer-section-title" style="color: var(--warning); border-bottom-color: var(--warning-border);">
            <span>YÊU CẦU HỦY ĐƠN TỪ KHÁCH HÀNG</span>
            <span class="payment-pill">${esc(crStatusLabel)}</span>
          </div>
          <div style="font-size: 13px; line-height: 1.6;">
            <strong>Lý do khách chọn:</strong> ${esc(cr.reason)}<br>
            <small style="color: var(--text-muted);">Gửi lúc: ${esc(formatDate(cr.createdAt))}</small>
            ${cr.resolvedAt ? `<br><strong>Kết quả xử lý (${esc(formatDate(cr.resolvedAt))}):</strong> ${esc(cr.adminReason || '—')}` : ''}
          </div>
          ${cr.status === 'pending' ? `
            <div style="margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px;">
              <button type="button" class="btn btn-danger-solid btn-sm" data-action="admin-cancel-req-approve" data-id="${esc(o.id)}">
                ${icons.check} Chấp nhận hủy & Giải phóng kho
              </button>
              <button type="button" class="btn btn-outline btn-sm" data-action="admin-cancel-req-reject" data-id="${esc(o.id)}">
                ${icons.x} Từ chối yêu cầu hủy
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }

    const changeReqs = Array.isArray(o.changeRequests) ? o.changeRequests : [];
    let changeRequestsSectionHtml = '';
    if (changeReqs.length) {
      changeRequestsSectionHtml = changeReqs.map(ch => {
        const chLabel = ch.status === 'pending' ? 'Chờ Admin xử lý' : (ch.status === 'approved' ? 'Đã chấp nhận' : 'Đã từ chối');
        const addrCh = ch.newData?.addressChange;
        const itemChs = Array.isArray(ch.newData?.items) ? ch.newData.items : [];
        return `
          <div class="drawer-section" style="border-color: rgba(185,154,98,0.45); background: #fcfaf6;">
            <div class="drawer-section-title">
              <span>YÊU CẦU THAY ĐỔI ĐƠN (${esc(ch.id)})</span>
              <span class="payment-pill">${esc(chLabel)}</span>
            </div>
            <div style="font-size: 13px; line-height: 1.55;">
              <p style="margin:0 0 8px;"><strong>Lý do khách gửi:</strong> ${esc(ch.reason)} <small style="color:var(--text-muted);">(${esc(formatDate(ch.createdAt))})</small></p>
              <table style="width:100%;border-collapse:collapse;font-size:12.5px;background:#fff;border:1px solid var(--border);">
                <thead>
                  <tr style="background:#f5efe6;text-align:left;">
                    <th style="padding:6px 8px;border-bottom:1px solid var(--border);">Hạng mục</th>
                    <th style="padding:6px 8px;border-bottom:1px solid var(--border);">Thông tin cũ</th>
                    <th style="padding:6px 8px;border-bottom:1px solid var(--border);">Thông tin mới</th>
                  </tr>
                </thead>
                <tbody>
                  ${addrCh ? `
                    <tr>
                      <td style="padding:6px 8px;border-bottom:1px solid var(--border);">Giao nhận</td>
                      <td style="padding:6px 8px;border-bottom:1px solid var(--border);">${esc(ch.oldData?.receiver)} · ${esc(ch.oldData?.phone)}<br>${esc(ch.oldData?.address)}</td>
                      <td style="padding:6px 8px;border-bottom:1px solid var(--border);"><strong>${esc(addrCh.receiver)} · ${esc(addrCh.phone)}</strong><br><strong>${esc(addrCh.address)}</strong></td>
                    </tr>
                  ` : ''}
                  ${itemChs.map(ic => `
                    <tr>
                      <td style="padding:6px 8px;border-bottom:1px solid var(--border);">${esc(ic.productName)} × ${ic.qty}</td>
                      <td style="padding:6px 8px;border-bottom:1px solid var(--border);">${esc(ic.oldColor)} / ${esc(ic.oldSize)}<br><code>${esc(ic.oldSku)}</code> (${money(ic.oldUnitPrice)})</td>
                      <td style="padding:6px 8px;border-bottom:1px solid var(--border);"><strong>${esc(ic.newColor)} / ${esc(ic.newSize)}</strong><br><code>${esc(ic.newSku)}</code> (${money(ic.newUnitPrice)})</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              ${ch.newData?.priceDelta ? `<p style="margin:8px 0 0;color:var(--brand-burgundy);"><strong>Chênh lệch tổng tiền (mô phỏng):</strong> ${ch.newData.priceDelta > 0 ? '+' : ''}${money(ch.newData.priceDelta)}</p>` : ''}
              ${ch.resolvedAt ? `<p style="margin:8px 0 0;"><strong>Phản hồi Admin (${esc(formatDate(ch.resolvedAt))}):</strong> ${esc(ch.adminReason || '—')}</p>` : ''}
            </div>
            ${ch.status === 'pending' ? `
              <div style="margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px;">
                <button type="button" class="btn btn-primary btn-sm" data-action="admin-change-req-approve" data-id="${esc(o.id)}" data-req-id="${esc(ch.id)}">
                  ${icons.check} Chấp nhận thay đổi
                </button>
                <button type="button" class="btn btn-outline btn-sm" data-action="admin-change-req-reject" data-id="${esc(o.id)}" data-req-id="${esc(ch.id)}">
                  ${icons.x} Từ chối thay đổi
                </button>
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    }

    const ret = (dbState.returns || []).find(r => r.orderId === o.id);
    let returnSectionHtml = '';
    if (ret) {
      returnSectionHtml = `
        <div class="drawer-section" style="border-color: var(--warning-border); background: var(--warning-bg);">
          <div class="drawer-section-title" style="color: var(--warning); border-bottom-color: var(--warning-border);">
            <span>YÊU CẦU ĐỔI TRẢ & KHIẾU NẠI</span>
            ${getStatusBadgeHtml(ret.status)}
          </div>
          <div style="font-size: 13px; line-height: 1.6;">
            <strong>Lý do từ khách hàng:</strong> ${esc(ret.reason || 'Không có mô tả')}<br>
            <small style="color: var(--text-muted);">Quy định: Tiếp nhận yêu cầu trong vòng 7 ngày kể từ khi nhận hàng.</small>
          </div>
          ${ret.status !== 'completed' && ret.status !== 'rejected' ? `
            <div style="margin-top: 14px; display: flex; flex-wrap: wrap; gap: 8px;">
              <button type="button" class="btn btn-primary btn-sm" data-action="return-approve" data-id="${esc(ret.id)}">
                ${icons.check} Chấp thuận & Nhập lại hàng
              </button>
              <button type="button" class="btn btn-outline btn-sm" data-action="return-reject" data-id="${esc(ret.id)}">
                ${icons.x} Từ chối yêu cầu
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }

    const itemsHtml = o.items.map(i => {
      const p = dbState.products.find(x => x.id === i.productId) || {};
      const unitPrice = i.unitPrice ?? i.price ?? 0;
      return `
        <div class="order-item-row">
          <img src="${esc(i.img || p.img || 'assets/accessory.png')}" class="order-item-img" alt="${esc(i.name)}">
          <div class="order-item-details">
            <div class="order-item-name">${esc(i.name)}</div>
            <div class="order-item-meta">SKU: <code>${esc(i.sku || 'N/A')}</code> · Màu: ${esc(i.color || 'Mặc định')} · Size: <strong>${esc(i.size)}</strong></div>
            <div style="font-size: 12.5px; margin-top: 4px; color: var(--text-main);">
              ${money(unitPrice)} × <strong>${i.qty}</strong> = <strong>${money(unitPrice * i.qty)}</strong>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Timeline history
    const historyHtml = (o.history || []).map(h => {
      const text = typeof h === 'string' ? h : `${formatDate(h.at)} · ${h.note || orderStatusText(h.status)}`;
      return `<div class="timeline-item"><span>${esc(text)}</span></div>`;
    }).join('');

    container.innerHTML = `
      <div class="admin-modal-overlay" data-action="close-order-detail">
        <aside class="admin-drawer" role="dialog" aria-modal="true" aria-label="Chi tiết đơn hàng ${esc(o.id)}">
          <header class="drawer-header">
            <div>
              <h3>Đơn hàng ${esc(o.id)}</h3>
              <div class="drawer-header-meta">
                <small style="color: var(--text-muted);">${esc(formatDate(o.createdAt))}</small>
                ${getStatusBadgeHtml(o.orderStatus)}
                ${getPaymentBadgeHtml(o.paymentStatus)}
              </div>
            </div>
            <button type="button" class="drawer-close" data-action="close-order-detail" title="Đóng (Esc)" aria-label="Đóng chi tiết đơn hàng">&times;</button>
          </header>

          <div class="drawer-body">
            ${buildOrderStepper(o)}

            <div class="action-panel">
              <div class="drawer-section-title" style="border-bottom-color: rgba(185,154,98,0.28);">QUY TRÌNH XỬ LÝ ĐƠN HÀNG</div>
              ${actionControlsHtml}
            </div>

            ${cancelRequestSectionHtml}
            ${changeRequestsSectionHtml}
            ${refundSectionHtml}
            ${returnSectionHtml}

            <div class="drawer-section">
              <div class="drawer-section-title">THÔNG TIN GIAO HÀNG & LIÊN HỆ</div>
              <div class="info-grid">
                <div class="info-item">
                  <span>NGƯỜI NHẬN</span>
                  <strong>${esc(o.receiver || 'Chưa cung cấp')}</strong>
                </div>
                <div class="info-item">
                  <span>SỐ ĐIỆN THOẠI</span>
                  <strong>${esc(o.phone || 'Chưa cung cấp')}</strong>
                </div>
                <div class="info-item" style="grid-column: 1 / -1;">
                  <span>ĐỊA CHỈ NHẬN HÀNG CHI TIẾT</span>
                  <strong>${esc(o.address || 'Chưa cung cấp')}</strong>
                </div>
                <div class="info-item">
                  <span>KHÁCH HÀNG</span>
                  <span>${esc(o.customerId || 'Đơn vãng lai / V1')}</span>
                </div>
                <div class="info-item">
                  <span>PHƯƠNG THỨC GIAO HÀNG</span>
                  <span>${shippingFee === remoteShippingFee() ? `Giao hàng khu vực xa (${money(remoteShippingFee())})` : `Giao hàng cơ bản (${money(shippingFee)})`}</span>
                </div>
              </div>
            </div>

            <div class="drawer-section">
              <div class="drawer-section-title">SẢN PHẨM & TỔNG THANH TOÁN</div>
              <div class="order-items-list">${itemsHtml}</div>
              <div style="border-top: 1px solid var(--border); margin-top: 14px; padding-top: 12px; font-size: 13px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                  <span style="color: var(--text-muted);">Tiền hàng</span>
                  <span>${money(subtotal)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                  <span style="color: var(--text-muted);">Phí giao hàng</span>
                  <span>${money(shippingFee)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 15.5px; font-weight: 700; color: var(--text-main); margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border);">
                  <span>Tổng thanh toán</span>
                  <span style="color: var(--brand-burgundy); font-family: var(--font-serif); font-size: 17px;">${money(o.total)}</span>
                </div>
                <div style="margin-top: 10px; font-size: 12px; color: var(--text-muted);">
                  Phương thức: <strong>${o.paymentMethod === 'COD' ? 'Thu tiền khi nhận hàng (COD mô phỏng)' : 'Thanh toán QR Demo (Mô phỏng)'}</strong>
                  · Đối soát: <strong>${esc(settlementText(o.settlementStatus))}</strong>
                </div>
              </div>
            </div>

            <div class="drawer-section">
              <div class="drawer-section-title">LỊCH SỬ THAO TÁC & AUDIT TRAIL</div>
              <div class="timeline">
                ${historyHtml || '<span style="color:var(--text-muted);font-size:12.5px;">Chưa có lịch sử ghi nhận.</span>'}
              </div>
            </div>
          </div>
        </aside>
      </div>
    `;
  }

  function closeOrderDetail() {
    selectedOrderId = null;
    const container = document.getElementById('order-drawer-container');
    if (container) container.innerHTML = '';
  }

  // TAB 2: DASHBOARD (sử dụng 100% dữ liệu thật từ dbState V2)
  function renderDashboard() {
    const orders = dbState.orders || [];
    const totalOrders = orders.length;
    const pendingOrders = orders.filter(o => o.orderStatus === 'pending').length;
    const deliveredOrders = orders.filter(o => o.orderStatus === 'delivered').length;
    const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);

    document.getElementById('dash-total-orders').textContent = totalOrders;
    document.getElementById('dash-pending-orders').textContent = pendingOrders;
    document.getElementById('dash-delivered-orders').textContent = deliveredOrders;
    document.getElementById('dash-total-revenue').textContent = money(totalRevenue);

    const visits = dbState.visits || 0;
    const cartEvents = dbState.cartEvents || 0;
    document.getElementById('dash-visits').textContent = visits;
    document.getElementById('dash-cart-events').textContent = cartEvents;
    document.getElementById('dash-funnel-orders').textContent = totalOrders;
    document.getElementById('dash-funnel-delivered').textContent = deliveredOrders;

    const rate = visits > 0 ? ((totalOrders / visits) * 100).toFixed(1) + '%' : '0%';
    document.getElementById('dash-conversion-rate').textContent = rate;

    const baseMax = Math.max(visits, cartEvents, totalOrders, 1);
    const setBar = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.style.width = Math.min(100, Math.round((val / baseMax) * 100)) + '%';
    };
    setBar('funnel-bar-visits', visits);
    setBar('funnel-bar-carts', cartEvents);
    setBar('funnel-bar-orders', totalOrders);
    setBar('funnel-bar-delivered', deliveredOrders);

    const breakdownBody = document.getElementById('dash-breakdown-body');
    if (breakdownBody) {
      if (!totalOrders) {
        breakdownBody.innerHTML = `
          <div class="empty-state" style="padding: 24px 12px;">
            <div class="empty-state-icon">${icons.emptyBox}</div>
            <h4>Chưa có dữ liệu đơn hàng</h4>
            <p style="margin-bottom:0;">Khi có đơn hàng từ cửa hàng, cơ cấu COD/Online và trạng thái sẽ hiển thị tại đây.</p>
          </div>
        `;
      } else {
        const codCount = orders.filter(o => o.paymentMethod === 'COD').length;
        const onlineCount = orders.filter(o => o.paymentMethod === 'online').length;
        const shippingCount = orders.filter(o => ['confirmed', 'packing', 'shipping'].includes(o.orderStatus)).length;
        const issueCount = orders.filter(o => ['delivery_failed', 'returning', 'returned', 'cancelled'].includes(o.orderStatus)).length;
        const pct = count => Math.round((count / totalOrders) * 100);

        breakdownBody.innerHTML = `
          <div class="breakdown-grid">
            <div class="breakdown-row">
              <span class="breakdown-label"><span class="dot-swatch" style="background: var(--brand-burgundy);"></span>Thanh toán COD</span>
              <strong>${codCount} đơn (${pct(codCount)}%)</strong>
            </div>
            <div class="breakdown-row">
              <span class="breakdown-label"><span class="dot-swatch" style="background: var(--brand-gold);"></span>Thanh toán trực tuyến</span>
              <strong>${onlineCount} đơn (${pct(onlineCount)}%)</strong>
            </div>
            <div class="breakdown-row">
              <span class="breakdown-label"><span class="dot-swatch" style="background: var(--info);"></span>Đang xử lý & vận chuyển</span>
              <strong>${shippingCount} đơn (${pct(shippingCount)}%)</strong>
            </div>
            <div class="breakdown-row">
              <span class="breakdown-label"><span class="dot-swatch" style="background: var(--brand-terracotta);"></span>Hủy / Giao thất bại / Hoàn hàng</span>
              <strong>${issueCount} đơn (${pct(issueCount)}%)</strong>
            </div>
          </div>
        `;
      }
    }

    const recentOrders = orders.slice(-5).reverse();
    const tbody = document.getElementById('dash-recent-orders-body');
    if (!tbody) return;

    if (!recentOrders.length) {
      tbody.innerHTML = renderEmptyRow(5, 'Chưa có đơn hàng gần đây', 'Các đơn mới phát sinh sẽ được liệt kê tại bảng này.');
      return;
    }

    tbody.innerHTML = recentOrders.map(o => `
      <tr>
        <td><span class="order-code">${esc(o.id)}</span></td>
        <td>
          <strong>${esc(o.receiver || 'Khách hàng')}</strong>
          ${o.phone ? `<br><small style="color: var(--text-muted);">${esc(o.phone)}</small>` : ''}
        </td>
        <td><strong>${money(o.total)}</strong></td>
        <td>${getStatusBadgeHtml(o.orderStatus)}</td>
        <td class="text-right">
          <button type="button" class="btn btn-outline btn-sm" data-action="open-order-detail" data-id="${esc(o.id)}">
            Chi tiết ${icons.arrowRight}
          </button>
        </td>
      </tr>
    `).join('');
  }

  // TAB 3: RETURNS (Schema V2: đọc từ dbState.returns)
  function renderReturnsTable() {
    const returns = (dbState.returns || []).slice().reverse();
    const countEl = document.getElementById('returns-count-text');
    if (countEl) countEl.textContent = `${returns.length} yêu cầu`;

    const tbody = document.getElementById('returns-table-body');
    if (!tbody) return;

    if (!returns.length) {
      tbody.innerHTML = renderEmptyRow(7, 'Không có yêu cầu đổi trả', 'Hiện chưa có đơn hàng nào phát sinh khiếu nại hoặc yêu cầu đổi trả.');
      return;
    }

    tbody.innerHTML = returns.map(r => {
      const o = (dbState.orders || []).find(x => x.id === r.orderId) || {};
      const itemsList = (r.items || []).map(i => `${esc(i.sku || i.productId)} × ${i.qty}`).join(', ');
      const canProcess = r.status !== 'completed' && r.status !== 'rejected';
      return `
        <tr>
          <td><span class="order-code">${esc(r.orderId)}</span></td>
          <td>
            <strong>${esc(o.receiver || 'Khách hàng')}</strong><br>
            <small style="color: var(--text-muted);">${esc(o.phone || '')}</small>
          </td>
          <td style="font-size: 12.5px;">${itemsList}</td>
          <td style="max-width: 240px;">${esc(r.reason || 'Không có mô tả')}</td>
          <td>${getStatusBadgeHtml(r.status)}</td>
          <td>${getPaymentBadgeHtml(o.paymentStatus || 'unpaid')}</td>
          <td class="text-right">
            <div style="display:inline-flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
              ${canProcess ? `
                <button type="button" class="btn btn-primary btn-sm" data-action="return-approve" data-id="${esc(r.id)}" title="Duyệt và nhập kho">
                  ${icons.check} Duyệt
                </button>
                <button type="button" class="btn btn-danger btn-sm" data-action="return-reject" data-id="${esc(r.id)}" title="Từ chối yêu cầu">
                  ${icons.x} Từ chối
                </button>
              ` : ''}
              <button type="button" class="btn btn-outline btn-sm" data-action="open-order-detail" data-id="${esc(r.orderId)}">
                Chi tiết
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // TAB 4: INVENTORY (Schema V2: đọc từ variants[].sku & state.stock[sku])
  function renderInventoryTable() {
    const products = dbState.products || [];
    const statusFilter = document.getElementById('filter-inventory-status')?.value || 'all';
    const tbody = document.getElementById('inventory-table-body');
    if (!tbody) return;

    const rows = products.filter(p => {
      const variants = p.variants || [];
      const qtys = variants.map(v => getVariantStock(v.sku));
      if (statusFilter === 'low') return qtys.some(q => q > 0 && q < 3);
      if (statusFilter === 'out') return qtys.some(q => q === 0);
      return true;
    });

    if (!rows.length) {
      tbody.innerHTML = renderEmptyRow(6, 'Không có biến thể phù hợp', 'Không có sản phẩm nào nằm trong nhóm cảnh báo tồn kho đã chọn.');
      return;
    }

    tbody.innerHTML = rows.map(p => {
      const variants = p.variants || [];
      let totalStock = 0;
      const sizeTags = variants.length
        ? variants.map(v => {
            const qty = getVariantStock(v.sku);
            totalStock += qty;
            const cls = qty === 0 ? 'out' : (qty < 3 ? 'low' : 'ok');
            const note = qty === 0 ? ' · Hết' : (qty < 3 ? ' · Sắp hết' : '');
            return `<span class="stock-chip ${cls}" title="${esc(v.sku)}"><strong>${esc(v.size)}:</strong> ${qty}${note}</span>`;
          }).join('')
        : '<span class="stock-chip out">Chưa khai báo biến thể</span>';
      const primaryColor = variants[0]?.color || 'Không rõ';

      return `
        <tr>
          <td><img src="${esc(p.img)}" class="product-thumb" alt="${esc(p.name)}"></td>
          <td><strong>${esc(p.name)}</strong><br><small style="color:var(--text-muted);">${esc(p.id)}</small></td>
          <td>${esc(categoryNameOf(p))}</td>
          <td>
            <span class="color-chip">
              <span class="color-chip-dot" style="background:${colorSwatches[primaryColor] || '#B99A62'}"></span>
              ${esc(primaryColor)}
            </span>
          </td>
          <td><div class="size-stock-list">${sizeTags}</div></td>
          <td class="text-right"><strong style="font-family: var(--font-serif); font-size: 18px; color: var(--text-main);">${totalStock}</strong></td>
        </tr>
      `;
    }).join('');
  }

  // TAB 5: PRODUCTS
  function populateProductCategories() {
    const select = document.getElementById('filter-product-category');
    if (!select) return;
    const current = select.value || 'all';
    const categories = (dbState.categories || []).map(c => c.name);
    select.innerHTML = `<option value="all">Tất cả danh mục</option>` +
      categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if ([...select.options].some(o => o.value === current)) select.value = current;
  }

  function renderProductsTable() {
    const products = dbState.products || [];
    const search = (document.getElementById('product-search')?.value || '').trim().toLowerCase();
    const catFilter = document.getElementById('filter-product-category')?.value || 'all';
    const tbody = document.getElementById('products-table-body');
    if (!tbody) return;

    const filtered = products.filter(p => {
      const catName = categoryNameOf(p);
      const colorText = [...new Set((p.variants || []).map(v => v.color))].join(', ');
      if (catFilter !== 'all' && catName !== catFilter) return false;
      if (search) {
        const hay = `${p.id} ${p.name} ${catName} ${p.material} ${colorText}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    if (!filtered.length) {
      tbody.innerHTML = renderEmptyRow(8, 'Không tìm thấy sản phẩm', 'Không có sản phẩm nào khớp với từ khóa hoặc danh mục đang chọn.');
      return;
    }

    tbody.innerHTML = filtered.map(p => {
      const variants = p.variants || [];
      const sizes = [...new Set(variants.map(v => v.size))];
      const primaryColor = variants[0]?.color || 'Không rõ';
      const totalStock = variants.reduce((sum, v) => sum + getVariantStock(v.sku), 0);
      return `
        <tr>
          <td><span class="order-code">${esc(p.id)}</span></td>
          <td><img src="${esc(p.img)}" class="product-thumb" alt="${esc(p.name)}"></td>
          <td>
            <strong>${esc(p.name)}</strong>
            <br><small style="color: var(--text-muted);">Size: ${sizes.length ? sizes.map(esc).join(', ') : 'Chưa có'}</small>
          </td>
          <td>${esc(categoryNameOf(p))}</td>
          <td>
            <strong>${money(p.price)}</strong>
            ${p.old ? `<br><del style="font-size:11.5px; color:var(--text-muted);">${money(p.old)}</del>` : ''}
          </td>
          <td>
            <div>${esc(p.material)}</div>
            <span class="color-chip" style="color: var(--text-muted); font-size: 12px;">
              <span class="color-chip-dot" style="background:${colorSwatches[primaryColor] || '#B99A62'}"></span>
              ${esc(primaryColor)}
            </span>
          </td>
          <td><span class="badge" style="background: var(--bg-main); border: 1px solid var(--border); color: var(--text-main);">${esc(p.tag || 'Mặc định')}</span></td>
          <td class="text-right"><strong>${totalStock}</strong> <small style="color: var(--text-muted);">sp</small></td>
        </tr>
      `;
    }).join('');
  }

  // TAB 6: RECONCILIATION (Schema V2)
  function renderReconciliationTable() {
    const codOrders = (dbState.orders || []).filter(o => o.paymentMethod === 'COD' && o.orderStatus === 'delivered');
    const summaryEl = document.getElementById('reconciliation-summary');
    const tbody = document.getElementById('reconciliation-table-body');
    if (!tbody) return;

    const totalCod = codOrders.reduce((s, o) => s + (o.total || 0), 0);
    const totalShip = codOrders.reduce((s, o) => s + (o.shippingFee ?? defaultShippingFee()), 0);
    const totalActual = codOrders.reduce((s, o) => s + Math.max(0, (o.total || 0) - (o.shippingFee ?? defaultShippingFee())), 0);
    const unsettledCount = codOrders.filter(o => o.settlementStatus !== 'settled').length;

    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="stat-card">
          <div class="stat-top"><span class="stat-label">Tổng thu hộ COD</span></div>
          <div class="stat-value">${money(totalCod)}</div>
          <div class="stat-sub">${codOrders.length} đơn COD đã giao thành công</div>
        </div>
        <div class="stat-card">
          <div class="stat-top"><span class="stat-label">Tổng phí vận chuyển</span></div>
          <div class="stat-value" style="color: var(--brand-terracotta);">${money(totalShip)}</div>
          <div class="stat-sub">Khấu trừ từ tiền thu hộ</div>
        </div>
        <div class="stat-card">
          <div class="stat-top"><span class="stat-label">Thực nhận dự kiến</span></div>
          <div class="stat-value" style="color: var(--success);">${money(totalActual)}</div>
          <div class="stat-sub">Công thức mô phỏng: Thu hộ − Phí ship</div>
        </div>
        <div class="stat-card">
          <div class="stat-top"><span class="stat-label">Chờ đối soát</span></div>
          <div class="stat-value" style="color: var(--warning);">${unsettledCount}</div>
          <div class="stat-sub">Đơn chưa xác nhận đối soát</div>
        </div>
      `;
    }

    if (!codOrders.length) {
      tbody.innerHTML = renderEmptyRow(7, 'Chưa có đơn COD cần đối soát', 'Các đơn COD sau khi giao thành công sẽ xuất hiện trong bảng đối soát tại đây.');
      return;
    }

    tbody.innerHTML = codOrders.map(o => {
      const shipFee = o.shippingFee ?? defaultShippingFee();
      const actualReceived = Math.max(0, o.total - shipFee);
      const isSettled = o.settlementStatus === 'settled';
      return `
        <tr>
          <td><span class="order-code">${esc(o.id)}</span></td>
          <td>
            <strong>${esc(o.receiver || 'Khách hàng')}</strong><br>
            <small style="color: var(--text-muted);">${esc(o.phone || '')}</small>
          </td>
          <td class="text-right"><strong>${money(o.total)}</strong></td>
          <td class="text-right" style="color: var(--danger); font-size: 12.5px;">−${money(shipFee)}</td>
          <td class="text-right"><strong style="color: var(--success); font-size: 14px;">${money(actualReceived)}</strong></td>
          <td>
            <span class="status-pill ${isSettled ? 'delivered' : 'pending'}">
              ${esc(settlementText(o.settlementStatus))}
            </span>
          </td>
          <td class="text-right">
            ${!isSettled ? `
              <button type="button" class="btn btn-primary btn-sm" data-action="order-settle" data-id="${esc(o.id)}">
                ${icons.check} Xác nhận đối soát
              </button>
            ` : '<span style="color: var(--text-muted); font-size: 12px;">Đã hoàn tất</span>'}
          </td>
        </tr>
      `;
    }).join('');
  }

  // Event Listeners
  document.addEventListener('DOMContentLoaded', () => {
    checkSession();

    // Toggle Password Visibility
    document.getElementById('toggle-password-btn')?.addEventListener('click', () => {
      const input = document.getElementById('login-password');
      const btn = document.getElementById('toggle-password-btn');
      if (!input || !btn) return;
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      btn.innerHTML = isHidden ? icons.eyeOff : icons.eye;
    });

    // Login Form Submit
    document.getElementById('admin-login-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target;
      const username = form.username.value.trim();
      const password = form.password.value;
      await login(username, password);
    });

    // Logout có xác nhận gọn gàng
    document.getElementById('admin-logout-btn')?.addEventListener('click', async () => {
      const ok = await showConfirmDialog({
        title: 'Đăng xuất quản trị',
        message: 'Bạn có muốn kết thúc phiên làm việc hiện tại trên trang quản trị Việt Phục?',
        confirmText: 'Đăng xuất',
        cancelText: 'Ở lại'
      });
      if (ok) await logout();
    });

    // Mobile sidebar controls
    document.getElementById('mobile-menu-toggle')?.addEventListener('click', () => toggleMobileSidebar(true));
    document.getElementById('sidebar-close-btn')?.addEventListener('click', () => toggleMobileSidebar(false));
    document.getElementById('sidebar-backdrop')?.addEventListener('click', () => toggleMobileSidebar(false));

    // Refresh Data
    document.getElementById('btn-refresh-data')?.addEventListener('click', async () => {
      await loadDatabase();
      showToast('Đã cập nhật dữ liệu mới nhất!', 'success');
    });

    // Sidebar navigation tabs
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        switchTab(btn.dataset.tab);
      });
    });

    // Dashboard shortcut
    document.getElementById('dash-view-all-orders')?.addEventListener('click', () => switchTab('orders'));

    // Filters
    document.getElementById('order-search')?.addEventListener('input', renderOrdersTable);
    document.getElementById('filter-order-status')?.addEventListener('change', renderOrdersTable);
    document.getElementById('filter-order-payment')?.addEventListener('change', renderOrdersTable);
    document.getElementById('filter-order-method')?.addEventListener('change', renderOrdersTable);
    document.getElementById('filter-order-date')?.addEventListener('change', renderOrdersTable);
    document.getElementById('btn-reset-order-filters')?.addEventListener('click', () => {
      const d = document.getElementById('filter-order-date');
      if (d) d.value = '';
      resetOrderFilters();
    });

    document.getElementById('filter-inventory-status')?.addEventListener('change', renderInventoryTable);
    document.getElementById('product-search')?.addEventListener('input', renderProductsTable);
    document.getElementById('filter-product-category')?.addEventListener('change', renderProductsTable);

    // Đóng Drawer / Dialog / Sidebar bằng phím Escape
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (activeDialogResolve) {
        closeDialog(null);
        return;
      }
      if (selectedOrderId) {
        closeOrderDetail();
        return;
      }
      toggleMobileSidebar(false);
    });

    // Click handler cho các hành động nghiệp vụ (giữ nguyên toàn bộ nghiệp vụ)
    document.addEventListener('click', async e => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const action = el.dataset.action;
      const orderId = el.dataset.id;

      if (action === 'open-order-detail') {
        renderOrderDetail(orderId);
        return;
      }

      if (action === 'close-order-detail') {
        if (el.classList.contains('drawer-backdrop') && e.target !== el) return;
        closeOrderDetail();
        return;
      }

      // Xử lý các bước đơn hàng qua Admin API
      if (action === 'order-step') {
        const step = el.dataset.step;
        if (step === 'delivery_failed') {
          const ok = await showConfirmDialog({
            title: 'Xác nhận giao thất bại',
            message: `Đánh dấu đơn hàng ${orderId} giao không thành công để chuyển sang quy trình hoàn hàng?`,
            confirmText: 'Xác nhận thất bại',
            danger: true
          });
          if (!ok) return;
        }

        el.classList.add('is-loading');
        try {
          await adminActionRequest('PATCH', `/api/admin/orders/${encodeURIComponent(orderId)}/status`, { nextStatus: step });
          showToast('Đã cập nhật trạng thái đơn hàng!', 'success');
        } catch (err) {
          showToast(err.message, 'danger');
        } finally {
          el.classList.remove('is-loading');
        }
        return;
      }

      // Hủy đơn hàng từ phía Admin
      if (action === 'order-cancel') {
        const ok = await showConfirmDialog({
          title: 'Xác nhận hủy đơn hàng',
          message: `Bạn có chắc chắn muốn hủy đơn ${orderId}? Số lượng hàng giữ sẽ được giải phóng lại về kho.`,
          confirmText: 'Hủy đơn hàng',
          danger: true
        });
        if (!ok) return;

        el.classList.add('is-loading');
        try {
          await adminActionRequest('PATCH', `/api/admin/orders/${encodeURIComponent(orderId)}/status`, { nextStatus: 'cancelled' });
          showToast('Đã hủy đơn hàng và hoàn lại số lượng tồn kho.', 'success');
        } catch (err) {
          showToast(err.message, 'danger');
        } finally {
          el.classList.remove('is-loading');
        }
        return;
      }

      // Hoàn tiền (Refund)
      if (action === 'admin-cancel-req-approve') {
        const ok = await showConfirmDialog({
          title: 'Chấp nhận yêu cầu hủy đơn',
          message: `Chấp nhận hủy đơn ${orderId}? Tồn kho đang giữ sẽ được giải phóng về kho (không cộng trùng) và đơn thanh toán online đã trả sẽ chuyển trạng thái chờ hoàn tiền mô phỏng.`,
          confirmText: 'Chấp nhận hủy',
          danger: true
        });
        if (!ok) return;
        el.classList.add('is-loading');
        try {
          await adminActionRequest('POST', `/api/admin/orders/${encodeURIComponent(orderId)}/cancel-request`, { decision: 'approve' });
          showToast('Đã chấp nhận yêu cầu hủy đơn và giải phóng tồn kho.', 'success');
        } catch (err) {
          showToast(err.message, 'danger');
        } finally {
          el.classList.remove('is-loading');
        }
        return;
      }

      if (action === 'admin-cancel-req-reject') {
        const reason = await showPromptDialog({
          title: 'Từ chối yêu cầu hủy đơn',
          message: `Nhập lý do từ chối yêu cầu hủy cho đơn ${orderId} (bắt buộc):`,
          placeholder: 'Ví dụ: Đơn đã chuẩn bị xong và sắp bàn giao đơn vị vận chuyển',
          confirmText: 'Từ chối yêu cầu'
        });
        if (reason === null) return;
        if (!reason.trim()) {
          showToast('Vui lòng nhập lý do từ chối yêu cầu hủy.', 'danger');
          return;
        }
        el.classList.add('is-loading');
        try {
          await adminActionRequest('POST', `/api/admin/orders/${encodeURIComponent(orderId)}/cancel-request`, { decision: 'reject', adminReason: reason.trim() });
          showToast('Đã từ chối yêu cầu hủy đơn.', 'info');
        } catch (err) {
          showToast(err.message, 'danger');
        } finally {
          el.classList.remove('is-loading');
        }
        return;
      }

      if (action === 'admin-change-req-approve') {
        const reqId = el.dataset.reqId || '';
        const ok = await showConfirmDialog({
          title: 'Chấp nhận yêu cầu thay đổi đơn',
          message: `Xác nhận duyệt yêu cầu ${reqId} cho đơn ${orderId}? Hệ thống sẽ kiểm tra lại tồn kho và cập nhật đơn hàng.`,
          confirmText: 'Chấp nhận thay đổi'
        });
        if (!ok) return;
        el.classList.add('is-loading');
        try {
          await adminActionRequest('POST', `/api/admin/orders/${encodeURIComponent(orderId)}/change-request`, { decision: 'approve', requestId: reqId });
          showToast('Đã duyệt và cập nhật thay đổi đơn hàng.', 'success');
        } catch (err) {
          showToast(err.message, 'danger');
        } finally {
          el.classList.remove('is-loading');
        }
        return;
      }

      if (action === 'admin-change-req-reject') {
        const reqId = el.dataset.reqId || '';
        const reason = await showPromptDialog({
          title: 'Từ chối yêu cầu thay đổi đơn',
          message: `Nhập lý do từ chối yêu cầu ${reqId} (bắt buộc):`,
          placeholder: 'Ví dụ: Biến thể mới vừa hết hàng hoặc đã chuyển sang đóng gói',
          confirmText: 'Từ chối'
        });
        if (reason === null) return;
        if (!reason.trim()) {
          showToast('Vui lòng nhập lý do từ chối yêu cầu thay đổi.', 'danger');
          return;
        }
        el.classList.add('is-loading');
        try {
          await adminActionRequest('POST', `/api/admin/orders/${encodeURIComponent(orderId)}/change-request`, { decision: 'reject', requestId: reqId, adminReason: reason.trim() });
          showToast('Đã từ chối yêu cầu thay đổi đơn.', 'info');
        } catch (err) {
          showToast(err.message, 'danger');
        } finally {
          el.classList.remove('is-loading');
        }
        return;
      }

      if (action === 'order-refund') {
        const amount = Number(el.dataset.amount) || undefined;
        const ok = await showConfirmDialog({
          title: 'Xác nhận hoàn tiền',
          message: `Xác nhận đã hoàn tất hoàn tiền mô phỏng cho đơn hàng ${orderId}?`,
          confirmText: 'Đã hoàn tiền',
          danger: true
        });
        if (!ok) return;

        el.classList.add('is-loading');
        try {
          await adminActionRequest('POST', `/api/admin/orders/${encodeURIComponent(orderId)}/refund`, { amount });
          showToast('Đã xác nhận hoàn tiền thành công!', 'success');
        } catch (err) {
          showToast(err.message, 'danger');
        } finally {
          el.classList.remove('is-loading');
        }
        return;
      }

      // Xử lý Đổi trả
      if (action === 'return-approve') {
        const ok = await showConfirmDialog({
          title: 'Chấp thuận đổi trả',
          message: `Xác nhận duyệt yêu cầu đổi trả ${orderId} và nhập lại hàng vào kho?`,
          confirmText: 'Duyệt đổi trả'
        });
        if (!ok) return;

        el.classList.add('is-loading');
        try {
          await adminActionRequest('PATCH', `/api/admin/returns/${encodeURIComponent(orderId)}`, { action: 'approve' });
          showToast('Đã chấp thuận yêu cầu đổi trả và cập nhật kho hàng.', 'success');
        } catch (err) {
          showToast(err.message, 'danger');
        } finally {
          el.classList.remove('is-loading');
        }
        return;
      }

      if (action === 'return-reject') {
        const reason = await showPromptDialog({
          title: 'Từ chối yêu cầu đổi trả',
          message: `Nhập lý do từ chối yêu cầu đổi trả ${orderId}:`,
          placeholder: 'Ví dụ: Quá thời hạn 7 ngày hoặc sản phẩm đã qua sử dụng',
          defaultValue: 'Không thỏa mãn điều kiện chính sách 7 ngày',
          confirmText: 'Xác nhận từ chối'
        });
        if (!reason) return;

        el.classList.add('is-loading');
        try {
          await adminActionRequest('PATCH', `/api/admin/returns/${encodeURIComponent(orderId)}`, { action: 'reject', note: reason });
          showToast('Đã từ chối yêu cầu đổi trả.', 'info');
        } catch (err) {
          showToast(err.message, 'danger');
        } finally {
          el.classList.remove('is-loading');
        }
        return;
      }

      // Đối soát COD
      if (action === 'order-settle') {
        const ok = await showConfirmDialog({
          title: 'Xác nhận đối soát COD',
          message: `Ghi nhận đã đối soát mô phỏng cho đơn ${orderId}?`,
          confirmText: 'Xác nhận đối soát'
        });
        if (!ok) return;

        el.classList.add('is-loading');
        try {
          await adminActionRequest('POST', `/api/admin/orders/${encodeURIComponent(orderId)}/settle`, {});
          showToast('Đã ghi nhận đối soát COD thành công!', 'success');
        } catch (err) {
          showToast(err.message, 'danger');
        } finally {
          el.classList.remove('is-loading');
        }
        return;
      }
    });
  });

  window.VPAdminBridge = {
    getState: () => dbState,
    getRevision: () => dbRevision,
    getConfig: () => businessConfig,
    adminActionRequest,
    showToast,
    showConfirmDialog,
    showPromptDialog,
    openOrderDetail: id => { selectedOrderId = id; renderOrderDetail(id); },
    switchTab,
    money,
    esc,
    formatDate,
    orderStatusText,
    paymentStatusText,
    settlementText,
    getStatusBadgeHtml,
    getPaymentBadgeHtml,
    renderEmptyRow,
    icons,
    colorSwatches
  };

})();
