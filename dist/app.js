(() => {
  'use strict';
  const serverMode = typeof location !== 'undefined' && ['localhost','127.0.0.1','[::1]'].includes(location.hostname) && /^https?:$/.test(location.protocol);
  const KEY = serverMode ? 'vietphuc-json-session-v1' : 'vietphuc-demo-v1';
  const images = [
    'assets/ao-dai-do.png',
    'assets/ao-dai-trang.png',
    'assets/ao-tu-than.png',
    'assets/ao-ba-ba.png',
    'assets/ao-tu-than.png',
    'assets/ao-ba-ba.png',
    'assets/ao-tu-than.png',
    'assets/ao-dai-xanh.png'
  ];
  const products = [
    {id:'p1',name:'Áo dài An Nhiên',category:'Áo dài truyền thống',price:1250000,old:1450000,color:'Đỏ trầm',material:'Lụa mềm',tag:'BÁN CHẠY',img:images[0]},
    {id:'p2',name:'Áo dài Bạch Liên',category:'Áo dài truyền thống',price:890000,color:'Trắng ngà',material:'Lụa tổng hợp',tag:'MỚI',img:images[1]},
    {id:'p3',name:'Bộ tứ thân Kinh Bắc',category:'Áo tứ thân',price:1150000,color:'Nâu đất',material:'Cotton pha',tag:'ĐƯỢC YÊU THÍCH',img:images[2]},
    {id:'p4',name:'Áo bà ba Hương Sen',category:'Áo bà ba',price:690000,color:'Hồng sen',material:'Cotton mềm',tag:'MỚI',img:images[3]},
    {id:'p5',name:'Bộ tứ thân Thương Nhớ',category:'Áo tứ thân',price:1290000,color:'Đen',material:'Cotton pha',tag:'DI SẢN VIỆT',img:images[4]},
    {id:'p6',name:'Áo bà ba Mộc Miên',category:'Áo bà ba',price:590000,color:'Hồng phấn',material:'Cotton mềm',tag:'BÁN CHẠY',img:images[5]},
    {id:'p7',name:'Bộ Việt phục Đồng Quê',category:'Áo tứ thân',price:990000,color:'Nâu đất',material:'Cotton pha',tag:'MỚI',img:images[6]},
    {id:'p8',name:'Áo dài cách tân Lụa Mộc',category:'Áo dài cách tân',price:790000,color:'Xanh nhạt',material:'Lụa tổng hợp',tag:'MỚI',img:images[7]},
    {id:'p9',name:'Mấn gấm đỏ truyền thống',category:'Phụ kiện',price:320000,color:'Đỏ trầm',material:'Gấm',tag:'MỚI',img:'assets/accessory.png',sizes:['One Size']}
  ];
  const initial = () => ({cart:[],orders:[],user:null,stock:{},visits:0,cartEvents:0});
  let state;
  try { state = {...initial(), ...JSON.parse(localStorage.getItem(KEY) || '{}')}; } catch (_) {state=initial();}
  state.stock ||= {}; state.orders ||= []; state.cart ||= [];
  if (!serverMode && !sessionStorage.getItem('vietphuc-visit')) { state.visits = (state.visits || 0) + 1; sessionStorage.setItem('vietphuc-visit','1'); }
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(serverMode ? {cart:state.cart,user:state.user} : state));}catch(e){console.warn('Không lưu được dữ liệu demo',e);}};
  save();
  let dbReady=!serverMode, dbBusy=false;
  const sharedFields=['products','orders','stock','visits','cartEvents'];
  function applyShared(data){ for(const key of sharedFields) state[key]=data[key]; if(Array.isArray(data.products))products.splice(0,products.length,...data.products); }
  function status(message,failed=false){
    let el=document.getElementById('database-status');
    if(!el){el=document.createElement('div');el.id='database-status';el.setAttribute('role','status');el.style.cssText='padding:10px 18px;text-align:center;font-size:14px;background:#f4eee8;color:#493b34';document.body.prepend(el);}
    el.textContent=message;el.style.background=failed?'#fbe5e5':'#f4eee8';
  }
  async function readDatabase(){
    const response=await fetch('/api/state',{cache:'no-store'});
    if(!response.ok)throw new Error('Không thể đọc dữ liệu từ máy chủ.');
    const result=await response.json();
    if(!result || !Number.isInteger(result.revision) || !result.state || !Array.isArray(result.state.products) || !Array.isArray(result.state.orders) || !result.state.stock || typeof result.state.stock!=='object') throw new Error('Dữ liệu máy chủ không hợp lệ.');
    return result;
  }
  async function initializeDatabase(){
    if(!serverMode)return;
    status('Đang kết nối dữ liệu JSON trên máy…');
    try{const result=await readDatabase();applyShared(result.state);dbReady=true;status('Dữ liệu đơn hàng và tồn kho lưu trong file JSON trên máy.');renderProducts();if(!sessionStorage.getItem('vietphuc-json-visit')){try{await commitShared(()=>{state.visits=(state.visits||0)+1;});sessionStorage.setItem('vietphuc-json-visit','1');}catch(error){console.warn('Chưa ghi được lượt truy cập thử nghiệm:',error.message);}}}
    catch(error){dbReady=false;status('Không kết nối được CSDL JSON. Hãy chạy npm start rồi tải lại trang; thao tác ghi đã tạm khóa.',true);}
  }
  async function refreshDatabase(){
    if(!serverMode)return;
    if(dbBusy)throw new Error('Đang lưu dữ liệu, vui lòng chờ.');
    try{const latest=await readDatabase();applyShared(latest.state);dbReady=true;status('Dữ liệu đơn hàng và tồn kho lưu trong file JSON trên máy.');renderProducts();}
    catch(error){dbReady=false;status('Không kết nối được CSDL JSON. Hãy chạy npm start rồi tải lại trang; thao tác ghi đã tạm khóa.',true);throw new Error('Không thể tải dữ liệu. Hãy kiểm tra máy chủ và thử lại.');}
  }
  async function commitShared(mutate){
    if(!serverMode){const result=mutate();renderProducts();save();return result;}
    if(!dbReady)throw new Error('Chưa kết nối CSDL. Hãy chạy npm start và tải lại trang.');
    if(dbBusy)throw new Error('Đang lưu dữ liệu, vui lòng chờ.');
    dbBusy=true;let before;
    try{
      const latest=await readDatabase();applyShared(latest.state);
      before=JSON.parse(JSON.stringify(latest.state));
      const result=mutate();
      const payload=Object.fromEntries(sharedFields.map(key=>[key,state[key]]));
      const response=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:latest.revision,state:payload})});
      if(response.status===409){const conflict=await response.json();applyShared(conflict.state);renderProducts();throw new Error('Dữ liệu vừa được thay đổi ở phiên khác. Vui lòng kiểm tra lại và thực hiện lại.');}
      if(!response.ok)throw new Error('Máy chủ không lưu được dữ liệu.');
      const saved=await response.json();applyShared(saved.state);renderProducts();save();return result;
    }catch(error){
      if(before && !/phiên khác/.test(error.message))applyShared(before);
      if(error instanceof TypeError){dbReady=false;status('Mất kết nối CSDL. Hãy chạy lại máy chủ và tải trang để kiểm tra dữ liệu trước khi thử lại.',true);throw new Error('Mất kết nối trong lúc lưu. Hãy tải lại trang và kiểm tra đơn hàng trước khi thử lại.');}
      renderProducts();throw error;
    }finally{dbBusy=false;}
  }
  let category='Tất cả', search='', sort='featured', selectedSize='M', selectedProduct=null, adminLogged=false;
  let filters={sizes:[],colors:[],prices:[]};
  const sizesFor=p=>p.sizes || ['S','M','L','XL'];
  const colors={'Đỏ trầm':'#80252c','Trắng ngà':'#f3eee2','Nâu đất':'#805d48','Hồng sen':'#dd8a99','Đen':'#242424','Hồng phấn':'#eac5c9','Xanh nhạt':'#a9c9cb'};
  const priceRanges=[['under500','Dưới 500.000đ',0,500000],['500to1m','500.000đ - 1.000.000đ',500000,1000000],['1to2m','1.000.000đ - 2.000.000đ',1000000,2000000],['2to3m','2.000.000đ - 3.000.000đ',2000000,3000000],['over3m','Từ 3.000.000đ',3000000,Infinity]];
  // Ngày thêm minh họa của dữ liệu sản phẩm trong bản trình diễn.
  const addedDates=['2026-01-10','2026-03-14','2026-02-02','2026-04-05','2026-01-21','2026-02-25','2026-05-12','2026-06-08','2026-07-01'];
  products.forEach((p,i)=>p.addedAt=addedDates[i]);
  const money=n=>new Intl.NumberFormat('vi-VN').format(n)+'₫';
  const esc=s=>String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const find=id=>products.find(p=>p.id===id);
  const key=(id,size)=>id+'|'+size;
  const available=(id,size)=>state.stock[key(id,size)] ?? 8;
  const changeStock=(id,size,n)=>{state.stock[key(id,size)]=Math.max(0,available(id,size)+n);};
  const cartCount=()=>state.cart.reduce((s,i)=>s+i.qty,0);
  const subtotal=()=>state.cart.reduce((s,i)=>s+(find(i.id)?.price||0)*i.qty,0);
  function quantityInCart(id, size) {
    return state.cart.reduce((total, item) =>
      item.id === id && item.size === size ? total + item.qty : total, 0);
  }

  function cartStockIssue(item) {
    const product = find(item.id);
    if (!product || !sizesFor(product).includes(item.size)) return 'Lựa chọn này đã ngừng bán.';
    const stock = available(item.id, item.size);
    if (stock < 1) return 'Size này đã hết hàng.';
    if (quantityInCart(item.id, item.size) > stock) return `Chỉ còn ${stock} sản phẩm ở size này. Vui lòng giảm số lượng.`;
    return '';
  }

  function updateCount(){document.querySelectorAll('#cart-count,[data-cart-count]').forEach(x=>x.textContent=cartCount());}
  function catalogStock(product) {
    const sizes = sizesFor(product);
    const inStock = sizes.filter(size => available(product.id, size) > 0);
    if (!inStock.length) return '<p class="vp-stock vp-stock-out">Hết hàng</p>';
    if (sizes.length === 1) return '<p class="vp-stock vp-stock-in">Còn hàng</p>';

    const outOfStock = sizes.filter(size => !inStock.includes(size));
    return `<p class="vp-stock">
      <span class="vp-stock-in">Còn hàng: ${esc(inStock.join(', '))}</span>
      ${outOfStock.length ? `<span class="vp-stock-out">Hết size: ${esc(outOfStock.join(', '))}</span>` : ''}
    </p>`;
  }

  function normalizeSearch(value) {
    return value.toLocaleLowerCase('vi').normalize('NFD')
      .replace(/\p{M}/gu, '').replace(/đ/g, 'd').trim().replace(/\s+/g, ' ');
  }

  function matchesSearch(product, query) {
    return normalizeSearch(product.name).includes(query) ||
      normalizeSearch(product.category).includes(query);
  }

  function searchSuggestions(value = '') {
    const query = normalizeSearch(value);
    const categories = [...new Set(products.map(product => product.category))]
      .filter(name => normalizeSearch(name).includes(query));
    const results = products.filter(product => matchesSearch(product, query)).slice(0, 4);
    if (!categories.length && !results.length) {
      return '<p class="vp-muted">Không tìm thấy tên sản phẩm hoặc danh mục phù hợp.</p>';
    }
    return `
      ${categories.length ? `<h3>Danh mục</h3><div class="vp-search-categories">${categories.map(name =>
        `<button type="button" data-action="search-category" data-name="${esc(name)}">${esc(name)}</button>`).join('')}</div>` : ''}
      ${results.length ? `<h3>${query ? 'Sản phẩm phù hợp' : 'Sản phẩm gợi ý'}</h3>${results.map(product =>
        `<button type="button" class="vp-search-product" data-action="product" data-id="${esc(product.id)}">
          <img src="${esc(product.img)}" alt=""><span><b>${esc(product.name)}</b><small>${money(product.price)}</small></span>
        </button>`).join('')}` : ''}`;
  }

  function showSearchResults(query, selectedCategory = 'Tất cả') {
    search = query.trim();
    category = selectedCategory;
    filters = {sizes:[], colors:[], prices:[]};
    close();
    renderProducts();
    document.getElementById('product-grid')?.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function renderProducts(){
    const grid=document.getElementById('product-grid'); if(!grid) return;
    const query = normalizeSearch(search);
    let list=products.filter(p=>(category==='Tất cả'||p.category===category)
      && matchesSearch(p, query)
      && (!filters.sizes.length || filters.sizes.some(s=>sizesFor(p).includes(s)&&available(p.id,s)>0))
      && (!filters.colors.length || filters.colors.includes(p.color))
      && (!filters.prices.length || priceRanges.some(([id,,min,max])=>filters.prices.includes(id)&&p.price>=min&&p.price<max)));
    if(sort==='price-asc') list.sort((a,b)=>a.price-b.price);
    if(sort==='price-desc') list.sort((a,b)=>b.price-a.price);
    if(sort==='newest') list.sort((a,b)=>b.addedAt.localeCompare(a.addedAt));
    const count=document.querySelector('[data-product-count]');if(count) count.textContent=list.length+' sản phẩm';
    const summary=document.getElementById('filter-summary');if(summary) summary.textContent=list.length+' sản phẩm'+(filters.sizes.length+filters.colors.length+filters.prices.length?' · '+(filters.sizes.length+filters.colors.length+filters.prices.length)+' lựa chọn lọc':'');
    const searchInput=document.getElementById('catalog-search');if(searchInput && searchInput.value!==search)searchInput.value=search;
    const categoryInput=document.getElementById('catalog-category');if(categoryInput)categoryInput.value=category;
    const sortInput=document.getElementById('catalog-sort');if(sortInput)sortInput.value=sort;
    grid.innerHTML=list.length?list.map((p,i)=>`<article class="vp-product"><button class="vp-product-image" data-action="product" data-id="${p.id}" aria-label="Xem ${esc(p.name)}"><img src="${p.img}" alt="${esc(p.name)}" loading="${i<4?'eager':'lazy'}"><span class="vp-product-tag">${p.tag}</span><span class="vp-product-view">KHÁM PHÁ SẢN PHẨM</span></button><div class="vp-product-info"><div class="vp-product-category">${esc(p.category)}</div><button class="vp-product-name" data-action="product" data-id="${p.id}">${esc(p.name)}</button><div class="vp-product-price">${money(p.price)} ${p.old?`<del>${money(p.old)}</del>`:''}</div><div class="vp-swatches"><span style="background:${colors[p.color]||'#aaa'}"></span><small>${esc(p.color)}</small></div>${catalogStock(p)}</div></article>`).join(''):'<p class="vp-empty">Không tìm thấy sản phẩm phù hợp. Hãy thử thay đổi từ khóa hoặc bộ lọc.</p>';
    document.querySelectorAll('[data-category]').forEach(el=>el.classList.toggle('active',el.dataset.category===category));
  }
  const css=`
  .vp-product{min-width:0}.vp-product-image{position:relative;display:block;width:100%;aspect-ratio:3/4;border:0;padding:0;background:#ede9e3;overflow:hidden;cursor:pointer}.vp-product-image img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .6s}.vp-product-image:hover img{transform:scale(1.04)}.vp-product-tag{position:absolute;left:12px;top:12px;background:#f8f6f0;padding:6px 8px;font:600 9px Arial;letter-spacing:.08em}.vp-product-view{position:absolute;bottom:0;left:0;right:0;padding:14px;color:white;background:#25231f;font:600 10px Arial;letter-spacing:.1em;transform:translateY(100%);transition:.25s}.vp-product-image:hover .vp-product-view{transform:translateY(0)}.vp-product-info{padding:15px 0 23px}.vp-product-category{font-size:11px;color:#8f8980;margin-bottom:7px}.vp-product-name{border:0;background:none;padding:0;text-align:left;cursor:pointer;font-size:14px;font-weight:600;color:#25231f}.vp-product-price{font-size:14px;margin-top:8px;font-weight:600}.vp-product-price del{font-weight:400;color:#aaa;margin-left:7px}.vp-swatches{display:flex;align-items:center;gap:7px;margin-top:11px;color:#928a80}.vp-swatches span{width:13px;height:13px;border-radius:50%;background:#8f5147;border:2px solid white;outline:1px solid #b8a79e}.vp-swatches small{font-size:10px}.vp-overlay{position:fixed;inset:0;z-index:9999;background:rgba(26,24,21,.5);display:flex;justify-content:flex-end;align-items:stretch}.vp-overlay.center{align-items:center;justify-content:center;padding:24px}.vp-panel{background:#fcfbf8;color:#292824;width:min(100%,510px);height:100%;overflow:auto;box-shadow:0 12px 48px #0002;font-family:Arial,sans-serif}.vp-overlay.center .vp-panel{width:min(100%,900px);height:auto;max-height:90vh}.vp-head{position:sticky;top:0;background:#fcfbf8;z-index:2;display:flex;justify-content:space-between;align-items:center;padding:23px 26px;border-bottom:1px solid #e9e6df}.vp-head h2{font:400 25px Georgia,serif;margin:0}.vp-close{font-size:26px;line-height:1;border:0;background:none;cursor:pointer;color:#222}.vp-body{padding:26px}.vp-body p{line-height:1.65}.vp-muted{font-size:12px;color:#807b72;line-height:1.6}.vp-note{background:#f2eee5;padding:13px 15px;font-size:12px;line-height:1.6;margin:15px 0}.vp-btn{display:inline-flex;justify-content:center;align-items:center;gap:8px;border:1px solid #272621;background:#272621;color:white;padding:14px 18px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;cursor:pointer;text-decoration:none}.vp-btn:hover{background:#5a3a33}.vp-btn.secondary{background:transparent;color:#25231f}.vp-btn:disabled{opacity:.4;cursor:not-allowed}.vp-full{width:100%;margin-top:12px}.vp-form label{font-size:12px;font-weight:600;display:block;margin:16px 0 7px}.vp-form input,.vp-form select,.vp-form textarea,.vp-input{width:100%;border:1px solid #d9d5cc;background:#fff;padding:13px;font:14px Arial;color:#292824;border-radius:0;box-sizing:border-box}.vp-form textarea{min-height:80px;resize:vertical}.vp-row{display:flex;justify-content:space-between;gap:12px;align-items:center}.vp-line{border-top:1px solid #e9e6df;margin:20px 0}.vp-item{display:flex;gap:16px;padding:16px 0;border-bottom:1px solid #eeeae3}.vp-item img{width:80px;height:105px;object-fit:cover;background:#eee}.vp-item-info{flex:1;min-width:0}.vp-item h3{font-size:14px;margin:2px 0 8px}.vp-item p{font-size:12px;color:#827c74;margin:5px 0}.vp-link{border:0;background:none;padding:0;text-decoration:underline;cursor:pointer;font-size:12px;color:#5d544d}.vp-qty{display:inline-flex;border:1px solid #ddd;align-items:center;margin-top:8px}.vp-qty button{border:0;background:none;padding:7px 11px;cursor:pointer}.vp-qty span{font-size:12px}.vp-detail{display:grid;grid-template-columns:1fr 1fr}.vp-detail img{width:100%;height:100%;max-height:680px;object-fit:cover}.vp-detail-info{padding:35px}.vp-detail h3{font:400 32px Georgia,serif;margin:10px 0 14px}.vp-detail-price{font-size:20px;font-weight:bold}.vp-size{display:flex;gap:8px;margin:12px 0}.vp-size button{background:white;border:1px solid #d5d0c8;min-width:42px;height:42px;cursor:pointer}.vp-size button.active{background:#272621;color:white;border-color:#272621}.vp-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 20px}.vp-tabs button{background:none;border:1px solid #ded9d0;padding:9px;cursor:pointer;font-size:11px}.vp-tabs button.active{background:#292824;color:white}.vp-order{border:1px solid #e3dfd7;padding:16px;margin:12px 0}.vp-order h3{font-size:14px;margin:0}.vp-order p{font-size:12px;margin:6px 0}.vp-status{display:inline-block;background:#e9eee5;color:#415b3f;padding:6px 8px;font-size:10px}.vp-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.vp-stat{background:#f2eee7;padding:15px}.vp-stat strong{display:block;font:24px Georgia;margin-top:8px}.vp-toast{position:fixed;bottom:25px;left:50%;transform:translateX(-50%);z-index:10001;background:#292824;color:white;padding:14px 22px;font:13px Arial;box-shadow:0 5px 20px #0003}.vp-empty{color:#817a70;padding:35px 0;font-size:14px}.vp-product-image img{color:#80796f}.vp-inline-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}@media(max-width:650px){.vp-overlay.center{padding:0;align-items:stretch}.vp-overlay.center .vp-panel{height:100%;max-height:none}.vp-detail{grid-template-columns:1fr}.vp-detail img{max-height:380px}.vp-detail-info{padding:24px}.vp-stats{grid-template-columns:1fr 1fr}.vp-body{padding:20px}.vp-head{padding:20px}}
  `;
  const filterCss=`
    .vp-stock{display:flex;flex-wrap:wrap;gap:3px 10px;font-size:13px;margin:7px 0 0}.vp-stock-in{color:#21603d;font-weight:600}.vp-stock-out{color:#912d37;font-weight:600}.vp-filter-form{display:flex;flex-direction:column;min-height:calc(100% - 76px);background:#fff}.vp-filter-content{flex:1;padding:12px 28px 25px}.vp-filter-group{border:0;border-bottom:1px solid #eee8e4;padding:14px 0 22px;margin:0}.vp-filter-group summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-size:15px;font-weight:600;letter-spacing:.04em;padding:5px 0 13px}.vp-filter-group summary::-webkit-details-marker{display:none}.vp-filter-group summary:after{content:'⌃';font-size:16px}.vp-filter-group:not([open]) summary:after{content:'⌄'}.vp-filter-check{display:flex;align-items:center;justify-content:space-between;gap:16px;font-size:14px;padding:6px 0;cursor:pointer}.vp-filter-check input{width:17px;height:17px;accent-color:#26211f;cursor:pointer}.vp-filter-check:has(input:disabled){color:#aaa;cursor:not-allowed}.vp-color-grid{display:flex;flex-wrap:wrap;gap:10px;padding:4px 0}.vp-color-choice{display:inline-flex;position:relative;cursor:pointer}.vp-color-choice input{position:absolute;width:1px;height:1px;opacity:0}.vp-color-choice span{display:block;width:29px;height:29px;background:var(--swatch);border:3px solid white;border-radius:50%;box-shadow:0 0 0 1px #c9c9c9}.vp-color-choice input:checked+span{box-shadow:0 0 0 2px #251f1d}.vp-color-choice input:focus-visible+span{outline:2px solid #70272e;outline-offset:4px}.vp-filter-actions{position:sticky;bottom:0;display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#fff;padding:16px 28px;border-top:1px solid #eee}.vp-filter-actions .vp-btn{width:100%;padding:13px 8px;min-height:46px}.vp-filter-hint{font-size:12px;color:#777;line-height:1.6;margin:4px 0 12px}@media(max-width:520px){.vp-filter-content{padding-left:18px;padding-right:18px}.vp-filter-actions{padding:12px 18px}.vp-filter-group summary{font-size:14px}}
  `;
  const productDetailCss = `
    .vp-search-suggestions{margin-top:24px}
    .vp-search-suggestions h3{margin:16px 0 8px;font-size:15px}
    .vp-search-categories{display:flex;flex-wrap:wrap;gap:8px}
    .vp-search-categories button{background:#fff;border:1px solid #ded7cf;border-radius:16px;color:#362d28;padding:7px 12px;cursor:pointer;text-align:left}
    .vp-search-product{width:100%;display:flex;align-items:center;gap:12px;padding:10px 0;background:none;border:0;border-bottom:1px solid #eee8e4;text-align:left;color:#26211f;cursor:pointer}
    .vp-search-product img{width:44px;height:55px;object-fit:cover;border-radius:4px}
    .vp-search-product span{min-width:0;overflow-wrap:anywhere}
    .vp-search-product small{display:block;margin-top:4px;color:#615b56}
    .vp-search-product:hover,.vp-search-categories button:hover{background:#f3ece5}
    .vp-policy-menu{display:grid;gap:8px}
    .vp-policy-menu button{width:100%;justify-content:flex-start;text-align:left;line-height:1.35}
    .vp-detail-info{min-width:0}
    .vp-product-quantity{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:12px 0}
    .vp-product-quantity input{width:5rem;padding:7px}
    .vp-cart-prices{display:flex;flex-wrap:wrap;gap:4px 12px;margin:6px 0}
    .vp-qty button:disabled{opacity:.5;cursor:not-allowed}
    .vp-detail-price del{margin-left:8px;font-size:.85em;color:#6c6260;font-weight:400}
    .vp-detail-price .vp-promo{color:#912d37;font-size:.8em;margin-left:8px}
    .vp-detail .vp-size{flex-wrap:wrap}
    .vp-detail .vp-size button:disabled{opacity:.55;cursor:not-allowed}
    .vp-detail-section{border-top:1px solid #eee8e4;padding-top:12px;margin-top:16px}
    .vp-detail-section summary{cursor:pointer;font-weight:600}
    .vp-detail-section table{width:100%;border-collapse:collapse;font-size:.875rem;margin-top:10px}
    .vp-detail-section th,.vp-detail-section td{padding:8px 4px;text-align:left;border-bottom:1px solid #eee8e4}
    .vp-detail-section dl{margin:10px 0 0}
    .vp-detail-section dt{font-weight:600;margin-top:8px}
    .vp-detail-section dd{margin:3px 0 0}
  `;
  const style=document.createElement('style');style.textContent=css+filterCss+productDetailCss;document.head.appendChild(style);
  const toast=msg=>{document.querySelector('.vp-toast')?.remove();let t=document.createElement('div');t.className='vp-toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),3000);};
  function modal(title,body,center=false){document.querySelector('.vp-overlay')?.remove();let el=document.createElement('div');el.className='vp-overlay'+(center?' center':'');el.innerHTML=`<section class="vp-panel" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="vp-head"><h2>${esc(title)}</h2><button class="vp-close" data-action="close" aria-label="Đóng">×</button></div>${body}</section>`;document.body.appendChild(el);document.body.style.overflow='hidden';}
  function close(){document.querySelector('.vp-overlay')?.remove();document.body.style.overflow='';}
  function openFilters(){
    const allSizes=['XS','S','M','L','XL','XXL','Freesize','One Size'];
    const sizeRows=allSizes.map(s=>{const offered=products.some(p=>sizesFor(p).includes(s)&&available(p.id,s)>0);return `<label class="vp-filter-check"><span>${esc(s)}</span><input type="checkbox" name="sizes" value="${esc(s)}" ${filters.sizes.includes(s)?'checked':''} ${!offered&&!filters.sizes.includes(s)?'disabled':''}></label>`;}).join('');
    const colorRows=Object.entries(colors).map(([name,color])=>`<label class="vp-color-choice" title="${esc(name)}"><input type="checkbox" name="colors" value="${esc(name)}" aria-label="${esc(name)}" ${filters.colors.includes(name)?'checked':''}><span style="--swatch:${color}"></span></label>`).join('');
    const priceRows=priceRanges.map(([id,label])=>`<label class="vp-filter-check"><span>${label}</span><input type="checkbox" name="prices" value="${id}" ${filters.prices.includes(id)?'checked':''}></label>`).join('');
    modal('Bộ lọc sản phẩm',`<form class="vp-filter-form" data-form="filters"><div class="vp-filter-content"><p class="vp-filter-hint">Chọn một hoặc nhiều giá trị trong mỗi nhóm.</p><details class="vp-filter-group" open><summary>KÍCH THƯỚC</summary>${sizeRows}</details><details class="vp-filter-group" open><summary>MÀU SẮC</summary><div class="vp-color-grid">${colorRows}</div></details><details class="vp-filter-group" open><summary>KHOẢNG GIÁ</summary>${priceRows}</details></div><div class="vp-filter-actions"><button type="button" class="vp-btn secondary" data-action="filter-reset">XÓA BỘ LỌC</button><button type="submit" class="vp-btn">XEM KẾT QUẢ</button></div></form>`);
    document.querySelector('.vp-overlay .vp-close')?.focus();
  }
  const sizeWeights = {S:'40–47 kg', M:'48–54 kg', L:'55–61 kg', XL:'62–68 kg'};

  function detail(id) {
    const product = find(id);
    if (!product) return;
    const sizes = sizesFor(product);
    selectedProduct = id;
    selectedSize = sizes.find(size => size === 'M' && available(id, size) > 0) ||
      sizes.find(size => available(id, size) > 0) || sizes[0];
    renderDetail();
  }

  function renderDetail() {
    const product = find(selectedProduct);
    if (!product) return;
    const sizes = sizesFor(product);
    const accessory = product.category === 'Phụ kiện';
    const stock = available(product.id, selectedSize);
    const remaining = Math.max(0, stock - quantityInCart(product.id, selectedSize));
    const promotion = product.old > product.price;
    const description = product.description || (accessory
      ? `${product.name} màu ${product.color}, chất liệu ${product.material}, dùng để phối cùng trang phục truyền thống.`
      : `${product.name} thuộc dòng ${product.category.toLocaleLowerCase('vi')}, màu ${product.color}, chất liệu ${product.material}.`);
    const included = product.included || (accessory
      ? `Sản phẩm: ${product.name}. Kích thước dùng chung.`
      : 'Danh sách các món và phụ kiện kèm theo cần được cửa hàng xác nhận trước khi đặt.');
    const care = product.care || (accessory
      ? 'Lau nhẹ bằng khăn mềm. Tránh ngâm nước và cất ở nơi khô ráo.'
      : 'Ưu tiên hướng dẫn trên nhãn. Giặt nhẹ bằng tay với nước mát, tránh ngâm lâu và phơi dưới nắng gắt. Cất ở nơi khô ráo.');

    modal('Chi tiết sản phẩm', `<div class="vp-detail">
      <img src="${esc(product.img)}" alt="${esc(product.name)}">
      <div class="vp-detail-info">
        <div class="vp-muted">${esc(product.category)} / VIỆT PHỤC</div>
        <h3>${esc(product.name)}</h3>
        <div class="vp-detail-price">
          ${promotion ? '<span class="vp-promo">Giá khuyến mãi</span>' : ''}
          ${money(product.price)}
          ${promotion ? `<del aria-label="Giá gốc ${money(product.old)}">${money(product.old)}</del>` : ''}
        </div>
        <p>${esc(description)}</p>
        <p><b>Chất liệu:</b> ${esc(product.material)}<br><b>Màu sắc:</b> ${esc(product.color)}</p>
        <p><b>Kích thước:</b> ${esc(selectedSize)}</p>
        <div class="vp-size" role="group" aria-label="Chọn kích thước">
          ${sizes.map(size => {
            const soldOut = available(product.id, size) < 1;
            return `<button type="button" class="${size === selectedSize ? 'active' : ''}"
              data-action="size" data-size="${esc(size)}" aria-pressed="${size === selectedSize}"
              ${soldOut ? 'disabled' : ''}>${esc(size)}${soldOut ? ' · Hết' : ''}</button>`;
          }).join('')}
        </div>
        <p class="${stock > 0 ? 'vp-stock-in' : 'vp-stock-out'}">${stock > 0 ? `Còn ${stock} sản phẩm ở size ${esc(selectedSize)}` : 'Hết hàng'}</p>
        ${remaining > 0 ? `<div class="vp-product-quantity">
          <label for="product-quantity">Số lượng</label>
          <input id="product-quantity" type="number" min="1" max="${remaining}" step="1" value="1" required>
        </div>` : stock > 0 ? '<p class="vp-note">Bạn đã thêm đủ số lượng hiện có của size này vào giỏ.</p>' : ''}
        <button class="vp-btn vp-full" data-action="add" ${remaining < 1 ? 'disabled' : ''}>THÊM VÀO GIỎ HÀNG</button>
        <button class="vp-btn secondary vp-full" data-action="buy" ${remaining < 1 ? 'disabled' : ''}>MUA NGAY</button>

        <details class="vp-detail-section" open>
          <summary>Hướng dẫn chọn size</summary>
          ${accessory ? '<p>Kích thước dùng chung (One Size).</p>' : '<p>Cân nặng chỉ dùng để tham khảo.</p>'}
          <table>
            <thead><tr><th scope="col">Size</th><th scope="col">Cân nặng tham khảo</th><th scope="col">Còn lại</th></tr></thead>
            <tbody>${sizes.map(size => `<tr><th scope="row">${esc(size)}</th><td>${esc(sizeWeights[size] || '—')}</td><td>${available(product.id, size) || 'Hết hàng'}</td></tr>`).join('')}</tbody>
          </table>
        </details>
        <details class="vp-detail-section">
          <summary>Sản phẩm và phụ kiện đi kèm</summary>
          <p>${esc(included)}</p>
        </details>
        <details class="vp-detail-section">
          <summary>Sử dụng, giặt và bảo quản</summary>
          <p>${esc(care)}</p>
        </details>
        <details class="vp-detail-section">
          <summary>Giao hàng, đổi trả và bảo hành</summary>
          <dl>
            <dt>Giao hàng</dt><dd>Tiêu chuẩn 30.000₫ hoặc giao nhanh 45.000₫ (mô phỏng). Chọn phương thức khi đặt hàng.</dd>
            <dt>Đổi trả</dt><dd>Sau khi nhận hàng, mở Chi tiết đơn hàng để gửi yêu cầu đổi size hoặc trả hàng trong 7 ngày.</dd>
            <dt>Bảo hành</dt><dd>${esc(product.warranty || 'Chính sách bảo hành cho sản phẩm này đang chờ cửa hàng xác nhận.')}</dd>
          </dl>
        </details>
      </div></div>`, true);
  }
  async function add() {
    try {
      const productId = selectedProduct;
      const size = selectedSize;
      const input = document.getElementById('product-quantity');
      const quantity = input ? Number(input.value) : 1;
      if (!Number.isSafeInteger(quantity) || quantity < 1) {
        throw new Error('Vui lòng nhập số lượng nguyên từ 1 trở lên.');
      }
      await commitShared(() => {
        const product = find(productId);
        if (!product || !sizesFor(product).includes(size)) throw new Error('Size này không còn bán.');
        const remaining = available(productId, size) - quantityInCart(productId, size);
        if (quantity > remaining) throw new Error(`Bạn có thể thêm tối đa ${Math.max(0, remaining)} sản phẩm ở size này.`);
        state.cartEvents = (state.cartEvents || 0) + 1;
      });
      const existing = state.cart.find(item => item.id === productId && item.size === size);
      if (existing) existing.qty += quantity;
      else state.cart.push({id:productId, size, qty:quantity});
      save();
      updateCount();
      return true;
    } catch (error) {
      toast(error.message);
      return false;
    }
  }

  function cart() {
    if (!state.cart.length) {
      modal('Giỏ hàng của bạn', `<div class="vp-body"><p class="vp-empty">Giỏ hàng của bạn đang trống.</p>
        <button class="vp-btn vp-full" data-action="close">TIẾP TỤC MUA SẮM</button></div>`);
      return;
    }
    const items = state.cart.map((item, index) => {
      const product = find(item.id);
      const issue = cartStockIssue(item);
      return `<div class="vp-item">
        ${product ? `<img src="${esc(product.img)}" alt="">` : ''}
        <div class="vp-item-info">
          <h3>${esc(product?.name || 'Sản phẩm không còn bán')}</h3>
          <p>${esc(product?.color)} · Size ${esc(item.size)}</p>
          ${product ? `<div class="vp-cart-prices"><span>Đơn giá: ${money(product.price)}</span>
            <b>Thành tiền: ${money(product.price * item.qty)}</b></div>` : ''}
          ${issue ? `<p class="vp-stock-out">${esc(issue)}</p>` : ''}
          <div class="vp-row">
            <div class="vp-qty">
              <button data-action="qty" data-index="${index}" data-delta="-1" aria-label="Giảm số lượng" ${item.qty <= 1 ? 'disabled' : ''}>−</button>
              <span>${item.qty}</span>
              <button data-action="qty" data-index="${index}" data-delta="1" aria-label="Tăng số lượng"
                ${issue || quantityInCart(item.id, item.size) >= available(item.id, item.size) ? 'disabled' : ''}>+</button>
            </div>
            <button class="vp-link" data-action="remove" data-index="${index}">Xóa</button>
          </div>
        </div>
      </div>`;
    }).join('');
    modal('Giỏ hàng của bạn', `<div class="vp-body">${items}
      <div class="vp-row" style="margin-top:24px"><b>Tổng tiền hàng</b><b>${money(subtotal())}</b></div>
      <p class="vp-muted">Phí vận chuyển được tính tại bước thanh toán.</p>
      <button class="vp-btn vp-full" data-action="checkout" ${state.cart.some(cartStockIssue) ? 'disabled' : ''}>TIẾN HÀNH THANH TOÁN →</button>
      <button class="vp-btn secondary vp-full" data-action="close">TIẾP TỤC MUA SẮM</button>
    </div>`);
  }

  function account(){modal('Tài khoản',`<div class="vp-body">${state.user?`<p>Xin chào, <b>${esc(state.user.name)}</b></p><p class="vp-muted">${esc(state.user.email)}</p><button class="vp-btn vp-full" data-action="orders">ĐƠN HÀNG CỦA TÔI</button><button class="vp-btn secondary vp-full" data-action="logout">ĐĂNG XUẤT</button>`:`<p>Chào mừng bạn đến với Việt Phục.</p><div class="vp-note">Đây là danh tính dùng thử, không có mật khẩu hay xác thực. ${serverMode?'Đơn hàng lưu trong file JSON trên máy.':'Dữ liệu chỉ lưu trên trình duyệt này.'} Vui lòng không nhập thông tin thật hoặc mật khẩu.</div><form class="vp-form" data-form="login"><label>Họ và tên</label><input name="name" required placeholder="Tên của bạn"><label>Email dùng thử</label><input name="email" type="email" required placeholder="ban@example.com"><button class="vp-btn vp-full">TIẾP TỤC</button></form>`}</div>`);}
  async function checkout(){
    try { await refreshDatabase(); } catch (error) { toast(error.message); return; }
    if (state.cart.some(cartStockIssue)) {
      cart();
      toast('Tồn kho đã thay đổi. Vui lòng kiểm tra giỏ hàng.');
      return;
    }
    if(!state.cart.length){cart();return;}if(!state.user){toast('Vui lòng tạo tài khoản dùng thử trước khi đặt hàng.');account();return;}modal('Thông tin đặt hàng',`<div class="vp-body"><div class="vp-note">ĐƠN HÀNG THỬ NGHIỆM · Không có giao dịch hay vận chuyển thực tế. Vui lòng không nhập thông tin thật.</div><form class="vp-form" data-form="checkout"><label>Người nhận</label><input name="receiver" required value="${esc(state.user.name)}"><label>Số điện thoại dùng thử</label><input name="phone" required placeholder="Ví dụ: 0900000000"><label>Địa chỉ nhận hàng dùng thử</label><input name="address" required placeholder="Số nhà, đường, phường/xã, tỉnh/thành"><label>Vận chuyển</label><select name="shipping"><option value="30000">Giao hàng tiêu chuẩn · 30.000₫</option><option value="45000">Giao hàng nhanh · 45.000₫</option></select><label>Phương thức thanh toán</label><select name="payment"><option value="COD">Thanh toán khi nhận hàng (COD mô phỏng)</option><option value="online">Thanh toán trực tuyến mô phỏng</option></select><div class="vp-line"></div><div class="vp-row"><span>Tiền hàng</span><b>${money(subtotal())}</b></div><div class="vp-row"><span>Phí giao hàng</span><b data-checkout-shipping>${money(30000)}</b></div><div class="vp-row"><strong>Tổng thanh toán</strong><strong data-checkout-total>${money(subtotal()+30000)}</strong></div><label><input type="checkbox" required style="width:auto"> Tôi đồng ý với điều kiện mua hàng và chính sách đổi trả thử nghiệm.</label><button class="vp-btn vp-full">XÁC NHẬN ĐẶT HÀNG</button><button class="vp-btn secondary vp-full" type="button" data-action="open-cart">QUAY LẠI GIỎ HÀNG</button></form></div>`);}
  function orders(){let list=state.orders.filter(o=>o.email===state.user?.email);modal('Đơn hàng của tôi',`<div class="vp-body"><p class="vp-muted">${serverMode?'Đơn thử nghiệm được lưu trong file JSON trên máy.':'Thông tin chỉ được lưu trên trình duyệt này.'}</p>${list.length?list.slice().reverse().map(o=>orderCard(o,false)).join(''):'<p class="vp-empty">Bạn chưa có đơn hàng nào.</p>'}</div>`);}
  function orderCard(o,admin,detail=false){return `<div class="vp-order"><div class="vp-row"><h3>${esc(o.id)}</h3><span class="vp-status">${esc(o.status)}</span></div><p>${esc(o.date)} · ${money(o.total)}</p><p>${o.items.map(i=>`${esc(i.name)} (${i.size}) × ${i.qty}`).join('<br>')}</p><p>Thanh toán: ${esc(o.paymentStatus)} · Vận chuyển: ${esc(o.shipStatus)}</p>${o.cancellation?`<p>Yêu cầu hủy: ${esc(o.cancellation.status)}</p>`:''}${o.supportMessages?.length?`<p>Hỗ trợ: ${o.supportMessages.at(-1).role==='admin'?'Đã phản hồi':'Chờ phản hồi'}</p>`:''}${o.returnStatus?`<p>Đổi trả: ${esc(o.returnStatus)}</p>`:''}<p>Địa chỉ: ${esc(o.address)}</p><p>Phương thức: ${o.payment==='online'?'Trực tuyến (mô phỏng)':'COD (mô phỏng)'}</p><div class="vp-inline-actions">${!admin&&!detail?`<button class="vp-link" data-action="order-detail" data-id="${esc(o.id)}">Xem chi tiết</button>`:''}${!admin&&detail&&o.status==='Chờ xác nhận'&&o.inventory==='reserved'&&!cancellationPending(o)&&o.paymentStatus!=='Thanh toán thành công'?`<button class="vp-link" data-action="edit-order" data-id="${esc(o.id)}">Sửa đơn hàng</button>`:''}${!admin&&detail&&canRequestCancellation(o)?`<button class="vp-link" data-action="cancel" data-id="${o.id}">Yêu cầu hủy đơn</button>`:''}${!admin&&detail&&canPayOnline(o)?`<button class="vp-link" data-action="retry" data-id="${o.id}">${o.paymentStatus==='Thanh toán thất bại'?'Thanh toán lại':'Tiếp tục thanh toán'}</button>`:''}${!admin&&detail&&canRequestReturn(o)?`<button class="vp-link" data-action="return" data-id="${o.id}">Yêu cầu đổi trả</button>`:''}${admin&&!detail?`<button class="vp-link" data-action="admin-order" data-id="${o.id}">Xử lý đơn →</button>`:''}</div></div>`;}
  function orderDetail(id) {
    const order = state.orders.find(item => item.id === id && item.email === state.user?.email);
    if (!order) { toast('Không tìm thấy đơn hàng.'); return; }
    modal('Chi tiết đơn hàng', `<div class="vp-body">${orderCard(order,false,true)}
      <section class="vp-order">
        <h3>Thông tin giao hàng</h3>
        <p>Người nhận: ${esc(order.receiver)} · ${esc(order.phone)}</p>
        ${Number.isFinite(order.shippingFee) ? `<p>Tiền hàng: ${money(order.total - order.shippingFee)} · Phí giao hàng: ${money(order.shippingFee)}</p>` : ''}
      </section>
      ${order.returnStatus ? returnSummary(order) : order.status !== 'Đã hủy' ? `<p class="vp-note">${order.status !== 'Đã giao'
        ? 'Bạn có thể gửi yêu cầu đổi trả sau khi nhận hàng.'
        : canRequestReturn(order) ? 'Gửi yêu cầu đổi trả trong vòng 7 ngày kể từ khi nhận hàng.' : 'Đơn hàng đã hết thời hạn gửi yêu cầu đổi trả.'}</p>` : ''}
      ${order.refund ? `<p>Hoàn tiền: ${esc(order.refund)}</p>` : ''}
      ${order.cancellation ? cancellationSection(order, false) : ''}
      ${supportSection(order, false)}
      ${order.history?.length ? `<section class="vp-order"><h3>Lịch sử đơn hàng</h3>
        <ol>${order.history.map(event => typeof event === 'string'
          ? `<li>${esc(event)}</li>`
          : `<li>${esc(event.label)} · <time datetime="${esc(event.at)}">${formatOrderTime(event.at)}</time></li>`).join('')}</ol>
      </section>` : ''}
      <button class="vp-btn secondary vp-full" data-action="orders">QUAY LẠI ĐƠN HÀNG</button></div>`);
  }
  function formatOrderTime(at) {
    return new Date(at).toLocaleString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'});
  }

  function addOrderHistory(order, label) {
    (order.history ||= []).push({label, at:new Date().toISOString()});
  }

  function cancellationPending(order) {
    return order.cancellation?.status === 'Chờ xử lý';
  }

  function canRequestCancellation(order) {
    return order.inventory === 'reserved' && ['Chờ xác nhận', 'Đã xác nhận'].includes(order.status)
      && !cancellationPending(order);
  }

  function cancellationSection(order, isAdmin) {
    const request = order.cancellation;
    return `<section class="vp-order">
      <h3>Yêu cầu hủy đơn</h3>
      <p><strong>${esc(request.status)}</strong> · ${formatOrderTime(request.requestedAt)}</p>
      <p>Lý do: ${esc(request.reason)}</p>
      ${request.response ? `<p>Phản hồi: ${esc(request.response)}</p>` : ''}
      ${isAdmin && cancellationPending(order) ? `<form class="vp-form" data-form="resolve-cancellation" data-id="${esc(order.id)}">
        <label for="cancel-response">Phản hồi cho khách</label>
        <textarea id="cancel-response" name="response" maxlength="500"></textarea>
        <button class="vp-btn" type="submit" name="decision" value="approve">Duyệt hủy</button>
        <button class="vp-btn secondary" type="submit" name="decision" value="reject">Từ chối</button>
      </form>` : ''}
    </section>`;
  }

  function supportSection(order, isAdmin) {
    const messages = order.supportMessages || [];
    if (isAdmin && !messages.length) return '';
    return `<section class="vp-order">
      <h3>Hỗ trợ đơn hàng</h3>
      ${messages.map(message => `<div class="vp-order">
        <strong>${message.role === 'admin' ? 'Việt Phục' : 'Khách hàng'}</strong> · <time datetime="${esc(message.at)}">${formatOrderTime(message.at)}</time>
        ${message.topic ? `<p>${esc(message.topic)}</p>` : ''}
        <p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(message.body)}</p>
      </div>`).join('')}
      <form class="vp-form" data-form="${isAdmin ? 'support-reply' : 'support-request'}" data-id="${esc(order.id)}">
        ${isAdmin ? '' : `<label for="support-topic">Vấn đề cần hỗ trợ</label>
          <select id="support-topic" name="topic" required>
            <option value="Giao hàng chậm">Giao hàng chậm</option>
            <option value="Vấn đề thanh toán">Vấn đề thanh toán</option>
            <option value="Vấn đề khác">Vấn đề khác</option>
          </select>`}
        <label for="support-body">${isAdmin ? 'Nội dung phản hồi' : 'Mô tả vấn đề'}</label>
        <textarea id="support-body" name="body" required maxlength="1000"></textarea>
        <button class="vp-btn" type="submit">${isAdmin ? 'Gửi phản hồi' : 'Gửi yêu cầu hỗ trợ'}</button>
      </form>
    </section>`;
  }

  function canPayOnline(order) {
    return order.payment === 'online' && order.inventory === 'reserved' && !cancellationPending(order) &&
      ['Chưa thanh toán', 'Thanh toán thất bại'].includes(order.paymentStatus);
  }

  function canRequestReturn(order) {
    if (order.status !== 'Đã giao' || order.returnStatus) return false;
    const deliveredAt = Date.parse(order.deliveredAt);
    return !Number.isFinite(deliveredAt) || Date.now() - deliveredAt <= 7 * 24 * 60 * 60 * 1000;
  }

  function returnSummary(order) {
    const exchange = order.returnExchange;
    return `<section class="vp-order">
      <h3>${exchange ? 'Yêu cầu đổi size' : 'Yêu cầu trả hàng'}</h3>
      <p>Trạng thái: ${esc(order.returnStatus)}</p>
      ${exchange ? `<p>${esc(exchange.name)} · ${esc(exchange.oldSize)} → ${esc(exchange.newSize)} · Số lượng: ${exchange.qty}</p>` : ''}
      <p>Lý do: ${esc(order.returnReason)}</p>
    </section>`;
  }

  function returnForm(order) {
    const variants = order.items.flatMap((item, index) => {
      const product = find(item.id);
      return product ? sizesFor(product).filter(size => size !== item.size).map(size =>
        `<option value="${index}:${esc(size)}">${esc(item.name)} · ${esc(item.color)} · ${esc(item.size)} → ${esc(size)} · SL ${item.qty}</option>`) : [];
    });
    modal('Yêu cầu đổi trả', `<div class="vp-body">
      <p>Đơn hàng <strong>${esc(order.id)}</strong></p>
      <form class="vp-form" data-form="return" data-id="${esc(order.id)}">
        <label for="return-choice">Bạn muốn đổi hay trả hàng?</label>
        <select id="return-choice" name="choice" required>
          <option value="">Chọn phương án</option>
          <option value="return">Trả toàn bộ đơn hàng</option>
          ${variants.length ? `<optgroup label="Đổi size">${variants.join('')}</optgroup>` : ''}
        </select>
        <label for="return-reason">Lý do</label>
        <textarea id="return-reason" name="reason" required maxlength="500"></textarea>
        <button class="vp-btn vp-full">GỬI YÊU CẦU</button>
        <button type="button" class="vp-btn secondary vp-full" data-action="order-detail" data-id="${esc(order.id)}">VỀ CHI TIẾT ĐƠN</button>
      </form></div>`);
  }

  // Tạo dấu nhận diện để phát hiện đơn thay đổi trong lúc mở biểu mẫu.
  function orderEditSnapshot(order) {
    return JSON.stringify({
      address: order.address,
      payment: order.payment,
      paymentStatus: order.paymentStatus,
      items: order.items.map(item => ({id: item.id, size: item.size, qty: item.qty}))
    });
  }

  function editOrder(id) {
    const order = state.orders.find(item => item.id === id);
    if (!order || order.email !== state.user?.email || order.status !== 'Chờ xác nhận' ||
        order.inventory !== 'reserved' || cancellationPending(order) || order.paymentStatus === 'Thanh toán thành công') {
      toast('Đơn hàng không còn đủ điều kiện chỉnh sửa.');
      return;
    }
    const fields = order.items.map((item, index) => {
      const product = find(item.id);
      const sizes = product ? [...new Set([...sizesFor(product), item.size])] : [item.size];
      return `<div class="vp-order"><strong>${esc(item.name)}</strong>
        <p>${esc(item.color)} · Số lượng: ${item.qty}</p>
        <label for="edit-size-${index}">Kích thước</label>
        <select id="edit-size-${index}" name="size_${index}" required>
          ${sizes.map(size => `<option value="${esc(size)}" ${size === item.size ? 'selected' : ''}>${esc(size)}</option>`).join('')}
        </select></div>`;
    }).join('');
    modal('Sửa đơn hàng', `<div class="vp-body">
      <div class="vp-note">Chỉnh sửa khi đơn đang chờ xác nhận và chưa thanh toán thành công.</div>
      <form class="vp-form" data-form="edit-order" data-id="${esc(order.id)}">
        <input type="hidden" name="snapshot" value="${esc(orderEditSnapshot(order))}">
        <label for="edit-address">Địa chỉ nhận hàng</label>
        <textarea id="edit-address" name="address" required>${esc(order.address)}</textarea>
        <label for="edit-payment">Phương thức thanh toán</label>
        <select id="edit-payment" name="payment" required>
          <option value="COD" ${order.payment === 'COD' ? 'selected' : ''}>Thanh toán khi nhận hàng (COD mô phỏng)</option>
          <option value="online" ${order.payment === 'online' ? 'selected' : ''}>Thanh toán trực tuyến mô phỏng</option>
        </select><h3>Sản phẩm trong đơn</h3>${fields}
        <button class="vp-btn vp-full" type="submit">LƯU THAY ĐỔI</button>
        <button class="vp-btn secondary vp-full" type="button" data-action="orders">QUAY LẠI ĐƠN HÀNG</button>
      </form></div>`);
  }
  function payment(o){modal('Thanh toán mô phỏng',`<div class="vp-body"><div class="vp-note">GIAO DỊCH THỬ NGHIỆM · Không thu tiền thật và không kết nối cổng thanh toán.</div><p>Mã đơn: <b>${esc(o.id)}</b><br>Tổng thanh toán: <b>${money(o.total)}</b></p><p>Chọn kết quả để kiểm thử luồng thanh toán:</p><button class="vp-btn vp-full" data-action="pay-result" data-id="${o.id}" data-result="ok">MÔ PHỎNG THÀNH CÔNG</button><button class="vp-btn secondary vp-full" data-action="pay-result" data-id="${o.id}" data-result="fail">MÔ PHỎNG THẤT BẠI</button></div>`);}
  function admin(tab='dashboard'){if(!adminLogged){modal('Đăng nhập quản trị',`<div class="vp-body"><div class="vp-note">Khu vực mô phỏng trên trình duyệt, không có xác thực bảo mật. Tài khoản: admin / admin123.</div><form data-form="admin-login" class="vp-form"><label>Tên đăng nhập</label><input name="username" required><label>Mật khẩu</label><input name="password" type="password" required><button class="vp-btn vp-full">ĐĂNG NHẬP</button></form></div>`);return;}
    let content='';const os=state.orders;
    if(tab==='dashboard')content=`<div class="vp-stats"><div class="vp-stat">Tổng đơn<strong>${os.length}</strong></div><div class="vp-stat">Chờ xử lý<strong>${os.filter(o=>o.status==='Chờ xác nhận').length}</strong></div><div class="vp-stat">Đã giao<strong>${os.filter(o=>o.status==='Đã giao').length}</strong></div></div><div class="vp-note">${serverMode?'Dữ liệu thử nghiệm lưu trong file JSON trên máy.':'Dữ liệu thử nghiệm trong trình duyệt này.'} Giá trị đơn hàng: ${money(os.reduce((a,o)=>a+o.total,0))} · Số phiên thử: ${state.visits} · Lượt thêm giỏ: ${state.cartEvents||0}. Không đại diện cho dữ liệu kinh doanh thực tế.</div><h3>Đơn hàng gần đây</h3>${os.length?os.slice(-3).reverse().map(o=>orderCard(o,true)).join(''):'<p class="vp-empty">Chưa có đơn hàng thử nghiệm.</p>'}`;
    if(tab==='orders')content=os.length?os.slice().reverse().map(o=>orderCard(o,true)).join(''):'<p class="vp-empty">Chưa có đơn hàng.</p>';
    if(tab==='stock')content=`<p class="vp-muted">Tồn khả dụng theo biến thể. ${serverMode?'Thay đổi lưu trong file JSON trên máy.':'Thay đổi chỉ lưu trên trình duyệt này.'}</p>${products.map(p=>`<div class="vp-order"><b>${esc(p.name)}</b><p>${esc(p.color)}</p><div class="vp-inline-actions">${sizesFor(p).map(s=>`<button class="vp-link" data-action="stock" data-id="${p.id}" data-size="${s}">${s}: ${available(p.id,s)} (+1)</button>`).join('')}</div></div>`).join('')}`;
    if(tab==='requests')content=os.filter(o=>cancellationPending(o)||o.supportMessages?.length).map(o=>orderCard(o,true)).join('')||'<p class="vp-empty">Chưa có yêu cầu hủy hoặc hỗ trợ.</p>';
    if(tab==='returns')content=os.filter(o=>o.returnStatus).map(o=>orderCard(o,true)).join('')||'<p class="vp-empty">Chưa có yêu cầu đổi trả.</p>';
    modal('Quản trị cửa hàng',`<div class="vp-body"><div class="vp-note">CHẾ ĐỘ MÔ PHỎNG · ${serverMode?'Dữ liệu lưu trong file JSON trên máy.':'Dữ liệu lưu trong trình duyệt.'} Không dùng cho vận hành thật.</div><div class="vp-tabs">${[['dashboard','Tổng quan'],['orders','Đơn hàng'],['stock','Tồn kho'],['returns','Đổi trả'],['requests','Hủy đơn & hỗ trợ']].map(([k,v])=>`<button class="${tab===k?'active':''}" data-action="admin-tab" data-tab="${k}">${v}</button>`).join('')}<button data-action="admin-logout">Đăng xuất</button></div>${content}</div>`,true);
  }
  function adminOrder(id){const o=state.orders.find(x=>x.id===id);if(!o)return;modal('Xử lý '+o.id,`<div class="vp-body">${orderCard(o,true,true)}${o.cancellation ? cancellationSection(o,true) : ''}${supportSection(o,true)}<div class="vp-line"></div><p><b>Cập nhật đơn & vận chuyển</b></p><div class="vp-inline-actions">${o.status==='Chờ xác nhận'?`<button class="vp-btn" data-action="order-step" data-id="${id}" data-step="confirm">Xác nhận đơn</button>`:''}${o.status==='Đã xác nhận'&&!cancellationPending(o)?`<button class="vp-btn" data-action="order-step" data-id="${id}" data-step="ship">Bàn giao vận chuyển</button>`:''}${o.status==='Đang giao'?`<button class="vp-btn" data-action="order-step" data-id="${id}" data-step="delivered">Giao thành công</button><button class="vp-btn secondary" data-action="order-step" data-id="${id}" data-step="failed">Giao thất bại</button>`:''}</div>${o.returnStatus&&o.returnStatus!=='Đã hoàn tất'?`<div class="vp-line"></div>${returnSummary(o)}${o.status==='Đã giao'?`<button class="vp-btn" data-action="complete-return" data-id="${id}">${o.returnExchange?'XÁC NHẬN ĐÃ ĐỔI SIZE':'XÁC NHẬN HOÀN TẤT VÀ NHẬP LẠI HÀNG'}</button>`:'<p>Yêu cầu đang chờ xử lý. Chỉ nhập lại hàng sau khi đơn đã giao và nhận lại sản phẩm.</p>'}`:''}${o.status==='Đã giao'&&o.payment==='COD'?`<div class="vp-line"></div><p>Đối soát COD: ${esc(o.settlement||'Chưa đối soát')}</p><button class="vp-btn secondary" data-action="settle" data-id="${id}">GHI NHẬN ĐÃ THỰC NHẬN</button>`:''}<button class="vp-btn secondary vp-full" data-action="admin-tab" data-tab="orders">QUAY LẠI DANH SÁCH</button></div>`);}
  const customerPolicies = [
    {id:'overview', title:'Tổng quan chính sách bán hàng', paragraphs:[
      'Việt Phục giới thiệu trang phục truyền thống may sẵn gồm áo dài, áo bà ba, áo tứ thân và phụ kiện. Thông tin màu sắc, chất liệu, size và tồn kho được hiển thị trên trang sản phẩm.'
    ]},
    {id:'prices', title:'Giá bán và khuyến mãi', paragraphs:[
      'Giá niêm yết bằng đồng Việt Nam. Sản phẩm giảm giá hiển thị giá gốc và giá khuyến mãi. Kiểm tra đơn giá, số lượng và phí giao hàng trước khi xác nhận.',
      'Mỗi ưu đãi có thể áp dụng cho một số sản phẩm hoặc trong một khoảng thời gian nhất định. Bản demo áp dụng giá giảm hiển thị trên sản phẩm.'
    ]},
    {id:'ordering', title:'Đặt hàng và hủy đơn', paragraphs:[
      'Chọn mẫu, size và số lượng, thêm vào giỏ, sau đó nhập thông tin nhận hàng và chọn cách giao hàng, thanh toán. Hệ thống kiểm tra lại tồn kho khi xác nhận đặt hàng.',
      'Vào Đơn hàng của tôi để xem trạng thái. Khi đơn đang chờ xác nhận và chưa thanh toán thành công, bạn có thể sửa thông tin nếu đơn đủ điều kiện.',
      'Trước khi bàn giao vận chuyển, bạn có thể gửi yêu cầu hủy. Đơn tạm dừng bàn giao trong lúc cửa hàng xem xét. Kết quả hiển thị ở Chi tiết đơn hàng.'
    ]},
    {id:'payment', title:'Thanh toán', paragraphs:[
      'Bản demo có thanh toán khi nhận hàng (COD) và thanh toán trực tuyến mô phỏng. Chuyển khoản bằng mã QR và kết nối cổng thanh toán là các phương án trong đề án.',
      'Kiểm tra tổng tiền và trạng thái giao dịch trong Chi tiết đơn hàng. Nếu gặp lỗi hoặc có giao dịch trùng, mở mục Hỗ trợ đơn hàng để gửi thông tin. Chỉ dùng dữ liệu thử nghiệm khi thao tác.'
    ]},
    {id:'shipping', title:'Vận chuyển và giao nhận', paragraphs:[
      'Phí mô phỏng là 30.000₫ cho giao tiêu chuẩn và 45.000₫ cho giao nhanh. Phí và tổng tiền hiển thị trước khi xác nhận đơn. Bản demo mô phỏng trạng thái giao hàng.',
      'Thời gian dự kiến trong đề án, tính từ lúc bàn giao: nội thành Đắk Lắk 1–2 ngày làm việc, các khu vực khác trong tỉnh 2–3 ngày, tỉnh hoặc thành phố lớn 2–4 ngày, vùng xa hoặc hải đảo 4–7 ngày hoặc lâu hơn tùy tuyến.',
      'Bạn có thể theo dõi đơn trong Chi tiết đơn hàng. Nếu giao chậm, giao thiếu hoặc kiện hàng bị hư hỏng, gửi yêu cầu qua Hỗ trợ đơn hàng.'
    ]},
    {id:'returns', title:'Đổi trả và hoàn tiền', paragraphs:[
      'Theo đề án, yêu cầu đổi theo nhu cầu được tiếp nhận trong 7 ngày kể từ khi nhận hàng. Sản phẩm cần còn tem, nhãn và phụ kiện, chưa sử dụng, giặt hoặc chỉnh sửa. Đổi size tùy thuộc tồn kho.',
      'Với đơn giao sai, thiếu hoặc có lỗi, cửa hàng xem xét đổi, bổ sung hoặc hoàn tiền. Đề án quy định khách chịu phí khi đổi theo nhu cầu, còn cửa hàng chịu chi phí hợp lý khi lỗi thuộc về cửa hàng.',
      'Để gửi yêu cầu trong bản demo, mở Chi tiết đơn hàng sau khi nhận, chọn đổi size hoặc trả hàng và nhập lý do. Mốc hoàn tiền dự kiến trong đề án là 5 ngày làm việc kể từ khi yêu cầu được phê duyệt. Bản demo ghi trạng thái và mô phỏng giao dịch.'
    ]},
    {id:'quality', title:'Hỗ trợ chất lượng sản phẩm', paragraphs:[
      'Đề án đề xuất tiếp nhận phản ánh về lỗi chất lượng trong 30 ngày kể từ khi nhận sản phẩm. Gửi mã đơn và mô tả lỗi qua Hỗ trợ đơn hàng để cửa hàng xem xét.'
    ]},
    {id:'privacy', title:'Bảo mật thông tin khách hàng', paragraphs:[
      'Theo đề án, thông tin liên hệ, địa chỉ giao nhận và dữ liệu đơn hàng phục vụ xác nhận đơn, giao hàng, đối soát và hỗ trợ. Khi triển khai thực tế, thông tin cần thiết có thể được chia sẻ với đơn vị vận chuyển hoặc thanh toán để thực hiện đơn.',
      'Đề án có kênh tiếp nhận yêu cầu xem, chỉnh sửa, ngừng tiếp thị hoặc xem xét xóa dữ liệu. Dữ liệu bản demo lưu trên trình duyệt hoặc tệp JSON cục bộ. Tài khoản chỉ dùng để mô phỏng, vì vậy hãy nhập dữ liệu giả lập.'
    ]},
    {id:'complaints', title:'Hỗ trợ và giải quyết khiếu nại', paragraphs:[
      'Vào Đơn hàng của tôi → Chi tiết đơn hàng → Hỗ trợ đơn hàng. Chọn vấn đề và mô tả tình huống để cửa hàng kiểm tra. Bạn có thể xem phản hồi tại cùng mục.',
      'Đề án đặt mục tiêu phản hồi tiếp nhận khiếu nại thông thường trong 1 ngày làm việc. Vụ việc cần xác minh với bên vận chuyển hoặc thanh toán sẽ được cập nhật tiến độ.'
    ]},
    {id:'responsibilities', title:'Quyền và trách nhiệm khi mua hàng', paragraphs:[
      'Cửa hàng công bố giá và điều kiện giao dịch, xác nhận đơn, xử lý giao hàng và tiếp nhận vấn đề phát sinh.',
      'Khách kiểm tra thông tin sản phẩm và tổng tiền, cung cấp thông tin nhận hàng chính xác, thực hiện thanh toán theo lựa chọn và gửi mã đơn khi cần hỗ trợ.'
    ]},
    {id:'size', title:'Hướng dẫn chọn size', paragraphs:[
      'Bảng tham khảo: S 40–47 kg, M 48–54 kg, L 55–61 kg, XL 62–68 kg. Xem size còn hàng trên trang chi tiết của từng sản phẩm. Phụ kiện có thể dùng cỡ chung.'
    ]}
  ];

  function showPolicies(selectedId = '') {
    const policy = customerPolicies.find(item => item.id === selectedId);
    modal(policy?.title || 'Chính sách', `<div class="vp-body">
      <p class="vp-note">Chính sách đề xuất cho đồ án. Đặt hàng, thanh toán và vận chuyển trên website là mô phỏng.</p>
      ${policy ? `<article>${policy.paragraphs.map(paragraph => `<p>${esc(paragraph)}</p>`).join('')}</article>
        <button type="button" class="vp-btn secondary vp-full" data-action="policy">VỀ MENU CHÍNH SÁCH</button>`
        : `<nav class="vp-policy-menu" aria-label="Danh mục chính sách">${customerPolicies.map(item =>
          `<button type="button" class="vp-btn secondary" data-action="policy" data-policy="${esc(item.id)}">${esc(item.title)}</button>`).join('')}</nav>`}
    </div>`);
    document.querySelector('.vp-overlay .vp-close')?.focus();
  }

  document.addEventListener('click',async e=>{const el=e.target.closest('[data-action], [data-category]');if(!el)return;const action=el.dataset.action;if(el.dataset.category!==undefined&&!action){e.preventDefault();category=el.dataset.category;search='';renderProducts();document.getElementById('product-grid')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
    if(action==='filter-reset'){el.closest('form')?.querySelectorAll('input[type="checkbox"]').forEach(input=>{input.checked=false;});return;}
    if(action==='mobile-menu'){const nav=document.querySelector('.main-nav');if(nav){nav.classList.toggle('open');el.setAttribute('aria-expanded',String(nav.classList.contains('open')));}return;} if(action==='close'){close();return;} if(action==='product'){detail(el.dataset.id);return;} if(action==='size'){selectedSize=el.dataset.size;renderDetail();return;} if(action==='add'){if(await add()){toast('Đã thêm sản phẩm vào giỏ hàng.');cart();}return;} if(action==='buy'){if(await add())await checkout();return;}
    if(action==='policy'){e.preventDefault();showPolicies(el.dataset.policy);return;}
    if(action==='open-cart'){cart();return;}if(action==='open-account'){account();return;}if (action === 'open-admin') {
  window.location.href = 'admin.html';
  return;
}if(action==='open-orders'){try{await refreshDatabase();state.user?orders():account();}catch(err){toast(err.message);}return;}
    if(action==='open-search'){
      modal('Tìm kiếm', `<div class="vp-body">
        <form class="vp-form" data-form="search">
          <label for="quick-search-query">Bạn đang tìm kiếm điều gì?</label>
          <input id="quick-search-query" name="query" type="search" autocomplete="off" placeholder="Tên sản phẩm, danh mục...">
          <button class="vp-btn vp-full" type="submit">TÌM KIẾM</button>
        </form>
        <div id="quick-search-suggestions" class="vp-search-suggestions">${searchSuggestions()}</div>
      </div>`);
      const input = document.getElementById('quick-search-query');
      const suggestions = document.getElementById('quick-search-suggestions');
      if (input && suggestions) {
        input.addEventListener('input', () => { suggestions.innerHTML = searchSuggestions(input.value); });
        input.focus();
      }
      return;
    }
    if(action==='search-category'){showSearchResults('',el.dataset.name);return;}
    if(action==='qty'){
      const item = state.cart[Number(el.dataset.index)];
      if (!item) return;
      try { await refreshDatabase(); } catch (error) { toast(error.message); return; }
      if (!state.cart.includes(item)) return;
      const delta = Number(el.dataset.delta);
      if (delta === -1 && item.qty > 1) item.qty--;
      if (delta === 1 && !cartStockIssue(item) && quantityInCart(item.id, item.size) < available(item.id, item.size)) item.qty++;
      save();
      updateCount();
      cart();
      return;
    }
    if(action==='remove'){
      if (dbBusy) { toast('Đang lưu dữ liệu, vui lòng chờ.'); return; }
      const index = Number(el.dataset.index);
      if (!state.cart[index]) return;
      state.cart.splice(index,1);
      save();
      updateCount();
      cart();
      return;
    }if(action==='checkout'){await checkout();return;}if(action==='orders'){try{await refreshDatabase();orders();}catch(err){toast(err.message);}return;}if(action==='logout'){state.user=null;save();account();return;}
    if(action==='cancel'){
      try {
        await refreshDatabase();
        const order = state.orders.find(item => item.id === el.dataset.id && item.email === state.user?.email);
        if (!order || !canRequestCancellation(order)) throw new Error('Đơn không còn đủ điều kiện gửi yêu cầu hủy.');
        modal('Yêu cầu hủy đơn', `<div class="vp-body">
          <p>Đơn ${esc(order.id)} sẽ được giữ trong lúc cửa hàng xem xét yêu cầu hủy.</p>
          <form class="vp-form" data-form="request-cancellation" data-id="${esc(order.id)}">
            <label for="cancel-reason">Lý do hủy</label>
            <textarea id="cancel-reason" name="reason" required maxlength="500"></textarea>
            <button class="vp-btn vp-full" type="submit">Gửi yêu cầu hủy</button>
            <button class="vp-btn secondary vp-full" type="button" data-action="order-detail" data-id="${esc(order.id)}">Về chi tiết đơn</button>
          </form></div>`);
      } catch (error) { toast(error.message); }
      return;
    }
    if(action==='retry'){
      try {
        await refreshDatabase();
        const order = state.orders.find(item => item.id === el.dataset.id && item.email === state.user?.email);
        if (!order || !canPayOnline(order)) throw new Error('Đơn hàng không thể tiếp tục thanh toán.');
        payment(order);
      } catch (error) { toast(error.message); }
      return;
    }if(action==='pay-result'){try{const paymentStatus=await commitShared(()=>{const o=state.orders.find(x=>x.id===el.dataset.id);if(!o||o.email!==state.user?.email||!canPayOnline(o))throw new Error('Đơn hàng không còn hợp lệ.');o.paymentStatus=el.dataset.result==='ok'?'Thanh toán thành công':'Thanh toán thất bại';addOrderHistory(o, o.paymentStatus+' (mô phỏng)');return o.paymentStatus;});toast(paymentStatus+' (mô phỏng)');orderDetail(el.dataset.id);}catch(err){toast(err.message);}return;}
    if(action==='order-detail'){try{await refreshDatabase();orderDetail(el.dataset.id);}catch(error){toast(error.message);}return;}
    if(action==='edit-order'){try{await refreshDatabase();editOrder(el.dataset.id);}catch(error){toast(error.message);}return;}
    if(action==='return'){
      try {
        await refreshDatabase();
        const order = state.orders.find(item => item.id === el.dataset.id && item.email === state.user?.email);
        if (!order || !canRequestReturn(order)) throw new Error('Đơn hàng không đủ điều kiện đổi trả.');
        returnForm(order);
      } catch (error) { toast(error.message); }
      return;
    }
    if(action==='admin-tab'){try{await refreshDatabase();admin(el.dataset.tab);}catch(err){toast(err.message);}return;}if(action==='admin-logout'){adminLogged=false;admin();return;}if(action==='admin-order'){try{await refreshDatabase();adminOrder(el.dataset.id);}catch(err){toast(err.message);}return;}if(action==='stock'){try{await commitShared(()=>changeStock(el.dataset.id,el.dataset.size,1));admin('stock');}catch(err){toast(err.message);}return;}
    if(action==='order-step'){try{await commitShared(()=>{const o=state.orders.find(x=>x.id===el.dataset.id),step=el.dataset.step;if(!o)throw new Error('Không tìm thấy đơn hàng.');if(step==='confirm'&&o.status==='Chờ xác nhận')o.status='Đã xác nhận';else if(step==='ship'&&o.status==='Đã xác nhận'&&!cancellationPending(o)){o.status='Đang giao';o.shipStatus='Đang vận chuyển';o.inventory='issued';}else if(step==='delivered'&&o.status==='Đang giao'){o.status='Đã giao';o.shipStatus='Giao thành công';o.deliveredAt=new Date().toISOString();if(o.payment==='COD')o.paymentStatus='Thanh toán thành công';}else if(step==='failed'&&o.status==='Đang giao'){o.shipStatus='Giao thất bại';}else throw new Error('Trạng thái đơn đã thay đổi. Vui lòng kiểm tra lại.');addOrderHistory(o, o.status+' / '+o.shipStatus);});adminOrder(el.dataset.id);}catch(err){toast(err.message);}return;}
    if(action==='complete-return'||action==='refund'||action==='settle'){try{await commitShared(()=>{const o=state.orders.find(x=>x.id===el.dataset.id);if(!o)throw new Error('Không tìm thấy đơn hàng.');if(action==='complete-return'){if(!o.returnStatus||o.returnStatus==='Đã hoàn tất'||o.status!=='Đã giao')throw new Error('Chỉ hoàn tất sau khi đơn đã giao và nhận lại hàng.');if(o.returnExchange){
      const exchange = o.returnExchange;
      if(o.inventory!=='issued' || available(exchange.id, exchange.newSize)<exchange.qty) throw new Error('Không đủ tồn kho để hoàn tất đổi size.');
      changeStock(exchange.id, exchange.newSize, -exchange.qty);
      changeStock(exchange.id, exchange.oldSize, exchange.qty);
      o.returnStatus='Đã hoàn tất';
      addOrderHistory(o, 'Đã hoàn tất đổi size');
      return;
    }if(o.inventory==='issued'){o.items.forEach(i=>changeStock(i.id,i.size,i.qty));o.inventory='returned';}o.returnStatus='Đã hoàn tất';o.refund='Chờ hoàn tiền';addOrderHistory(o, 'Đã nhận lại và kiểm tra hàng');}if(action==='refund'){o.refund='Đã hoàn tiền (mô phỏng)';o.paymentStatus='Đã hoàn toàn bộ';addOrderHistory(o, o.refund);}if(action==='settle'){o.settlement='Đã thực nhận tiền (mô phỏng)';addOrderHistory(o, o.settlement);}});adminOrder(el.dataset.id);}catch(err){toast(err.message);}return;}
  });
  document.addEventListener('change',e=>{if(e.target.matches('[data-form="checkout"] select[name="shipping"]')){const form=e.target.closest('form'),fee=Number(e.target.value);form.querySelector('[data-checkout-shipping]').textContent=money(fee);form.querySelector('[data-checkout-total]').textContent=money(subtotal()+fee);}});
  document.addEventListener('submit',async e=>{const form=e.target.closest('[data-form]');if(!form)return;e.preventDefault();const data=new FormData(form),type=form.dataset.form;
    if(type==='filters'){filters={sizes:data.getAll('sizes'),colors:data.getAll('colors'),prices:data.getAll('prices')};close();renderProducts();return;}
    if(type==='search'){showSearchResults(String(data.get('query') || ''));return;}
    if(type==='login'){state.user={name:String(data.get('name')).trim(),email:String(data.get('email')).trim().toLowerCase()};save();toast('Đã đăng nhập tài khoản thử nghiệm.');account();return;}
    if(type==='admin-login'){if(data.get('username')==='admin'&&data.get('password')==='admin123'){adminLogged=true;admin();}else toast('Tài khoản hoặc mật khẩu không đúng.');return;}
    if(type==='request-cancellation'||type==='resolve-cancellation'){
      try {
        const isAdmin = type === 'resolve-cancellation';
        const decision = e.submitter?.value || data.get('decision');
        const message = String(data.get(isAdmin ? 'response' : 'reason') || '').trim();
        if (message.length > 500 || (!message && (!isAdmin || decision === 'reject'))) {
          throw new Error('Vui lòng nhập lý do từ 1 đến 500 ký tự.');
        }
        if (isAdmin && (!adminLogged || !['approve','reject'].includes(decision))) {
          throw new Error('Thao tác xử lý yêu cầu không hợp lệ.');
        }
        await commitShared(() => {
          const order = state.orders.find(item => item.id === form.dataset.id);
          if (!isAdmin) {
            if (!order || order.email !== state.user?.email || !canRequestCancellation(order)) {
              throw new Error('Đơn không còn đủ điều kiện gửi yêu cầu hủy.');
            }
            order.cancellation = {status:'Chờ xử lý', reason:message, requestedAt:new Date().toISOString()};
            addOrderHistory(order,'Khách đã gửi yêu cầu hủy đơn');
            return;
          }
          if (!order || !cancellationPending(order) || order.inventory !== 'reserved') {
            throw new Error('Yêu cầu hủy không còn đủ điều kiện xử lý.');
          }
          order.cancellation.response = message;
          if (decision === 'reject') {
            order.cancellation.status = 'Đã từ chối';
            addOrderHistory(order,'Cửa hàng đã từ chối yêu cầu hủy');
            return;
          }
          for (const item of order.items) changeStock(item.id,item.size,item.qty);
          order.cancellation.status = 'Đã duyệt';
          order.status = 'Đã hủy';
          order.shipStatus = 'Đã hủy vận chuyển';
          order.inventory = 'released';
          if (order.paymentStatus === 'Thanh toán thành công') order.refund = 'Chờ hoàn tiền';
          addOrderHistory(order,'Cửa hàng đã duyệt hủy đơn');
        });
        if (isAdmin) adminOrder(form.dataset.id);
        else orderDetail(form.dataset.id);
        toast(isAdmin ? 'Đã cập nhật yêu cầu hủy.' : 'Đã gửi yêu cầu hủy.');
      } catch (error) { toast(error.message); }
      return;
    }
    if(type==='support-request'||type==='support-reply'){
      try {
        const isAdmin = type === 'support-reply';
        const body = String(data.get('body') || '').trim();
        const topic = isAdmin ? '' : String(data.get('topic') || '');
        if (!body || body.length > 1000) throw new Error('Vui lòng nhập nội dung từ 1 đến 1.000 ký tự.');
        if (!isAdmin && !['Giao hàng chậm','Vấn đề thanh toán','Vấn đề khác'].includes(topic)) {
          throw new Error('Vui lòng chọn vấn đề cần hỗ trợ.');
        }
        await commitShared(() => {
          const order = state.orders.find(item => item.id === form.dataset.id);
          if (!order || (isAdmin ? !adminLogged || !order.supportMessages?.length : order.email !== state.user?.email)) {
            throw new Error('Không thể gửi tin nhắn cho đơn này.');
          }
          (order.supportMessages ||= []).push({role:isAdmin ? 'admin' : 'customer', topic, body, at:new Date().toISOString()});
          addOrderHistory(order,isAdmin ? 'Cửa hàng đã phản hồi hỗ trợ' : 'Khách đã gửi yêu cầu hỗ trợ');
        });
        if (isAdmin) adminOrder(form.dataset.id);
        else orderDetail(form.dataset.id);
        toast('Đã gửi tin nhắn.');
      } catch (error) { toast(error.message); }
      return;
    }
    if(type==='return'){
      try {
        const reason = String(data.get('reason') || '').trim();
        const choice = String(data.get('choice') || '');
        if (!reason || reason.length > 500) throw new Error('Vui lòng nhập lý do từ 1 đến 500 ký tự.');
        await commitShared(() => {
          const order = state.orders.find(item => item.id === form.dataset.id && item.email === state.user?.email);
          if (!order || !canRequestReturn(order)) throw new Error('Đơn hàng không đủ điều kiện đổi trả.');
          if (choice !== 'return') {
            const match = /^(\d+):(.+)$/.exec(choice);
            const item = match && order.items[Number(match[1])];
            const product = item && find(item.id);
            const size = match?.[2];
            if (!product || size === item.size || !sizesFor(product).includes(size)) {
              throw new Error('Vui lòng chọn phương án đổi trả hợp lệ.');
            }
            if (available(item.id, size) < item.qty) throw new Error('Size mới hiện không đủ hàng.');
            order.returnExchange = {id: item.id, name: item.name, oldSize: item.size, newSize: size, qty: item.qty};
          }
          order.returnStatus = 'Chờ xử lý';
          order.returnReason = reason;
          addOrderHistory(order,order.returnExchange ? 'Đã gửi yêu cầu đổi size' : 'Đã gửi yêu cầu trả hàng');
        });
        orderDetail(form.dataset.id);
        toast('Đã gửi yêu cầu.');
      } catch (error) { toast(error.message); }
      return;
    }
    if(type==='edit-order'){
      try {
        const address = String(data.get('address') || '').trim();
        const method = String(data.get('payment') || '');
        if (!address) throw new Error('Vui lòng nhập địa chỉ nhận hàng.');
        if (!['COD', 'online'].includes(method)) throw new Error('Phương thức thanh toán không hợp lệ.');
        const updated = await commitShared(() => {
          const order = state.orders.find(item => item.id === form.dataset.id);
          if (!order || order.email !== state.user?.email || order.status !== 'Chờ xác nhận' ||
              order.inventory !== 'reserved' || cancellationPending(order) || order.paymentStatus === 'Thanh toán thành công') {
            throw new Error('Đơn hàng không còn đủ điều kiện chỉnh sửa.');
          }
          if (String(data.get('snapshot') || '') !== orderEditSnapshot(order)) {
            throw new Error('Đơn hàng đã thay đổi. Vui lòng mở lại biểu mẫu.');
          }
          const changes = new Map();
          const selectedSizes = [];
          function addChange(id, size, amount) {
            const stockKey = key(id, size);
            const change = changes.get(stockKey);
            if (change) change.amount += amount;
            else changes.set(stockKey, {id, size, amount});
          }
          order.items.forEach((item, index) => {
            const product = find(item.id);
            const size = String(data.get(`size_${index}`) || '');
            if (!size) throw new Error('Vui lòng chọn size cho sản phẩm.');
            if (size !== item.size) {
              if (!product || !sizesFor(product).includes(size)) {
                throw new Error(`Size của sản phẩm "${item.name}" không hợp lệ.`);
              }
              addChange(item.id, item.size, item.qty);
              addChange(item.id, size, -item.qty);
            }
            selectedSizes.push(size);
          });
          for (const change of changes.values()) {
            if (available(change.id, change.size) + change.amount < 0) {
              throw new Error(`Sản phẩm "${find(change.id)?.name || change.id}" không đủ hàng ở size ${change.size}.`);
            }
          }
          for (const change of changes.values()) changeStock(change.id, change.size, change.amount);
          order.items.forEach((item, index) => { item.size = selectedSizes[index]; });
          order.address = address;
          if (order.payment !== method) {
            order.payment = method;
            order.paymentStatus = 'Chưa thanh toán';
          }
          addOrderHistory(order, 'Khách hàng cập nhật địa chỉ, thanh toán hoặc size');
          return order;
        });
        toast('Đã cập nhật đơn hàng.');
        if (updated.payment === 'online' && updated.paymentStatus !== 'Thanh toán thành công') payment(updated);
        else orderDetail(updated.id);
      } catch (error) { toast(error.message); }
      return;
    }
    if(type==='checkout'){
      try{const o=await commitShared(()=>{
        if (!state.cart.length) throw new Error('Giỏ hàng đang trống.');
        if (state.cart.some(cartStockIssue)) throw new Error('Một sản phẩm không còn đủ hàng. Vui lòng kiểm tra giỏ hàng.');
        const ship=Number(data.get('shipping')),items=state.cart.map(i=>{let p=find(i.id);return {id:i.id,name:p.name,color:p.color,size:i.size,qty:i.qty,price:p.price};});
        items.forEach(i=>changeStock(i.id,i.size,-i.qty));const id='VP'+Date.now().toString(36).toUpperCase()+Math.random().toString(36).slice(2,6).toUpperCase();let order={id,date:new Date().toLocaleString('vi-VN'),email:state.user.email,receiver:String(data.get('receiver')),phone:String(data.get('phone')),address:String(data.get('address')),items,total:subtotal()+ship,shippingFee:ship,payment:String(data.get('payment')),status:'Chờ xác nhận',shipStatus:'Chờ bàn giao',paymentStatus:'Chưa thanh toán',inventory:'reserved',settlement:'Chưa đối soát',policy:'Chính sách thử nghiệm: đổi trả trong 7 ngày theo điều kiện cửa hàng.',history:[{label:'Tạo đơn và giữ hàng',at:new Date().toISOString()}]};state.orders.push(order);return order;});
        state.cart=[];save();updateCount();if(o.payment==='online')payment(o);else {toast('Đã tạo đơn hàng thử nghiệm '+o.id);orderDetail(o.id);}
      }catch(err){toast(err.message);}return;
    }
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  document.addEventListener('click',e=>{if(e.target.classList?.contains('vp-overlay'))close();});
  document.getElementById('filter-open')?.addEventListener('click',openFilters);
  document.getElementById('catalog-search')?.addEventListener('input',e=>{search=e.target.value;renderProducts();});
  document.getElementById('catalog-category')?.addEventListener('change',e=>{category=e.target.value;renderProducts();});
  document.getElementById('catalog-sort')?.addEventListener('change',e=>{sort=e.target.value;renderProducts();});
  window.VietPhuc={products,getState:()=>state,renderProducts};
  renderProducts();updateCount();initializeDatabase();
})();
