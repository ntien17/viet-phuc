(() => {
  'use strict';

  const ALLOWED_COLORS = ['Đỏ', 'Đen', 'Trắng', 'Đỏ trầm', 'Trắng ngà', 'Nâu đất', 'Hồng sen', 'Hồng phấn', 'Xanh nhạt', 'Xanh rêu'];
  const RETURN_TYPE_VI = { return: 'Trả hàng', exchange: 'Đổi hàng', warranty: 'Bảo hành' };
  const POLICY_KEYS = [
    ['pricing', '1. Giá bán & Khuyến mãi'],
    ['purchase', '2. Mua hàng & Đặt hàng'],
    ['payment', '3. Thanh toán'],
    ['shipping', '4. Vận chuyển & Giao nhận'],
    ['returns', '5. Đổi trả & Hoàn tiền (7 ngày)'],
    ['warranty', '6. Hỗ trợ chất lượng (30 ngày)'],
    ['privacy', '7. Bảo mật thông tin'],
    ['complaints', '8. Giải quyết khiếu nại'],
    ['rights', '9. Quyền & Nghĩa vụ các bên'],
    ['orderProcess', '10. Quản lý đơn hàng & Đối soát'],
    ['size', '11. Hướng dẫn chọn size & Sản phẩm'],
  ];

  let dashRange = '30d';
  let prodSort = 'newest';
  let prodStatusFilter = 'all';
  let cusFilter = 'all';
  let cusSearch = '';
  let retTypeFilter = 'all';
  let reportFrom = '';
  let reportTo = '';

  const B = () => window.VPAdminBridge;

  function openModal(title, bodyHtml, footerHtml = '') {
    const c = document.getElementById('admin-modal-container');
    if (!c) return;
    c.innerHTML = `
      <div class="admin-modal-overlay" id="admin-modal-overlay">
        <div class="admin-modal-box" role="dialog" aria-modal="true">
          <div class="admin-modal-header">
            <h3>${B().esc(title)}</h3>
            <button type="button" class="btn btn-outline btn-sm" id="admin-modal-close">✕</button>
          </div>
          <div class="admin-modal-body">${bodyHtml}</div>
          ${footerHtml ? `<div class="admin-modal-footer">${footerHtml}</div>` : ''}
        </div>
      </div>`;
    document.getElementById('admin-modal-close')?.addEventListener('click', closeModal);
    document.getElementById('admin-modal-overlay')?.addEventListener('click', e => {
      if (e.target.id === 'admin-modal-overlay') closeModal();
    });
  }

  function closeModal() {
    const c = document.getElementById('admin-modal-container');
    if (c) c.innerHTML = '';
  }

  function inTimeRange(iso, range) {
    if (range === 'all') return true;
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) return false;
    const now = new Date();
    if (range === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      return ms >= start;
    }
    if (range === '7d') return ms >= Date.now() - 7 * 86400000;
    if (range === '30d') return ms >= Date.now() - 30 * 86400000;
    if (range === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      return ms >= start;
    }
    return true;
  }

  function inCustomRange(iso, from, to) {
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) return true;
    if (from) {
      const f = Date.parse(from);
      if (!Number.isNaN(f) && ms < f) return false;
    }
    if (to) {
      const t = Date.parse(to) + 86399999;
      if (!Number.isNaN(t) && ms > t) return false;
    }
    return true;
  }

  // =========================================================
  // 2.4.1 DASHBOARD TỔNG QUAN
  // =========================================================
  function renderDashboard() {
    const { money, esc, orderStatusText, getStatusBadgeHtml, openOrderDetail, switchTab } = B();
    const s = B().getState();
    const pane = document.getElementById('pane-dashboard');
    if (!pane) return;

    const allOrders = s.orders || [];
    const orders = allOrders.filter(o => inTimeRange(o.createdAt, dashRange));
    const products = s.products || [];
    const customers = s.customers || [];
    const returns = s.returns || [];
    const stock = s.stock || {};

    const countNew = orders.filter(o => o.orderStatus === 'pending').length;
    const countProcessing = orders.filter(o => ['confirmed', 'packing'].includes(o.orderStatus)).length;
    const countShipping = orders.filter(o => o.orderStatus === 'shipping').length;
    const countDelivered = orders.filter(o => o.orderStatus === 'delivered').length;
    const countCancelled = orders.filter(o => o.orderStatus === 'cancelled').length;

    // Doanh thu hợp lệ: chỉ tính đơn đã thanh toán & không hủy (trừ tiền đã hoàn trên chính các đơn đó)
    const validOrders = orders.filter(o => o.orderStatus !== 'cancelled');
    const totalOrderValue = validOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const paidOrders = validOrders.filter(o => o.paymentStatus === 'paid' || o.paymentStatus === 'partially_refunded');
    const paidRevenue = paidOrders.reduce((sum, o) => {
      const oRefunded = (o.refunds || []).filter(r => r.status === 'success').reduce((a, r) => a + r.amount, 0);
      return sum + Math.max(0, (o.total || 0) - oRefunded);
    }, 0);
    const codUnpaidTotal = validOrders.filter(o => o.paymentMethod === 'COD' && o.paymentStatus === 'unpaid').reduce((sum, o) => sum + (o.total || 0), 0);

    let outSkuCount = 0;
    let lowSkuCount = 0;
    for (const p of products) {
      for (const v of (p.variants || [])) {
        const q = stock[v.sku] ?? 0;
        if (q === 0) outSkuCount++;
        else if (q < 3) lowSkuCount++;
      }
    }
    const pendingReturns = returns.filter(r => r.status === 'pending' || r.status === 'approved').length;

    // Daily chart (last 7 days or buckets)
    const dayMap = new Map();
    for (const o of validOrders) {
      const day = (o.createdAt || '').slice(0, 10) || 'N/A';
      const cur = dayMap.get(day) || { rev: 0, count: 0 };
      cur.count += 1;
      if (o.paymentStatus === 'paid') cur.rev += o.total || 0;
      dayMap.set(day, cur);
    }
    const dayKeys = Array.from(dayMap.keys()).sort().slice(-7);
    const maxRev = Math.max(1, ...dayKeys.map(k => dayMap.get(k).rev));

    // Top products
    const soldProd = new Map();
    for (const o of validOrders) {
      for (const it of (o.items || [])) {
        soldProd.set(it.name, (soldProd.get(it.name) || 0) + (it.qty || 0));
      }
    }
    const topProds = Array.from(soldProd.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Alerts
    const problemOrders = allOrders.filter(o => o.orderStatus === 'delivery_failed').length;
    const waitingPay = allOrders.filter(o => o.paymentMethod === 'online' && ['unpaid', 'pending'].includes(o.paymentStatus) && o.orderStatus !== 'cancelled').length;

    pane.innerHTML = `
      <div class="card" style="margin-bottom: 18px;">
        <div class="card-header">
          <div class="card-title-wrap">
            <h3 class="card-title">Bảng điều khiển vận hành <span class="vp-badge-sim">Thanh toán mô phỏng</span></h3>
            <span class="card-subtitle">Doanh thu chỉ tính đơn đã thanh toán (trừ hoàn tiền); không cộng đơn hủy hoặc COD chưa thu tiền.</span>
          </div>
          <select id="dash-range-select" class="select-filter" aria-label="Khoảng thời gian">
            <option value="today" ${dashRange === 'today' ? 'selected' : ''}>Hôm nay</option>
            <option value="7d" ${dashRange === '7d' ? 'selected' : ''}>7 ngày gần nhất</option>
            <option value="30d" ${dashRange === '30d' ? 'selected' : ''}>30 ngày gần nhất</option>
            <option value="month" ${dashRange === 'month' ? 'selected' : ''}>Tháng hiện tại</option>
            <option value="all" ${dashRange === 'all' ? 'selected' : ''}>Tất cả thời gian</option>
          </select>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card"><div class="stat-top"><span class="stat-label">Tổng đơn hàng</span></div><div class="stat-value">${orders.length}</div><div class="stat-sub">Mới: ${countNew} · Xử lý: ${countProcessing} · Giao: ${countShipping}</div></div>
        <div class="stat-card"><div class="stat-top"><span class="stat-label">Hoàn thành / Hủy</span></div><div class="stat-value" style="color:var(--success)">${countDelivered} <small style="font-size:16px;color:var(--danger)">/ ${countCancelled}</small></div><div class="stat-sub">Đổi trả chờ: ${pendingReturns}</div></div>
        <div class="stat-card"><div class="stat-top"><span class="stat-label">Doanh thu đã thanh toán</span></div><div class="stat-value" style="color:var(--brand-burgundy)">${money(paidRevenue)}</div><div class="stat-sub">COD chưa thu: ${money(codUnpaidTotal)} · Tổng đơn: ${money(totalOrderValue)}</div></div>
        <div class="stat-card"><div class="stat-top"><span class="stat-label">Khách hàng & Sản phẩm</span></div><div class="stat-value">${customers.length} <small style="font-size:16px;color:var(--text-muted)">KH</small></div><div class="stat-sub">${products.length} SP · Hết hàng: ${outSkuCount} SKU · Sắp hết: ${lowSkuCount}</div></div>
      </div>

      <div class="dashboard-split">
        <div class="card" style="margin-bottom:0">
          <div class="card-header"><div class="card-title-wrap"><h3 class="card-title">Doanh thu & Đơn theo ngày</h3><span class="card-subtitle">Dữ liệu thực tế từ đơn hàng trong kỳ</span></div></div>
          <div class="card-body">
            ${dayKeys.length ? `<div class="vp-chart-bars">${dayKeys.map(k => {
              const d = dayMap.get(k);
              const h = Math.max(6, Math.round((d.rev / maxRev) * 110));
              return `<div class="vp-chart-col" title="${esc(k)}: ${money(d.rev)} (${d.count} đơn)"><div class="vp-chart-bar" style="height:${h}px"></div><span class="vp-chart-lbl">${esc(k.slice(5))} (${d.count})</span></div>`;
            }).join('')}</div>` : '<p class="text-muted">Chưa có đơn hàng trong khoảng thời gian đã chọn.</p>'}
          </div>
        </div>

        <div class="card" style="margin-bottom:0">
          <div class="card-header"><div class="card-title-wrap"><h3 class="card-title">Cảnh báo cần xử lý</h3><span class="card-subtitle">Tổng hợp trạng thái vận hành hiện tại</span></div></div>
          <div class="card-body">
            <div class="vp-alert-list">
              <div class="vp-alert-item warn"><span>Đơn mới chưa xử lý</span><strong>${countNew}</strong></div>
              <div class="vp-alert-item warn"><span>Đơn online chờ thanh toán</span><strong>${waitingPay}</strong></div>
              <div class="vp-alert-item danger"><span>Đơn giao thất bại cần xử lý</span><strong>${problemOrders}</strong></div>
              <div class="vp-alert-item warn"><span>SKU hết / sắp hết hàng (&lt;3)</span><strong>${outSkuCount} / ${lowSkuCount}</strong></div>
              <div class="vp-alert-item warn"><span>Yêu cầu đổi trả chờ xử lý</span><strong>${pendingReturns}</strong></div>
            </div>
          </div>
        </div>
      </div>

      <div class="dashboard-split" style="margin-top:18px;">
        <div class="card" style="margin-bottom:0">
          <div class="card-header"><div class="card-title-wrap"><h3 class="card-title">Sản phẩm bán chạy</h3></div></div>
          <div class="card-body">
            ${topProds.length ? `<div class="breakdown-grid">${topProds.map(([name, qty]) => `<div class="breakdown-row"><span>${esc(name)}</span><strong>${qty} SP</strong></div>`).join('')}</div>` : '<p class="text-muted">Chưa có dữ liệu bán hàng.</p>'}
          </div>
        </div>
        <div class="card" style="margin-bottom:0">
          <div class="card-header"><div class="card-title-wrap"><h3 class="card-title">Đơn hàng gần đây</h3></div><button type="button" class="btn btn-outline btn-sm" id="dash-go-orders">Xem tất cả →</button></div>
          <div class="table-responsive"><table class="admin-table"><tbody>
            ${allOrders.length ? allOrders.slice(-5).reverse().map(o => `<tr><td><span class="order-code">${esc(o.id)}</span></td><td>${esc(o.receiver)}</td><td><strong>${money(o.total)}</strong></td><td>${getStatusBadgeHtml(o.orderStatus)}</td><td class="text-right"><button type="button" class="btn btn-outline btn-sm" data-dash-order="${esc(o.id)}">Xem</button></td></tr>`).join('') : '<tr><td colspan="5" class="text-center" style="padding:20px">Chưa có đơn hàng.</td></tr>'}
          </tbody></table></div>
        </div>
      </div>
    `;

    document.getElementById('dash-range-select')?.addEventListener('change', e => { dashRange = e.target.value; renderDashboard(); });
    document.getElementById('dash-go-orders')?.addEventListener('click', () => switchTab('orders'));
    pane.querySelectorAll('[data-dash-order]').forEach(btn => btn.addEventListener('click', () => openOrderDetail(btn.dataset.dashOrder)));
  }

  // =========================================================
  // 2.4.2 DANH MỤC & SẢN PHẨM + TỒN KHO SKU
  // =========================================================
  function renderProducts() {
    const { money, esc, renderEmptyRow } = B();
    const s = B().getState();
    const pane = document.getElementById('pane-products');
    if (!pane) return;

    const cats = s.categories || [];
    const prods = s.products || [];
    const stock = s.stock || {};

    pane.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title-wrap">
            <h3 class="card-title">Quản lý Danh mục</h3>
            <span class="card-subtitle">Không xóa cứng danh mục đang có sản phẩm; có thể ẩn để ngừng hiển thị trên Storefront</span>
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="btn-add-category">+ Thêm danh mục</button>
        </div>
        <div class="table-responsive">
          <table class="admin-table">
            <thead><tr><th>Mã</th><th>Tên danh mục</th><th>Mô tả</th><th>Thứ tự</th><th>Trạng thái</th><th class="text-right">Thao tác</th></tr></thead>
            <tbody>
              ${cats.length ? cats.map(c => `
                <tr>
                  <td><span class="order-code">${esc(c.id)}</span></td>
                  <td><strong>${esc(c.name)}</strong></td>
                  <td>${esc(c.description || '—')}</td>
                  <td>${c.sortOrder ?? 0}</td>
                  <td><span class="status-pill ${c.active ? 'delivered' : 'cancelled'}">${c.active ? 'Hoạt động' : 'Đã ẩn'}</span></td>
                  <td class="text-right">
                    <button type="button" class="btn btn-outline btn-sm" data-cat-edit="${esc(c.id)}">Sửa</button>
                    <button type="button" class="btn btn-outline btn-sm" data-cat-toggle="${esc(c.id)}">${c.active ? 'Ẩn' : 'Hiện'}</button>
                    <button type="button" class="btn btn-outline btn-sm" data-cat-del="${esc(c.id)}">Xóa</button>
                  </td>
                </tr>
              `).join('') : renderEmptyRow(6, 'Chưa có danh mục', 'Thêm danh mục để phân loại sản phẩm.')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title-wrap">
            <h3 class="card-title">Quản lý Sản phẩm & Biến thể SKU</h3>
            <span class="card-subtitle">Định dạng SKU chuẩn: VP-{PRODUCT_ID}-{COLOR_CODE}-{SIZE}</span>
          </div>
          <div class="toolbar" style="flex:0 1 auto">
            <input type="search" id="pm-search" class="form-control search-input" style="max-width:190px" placeholder="Tìm tên / mã SP...">
            <select id="pm-cat" class="select-filter"><option value="all">Tất cả danh mục</option>${cats.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>
            <select id="pm-status" class="select-filter">
              <option value="all" ${prodStatusFilter === 'all' ? 'selected' : ''}>Tất cả trạng thái</option>
              <option value="active" ${prodStatusFilter === 'active' ? 'selected' : ''}>Đang bán</option>
              <option value="hidden" ${prodStatusFilter === 'hidden' ? 'selected' : ''}>Đã ẩn / Ngừng bán</option>
            </select>
            <select id="pm-sort" class="select-filter">
              <option value="newest" ${prodSort === 'newest' ? 'selected' : ''}>Mới nhất</option>
              <option value="price-asc" ${prodSort === 'price-asc' ? 'selected' : ''}>Giá tăng dần</option>
              <option value="price-desc" ${prodSort === 'price-desc' ? 'selected' : ''}>Giá giảm dần</option>
            </select>
            <button type="button" class="btn btn-primary btn-sm" id="btn-add-product">+ Thêm sản phẩm</button>
          </div>
        </div>
        <div class="table-responsive">
          <table class="admin-table">
            <thead><tr><th>Mã</th><th>Ảnh</th><th>Tên sản phẩm</th><th>Danh mục</th><th>Giá bán</th><th>Biến thể & SKU</th><th>Trạng thái</th><th class="text-right">Thao tác</th></tr></thead>
            <tbody id="pm-tbody"></tbody>
          </table>
        </div>
      </div>
    `;

    const drawProdRows = () => {
      const q = (document.getElementById('pm-search')?.value || '').trim().toLowerCase();
      const catF = document.getElementById('pm-cat')?.value || 'all';
      prodStatusFilter = document.getElementById('pm-status')?.value || 'all';
      prodSort = document.getElementById('pm-sort')?.value || 'newest';

      let list = prods.filter(p => {
        if (q && !p.name.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q)) return false;
        if (catF !== 'all' && p.categoryId !== catF) return false;
        if (prodStatusFilter === 'active' && !p.active) return false;
        if (prodStatusFilter === 'hidden' && p.active) return false;
        return true;
      });
      if (prodSort === 'price-asc') list.sort((a, b) => a.price - b.price);
      else if (prodSort === 'price-desc') list.sort((a, b) => b.price - a.price);
      else list.sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')));

      const tbody = document.getElementById('pm-tbody');
      if (!tbody) return;
      if (!list.length) {
        tbody.innerHTML = renderEmptyRow(8, 'Không có sản phẩm phù hợp', 'Thử đổi bộ lọc hoặc thêm sản phẩm mới.');
        return;
      }
      tbody.innerHTML = list.map(p => {
        const cat = cats.find(c => c.id === p.categoryId);
        const totalStock = (p.variants || []).reduce((sum, v) => sum + (stock[v.sku] ?? 0), 0);
        return `
          <tr>
            <td><span class="order-code">${esc(p.id)}</span></td>
            <td><img src="${esc(p.img)}" alt="" style="width:42px;height:52px;object-fit:cover;border-radius:4px"></td>
            <td><strong>${esc(p.name)}</strong><br><small style="color:var(--text-muted)">${esc(p.material)}</small></td>
            <td>${esc(cat ? cat.name : p.categoryId)}</td>
            <td><strong>${money(p.price)}</strong>${p.old ? `<br><small style="text-decoration:line-through;color:var(--text-muted)">${money(p.old)}</small>` : ''}</td>
            <td><small>${(p.variants || []).map(v => `${esc(v.color)}/${esc(v.size)}: <b>${stock[v.sku] ?? 0}</b>`).join(' · ')}</small><br><small style="color:var(--text-muted)">Tổng: ${totalStock}</small></td>
            <td><span class="status-pill ${p.active ? 'delivered' : 'cancelled'}">${p.active ? 'Đang bán' : 'Đã ẩn'}</span></td>
            <td class="text-right">
              <button type="button" class="btn btn-outline btn-sm" data-prod-edit="${esc(p.id)}">Sửa</button>
              <button type="button" class="btn btn-outline btn-sm" data-prod-toggle="${esc(p.id)}">${p.active ? 'Ẩn' : 'Hiện'}</button>
            </td>
          </tr>`;
      }).join('');

      tbody.querySelectorAll('[data-prod-edit]').forEach(btn => btn.addEventListener('click', () => openProductModal(btn.dataset.prodEdit)));
      tbody.querySelectorAll('[data-prod-toggle]').forEach(btn => btn.addEventListener('click', async () => {
        const p = prods.find(x => x.id === btn.dataset.prodToggle);
        if (!p) return;
        try {
          await B().adminActionRequest('PATCH', `/api/admin/products/${encodeURIComponent(p.id)}`, { active: !p.active });
          B().showToast(p.active ? 'Đã ẩn sản phẩm.' : 'Đã kích hoạt sản phẩm.', 'success');
        } catch (err) { B().showToast(err.message, 'danger'); }
      }));
    };

    drawProdRows();
    document.getElementById('pm-search')?.addEventListener('input', drawProdRows);
    document.getElementById('pm-cat')?.addEventListener('change', drawProdRows);
    document.getElementById('pm-status')?.addEventListener('change', drawProdRows);
    document.getElementById('pm-sort')?.addEventListener('change', drawProdRows);
    document.getElementById('btn-add-category')?.addEventListener('click', () => openCategoryModal(null));
    document.getElementById('btn-add-product')?.addEventListener('click', () => openProductModal(null));

    pane.querySelectorAll('[data-cat-edit]').forEach(btn => btn.addEventListener('click', () => openCategoryModal(btn.dataset.catEdit)));
    pane.querySelectorAll('[data-cat-toggle]').forEach(btn => btn.addEventListener('click', async () => {
      const c = cats.find(x => x.id === btn.dataset.catToggle);
      if (!c) return;
      try {
        await B().adminActionRequest('PATCH', `/api/admin/categories/${encodeURIComponent(c.id)}`, { active: !c.active });
        B().showToast('Đã cập nhật trạng thái danh mục.', 'success');
      } catch (err) { B().showToast(err.message, 'danger'); }
    }));
    pane.querySelectorAll('[data-cat-del]').forEach(btn => btn.addEventListener('click', async () => {
      const ok = await B().showConfirmDialog({ title: 'Xóa danh mục', message: `Xóa danh mục ${btn.dataset.catDel}? (Chỉ xóa được khi không còn sản phẩm nào thuộc danh mục này.)`, danger: true });
      if (!ok) return;
      try {
        await B().adminActionRequest('DELETE', `/api/admin/categories/${encodeURIComponent(btn.dataset.catDel)}`, {});
        B().showToast('Đã xóa danh mục.', 'success');
      } catch (err) { B().showToast(err.message, 'danger'); }
    }));
  }

  function openCategoryModal(catId) {
    const { esc } = B();
    const s = B().getState();
    const cat = catId ? (s.categories || []).find(c => c.id === catId) : null;
    openModal(cat ? 'Chỉnh sửa danh mục' : 'Thêm danh mục mới', `
      <form id="cat-form">
        <div class="form-grid-2">
          <div class="form-group"><label>Mã danh mục</label><input class="form-control" name="id" value="${esc(cat?.id || '')}" ${cat ? 'readonly disabled' : ''} placeholder="Ví dụ: ao-tac (để trống tự tạo)"></div>
          <div class="form-group"><label>Thứ tự hiển thị</label><input class="form-control" type="number" min="0" name="sortOrder" value="${cat?.sortOrder ?? ((s.categories || []).length + 1)}"></div>
        </div>
        <div class="form-group"><label>Tên danh mục *</label><input class="form-control" name="name" required value="${esc(cat?.name || '')}"></div>
        <div class="form-group"><label>Mô tả</label><textarea class="form-control" name="description" rows="2">${esc(cat?.description || '')}</textarea></div>
        <div class="form-group"><label><input type="checkbox" name="active" ${cat ? (cat.active ? 'checked' : '') : 'checked'}> Hiển thị trên cửa hàng</label></div>
        <button type="submit" class="btn btn-primary">${cat ? 'Lưu thay đổi' : 'Tạo danh mục'}</button>
      </form>
    `);
    document.getElementById('cat-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        name: String(fd.get('name') || '').trim(),
        description: String(fd.get('description') || '').trim(),
        sortOrder: Number(fd.get('sortOrder') || 0),
        active: fd.get('active') === 'on',
      };
      try {
        if (cat) await B().adminActionRequest('PATCH', `/api/admin/categories/${encodeURIComponent(cat.id)}`, payload);
        else {
          if (fd.get('id')) payload.id = String(fd.get('id')).trim();
          await B().adminActionRequest('POST', '/api/admin/categories', payload);
        }
        closeModal();
        B().showToast('Đã lưu danh mục!', 'success');
      } catch (err) { B().showToast(err.message, 'danger'); }
    });
  }

  function openProductModal(prodId) {
    const { esc } = B();
    const s = B().getState();
    const cats = s.categories || [];
    const prod = prodId ? (s.products || []).find(p => p.id === prodId) : null;
    const stock = s.stock || {};
    const variants = prod ? prod.variants : [{ color: 'Đỏ trầm', size: 'M', priceOverride: '', active: true, initialStock: 10 }];

    const variantRowHtml = (v, isExisting) => `
      <div class="vp-variant-row">
        <select class="form-control v-color">${ALLOWED_COLORS.map(c => `<option value="${esc(c)}" ${v.color === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <input class="form-control v-size" value="${esc(v.size || '')}" placeholder="Size (S, M, One Size)" required>
        <input class="form-control v-price" type="number" min="0" value="${v.priceOverride ?? ''}" placeholder="Giá riêng (tùy chọn)">
        <input class="form-control v-stock" type="number" min="0" value="${isExisting ? (stock[v.sku] ?? 0) : (v.initialStock ?? 0)}" placeholder="Tồn kho">
        <button type="button" class="btn btn-outline btn-sm v-del">✕</button>
      </div>`;

    openModal(prod ? `Sửa sản phẩm ${prod.id}` : 'Thêm sản phẩm mới', `
      <form id="prod-form">
        <div class="form-grid-2">
          <div class="form-group"><label>Mã SP (tùy chọn)</label><input class="form-control" name="id" value="${esc(prod?.id || '')}" ${prod ? 'readonly disabled' : ''} placeholder="Ví dụ: P10"></div>
          <div class="form-group"><label>Danh mục *</label><select class="form-control" name="categoryId" required>${cats.map(c => `<option value="${esc(c.id)}" ${prod?.categoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        </div>
        <div class="form-group"><label>Tên sản phẩm *</label><input class="form-control" name="name" required value="${esc(prod?.name || '')}"></div>
        <div class="form-grid-2">
          <div class="form-group"><label>Giá bán (VNĐ) *</label><input class="form-control" type="number" min="0" name="price" required value="${prod?.price ?? 0}"></div>
          <div class="form-group"><label>Giá gốc (tùy chọn)</label><input class="form-control" type="number" min="0" name="old" value="${prod?.old ?? ''}"></div>
        </div>
        <div class="form-grid-2">
          <div class="form-group"><label>Chất liệu *</label><input class="form-control" name="material" required value="${esc(prod?.material || 'Lụa tơ tằm')}"></div>
          <div class="form-group"><label>Nhãn</label><input class="form-control" name="tag" value="${esc(prod?.tag || '')}" placeholder="Ví dụ: Mới, Di sản"></div>
        </div>
        <div class="form-group"><label>Đường dẫn ảnh (local assets/... hoặc URL) *</label><input class="form-control" name="img" required value="${esc(prod?.img || 'assets/ao-dai-do.png')}"></div>
        <div class="form-group"><label>Mô tả</label><textarea class="form-control" name="description" rows="2">${esc(prod?.description || '')}</textarea></div>
        <div class="form-group"><label><input type="checkbox" name="active" ${prod ? (prod.active ? 'checked' : '') : 'checked'}> Đang kinh doanh</label> &nbsp; <label><input type="checkbox" name="featured" ${prod?.featured ? 'checked' : ''}> Nổi bật</label></div>
        <div class="form-group">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <label style="margin:0">Biến thể (Màu / Size / Giá riêng / Tồn kho)</label>
            <button type="button" class="btn btn-outline btn-sm" id="btn-add-variant">+ Thêm biến thể</button>
          </div>
          <div id="variant-rows">${variants.map(v => variantRowHtml(v, Boolean(prod && v.sku))).join('')}</div>
        </div>
        <button type="submit" class="btn btn-primary">${prod ? 'Lưu sản phẩm' : 'Tạo sản phẩm'}</button>
      </form>
    `);

    const rowsBox = document.getElementById('variant-rows');
    rowsBox?.addEventListener('click', e => {
      if (e.target.classList.contains('v-del') && rowsBox.children.length > 1) {
        e.target.closest('.vp-variant-row').remove();
      }
    });
    document.getElementById('btn-add-variant')?.addEventListener('click', () => {
      rowsBox.insertAdjacentHTML('beforeend', variantRowHtml({ color: 'Đỏ trầm', size: 'L', priceOverride: '', initialStock: 0 }, false));
    });

    document.getElementById('prod-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const varList = Array.from(rowsBox.querySelectorAll('.vp-variant-row')).map(row => ({
        color: row.querySelector('.v-color').value,
        size: row.querySelector('.v-size').value.trim(),
        priceOverride: row.querySelector('.v-price').value ? Number(row.querySelector('.v-price').value) : null,
        stock: Number(row.querySelector('.v-stock').value || 0),
        initialStock: Number(row.querySelector('.v-stock').value || 0),
        active: true,
      }));
      const payload = {
        categoryId: fd.get('categoryId'),
        name: String(fd.get('name') || '').trim(),
        price: Number(fd.get('price')),
        old: fd.get('old') ? Number(fd.get('old')) : null,
        material: String(fd.get('material') || '').trim(),
        tag: String(fd.get('tag') || '').trim(),
        img: String(fd.get('img') || '').trim(),
        description: String(fd.get('description') || '').trim(),
        active: fd.get('active') === 'on',
        featured: fd.get('featured') === 'on',
        variants: varList,
      };
      try {
        if (prod) await B().adminActionRequest('PATCH', `/api/admin/products/${encodeURIComponent(prod.id)}`, payload);
        else {
          if (fd.get('id')) payload.id = String(fd.get('id')).trim();
          await B().adminActionRequest('POST', '/api/admin/products', payload);
        }
        closeModal();
        B().showToast('Đã lưu sản phẩm thành công!', 'success');
      } catch (err) { B().showToast(err.message, 'danger'); }
    });
  }

  function renderInventory() {
    const { esc, formatDate, renderEmptyRow } = B();
    const s = B().getState();
    const pane = document.getElementById('pane-inventory');
    if (!pane) return;

    const prods = s.products || [];
    const stock = s.stock || {};
    const logs = (s.inventoryLogs || []).slice().reverse().slice(0, 40);

    const skuRows = [];
    for (const p of prods) {
      for (const v of (p.variants || [])) {
        skuRows.push({ prod: p, v, qty: stock[v.sku] ?? 0 });
      }
    }

    pane.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title-wrap">
            <h3 class="card-title">Tồn kho theo SKU</h3>
            <span class="card-subtitle">Mọi thao tác nhập/xuất/điều chỉnh đi qua transaction queue, không cho tồn âm và tự ghi inventoryLogs</span>
          </div>
          <div class="toolbar" style="flex:0 1 auto">
            <input type="search" id="inv-search" class="form-control search-input" style="max-width:200px" placeholder="Tìm SKU hoặc tên SP...">
            <select id="inv-filter" class="select-filter">
              <option value="all">Tất cả SKU</option>
              <option value="low">Sắp hết (&lt; 3)</option>
              <option value="out">Hết hàng (0)</option>
            </select>
            <button type="button" class="btn btn-primary btn-sm" id="btn-open-restock">+ Nhập thêm hàng</button>
          </div>
        </div>
        <div class="table-responsive">
          <table class="admin-table">
            <thead><tr><th>SKU</th><th>Sản phẩm</th><th>Màu / Size</th><th>Tồn khả dụng</th><th class="text-right">Điều chỉnh kho</th></tr></thead>
            <tbody id="inv-tbody"></tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title-wrap"><h3 class="card-title">Nhật ký nhập / xuất kho gần đây</h3></div></div>
        <div class="table-responsive">
          <table class="admin-table">
            <thead><tr><th>Thời gian</th><th>SKU</th><th>Trước</th><th>Biến động</th><th>Sau</th><th>Lý do</th><th>Người thực hiện</th></tr></thead>
            <tbody>
              ${logs.length ? logs.map(l => `
                <tr>
                  <td><small>${esc(formatDate(l.createdAt))}</small></td>
                  <td><span class="order-code">${esc(l.sku)}</span></td>
                  <td>${l.beforeQty}</td>
                  <td><strong style="color:${l.delta >= 0 ? 'var(--success)' : 'var(--danger)'}">${l.delta >= 0 ? '+' + l.delta : l.delta}</strong></td>
                  <td><strong>${l.afterQty}</strong></td>
                  <td>${esc(l.reason)}${l.refId ? ` <small>(${esc(l.refId)})</small>` : ''}</td>
                  <td>${esc(l.actor)}</td>
                </tr>
              `).join('') : renderEmptyRow(7, 'Chưa có nhật ký kho', 'Các thay đổi tồn kho sẽ được ghi nhận tại đây.')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const drawInv = () => {
      const q = (document.getElementById('inv-search')?.value || '').trim().toLowerCase();
      const f = document.getElementById('inv-filter')?.value || 'all';
      const filtered = skuRows.filter(r => {
        if (q && !r.v.sku.toLowerCase().includes(q) && !r.prod.name.toLowerCase().includes(q)) return false;
        if (f === 'low' && (r.qty === 0 || r.qty >= 3)) return false;
        if (f === 'out' && r.qty !== 0) return false;
        return true;
      });
      const tbody = document.getElementById('inv-tbody');
      if (!tbody) return;
      if (!filtered.length) {
        tbody.innerHTML = renderEmptyRow(5, 'Không tìm thấy SKU phù hợp', 'Thử thay đổi từ khóa hoặc bộ lọc.');
        return;
      }
      tbody.innerHTML = filtered.map(r => `
        <tr>
          <td><span class="order-code">${esc(r.v.sku)}</span></td>
          <td><strong>${esc(r.prod.name)}</strong></td>
          <td>${esc(r.v.color)} / ${esc(r.v.size)}</td>
          <td><span class="status-pill ${r.qty === 0 ? 'failed' : (r.qty < 3 ? 'pending' : 'delivered')}">${r.qty}</span></td>
          <td class="text-right">
            <button type="button" class="btn btn-outline btn-sm" data-sku-adj="${esc(r.v.sku)}" data-mode="in">+ Nhập</button>
            <button type="button" class="btn btn-outline btn-sm" data-sku-adj="${esc(r.v.sku)}" data-mode="out">− Xuất</button>
            <button type="button" class="btn btn-outline btn-sm" data-sku-adj="${esc(r.v.sku)}" data-mode="set">Kiểm kê</button>
          </td>
        </tr>
      `).join('');
      tbody.querySelectorAll('[data-sku-adj]').forEach(btn => btn.addEventListener('click', () => {
        if (btn.dataset.mode === 'in') openRestockModal(btn.dataset.skuAdj);
        else openStockModal(btn.dataset.skuAdj, btn.dataset.mode);
      }));
    };

    drawInv();
    document.getElementById('inv-search')?.addEventListener('input', drawInv);
    document.getElementById('inv-filter')?.addEventListener('change', drawInv);
    document.getElementById('btn-open-restock')?.addEventListener('click', () => openRestockModal(''));
  }

  function openRestockModal(initialSku = '') {
    const { esc } = B();
    const state = B().getState();
    const prods = (state.products || []).filter(p => Array.isArray(p.variants) && p.variants.length > 0);
    if (!prods.length) {
      B().showToast('Chưa có sản phẩm nào có biến thể SKU để nhập kho.', 'danger');
      return;
    }

    const REASONS = ['Nhập bổ sung hàng', 'Nhập lô sản xuất mới', 'Hoàn kho kiểm tra đạt', 'Điều chuyển kho', 'Khác'];
    let mode = 'single';
    let prodFilter = '';
    let selectedProdId = prods.find(p => p.variants.some(v => v.sku === initialSku))?.id || prods[0].id;
    const initVar = prods.find(p => p.id === selectedProdId)?.variants.find(v => v.sku === initialSku)
      || prods.find(p => p.id === selectedProdId)?.variants[0];
    let selectedColor = initVar?.color || '';
    let selectedSize = initVar?.size || '';
    let addQtyRaw = '10';
    let reason = REASONS[0];
    let note = '';
    let batchReview = false;
    let batchRows = [];
    let isSubmitting = false;

    const resetBatchRows = () => {
      const p = prods.find(x => x.id === selectedProdId);
      const stockMap = B().getState().stock || {};
      batchRows = (p?.variants || []).map(v => ({
        sku: v.sku,
        color: v.color,
        size: v.size,
        current: stockMap[v.sku] ?? 0,
        qty: '',
      }));
    };
    resetBatchRows();

    const parsePosInt = val => {
      const s = String(val ?? '').trim();
      if (!/^\d+$/.test(s)) return null;
      const n = Number(s);
      return Number.isSafeInteger(n) && n > 0 ? n : null;
    };

    const renderBody = (errMsg = '') => {
      const stockMap = B().getState().stock || {};
      const filteredProds = prods.filter(p => !prodFilter || p.name.toLowerCase().includes(prodFilter) || p.id.toLowerCase().includes(prodFilter));
      if (filteredProds.length && !filteredProds.some(p => p.id === selectedProdId)) {
        selectedProdId = filteredProds[0].id;
      }
      const p = prods.find(x => x.id === selectedProdId) || prods[0];
      const colors = [...new Set((p.variants || []).map(v => v.color))];
      if (!colors.includes(selectedColor)) selectedColor = colors[0] || '';
      const sizes = (p.variants || []).filter(v => v.color === selectedColor).map(v => v.size);
      if (!sizes.includes(selectedSize)) selectedSize = sizes[0] || '';
      const variant = (p.variants || []).find(v => v.color === selectedColor && v.size === selectedSize) || null;
      const sku = variant?.sku || '';
      const curStock = sku ? (stockMap[sku] ?? 0) : 0;
      const parsedQty = parsePosInt(addQtyRaw);
      const afterStock = parsedQty !== null ? curStock + parsedQty : curStock;

      const tabsHtml = `
        <div class="restock-tabs" role="tablist">
          <button type="button" class="restock-tab-btn ${mode === 'single' ? 'active' : ''}" data-rmode="single">Nhập đơn lẻ (1 SKU)</button>
          <button type="button" class="restock-tab-btn ${mode === 'batch' ? 'active' : ''}" data-rmode="batch">Nhập hàng loạt (Nhiều SKU)</button>
        </div>
        ${errMsg ? `<div class="restock-alert" role="alert">${esc(errMsg)}</div>` : ''}`;

      if (mode === 'single') {
        openModal('Nhập thêm hàng tồn kho', `
          ${tabsHtml}
          <form id="restock-single-form">
            <div class="form-grid-2">
              <div class="form-group">
                <label>Tìm sản phẩm (tên hoặc mã)</label>
                <input type="search" class="form-control" id="restock-prod-search" value="${esc(prodFilter)}" placeholder="Ví dụ: An Nhiên hoặc p1...">
              </div>
              <div class="form-group">
                <label>Sản phẩm *</label>
                <select class="form-control" id="restock-prod-select" ${!filteredProds.length ? 'disabled' : ''}>
                  ${filteredProds.length ? filteredProds.map(x => `<option value="${esc(x.id)}" ${x.id === selectedProdId ? 'selected' : ''}>[${esc(x.id)}] ${esc(x.name)}</option>`).join('') : '<option value="">Không khớp sản phẩm</option>'}
                </select>
              </div>
            </div>
            <div class="form-grid-2">
              <div class="form-group">
                <label>Màu sắc *</label>
                <select class="form-control" id="restock-color" ${!colors.length ? 'disabled' : ''}>
                  ${colors.map(c => `<option value="${esc(c)}" ${c === selectedColor ? 'selected' : ''}>${esc(c)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Kích thước *</label>
                <select class="form-control" id="restock-size" ${!sizes.length ? 'disabled' : ''}>
                  ${sizes.map(sz => `<option value="${esc(sz)}" ${sz === selectedSize ? 'selected' : ''}>${esc(sz)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>SKU tương ứng</label>
              <div><span class="restock-sku-pill" id="restock-sku-pill">${esc(sku || 'Chưa có SKU hợp lệ')}</span></div>
            </div>
            <div class="form-group">
              <label>Số lượng muốn cộng thêm *</label>
              <div class="restock-qty-wrap">
                <input class="form-control restock-qty-input" id="restock-qty" type="number" min="1" step="1" value="${esc(addQtyRaw)}" placeholder="Nhập số > 0" required>
                <div class="restock-chips">
                  ${[5, 10, 20, 50].map(n => `<button type="button" class="restock-chip" data-rchip="${n}">+${n}</button>`).join('')}
                </div>
              </div>
            </div>
            <div class="restock-summary-grid">
              <div class="restock-stat"><span>Tồn kho hiện tại</span><strong id="rs-cur">${curStock}</strong></div>
              <div class="restock-stat is-add"><span>Số lượng nhập thêm</span><strong id="rs-add">+${parsedQty ?? 0}</strong></div>
              <div class="restock-stat is-after"><span>Tồn dự kiến sau nhập</span><strong id="rs-after">${afterStock}</strong></div>
            </div>
            <div class="form-grid-2">
              <div class="form-group">
                <label>Lý do nhập kho *</label>
                <select class="form-control" id="restock-reason">${REASONS.map(r => `<option value="${esc(r)}" ${r === reason ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
              </div>
              <div class="form-group">
                <label>Ghi chú (tùy chọn)</label>
                <input class="form-control" id="restock-note" maxlength="80" value="${esc(note)}" placeholder="Mã lô, nhà cung cấp...">
              </div>
            </div>
            <button type="submit" class="btn btn-primary" id="restock-submit-btn" ${!sku || isSubmitting ? 'disabled' : ''}>${isSubmitting ? 'Đang nhập kho...' : 'Xác nhận nhập kho'}</button>
          </form>
        `);
      } else {
        const validItems = batchRows.filter(r => parsePosInt(r.qty) !== null);
        const totalAdd = validItems.reduce((s, r) => s + parsePosInt(r.qty), 0);
        if (!batchReview) {
          openModal('Nhập hàng loạt theo sản phẩm', `
            ${tabsHtml}
            <div class="form-group">
              <label>Chọn sản phẩm</label>
              <select class="form-control" id="batch-prod-select">
                ${prods.map(x => `<option value="${esc(x.id)}" ${x.id === selectedProdId ? 'selected' : ''}>[${esc(x.id)}] ${esc(x.name)}</option>`).join('')}
              </select>
            </div>
            <div class="table-responsive">
              <table class="admin-table restock-batch-table">
                <thead><tr><th>Màu / Size</th><th>SKU</th><th>Tồn hiện tại</th><th>Số lượng cộng thêm</th><th class="text-right">Bỏ</th></tr></thead>
                <tbody>
                  ${batchRows.map((r, idx) => `
                    <tr>
                      <td><strong>${esc(r.color)}</strong> / ${esc(r.size)}</td>
                      <td><span class="order-code">${esc(r.sku)}</span></td>
                      <td>${r.current}</td>
                      <td><input type="number" min="0" step="1" class="form-control batch-qty-inp" data-bidx="${idx}" value="${esc(r.qty)}" placeholder="0"></td>
                      <td class="text-right"><button type="button" class="btn btn-outline btn-sm" data-bdel="${idx}">✕</button></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            <div class="restock-summary-grid">
              <div class="restock-stat"><span>Biến thể sẽ nhập</span><strong id="bs-count">${validItems.length}</strong></div>
              <div class="restock-stat is-add"><span>Tổng SL nhập thêm</span><strong id="bs-total">+${totalAdd}</strong></div>
              <div class="restock-stat is-after"><span>Trạng thái</span><strong>${validItems.length ? 'Sẵn sàng xem lại' : 'Chưa nhập SL'}</strong></div>
            </div>
            <div class="form-grid-2">
              <div class="form-group">
                <label>Lý do nhập kho *</label>
                <select class="form-control" id="batch-reason">${REASONS.map(r => `<option value="${esc(r)}" ${r === reason ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
              </div>
              <div class="form-group">
                <label>Ghi chú (tùy chọn)</label>
                <input class="form-control" id="batch-note" maxlength="80" value="${esc(note)}" placeholder="Ghi chú đợt nhập...">
              </div>
            </div>
            <button type="button" class="btn btn-primary" id="btn-batch-review" ${!validItems.length ? 'disabled' : ''}>Xem lại phiếu nhập (${validItems.length} SKU)</button>
          `);
        } else {
          openModal('Xem lại phiếu nhập hàng loạt', `
            ${tabsHtml}
            <p><b>Sản phẩm:</b> ${esc(p.name)} · <b>Lý do:</b> ${esc(reason)}${note ? ` · <b>Ghi chú:</b> ${esc(note)}` : ''}</p>
            <div class="table-responsive">
              <table class="admin-table">
                <thead><tr><th>SKU</th><th>Màu / Size</th><th>Trước</th><th>+ Nhập</th><th>Sau nhập</th></tr></thead>
                <tbody>
                  ${validItems.map(r => {
                    const q = parsePosInt(r.qty);
                    return `<tr><td><span class="order-code">${esc(r.sku)}</span></td><td>${esc(r.color)} / ${esc(r.size)}</td><td>${r.current}</td><td><strong style="color:var(--success)">+${q}</strong></td><td><strong>${r.current + q}</strong></td></tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
            <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
              <button type="button" class="btn btn-outline" id="btn-batch-back" ${isSubmitting ? 'disabled' : ''}>Quay lại chỉnh sửa</button>
              <button type="button" class="btn btn-primary" id="btn-batch-confirm" ${isSubmitting ? 'disabled' : ''}>${isSubmitting ? 'Đang nhập kho...' : `Xác nhận nhập +${totalAdd} sản phẩm`}</button>
            </div>
          `);
        }
      }

      document.querySelectorAll('[data-rmode]').forEach(btn => btn.addEventListener('click', () => {
        mode = btn.dataset.rmode;
        batchReview = false;
        renderBody();
      }));

      if (mode === 'single') {
        document.getElementById('restock-prod-search')?.addEventListener('input', e => {
          prodFilter = e.target.value.trim().toLowerCase();
          renderBody();
          const inp = document.getElementById('restock-prod-search');
          if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
        });
        document.getElementById('restock-prod-select')?.addEventListener('change', e => { selectedProdId = e.target.value; renderBody(); });
        document.getElementById('restock-color')?.addEventListener('change', e => { selectedColor = e.target.value; renderBody(); });
        document.getElementById('restock-size')?.addEventListener('change', e => { selectedSize = e.target.value; renderBody(); });
        document.getElementById('restock-reason')?.addEventListener('change', e => { reason = e.target.value; });
        document.getElementById('restock-note')?.addEventListener('input', e => { note = e.target.value; });
        const qtyEl = document.getElementById('restock-qty');
        const syncPreview = () => {
          addQtyRaw = qtyEl?.value ?? '';
          const n = parsePosInt(addQtyRaw);
          const addEl = document.getElementById('rs-add');
          const afterEl = document.getElementById('rs-after');
          if (addEl) addEl.textContent = `+${n ?? 0}`;
          if (afterEl) afterEl.textContent = String(curStock + (n ?? 0));
        };
        qtyEl?.addEventListener('input', syncPreview);
        document.querySelectorAll('[data-rchip]').forEach(btn => btn.addEventListener('click', () => {
          if (qtyEl) { qtyEl.value = btn.dataset.rchip; syncPreview(); }
        }));
        document.getElementById('restock-single-form')?.addEventListener('submit', async e => {
          e.preventDefault();
          if (isSubmitting) return;
          if (!sku) return renderBody('Vui lòng chọn biến thể SKU hợp lệ.');
          const q = parsePosInt(qtyEl?.value);
          if (q === null) return renderBody('Số lượng nhập thêm phải là số nguyên dương (> 0, không âm, không thập phân).');
          isSubmitting = true;
          renderBody();
          try {
            await B().adminActionRequest('POST', '/api/admin/stock/adjust', { sku, mode: 'in', qty: q, reason, note });
            closeModal();
            B().showToast(`Đã nhập thêm +${q} cho ${sku} (tồn mới: ${curStock + q})!`, 'success');
          } catch (err) {
            isSubmitting = false;
            renderBody(err.message);
          }
        });
      } else if (!batchReview) {
        document.getElementById('batch-prod-select')?.addEventListener('change', e => {
          selectedProdId = e.target.value;
          resetBatchRows();
          renderBody();
        });
        document.getElementById('batch-reason')?.addEventListener('change', e => { reason = e.target.value; });
        document.getElementById('batch-note')?.addEventListener('input', e => { note = e.target.value; });
        document.querySelectorAll('.batch-qty-inp').forEach(inp => inp.addEventListener('input', e => {
          const idx = Number(e.target.dataset.bidx);
          if (batchRows[idx]) batchRows[idx].qty = e.target.value;
          const valid = batchRows.filter(r => parsePosInt(r.qty) !== null);
          const tot = valid.reduce((s, r) => s + parsePosInt(r.qty), 0);
          const cEl = document.getElementById('bs-count');
          const tEl = document.getElementById('bs-total');
          const revBtn = document.getElementById('btn-batch-review');
          if (cEl) cEl.textContent = String(valid.length);
          if (tEl) tEl.textContent = `+${tot}`;
          if (revBtn) {
            revBtn.disabled = !valid.length;
            revBtn.textContent = `Xem lại phiếu nhập (${valid.length} SKU)`;
          }
        }));
        document.querySelectorAll('[data-bdel]').forEach(btn => btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.bdel);
          batchRows.splice(idx, 1);
          renderBody();
        }));
        document.getElementById('btn-batch-review')?.addEventListener('click', () => {
          const invalid = batchRows.find(r => String(r.qty).trim() !== '' && String(r.qty).trim() !== '0' && parsePosInt(r.qty) === null);
          if (invalid) return renderBody(`Số lượng cho ${invalid.sku} phải là số nguyên dương.`);
          batchReview = true;
          renderBody();
        });
      } else {
        document.getElementById('btn-batch-back')?.addEventListener('click', () => { batchReview = false; renderBody(); });
        document.getElementById('btn-batch-confirm')?.addEventListener('click', async () => {
          if (isSubmitting) return;
          const items = batchRows.map(r => ({ sku: r.sku, qty: parsePosInt(r.qty) })).filter(x => x.qty !== null);
          if (!items.length) return renderBody('Không có SKU hợp lệ để nhập kho.');
          isSubmitting = true;
          renderBody();
          try {
            const res = await B().adminActionRequest('POST', '/api/admin/stock/restock-batch', { items, reason, note });
            closeModal();
            B().showToast(`Đã nhập hàng loạt thành công ${res.updatedCount} SKU!`, 'success');
          } catch (err) {
            isSubmitting = false;
            batchReview = false;
            renderBody(err.message);
          }
        });
      }
    };

    renderBody();
  }

  function openStockModal(sku, mode) {
    const { esc } = B();
    const cur = B().getState().stock?.[sku] ?? 0;
    const label = mode === 'in' ? 'Nhập kho' : (mode === 'out' ? 'Xuất kho' : 'Đặt lại tồn kiểm kê');
    openModal(`${label}: ${sku}`, `
      <form id="stock-adj-form">
        <p>Tồn hiện tại: <strong>${cur}</strong></p>
        <div class="form-group"><label>${mode === 'set' ? 'Số lượng thực tế sau kiểm kê' : 'Số lượng'} *</label><input class="form-control" type="number" min="${mode === 'set' ? 0 : 1}" name="qty" required value="${mode === 'set' ? cur : 1}"></div>
        <div class="form-group"><label>Lý do điều chỉnh *</label><input class="form-control" name="reason" required value="${esc(mode === 'in' ? 'Nhập bổ sung hàng' : (mode === 'out' ? 'Xuất kho thủ công' : 'Kiểm kê định kỳ'))}"></div>
        <button type="submit" class="btn btn-primary">Xác nhận cập nhật</button>
      </form>
    `);
    document.getElementById('stock-adj-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await B().adminActionRequest('POST', '/api/admin/stock/adjust', {
          sku,
          mode,
          qty: Number(fd.get('qty')),
          reason: String(fd.get('reason') || '').trim(),
        });
        closeModal();
        B().showToast(`Đã cập nhật tồn kho ${sku}!`, 'success');
      } catch (err) { B().showToast(err.message, 'danger'); }
    });
  }

  // =========================================================
  // 2.4.3 QUẢN LÝ KHÁCH HÀNG
  // =========================================================
  function renderCustomers() {
    const { money, esc, formatDate, renderEmptyRow } = B();
    const s = B().getState();
    const pane = document.getElementById('pane-customers');
    if (!pane) return;

    const customers = s.customers || [];
    const orders = s.orders || [];

    pane.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title-wrap">
            <h3 class="card-title">Danh sách Khách hàng</h3>
            <span class="card-subtitle">Bảo mật thông tin xác thực; không tự động liên kết đơn cũ (customerId: null)</span>
          </div>
          <div class="toolbar" style="flex:0 1 auto">
            <input type="search" id="cus-search-inp" class="form-control search-input" style="max-width:220px" value="${esc(cusSearch)}" placeholder="Tìm tên, email, SĐT...">
            <select id="cus-status-sel" class="select-filter">
              <option value="all" ${cusFilter === 'all' ? 'selected' : ''}>Tất cả tài khoản</option>
              <option value="active" ${cusFilter === 'active' ? 'selected' : ''}>Đang hoạt động</option>
              <option value="locked" ${cusFilter === 'locked' ? 'selected' : ''}>Đã khóa</option>
            </select>
          </div>
        </div>
        <div class="table-responsive">
          <table class="admin-table">
            <thead><tr><th>Họ tên</th><th>Email</th><th>SĐT</th><th>Ngày ĐK</th><th>Số đơn</th><th>Đã thanh toán</th><th>Trạng thái</th><th class="text-right">Thao tác</th></tr></thead>
            <tbody id="cus-tbody"></tbody>
          </table>
        </div>
      </div>
    `;

    const drawCus = () => {
      cusSearch = (document.getElementById('cus-search-inp')?.value || '').trim().toLowerCase();
      cusFilter = document.getElementById('cus-status-sel')?.value || 'all';
      const filtered = customers.filter(c => {
        if (cusSearch && !c.name.toLowerCase().includes(cusSearch) && !c.email.toLowerCase().includes(cusSearch) && !(c.phone || '').includes(cusSearch)) return false;
        if (cusFilter === 'active' && c.locked) return false;
        if (cusFilter === 'locked' && !c.locked) return false;
        return true;
      });
      const tbody = document.getElementById('cus-tbody');
      if (!tbody) return;
      if (!filtered.length) {
        tbody.innerHTML = renderEmptyRow(8, 'Chưa có khách hàng phù hợp', 'Các tài khoản khách hàng đăng ký từ Storefront sẽ hiển thị tại đây.');
        return;
      }
      tbody.innerHTML = filtered.map(c => {
        const cusOrders = orders.filter(o => o.customerId === c.id && o.orderStatus !== 'cancelled');
        const paidTotal = cusOrders.filter(o => o.paymentStatus === 'paid').reduce((sum, o) => sum + (o.total || 0), 0);
        return `
          <tr>
            <td><strong>${esc(c.name)}</strong></td>
            <td>${esc(c.email)}</td>
            <td>${esc(c.phone || '—')}</td>
            <td><small>${esc(formatDate(c.createdAt))}</small></td>
            <td>${cusOrders.length}</td>
            <td><strong>${money(paidTotal)}</strong></td>
            <td><span class="status-pill ${c.locked ? 'failed' : 'delivered'}">${c.locked ? 'Đã khóa' : 'Hoạt động'}</span></td>
            <td class="text-right">
              <button type="button" class="btn btn-outline btn-sm" data-cus-detail="${esc(c.id)}">Chi tiết</button>
              <button type="button" class="btn btn-outline btn-sm" data-cus-lock="${esc(c.id)}">${c.locked ? 'Mở khóa' : 'Khóa'}</button>
            </td>
          </tr>`;
      }).join('');

      tbody.querySelectorAll('[data-cus-detail]').forEach(btn => btn.addEventListener('click', () => openCustomerDetail(btn.dataset.cusDetail)));
      tbody.querySelectorAll('[data-cus-lock]').forEach(btn => btn.addEventListener('click', async () => {
        const c = customers.find(x => x.id === btn.dataset.cusLock);
        if (!c) return;
        let reason = '';
        if (!c.locked) {
          reason = await B().showPromptDialog({ title: 'Khóa tài khoản khách hàng', message: `Nhập lý do khóa tài khoản ${c.email}:`, placeholder: 'Ví dụ: Vi phạm chính sách đặt hàng', defaultValue: 'Vi phạm quy định cửa hàng', confirmText: 'Xác nhận khóa' });
          if (!reason) return;
        } else {
          const ok = await B().showConfirmDialog({ title: 'Mở khóa tài khoản', message: `Mở khóa tài khoản ${c.email}?`, confirmText: 'Mở khóa' });
          if (!ok) return;
        }
        try {
          await B().adminActionRequest('PATCH', `/api/admin/customers/${encodeURIComponent(c.id)}/lock`, { locked: !c.locked, reason });
          B().showToast(c.locked ? 'Đã mở khóa tài khoản.' : 'Đã khóa tài khoản và thu hồi phiên đăng nhập.', 'success');
        } catch (err) { B().showToast(err.message, 'danger'); }
      }));
    };

    drawCus();
    document.getElementById('cus-search-inp')?.addEventListener('input', drawCus);
    document.getElementById('cus-status-sel')?.addEventListener('change', drawCus);
  }

  function openCustomerDetail(cusId) {
    const { money, esc, formatDate, getStatusBadgeHtml } = B();
    const s = B().getState();
    const c = (s.customers || []).find(x => x.id === cusId);
    if (!c) return;
    const cusOrders = (s.orders || []).filter(o => o.customerId === c.id);
    const cusReturns = (s.returns || []).filter(r => r.customerId === c.id || cusOrders.some(o => o.id === r.orderId));
    const tickets = (s.supportTickets || []).filter(t => t.customerId === c.id);

    openModal(`Khách hàng: ${c.name}`, `
      <div class="info-grid" style="margin-bottom:16px">
        <div class="info-item"><label>Mã KH</label><p>${esc(c.id)}</p></div>
        <div class="info-item"><label>Email</label><p>${esc(c.email)}</p></div>
        <div class="info-item"><label>Số điện thoại</label><p>${esc(c.phone || '—')}</p></div>
        <div class="info-item"><label>Địa chỉ mặc định</label><p>${esc(c.defaultAddress || '—')}</p></div>
        <div class="info-item"><label>Trạng thái</label><p>${c.locked ? `Đã khóa (${esc(c.lockedReason || '—')})` : 'Hoạt động'}</p></div>
        <div class="info-item"><label>Ngày đăng ký</label><p>${esc(formatDate(c.createdAt))}</p></div>
      </div>
      <h4>Lịch sử đơn hàng (${cusOrders.length})</h4>
      ${cusOrders.length ? `<table class="admin-table"><thead><tr><th>Mã đơn</th><th>Ngày</th><th>Tổng</th><th>Trạng thái</th></tr></thead><tbody>${cusOrders.map(o => `<tr><td><span class="order-code">${esc(o.id)}</span></td><td><small>${esc(formatDate(o.createdAt))}</small></td><td>${money(o.total)}</td><td>${getStatusBadgeHtml(o.orderStatus)}</td></tr>`).join('')}</tbody></table>` : '<p class="text-muted">Chưa có đơn hàng.</p>'}
      <h4 style="margin-top:14px">Yêu cầu đổi trả (${cusReturns.length}) & Hỗ trợ (${tickets.length})</h4>
      <p class="text-muted" style="font-size:12.5px">Đổi trả: ${cusReturns.map(r => `${esc(r.id)} (${esc(r.status)})`).join(', ') || 'Không có'} · Hỗ trợ: ${tickets.length} phiếu.</p>
    `);
  }

  // =========================================================
  // 2.4.5 THANH TOÁN MÔ PHỎNG, HOÀN TIỀN & ĐỐI SOÁT COD
  // =========================================================
  function renderReconciliation() {
    const { money, esc, formatDate, paymentStatusText, settlementText, getPaymentBadgeHtml, renderEmptyRow, icons } = B();
    const s = B().getState();
    const pane = document.getElementById('pane-reconciliation');
    if (!pane) return;

    const orders = (s.orders || []).slice().reverse();
    const txs = [];
    for (const o of orders) {
      for (const t of (o.transactions || [])) txs.push({ order: o, tx: t });
    }
    const codDelivered = orders.filter(o => o.paymentMethod === 'COD' && o.orderStatus === 'delivered');
    const pendingOnline = orders.filter(o => o.orderStatus !== 'cancelled' && o.paymentStatus !== 'paid' && o.paymentStatus !== 'refunded');

    pane.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title-wrap">
            <h3 class="card-title">Xử lý Thanh toán & Hoàn tiền <span class="vp-badge-sim">GIAO DỊCH MÔ PHỎNG</span></h3>
            <span class="card-subtitle">Không kết nối cổng thanh toán thật. Mọi giao dịch mô phỏng đều có isSimulated: true và không tính là tiền thật.</span>
          </div>
        </div>
        <div class="table-responsive">
          <table class="admin-table">
            <thead><tr><th>Mã đơn</th><th>Phương thức</th><th>Tổng đơn</th><th>Đã hoàn</th><th>Trạng thái thanh toán</th><th class="text-right">Thao tác mô phỏng</th></tr></thead>
            <tbody>
              ${orders.length ? orders.map(o => {
                const paid = (o.transactions || []).filter(t => t.status === 'success').reduce((a, t) => a + t.amount, 0);
                const refunded = (o.refunds || []).filter(r => r.status === 'success').reduce((a, r) => a + r.amount, 0);
                const canSimPay = o.orderStatus !== 'cancelled' && o.orderStatus !== 'returned' && o.paymentStatus !== 'paid';
                const canRefund = paid > refunded;
                return `
                  <tr>
                    <td><span class="order-code">${esc(o.id)}</span> <span class="vp-badge-sim">Mô phỏng</span></td>
                    <td>${esc(o.paymentMethod)}</td>
                    <td><strong>${money(o.total)}</strong></td>
                    <td>${money(refunded)} / ${money(paid)}</td>
                    <td>${getPaymentBadgeHtml(o.paymentStatus)}</td>
                    <td class="text-right">
                      ${canSimPay ? `
                        <button type="button" class="btn btn-primary btn-sm" data-pay-sim="${esc(o.id)}" data-act="success">TT Thành công</button>
                        <button type="button" class="btn btn-outline btn-sm" data-pay-sim="${esc(o.id)}" data-act="failed">Thất bại</button>
                        <button type="button" class="btn btn-outline btn-sm" data-pay-sim="${esc(o.id)}" data-act="expired">Hết hạn</button>
                      ` : ''}
                      ${canRefund ? `<button type="button" class="btn btn-outline btn-sm" data-refund-open="${esc(o.id)}" data-max="${paid - refunded}">Hoàn tiền</button>` : ''}
                    </td>
                  </tr>`;
              }).join('') : renderEmptyRow(6, 'Chưa có đơn hàng', 'Giao dịch thanh toán sẽ hiển thị tại đây.')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title-wrap">
            <h3 class="card-title">Lịch sử Giao dịch mô phỏng (${txs.length}) & Đối soát COD (${codDelivered.length})</h3>
            <span class="card-subtitle">Tách biệt rõ trạng thái thanh toán, giao dịch mô phỏng và trạng thái đối soát</span>
          </div>
        </div>
        <div class="table-responsive">
          <table class="admin-table">
            <thead><tr><th>Mã đơn</th><th>Loại / Mã GD</th><th>Số tiền</th><th>Trạng thái TT</th><th>Đối soát COD</th><th>Thời gian</th><th class="text-right">Thao tác</th></tr></thead>
            <tbody>
              ${codDelivered.map(o => `
                <tr>
                  <td><span class="order-code">${esc(o.id)}</span></td>
                  <td>COD <span class="vp-badge-sim">Mô phỏng</span></td>
                  <td><strong>${money(o.total)}</strong></td>
                  <td>${esc(paymentStatusText(o.paymentStatus))}</td>
                  <td><span class="status-pill ${o.settlementStatus === 'settled' ? 'delivered' : 'pending'}">${esc(settlementText(o.settlementStatus))}</span></td>
                  <td><small>${esc(formatDate(o.settledAt || o.createdAt))}</small></td>
                  <td class="text-right">${o.settlementStatus !== 'settled' ? `<button type="button" class="btn btn-primary btn-sm" data-action="order-settle" data-id="${esc(o.id)}">${icons.check} Đối soát COD</button>` : 'Đã đối soát'}</td>
                </tr>`).join('') || (txs.length ? '' : renderEmptyRow(7, 'Chưa có dữ liệu đối soát COD', 'Đơn COD giao thành công sẽ xuất hiện tại đây.'))}
              ${txs.slice(0, 20).map(({ order, tx }) => `
                <tr>
                  <td><span class="order-code">${esc(order.id)}</span></td>
                  <td><code>${esc(tx.id)}</code> <span class="vp-badge-sim">GIAO DỊCH MÔ PHỎNG</span></td>
                  <td>${money(tx.amount)}</td>
                  <td>${esc(tx.status)}</td>
                  <td>${esc(settlementText(order.settlementStatus))}</td>
                  <td><small>${esc(formatDate(tx.createdAt))}</small></td>
                  <td class="text-right"><small>${esc(tx.method)}</small></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    pane.querySelectorAll('[data-pay-sim]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.dataset.paySim;
      const act = btn.dataset.act;
      const ok = await B().showConfirmDialog({ title: 'Xác nhận giao dịch mô phỏng', message: `Thực hiện trạng thái thanh toán mô phỏng "${act}" cho đơn ${id}?`, danger: act === 'expired' });
      if (!ok) return;
      try {
        await B().adminActionRequest('POST', `/api/admin/orders/${encodeURIComponent(id)}/payment-simulate`, { action: act });
        B().showToast('Đã cập nhật thanh toán mô phỏng.', 'success');
      } catch (err) { B().showToast(err.message, 'danger'); }
    }));

    pane.querySelectorAll('[data-refund-open]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.refundOpen;
      const maxAmt = Number(btn.dataset.max || 0);
      openModal(`Hoàn tiền mô phỏng: ${id}`, `
        <form id="refund-modal-form">
          <p><span class="vp-badge-sim">GIAO DỊCH MÔ PHỎNG</span> Tối đa còn có thể hoàn: <strong>${money(maxAmt)}</strong></p>
          <div class="form-group"><label>Số tiền hoàn (VNĐ) *</label><input class="form-control" type="number" min="1" max="${maxAmt}" name="amount" required value="${maxAmt}"></div>
          <div class="form-group"><label>Lý do hoàn tiền *</label><input class="form-control" name="reason" required value="Hoàn tiền theo yêu cầu khách hàng"></div>
          <button type="submit" class="btn btn-primary">Xác nhận hoàn tiền mô phỏng</button>
        </form>
      `);
      document.getElementById('refund-modal-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          await B().adminActionRequest('POST', `/api/admin/orders/${encodeURIComponent(id)}/refund`, { amount: Number(fd.get('amount')), reason: String(fd.get('reason') || '').trim() });
          closeModal();
          B().showToast('Đã ghi nhận hoàn tiền mô phỏng!', 'success');
        } catch (err) { B().showToast(err.message, 'danger'); }
      });
    }));
    void pendingOnline;
  }

  // =========================================================
  // 2.4.6 QUẢN LÝ VẬN CHUYỂN
  // =========================================================
  function renderShipping() {
    const { money, esc, formatDate, getStatusBadgeHtml, renderEmptyRow } = B();
    const orders = (B().getState().orders || []).filter(o => o.orderStatus !== 'cancelled').slice().reverse();
    const pane = document.getElementById('pane-shipping');
    if (!pane) return;

    pane.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title-wrap">
            <h3 class="card-title">Quản lý Vận chuyển <span class="vp-badge-sim">VẬN CHUYỂN MÔ PHỎNG</span></h3>
            <span class="card-subtitle">Cập nhật đơn vị vận chuyển giả lập, mã vận đơn giả lập, trạng thái và ngày giao thành công</span>
          </div>
        </div>
        <div class="table-responsive">
          <table class="admin-table">
            <thead><tr><th>Mã đơn</th><th>Người nhận & Địa chỉ</th><th>Phí ship / TT</th><th>Đơn vị & Mã vận đơn</th><th>Trạng thái đơn</th><th>Ngày giao</th><th class="text-right">Thao tác</th></tr></thead>
            <tbody>
              ${orders.length ? orders.map(o => `
                <tr>
                  <td><span class="order-code">${esc(o.id)}</span></td>
                  <td><strong>${esc(o.receiver)}</strong> · ${esc(o.phone)}<br><small style="color:var(--text-muted)">${esc(o.address)}</small></td>
                  <td>${money(o.shippingFee)}<br><small>${esc(o.paymentMethod)}</small></td>
                  <td>${esc(o.shipment?.carrier || 'Chưa gán')}<br><code>${esc(o.shipment?.trackingCode || '—')}</code></td>
                  <td>${getStatusBadgeHtml(o.orderStatus)}</td>
                  <td><small>${esc(o.shipment?.deliveredAt ? formatDate(o.shipment.deliveredAt) : 'Chưa giao')}</small></td>
                  <td class="text-right"><button type="button" class="btn btn-outline btn-sm" data-ship-edit="${esc(o.id)}">Cập nhật vận chuyển</button></td>
                </tr>
              `).join('') : renderEmptyRow(7, 'Chưa có đơn hàng cần vận chuyển', 'Các đơn hàng hợp lệ sẽ hiển thị tại đây.')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    pane.querySelectorAll('[data-ship-edit]').forEach(btn => btn.addEventListener('click', () => {
      const o = orders.find(x => x.id === btn.dataset.shipEdit);
      if (!o) return;
      openModal(`Vận chuyển mô phỏng: ${o.id}`, `
        <form id="ship-form">
          <p><span class="vp-badge-sim">Dữ liệu mô phỏng</span> Không gọi API hãng vận chuyển thật.</p>
          <div class="form-grid-2">
            <div class="form-group"><label>Đơn vị vận chuyển giả lập</label><select class="form-control" name="carrier"><option value="GHN (Mô phỏng)">GHN (Mô phỏng)</option><option value="GHTK (Mô phỏng)">GHTK (Mô phỏng)</option><option value="Viettel Post (Mô phỏng)">Viettel Post (Mô phỏng)</option><option value="Nội bộ Việt Phục">Nội bộ Việt Phục</option></select></div>
            <div class="form-group"><label>Mã vận đơn giả lập</label><input class="form-control" name="trackingCode" value="${esc(o.shipment?.trackingCode || ('VP-SIM-' + o.id.slice(-6)))}" placeholder="Ví dụ: VP-SIM-123456"></div>
          </div>
          <div class="form-group"><label>Cập nhật trạng thái giao hàng</label><select class="form-control" name="shipStatus">
            <option value="preparing" ${o.shipment?.shipStatus === 'preparing' ? 'selected' : ''}>Đang chuẩn bị / Giữ nguyên trạng thái đơn</option>
            <option value="shipping" ${o.orderStatus === 'shipping' ? 'selected' : ''}>Đang giao hàng (chuyển đơn -> Đang giao)</option>
            <option value="delivered" ${o.orderStatus === 'delivered' ? 'selected' : ''}>Giao thành công (lưu ngày giao & tính hạn đổi trả 7 ngày)</option>
            <option value="delivery_failed" ${o.orderStatus === 'delivery_failed' ? 'selected' : ''}>Giao thất bại</option>
          </select></div>
          <div class="form-group"><label>Ghi chú giao hàng</label><input class="form-control" name="note" value="${esc(o.shipment?.note || '')}"></div>
          <button type="submit" class="btn btn-primary">Lưu vận chuyển</button>
        </form>
      `);
      document.getElementById('ship-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          await B().adminActionRequest('PATCH', `/api/admin/orders/${encodeURIComponent(o.id)}/shipment`, {
            carrier: String(fd.get('carrier') || ''),
            trackingCode: String(fd.get('trackingCode') || ''),
            shipStatus: String(fd.get('shipStatus') || ''),
            note: String(fd.get('note') || ''),
          });
          closeModal();
          B().showToast('Đã cập nhật vận chuyển mô phỏng!', 'success');
        } catch (err) { B().showToast(err.message, 'danger'); }
      });
    }));
  }

  // =========================================================
  // 2.4.7 ĐỔI TRẢ & BẢO HÀNH
  // =========================================================
  function renderReturns() {
    const { esc, formatDate, getStatusBadgeHtml, renderEmptyRow } = B();
    const s = B().getState();
    const returns = (s.returns || []).slice().reverse();
    const orders = s.orders || [];
    const pane = document.getElementById('pane-returns');
    if (!pane) return;

    const deliveredOrders = orders.filter(o => o.orderStatus === 'delivered');

    pane.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title-wrap">
            <h3 class="card-title">Quản lý Đổi trả & Bảo hành</h3>
            <span class="card-subtitle">Hạn đổi trả mặc định: ${B().getConfig().returnWindowDays || 7} ngày từ ngày giao. Chỉ nhập lại kho sau khi kiểm tra hàng đạt chuẩn (resellable).</span>
          </div>
          <div class="toolbar" style="flex:0 1 auto">
            <select id="ret-type-filter" class="select-filter">
              <option value="all" ${retTypeFilter === 'all' ? 'selected' : ''}>Tất cả loại</option>
              <option value="return" ${retTypeFilter === 'return' ? 'selected' : ''}>Trả hàng</option>
              <option value="exchange" ${retTypeFilter === 'exchange' ? 'selected' : ''}>Đổi hàng</option>
              <option value="warranty" ${retTypeFilter === 'warranty' ? 'selected' : ''}>Bảo hành</option>
            </select>
            <button type="button" class="btn btn-primary btn-sm" id="btn-create-return">+ Tạo yêu cầu</button>
          </div>
        </div>
        <div class="table-responsive">
          <table class="admin-table">
            <thead><tr><th>Mã YC</th><th>Đơn hàng</th><th>Loại</th><th>Sản phẩm</th><th>Lý do</th><th>Trạng thái</th><th class="text-right">Thao tác xử lý</th></tr></thead>
            <tbody id="ret-tbody"></tbody>
          </table>
        </div>
      </div>
    `;

    const drawRet = () => {
      retTypeFilter = document.getElementById('ret-type-filter')?.value || 'all';
      const filtered = returns.filter(r => retTypeFilter === 'all' || r.type === retTypeFilter);
      const tbody = document.getElementById('ret-tbody');
      if (!tbody) return;
      if (!filtered.length) {
        tbody.innerHTML = renderEmptyRow(7, 'Chưa có yêu cầu đổi trả / bảo hành', 'Các yêu cầu từ đơn hàng đã giao sẽ hiển thị tại đây.');
        return;
      }
      tbody.innerHTML = filtered.map(r => `
        <tr>
          <td><span class="order-code">${esc(r.id)}</span><br><small>${esc(formatDate(r.createdAt))}</small></td>
          <td><span class="order-code">${esc(r.orderId)}</span>${r.shippingFeeBearer ? `<br><small class="badge ${r.shippingFeeBearer === 'store' ? 'badge-info' : 'badge-warning'}">${r.shippingFeeBearer === 'store' ? 'Shop chịu phí VC' : 'Khách chịu phí VC'}</small>` : ''}</td>
          <td>${esc(RETURN_TYPE_VI[r.type] || r.type)}</td>
          <td><small>${(r.items || []).map(it => `${esc(it.name || it.productId)} × ${it.qty} (${esc(it.condition)})`).join('<br>')}</small></td>
          <td>${esc(r.reason)}${r.description ? `<br><small class="text-muted">${esc(r.description)}</small>` : ''}${(r.images && r.images.length) ? `<br><small>Minh họa (${r.images.length}): ${r.images.map(im => esc(im)).join(', ')}</small>` : ''}</td>
          <td>${getStatusBadgeHtml(r.status)}</td>
          <td class="text-right">
            ${r.status === 'pending' ? `
              <button type="button" class="btn btn-primary btn-sm" data-ret-approve="${esc(r.id)}">Duyệt</button>
              <button type="button" class="btn btn-outline btn-sm" data-ret-reject="${esc(r.id)}">Từ chối</button>
            ` : ''}
            ${r.status === 'approved' ? `
              <button type="button" class="btn btn-primary btn-sm" data-ret-inspect="${esc(r.id)}">Nhận & Kiểm tra hàng</button>
              <button type="button" class="btn btn-outline btn-sm" data-ret-reject="${esc(r.id)}">Từ chối</button>
            ` : ''}
            ${r.status === 'completed' || r.status === 'rejected' ? `<small style="color:var(--text-muted)">Đã kết thúc</small>` : ''}
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('[data-ret-approve]').forEach(btn => btn.addEventListener('click', async () => {
        const ok = await B().showConfirmDialog({ title: 'Duyệt yêu cầu', message: `Duyệt yêu cầu ${btn.dataset.retApprove} để chờ nhận lại & kiểm tra hàng? (Chưa cộng kho ngay.)` });
        if (!ok) return;
        try {
          await B().adminActionRequest('PATCH', `/api/admin/returns/${encodeURIComponent(btn.dataset.retApprove)}`, { action: 'approve' });
          B().showToast('Đã duyệt yêu cầu. Chờ nhận & kiểm tra hàng.', 'success');
        } catch (err) { B().showToast(err.message, 'danger'); }
      }));

      tbody.querySelectorAll('[data-ret-reject]').forEach(btn => btn.addEventListener('click', async () => {
        const reason = await B().showPromptDialog({ title: 'Từ chối yêu cầu', message: `Nhập lý do từ chối ${btn.dataset.retReject}:`, defaultValue: 'Không đủ điều kiện đổi trả', confirmText: 'Từ chối' });
        if (!reason) return;
        try {
          await B().adminActionRequest('PATCH', `/api/admin/returns/${encodeURIComponent(btn.dataset.retReject)}`, { action: 'reject', note: reason });
          B().showToast('Đã từ chối yêu cầu.', 'info');
        } catch (err) { B().showToast(err.message, 'danger'); }
      }));

      tbody.querySelectorAll('[data-ret-inspect]').forEach(btn => btn.addEventListener('click', () => {
        const ret = returns.find(x => x.id === btn.dataset.retInspect);
        if (!ret) return;
        openModal(`Kiểm tra hàng nhận lại: ${ret.id}`, `
          <form id="ret-inspect-form">
            <p class="text-muted">Chọn tình trạng từng sản phẩm sau khi kiểm tra thực tế. Chỉ sản phẩm <b>Đạt chuẩn (resellable)</b> mới được hoàn nhập kho bán được.</p>
            ${ret.items.map((it, idx) => `
              <div class="form-group">
                <label>${esc(it.name || it.productId)} × ${it.qty}</label>
                <select class="form-control" name="cond_${idx}">
                  <option value="resellable">Đạt chuẩn — hoàn nhập kho bán được</option>
                  <option value="damaged">Hư hỏng — KHÔNG hoàn nhập kho bán</option>
                </select>
              </div>
            `).join('')}
            <div class="form-group"><label>Ghi chú kiểm tra</label><input class="form-control" name="note" value="Đã kiểm tra hàng thực tế"></div>
            <button type="submit" class="btn btn-primary">Hoàn tất đổi trả / bảo hành</button>
          </form>
        `);
        document.getElementById('ret-inspect-form')?.addEventListener('submit', async e => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const itemConditions = {};
          ret.items.forEach((_, idx) => { itemConditions[idx] = fd.get(`cond_${idx}`); });
          try {
            await B().adminActionRequest('PATCH', `/api/admin/returns/${encodeURIComponent(ret.id)}`, {
              action: 'complete',
              itemConditions,
              note: String(fd.get('note') || ''),
            });
            closeModal();
            B().showToast('Đã hoàn tất kiểm tra và cập nhật kho!', 'success');
          } catch (err) { B().showToast(err.message, 'danger'); }
        });
      }));
    };

    drawRet();
    document.getElementById('ret-type-filter')?.addEventListener('change', drawRet);
    document.getElementById('btn-create-return')?.addEventListener('click', () => {
      if (!deliveredOrders.length) {
        B().showToast('Chưa có đơn hàng nào đã giao thành công để tạo yêu cầu.', 'info');
        return;
      }
      openModal('Tạo yêu cầu Đổi trả / Bảo hành', `
        <form id="ret-create-form">
          <div class="form-group"><label>Chọn đơn hàng đã giao *</label><select class="form-control" name="orderId" required>${deliveredOrders.map(o => `<option value="${esc(o.id)}">${esc(o.id)} · ${esc(o.receiver)}</option>`).join('')}</select></div>
          <div class="form-group"><label>Loại yêu cầu *</label><select class="form-control" name="type"><option value="return">Trả hàng</option><option value="exchange">Đổi hàng</option><option value="warranty">Bảo hành</option></select></div>
          <div class="form-group"><label>Lý do *</label><textarea class="form-control" name="reason" required placeholder="Mô tả chi tiết lý do..."></textarea></div>
          <button type="submit" class="btn btn-primary">Tạo yêu cầu</button>
        </form>
      `);
      document.getElementById('ret-create-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const o = deliveredOrders.find(x => x.id === fd.get('orderId'));
        const items = (o?.items || []).map(it => ({ productId: it.productId, sku: it.sku, qty: it.qty }));
        try {
          await B().adminActionRequest('POST', '/api/admin/returns', {
            orderId: fd.get('orderId'),
            type: fd.get('type'),
            reason: String(fd.get('reason') || '').trim(),
            items,
          });
          closeModal();
          B().showToast('Đã tạo yêu cầu thành công!', 'success');
        } catch (err) { B().showToast(err.message, 'danger'); }
      });
    });
  }

  // =========================================================
  // 2.4.9 QUẢN LÝ KHUYẾN MÃI
  // =========================================================
  function renderPromotions() {
    const { money, esc, formatDate, renderEmptyRow } = B();
    const s = B().getState();
    const promos = s.promotions || [];
    const orders = s.orders || [];
    const pane = document.getElementById('pane-promotions');
    if (!pane) return;

    const nowMs = Date.now();
    const activeCount = promos.filter(p => p.active && Date.parse(p.endAt) >= nowMs).length;
    const expiredCount = promos.filter(p => Date.parse(p.endAt) < nowMs).length;
    const totalUsed = promos.reduce((sum, p) => sum + (p.usedCount || 0), 0);
    const totalDiscountGiven = orders.filter(o => o.orderStatus !== 'cancelled').reduce((sum, o) => sum + (o.discountAmount || 0), 0);

    pane.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-top"><span class="stat-label">Tổng chương trình</span></div><div class="stat-value">${promos.length}</div><div class="stat-sub">Đang hoạt động: ${activeCount} · Hết hạn: ${expiredCount}</div></div>
        <div class="stat-card"><div class="stat-top"><span class="stat-label">Tổng lượt sử dụng</span></div><div class="stat-value">${totalUsed}</div><div class="stat-sub">Tổng tiền đã giảm: ${money(totalDiscountGiven)}</div></div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title-wrap">
            <h3 class="card-title">Danh sách Mã khuyến mãi</h3>
            <span class="card-subtitle">Mỗi đơn áp dụng tối đa 1 mã; Server tự kiểm tra điều kiện và tính giảm giá.</span>
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="btn-add-promo">+ Tạo khuyến mãi</button>
        </div>
        <div class="table-responsive">
          <table class="admin-table">
            <thead><tr><th>Mã</th><th>Tên chương trình</th><th>Mức giảm</th><th>Đơn tối thiểu</th><th>Lượt dùng</th><th>Thời gian</th><th>Trạng thái</th><th class="text-right">Thao tác</th></tr></thead>
            <tbody>
              ${promos.length ? promos.map(p => {
                const isExpired = Date.parse(p.endAt) < nowMs;
                return `
                  <tr>
                    <td><span class="order-code">${esc(p.code)}</span></td>
                    <td><strong>${esc(p.name || p.code)}</strong></td>
                    <td>${p.type === 'percent' ? `${p.value}%` : money(p.value)}${p.maxDiscount ? `<br><small>Tối đa ${money(p.maxDiscount)}</small>` : ''}</td>
                    <td>${money(p.minOrder)}</td>
                    <td>${p.usedCount} / ${p.usageLimit}</td>
                    <td><small>${esc(formatDate(p.startAt))}<br>→ ${esc(formatDate(p.endAt))}</small></td>
                    <td><span class="status-pill ${!p.active ? 'cancelled' : (isExpired ? 'failed' : 'delivered')}">${!p.active ? 'Tạm ngưng' : (isExpired ? 'Hết hạn' : 'Hoạt động')}</span></td>
                    <td class="text-right">
                      <button type="button" class="btn btn-outline btn-sm" data-promo-edit="${esc(p.id)}">Sửa</button>
                      <button type="button" class="btn btn-outline btn-sm" data-promo-toggle="${esc(p.id)}">${p.active ? 'Vô hiệu hóa' : 'Kích hoạt'}</button>
                    </td>
                  </tr>`;
              }).join('') : renderEmptyRow(8, 'Chưa có mã khuyến mãi', 'Tạo mã khuyến mãi đầu tiên để chạy chương trình ưu đãi.')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('btn-add-promo')?.addEventListener('click', () => openPromoModal(null));
    pane.querySelectorAll('[data-promo-edit]').forEach(btn => btn.addEventListener('click', () => openPromoModal(btn.dataset.promoEdit)));
    pane.querySelectorAll('[data-promo-toggle]').forEach(btn => btn.addEventListener('click', async () => {
      const p = promos.find(x => x.id === btn.dataset.promoToggle);
      if (!p) return;
      try {
        await B().adminActionRequest('PATCH', `/api/admin/promotions/${encodeURIComponent(p.id)}`, { active: !p.active });
        B().showToast(p.active ? 'Đã vô hiệu hóa mã khuyến mãi.' : 'Đã kích hoạt mã khuyến mãi.', 'success');
      } catch (err) { B().showToast(err.message, 'danger'); }
    }));
  }

  function openPromoModal(promoId) {
    const { esc } = B();
    const p = promoId ? (B().getState().promotions || []).find(x => x.id === promoId) : null;
    const today = new Date().toISOString().slice(0, 10);
    const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    openModal(p ? `Sửa mã ${p.code}` : 'Tạo mã khuyến mãi mới', `
      <form id="promo-form">
        <div class="form-grid-2">
          <div class="form-group"><label>Mã khuyến mãi *</label><input class="form-control" name="code" required value="${esc(p?.code || '')}" ${p ? 'readonly disabled' : ''} placeholder="VIETPHUC10"></div>
          <div class="form-group"><label>Tên chương trình</label><input class="form-control" name="name" value="${esc(p?.name || '')}" placeholder="Ưu đãi mùa lễ hội"></div>
        </div>
        <div class="form-grid-2">
          <div class="form-group"><label>Loại giảm</label><select class="form-control" name="type"><option value="percent" ${p?.type === 'percent' ? 'selected' : ''}>Phần trăm (%)</option><option value="fixed" ${p?.type === 'fixed' ? 'selected' : ''}>Số tiền cố định (VNĐ)</option></select></div>
          <div class="form-group"><label>Giá trị giảm *</label><input class="form-control" type="number" min="1" name="value" required value="${p?.value ?? 10}"></div>
        </div>
        <div class="form-grid-2">
          <div class="form-group"><label>Đơn tối thiểu (VNĐ)</label><input class="form-control" type="number" min="0" name="minOrder" value="${p?.minOrder ?? 0}"></div>
          <div class="form-group"><label>Giảm tối đa (VNĐ, tùy chọn)</label><input class="form-control" type="number" min="0" name="maxDiscount" value="${p?.maxDiscount ?? ''}"></div>
        </div>
        <div class="form-grid-2">
          <div class="form-group"><label>Giới hạn lượt sử dụng *</label><input class="form-control" type="number" min="1" name="usageLimit" required value="${p?.usageLimit ?? 100}"></div>
          <div class="form-group"><label>Trạng thái</label><select class="form-control" name="active"><option value="true" ${!p || p.active ? 'selected' : ''}>Kích hoạt</option><option value="false" ${p && !p.active ? 'selected' : ''}>Tạm ngưng</option></select></div>
        </div>
        <div class="form-grid-2">
          <div class="form-group"><label>Ngày bắt đầu *</label><input class="form-control" type="date" name="startAt" required value="${(p?.startAt || today).slice(0, 10)}"></div>
          <div class="form-group"><label>Ngày kết thúc *</label><input class="form-control" type="date" name="endAt" required value="${(p?.endAt || nextMonth).slice(0, 10)}"></div>
        </div>
        <button type="submit" class="btn btn-primary">${p ? 'Lưu thay đổi' : 'Tạo khuyến mãi'}</button>
      </form>
    `);
    document.getElementById('promo-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        name: String(fd.get('name') || '').trim(),
        type: fd.get('type'),
        value: Number(fd.get('value')),
        minOrder: Number(fd.get('minOrder') || 0),
        maxDiscount: fd.get('maxDiscount') ? Number(fd.get('maxDiscount')) : null,
        usageLimit: Number(fd.get('usageLimit')),
        active: fd.get('active') === 'true',
        startAt: fd.get('startAt') + 'T00:00:00.000Z',
        endAt: fd.get('endAt') + 'T23:59:59.999Z',
      };
      try {
        if (p) await B().adminActionRequest('PATCH', `/api/admin/promotions/${encodeURIComponent(p.id)}`, payload);
        else {
          payload.code = String(fd.get('code') || '').trim().toUpperCase();
          await B().adminActionRequest('POST', '/api/admin/promotions', payload);
        }
        closeModal();
        B().showToast('Đã lưu mã khuyến mãi!', 'success');
      } catch (err) { B().showToast(err.message, 'danger'); }
    });
  }

  // =========================================================
  // 2.4.8 CHÍNH SÁCH & NỘI DUNG WEBSITE
  // =========================================================
  function renderPolicies() {
    const { esc, formatDate, getStatusBadgeHtml } = B();
    const s = B().getState();
    const pol = s.policies || { version: 1, storeInfo: {}, banners: {}, visibility: {}, items: {} };
    const vis = pol.visibility || {};
    const versions = (s.policyVersions || []).slice().reverse();
    const tickets = (s.supportTickets || []).slice().reverse();
    const feedbacks = tickets.filter(t => t.source === 'contact_feedback');
    const orderTickets = tickets.filter(t => t.source !== 'contact_feedback');
    const pane = document.getElementById('pane-policies');
    if (!pane) return;

    pane.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title-wrap">
            <h3 class="card-title">Chính sách & Nội dung Storefront (Phiên bản hiện tại: v${pol.version || 1})</h3>
            <span class="card-subtitle">Cập nhật tự động đồng bộ sang Storefront (/api/public/bootstrap) và lưu lịch sử vào policyVersions. Có thể bật/tắt hiển thị từng nhóm chính sách.</span>
          </div>
        </div>
        <div class="card-body">
          <form id="policies-form">
            <div class="form-grid-2">
              <div class="form-group"><label>Tên cửa hàng</label><input class="form-control" name="store_name" value="${esc(pol.storeInfo?.name || 'VIỆT PHỤC — Traditional Clothing')}"></div>
              <div class="form-group"><label>Hotline / Liên hệ</label><input class="form-control" name="store_hotline" value="${esc(pol.storeInfo?.hotline || 'Chưa cấu hình')}" placeholder="Chưa cấu hình"></div>
              <div class="form-group"><label>Email liên hệ</label><input class="form-control" name="store_email" value="${esc(pol.storeInfo?.email || 'Chưa cấu hình')}" placeholder="Chưa cấu hình"></div>
              <div class="form-group"><label>Địa chỉ cửa hàng</label><input class="form-control" name="store_address" value="${esc(pol.storeInfo?.address || 'Chưa cấu hình')}" placeholder="Chưa cấu hình"></div>
              <div class="form-group"><label>Giờ hỗ trợ</label><input class="form-control" name="store_hours" value="${esc(pol.storeInfo?.hours || 'Thứ 2 – Thứ 7: 08:00 – 17:00')}"></div>
              <div class="form-group"><label>Mạng xã hội</label><input class="form-control" name="store_social" value="${esc(pol.storeInfo?.social || 'Chưa cấu hình')}" placeholder="Chưa cấu hình"></div>
              <div class="form-group"><label>Tiêu đề Banner / Thông báo</label><input class="form-control" name="banner_title" value="${esc(pol.banners?.notice || '')}" placeholder="Thông báo cửa hàng..."></div>
              <div class="form-group"><label>Ghi chú phiên bản *</label><input class="form-control" name="note" required value="Cập nhật chính sách & nội dung"></div>
            </div>
            ${POLICY_KEYS.map(([k, lbl]) => {
              const isPub = vis[k] !== false;
              return `
              <div class="form-group" style="border:1px solid var(--border);padding:12px;border-radius:6px;margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:12px">
                  <label style="margin:0;font-weight:600">${esc(lbl)}</label>
                  <label style="margin:0;display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
                    <input type="checkbox" name="vis_${k}" ${isPub ? 'checked' : ''}>
                    <span class="badge ${isPub ? 'badge-success' : 'badge-neutral'}">${isPub ? 'Đang công khai' : 'Đang ẩn'}</span>
                  </label>
                </div>
                <textarea class="form-control" name="item_${k}" rows="12" aria-label="Nội dung ${esc(lbl)}">${esc(pol.items?.[k] || '')}</textarea>
              </div>`;
            }).join('')}
            <button type="submit" class="btn btn-primary">Lưu & Tạo phiên bản mới</button>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title-wrap"><h3 class="card-title">Lịch sử phiên bản chính sách (${versions.length})</h3></div></div>
        <div class="table-responsive">
          <table class="admin-table">
            <thead><tr><th>Phiên bản</th><th>Thời gian lưu</th><th>Người thực hiện</th><th>Ghi chú</th><th class="text-right">Chi tiết</th></tr></thead>
            <tbody>
              ${versions.length ? versions.map((v, idx) => `<tr><td><strong>v${v.version}</strong></td><td>${esc(formatDate(v.archivedAt || v.updatedAt))}</td><td>${esc(v.actor || 'admin')}</td><td>${esc(v.note || '')}</td><td class="text-right"><button type="button" class="btn btn-outline btn-sm" data-pol-ver="${idx}">Xem nội dung</button></td></tr>`).join('') : '<tr><td colspan="5" class="text-center" style="padding:18px">Chưa có phiên bản lưu trữ trước đó.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title-wrap">
            <h3 class="card-title">Phản hồi nhanh từ Storefront (${feedbacks.length})</h3>
            <span class="card-subtitle">Tiếp nhận tự động từ form Gửi phản hồi nhanh ở Footer và Popup Liên hệ.</span>
          </div>
        </div>
        <div class="table-responsive">
          <table class="admin-table">
            <thead><tr><th>Mã</th><th>Người gửi</th><th>Nội dung phản hồi</th><th>Trạng thái</th><th>Phản hồi / Ghi chú Admin</th><th class="text-right">Xử lý</th></tr></thead>
            <tbody>
              ${feedbacks.length ? feedbacks.map(t => `
                <tr>
                  <td><span class="order-code">${esc(t.id)}</span><br><small>${esc(formatDate(t.createdAt))}</small></td>
                  <td><b>${esc(t.senderName || 'Khách')}</b><br><small>${esc(t.email)}</small></td>
                  <td><small>${esc(t.message)}</small></td>
                  <td>${getStatusBadgeHtml(t.status)}</td>
                  <td><small>${esc(t.adminReply || 'Chưa phản hồi')}</small></td>
                  <td class="text-right"><button type="button" class="btn btn-primary btn-sm" data-ticket-reply="${esc(t.id)}">Phản hồi / Cập nhật</button></td>
                </tr>
              `).join('') : '<tr><td colspan="6" class="text-center" style="padding:18px">Chưa có phản hồi nhanh nào từ Storefront.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title-wrap">
            <h3 class="card-title">Khiếu nại & Hỗ trợ khách hàng (${orderTickets.length})</h3>
            <span class="card-subtitle">Mục tiêu phản hồi tiếp nhận: 01 ngày làm việc. Lưu lịch sử phản hồi tại supportTickets.</span>
          </div>
        </div>
        <div class="table-responsive">
          <table class="admin-table">
            <thead><tr><th>Mã</th><th>Khách hàng / Đơn</th><th>Tiêu đề & Nội dung</th><th>Trạng thái</th><th>Phản hồi Admin</th><th class="text-right">Xử lý</th></tr></thead>
            <tbody>
              ${orderTickets.length ? orderTickets.map(t => `
                <tr>
                  <td><span class="order-code">${esc(t.id)}</span><br><small>${esc(formatDate(t.createdAt))}</small></td>
                  <td>${esc(t.email)}${t.orderId ? `<br><span class="order-code">${esc(t.orderId)}</span>` : ''}</td>
                  <td><b>${esc(t.subject)}</b><br><small>${esc(t.message)}</small></td>
                  <td>${getStatusBadgeHtml(t.status)}</td>
                  <td><small>${esc(t.adminReply || 'Chưa phản hồi')}</small></td>
                  <td class="text-right"><button type="button" class="btn btn-primary btn-sm" data-ticket-reply="${esc(t.id)}">Phản hồi / Cập nhật</button></td>
                </tr>
              `).join('') : '<tr><td colspan="6" class="text-center" style="padding:18px">Chưa có yêu cầu hỗ trợ / khiếu nại nào.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    pane.querySelectorAll('[data-pol-ver]').forEach(btn => btn.addEventListener('click', () => {
      const v = versions[Number(btn.dataset.polVer)];
      if (!v) return;
      const snap = v.snapshot || {};
      openModal(`Lịch sử Chính sách v${v.version}`, `
        <p class="text-muted">Lưu lúc: ${esc(formatDate(v.archivedAt || v.updatedAt))} · Người thực hiện: ${esc(v.actor || 'admin')}</p>
        ${Object.entries(snap.items || {}).map(([k, val]) => `<div style="margin-bottom:12px"><b>${esc(k)}</b><pre style="white-space:pre-wrap;font-family:inherit;background:#f7f5f0;padding:10px;border-radius:4px;margin:4px 0">${esc(val)}</pre></div>`).join('')}
      `);
    }));

    pane.querySelectorAll('[data-ticket-reply]').forEach(btn => btn.addEventListener('click', () => {
      const t = tickets.find(x => x.id === btn.dataset.ticketReply);
      if (!t) return;
      openModal(`Xử lý khiếu nại: ${t.id}`, `
        <form id="ticket-reply-form">
          <p><b>Khách:</b> ${esc(t.email)} ${t.orderId ? `· <b>Đơn:</b> ${esc(t.orderId)}` : ''}</p>
          <p><b>Nội dung:</b> ${esc(t.message)}</p>
          <div class="form-group">
            <label>Trạng thái xử lý</label>
            <select class="form-control" name="status">
              <option value="open" ${t.status === 'open' ? 'selected' : ''}>Mới tiếp nhận (open)</option>
              <option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>Đang xác minh (in_progress)</option>
              <option value="resolved" ${t.status === 'resolved' ? 'selected' : ''}>Đã giải quyết (resolved)</option>
              <option value="closed" ${t.status === 'closed' ? 'selected' : ''}>Đã đóng (closed)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Phản hồi gửi khách hàng</label>
            <textarea class="form-control" name="adminReply" rows="4" required>${esc(t.adminReply || '')}</textarea>
          </div>
          <button type="submit" class="btn btn-primary">Lưu phản hồi</button>
        </form>
      `);
      document.getElementById('ticket-reply-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
          await B().adminActionRequest('PATCH', `/api/admin/support-tickets/${encodeURIComponent(t.id)}`, {
            status: fd.get('status'),
            adminReply: fd.get('adminReply'),
          });
          closeModal();
          B().showToast('Đã cập nhật phản hồi khiếu nại!', 'success');
        } catch (err) { B().showToast(err.message, 'danger'); }
      });
    }));

    document.getElementById('policies-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const items = {};
      const visibility = {};
      for (const [k] of POLICY_KEYS) {
        items[k] = String(fd.get(`item_${k}`) || '').trim();
        visibility[k] = fd.get(`vis_${k}`) !== null;
      }
      try {
        await B().adminActionRequest('PUT', '/api/admin/policies', {
          storeInfo: {
            ...(pol.storeInfo || {}),
            name: String(fd.get('store_name') || '').trim(),
            hotline: String(fd.get('store_hotline') || '').trim() || 'Chưa cấu hình',
            email: String(fd.get('store_email') || '').trim() || 'Chưa cấu hình',
            address: String(fd.get('store_address') || '').trim() || 'Chưa cấu hình',
            hours: String(fd.get('store_hours') || '').trim(),
            social: String(fd.get('store_social') || '').trim() || 'Chưa cấu hình',
          },
          banners: { ...(pol.banners || {}), notice: String(fd.get('banner_title') || '').trim() },
          visibility,
          items,
          note: String(fd.get('note') || '').trim(),
        });
        B().showToast('Đã lưu chính sách & đồng bộ Storefront!', 'success');
      } catch (err) { B().showToast(err.message, 'danger'); }
    });
  }

  // =========================================================
  // 2.4.10 BÁO CÁO, THỐNG KÊ, CSV & NHẬT KÝ ADMIN
  // =========================================================
  function renderReports() {
    const { money, esc, formatDate } = B();
    const s = B().getState();
    const pane = document.getElementById('pane-reports');
    if (!pane) return;

    const orders = (s.orders || []).filter(o => inCustomRange(o.createdAt, reportFrom, reportTo));
    const valid = orders.filter(o => o.orderStatus !== 'cancelled');
    const paidTotal = valid
      .filter(o => o.paymentStatus === 'paid' || o.paymentStatus === 'partially_refunded')
      .reduce((sum, o) => {
        const oRefunded = (o.refunds || []).filter(r => r.status === 'success').reduce((a, r) => a + r.amount, 0);
        return sum + Math.max(0, (o.total || 0) - oRefunded);
      }, 0);
    const codUnpaid = valid.filter(o => o.paymentMethod === 'COD' && o.paymentStatus === 'unpaid').reduce((sum, o) => sum + (o.total || 0), 0);
    const shipTotal = valid.reduce((sum, o) => sum + (o.shippingFee || 0), 0);
    const discTotal = valid.reduce((sum, o) => sum + (o.discountAmount || 0), 0);
    const refundTotal = valid.reduce((sum, o) => sum + (o.refunds || []).filter(r => r.status === 'success').reduce((a, r) => a + r.amount, 0), 0);
    const logs = (s.adminActivityLogs || []).slice().reverse().slice(0, 50);

    const qs = new URLSearchParams();
    if (reportFrom) qs.set('from', reportFrom);
    if (reportTo) qs.set('to', reportTo);
    const qStr = qs.toString() ? '&' + qs.toString() : '';

    pane.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title-wrap">
            <h3 class="card-title">Báo cáo Doanh thu, Đơn hàng & Xuất CSV <span class="vp-badge-sim">Mô phỏng</span></h3>
            <span class="card-subtitle">COD chưa thu tiền được tách riêng khỏi doanh thu đã thanh toán; file CSV không xuất passwordHash/salt.</span>
          </div>
          <div class="toolbar" style="flex:0 1 auto">
            <input type="date" id="rep-from" class="select-filter" value="${esc(reportFrom)}">
            <input type="date" id="rep-to" class="select-filter" value="${esc(reportTo)}">
            <a class="btn btn-outline btn-sm" href="/api/admin/reports/export.csv?type=orders${qStr}">CSV Đơn hàng</a>
            <a class="btn btn-outline btn-sm" href="/api/admin/reports/export.csv?type=products${qStr}">CSV Sản phẩm/SKU</a>
            <a class="btn btn-outline btn-sm" href="/api/admin/reports/export.csv?type=customers${qStr}">CSV Khách hàng</a>
            <a class="btn btn-outline btn-sm" href="/api/admin/reports/export.csv?type=promotions${qStr}">CSV Khuyến mãi</a>
          </div>
        </div>
        <div class="card-body">
          <div class="stats-grid" style="margin-bottom:0">
            <div class="stat-card"><div class="stat-top"><span class="stat-label">Đơn hợp lệ / Tổng đơn</span></div><div class="stat-value">${valid.length} / ${orders.length}</div></div>
            <div class="stat-card"><div class="stat-top"><span class="stat-label">Đã thanh toán (mô phỏng)</span></div><div class="stat-value" style="color:var(--success)">${money(paidTotal)}</div></div>
            <div class="stat-card"><div class="stat-top"><span class="stat-label">COD chưa thu tiền</span></div><div class="stat-value" style="color:var(--warning)">${money(codUnpaid)}</div></div>
            <div class="stat-card"><div class="stat-top"><span class="stat-label">Giảm giá / Ship / Hoàn</span></div><div class="stat-value" style="font-size:20px">${money(discTotal)} / ${money(shipTotal)} / ${money(refundTotal)}</div></div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title-wrap"><h3 class="card-title">Nhật ký hoạt động Admin (${logs.length} gần nhất)</h3></div></div>
        <div class="table-responsive">
          <table class="admin-table">
            <thead><tr><th>Thời gian</th><th>Admin</th><th>Thao tác</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead>
            <tbody>
              ${logs.length ? logs.map(l => `<tr><td><small>${esc(formatDate(l.createdAt))}</small></td><td><strong>${esc(l.actor)}</strong></td><td><code>${esc(l.action)}</code></td><td>${esc(l.targetId || '—')}</td><td>${esc(l.detail || '')}</td></tr>`).join('') : '<tr><td colspan="5" class="text-center" style="padding:18px">Chưa có nhật ký hoạt động.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('rep-from')?.addEventListener('change', e => { reportFrom = e.target.value; renderReports(); });
    document.getElementById('rep-to')?.addEventListener('change', e => { reportTo = e.target.value; renderReports(); });
  }

  window.VPAdminModules = {
    dashboard: renderDashboard,
    products: renderProducts,
    inventory: renderInventory,
    customers: renderCustomers,
    reconciliation: renderReconciliation,
    shipping: renderShipping,
    returns: renderReturns,
    promotions: renderPromotions,
    policies: renderPolicies,
    reports: renderReports,
  };
})();
