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
  let dbReady=!serverMode, dbBusy=false, publicPolicies=null, businessConfig={shipping:{standardFee:30000,remoteFee:45000},returnWindowDays:7};
  function mapPublicProduct(p, catMap){
    const activeVariants=Array.isArray(p.variants)?p.variants.filter(v=>v.active!==false):[];
    const sizes=activeVariants.length?[...new Set(activeVariants.map(v=>v.size))]:(p.sizes||['S','M','L','XL']);
    const color=activeVariants[0]?.color||p.color||'';
    return {...p, category:catMap.get(p.categoryId)||p.category||'', color, sizes};
  }
  function applyPublicBootstrap(data){
    const catMap=new Map((data.categories||[]).map(c=>[c.id,c.name]));
    state.categories=data.categories||[];
    state.stock=data.stock||{};
    publicPolicies=data.policies||null;
    if(data.config)businessConfig=data.config;
    if(Array.isArray(data.products)){
      const mapped=data.products.map(p=>mapPublicProduct(p,catMap));
      products.splice(0,products.length,...mapped);
    }
  }
  function status(message,failed=false){
    let el=document.getElementById('database-status');
    if(!el){el=document.createElement('div');el.id='database-status';el.setAttribute('role','status');el.style.cssText='padding:10px 18px;text-align:center;font-size:14px;background:#f4eee8;color:#493b34';document.body.prepend(el);}
    el.textContent=message;el.style.background=failed?'#fbe5e5':'#f4eee8';
  }
  async function readDatabase(){
    const response=await fetch('/api/public/bootstrap',{cache:'no-store'});
    if(!response.ok)throw new Error('Không thể đọc dữ liệu cửa hàng từ máy chủ.');
    const result=await response.json();
    if(!result || !Array.isArray(result.products) || !result.stock || typeof result.stock!=='object') throw new Error('Dữ liệu máy chủ không hợp lệ.');
    return result;
  }
  async function trackPublic(type){
    if(!serverMode)return;
    try{await fetch('/api/public/track',{method:'POST',headers:{'Content-Type':'application/json','X-VP-Requested':'1'},body:JSON.stringify({type})});}catch(_){}
  }
  async function apiCustomer(url,method='GET',body=null){
    const opts={method,headers:{'X-VP-Requested':'1'}};
    if(body!==null){opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(body);}
    const res=await fetch(url,opts);
    const data=await res.json().catch(()=>({}));
    if(!res.ok){
      if(res.status===401||data.error==='account_locked'){state.user=null;updateAccountIndicator();}
      const err=new Error(data.message||'Có lỗi xảy ra.');
      err.status=res.status;
      err.code=data.error||'';
      throw err;
    }
    return data;
  }
  function updateAccountIndicator(){
    const el=document.getElementById('account-label');
    const btn=document.querySelector('[data-action="open-account"]');
    if(!el)return;
    if(serverMode&&state.user){
      const parts=String(state.user.name||'').trim().split(/\s+/);
      el.textContent=parts[parts.length-1]||state.user.email||'Tài khoản';
      if(btn)btn.title=`Tài khoản: ${state.user.name}`;
    }else{
      el.textContent='';
      if(btn)btn.title='Tài khoản';
    }
  }
  async function syncCustomerSession(){
    if(!serverMode)return;
    try{
      const data=await apiCustomer('/api/customer/session');
      state.user=data.loggedIn&&data.customer?data.customer:null;
    }catch(_){
      state.user=null;
    }
    updateAccountIndicator();
  }
  async function initializeDatabase(){
    if(!serverMode)return;
    status('Đang kết nối dữ liệu cửa hàng…');
    try{const result=await readDatabase();applyPublicBootstrap(result);await syncCustomerSession();dbReady=true;status('Dữ liệu sản phẩm và tồn kho được đồng bộ từ máy chủ.');renderProducts();if(!sessionStorage.getItem('vietphuc-json-visit')){await trackPublic('visit');sessionStorage.setItem('vietphuc-json-visit','1');}}
    catch(error){dbReady=false;status('Không kết nối được máy chủ. Hãy chạy npm start rồi tải lại trang.',true);}
  }
  async function refreshDatabase(){
    if(!serverMode)return;
    if(dbBusy)throw new Error('Đang tải dữ liệu, vui lòng chờ.');
    try{const latest=await readDatabase();applyPublicBootstrap(latest);dbReady=true;status('Dữ liệu sản phẩm và tồn kho được đồng bộ từ máy chủ.');renderProducts();}
    catch(error){dbReady=false;status('Không kết nối được máy chủ. Hãy kiểm tra và thử lại.',true);throw new Error('Không thể tải dữ liệu. Hãy kiểm tra máy chủ và thử lại.');}
  }
  async function commitShared(mutate){
    if(!serverMode){const result=mutate();renderProducts();save();return result;}
    throw new Error('Thao tác này yêu cầu đăng nhập tài khoản khách hàng (triển khai ở GĐ2).');
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
  const skuFor=(id,size)=>{const p=find(id);return p?.variants?.find(v=>v.size===size&&v.active!==false)?.sku||null;};
  const available=(id,size)=>{if(Object.prototype.hasOwnProperty.call(state.stock,key(id,size)))return state.stock[key(id,size)];const sku=skuFor(id,size);if(sku&&Object.prototype.hasOwnProperty.call(state.stock,sku))return state.stock[sku];return serverMode?0:8;};
  const changeStock=(id,size,n)=>{const sku=skuFor(id,size);const k=(sku&&Object.prototype.hasOwnProperty.call(state.stock,sku))?sku:key(id,size);state.stock[k]=Math.max(0,available(id,size)+n);};
  const cartCount=()=>state.cart.reduce((s,i)=>s+i.qty,0);
  const subtotal=()=>state.cart.reduce((s,i)=>s+(find(i.id)?.price||0)*i.qty,0);
  function updateCount(){document.querySelectorAll('#cart-count,[data-cart-count]').forEach(x=>x.textContent=cartCount());}
  function renderProducts(){
    const grid=document.getElementById('product-grid'); if(!grid) return;
    let list=products.filter(p=>(category==='Tất cả'||p.category===category)
      && p.name.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'))
      && (!filters.sizes.length || filters.sizes.some(s=>sizesFor(p).includes(s)&&available(p.id,s)>0))
      && (!filters.colors.length || filters.colors.includes(p.color))
      && (!filters.prices.length || priceRanges.some(([id,,min,max])=>filters.prices.includes(id)&&p.price>=min&&p.price<max)));
    if(sort==='price-asc') list.sort((a,b)=>a.price-b.price);
    if(sort==='price-desc') list.sort((a,b)=>b.price-a.price);
    if(sort==='newest') list.sort((a,b)=>String(b.addedAt||'').localeCompare(String(a.addedAt||'')));
    const count=document.querySelector('[data-product-count]');if(count) count.textContent=list.length+' sản phẩm';
    const summary=document.getElementById('filter-summary');if(summary) summary.textContent=list.length+' sản phẩm'+(filters.sizes.length+filters.colors.length+filters.prices.length?' · '+(filters.sizes.length+filters.colors.length+filters.prices.length)+' lựa chọn lọc':'');
    const searchInput=document.getElementById('catalog-search');if(searchInput && searchInput.value!==search)searchInput.value=search;
    const categoryInput=document.getElementById('catalog-category');if(categoryInput)categoryInput.value=category;
    const sortInput=document.getElementById('catalog-sort');if(sortInput)sortInput.value=sort;
    grid.innerHTML=list.length?list.map((p,i)=>`<article class="vp-product"><button class="vp-product-image" data-action="product" data-id="${p.id}" aria-label="Xem ${esc(p.name)}"><img src="${p.img}" alt="${esc(p.name)}" loading="${i<4?'eager':'lazy'}"><span class="vp-product-tag">${p.tag}</span><span class="vp-product-view">KHÁM PHÁ SẢN PHẨM</span></button><div class="vp-product-info"><div class="vp-product-category">${esc(p.category)}</div><button class="vp-product-name" data-action="product" data-id="${p.id}">${esc(p.name)}</button><div class="vp-product-price">${money(p.price)} ${p.old?`<del>${money(p.old)}</del>`:''}</div><div class="vp-swatches"><span style="background:${colors[p.color]||'#aaa'}"></span><small>${esc(p.color)}</small></div><p class="vp-stock">${sizesFor(p).some(s=>available(p.id,s)>0)?'Còn hàng':'Hết hàng'}</p></div></article>`).join(''):'<p class="vp-empty">Không tìm thấy sản phẩm phù hợp. Hãy thử thay đổi từ khóa hoặc bộ lọc.</p>';
    document.querySelectorAll('[data-category]').forEach(el=>el.classList.toggle('active',el.dataset.category===category));
  }
  const css=`
  .vp-product{min-width:0}.vp-product-image{position:relative;display:block;width:100%;aspect-ratio:3/4;border:0;padding:0;background:#ede9e3;overflow:hidden;cursor:pointer}.vp-product-image img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .6s}.vp-product-image:hover img{transform:scale(1.04)}.vp-product-tag{position:absolute;left:12px;top:12px;background:#f8f6f0;padding:6px 8px;font:600 9px Arial;letter-spacing:.08em}.vp-product-view{position:absolute;bottom:0;left:0;right:0;padding:14px;color:white;background:#25231f;font:600 10px Arial;letter-spacing:.1em;transform:translateY(100%);transition:.25s}.vp-product-image:hover .vp-product-view{transform:translateY(0)}.vp-product-info{padding:15px 0 23px}.vp-product-category{font-size:11px;color:#8f8980;margin-bottom:7px}.vp-product-name{border:0;background:none;padding:0;text-align:left;cursor:pointer;font-size:14px;font-weight:600;color:#25231f}.vp-product-price{font-size:14px;margin-top:8px;font-weight:600}.vp-product-price del{font-weight:400;color:#aaa;margin-left:7px}.vp-swatches{display:flex;align-items:center;gap:7px;margin-top:11px;color:#928a80}.vp-swatches span{width:13px;height:13px;border-radius:50%;background:#8f5147;border:2px solid white;outline:1px solid #b8a79e}.vp-swatches small{font-size:10px}.vp-overlay{position:fixed;inset:0;z-index:9999;background:rgba(26,24,21,.5);display:flex;justify-content:flex-end;align-items:stretch}.vp-overlay.center{align-items:center;justify-content:center;padding:24px}.vp-panel{background:#fcfbf8;color:#292824;width:min(100%,510px);height:100%;overflow:auto;box-shadow:0 12px 48px #0002;font-family:Arial,sans-serif}.vp-overlay.center .vp-panel{width:min(100%,900px);height:auto;max-height:90vh}.vp-head{position:sticky;top:0;background:#fcfbf8;z-index:2;display:flex;justify-content:space-between;align-items:center;padding:23px 26px;border-bottom:1px solid #e9e6df}.vp-head h2{font:400 25px Georgia,serif;margin:0}.vp-close{font-size:26px;line-height:1;border:0;background:none;cursor:pointer;color:#222}.vp-body{padding:26px}.vp-body p{line-height:1.65}.vp-muted{font-size:12px;color:#807b72;line-height:1.6}.vp-note{background:#f2eee5;padding:13px 15px;font-size:12px;line-height:1.6;margin:15px 0}.vp-btn{display:inline-flex;justify-content:center;align-items:center;gap:8px;border:1px solid #272621;background:#272621;color:white;padding:14px 18px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;cursor:pointer;text-decoration:none}.vp-btn:hover{background:#5a3a33}.vp-btn.secondary{background:transparent;color:#25231f}.vp-btn:disabled{opacity:.4;cursor:not-allowed}.vp-full{width:100%;margin-top:12px}.vp-form label{font-size:12px;font-weight:600;display:block;margin:16px 0 7px}.vp-form input,.vp-form select,.vp-form textarea,.vp-input{width:100%;border:1px solid #d9d5cc;background:#fff;padding:13px;font:14px Arial;color:#292824;border-radius:0;box-sizing:border-box}.vp-form textarea{min-height:80px;resize:vertical}.vp-row{display:flex;justify-content:space-between;gap:12px;align-items:center}.vp-line{border-top:1px solid #e9e6df;margin:20px 0}.vp-item{display:flex;gap:16px;padding:16px 0;border-bottom:1px solid #eeeae3}.vp-item img{width:80px;height:105px;object-fit:cover;background:#eee}.vp-item-info{flex:1;min-width:0}.vp-item h3{font-size:14px;margin:2px 0 8px}.vp-item p{font-size:12px;color:#827c74;margin:5px 0}.vp-link{border:0;background:none;padding:0;text-decoration:underline;cursor:pointer;font-size:12px;color:#5d544d}.vp-qty{display:inline-flex;border:1px solid #ddd;align-items:center;margin-top:8px}.vp-qty button{border:0;background:none;padding:7px 11px;cursor:pointer}.vp-qty span{font-size:12px}.vp-detail{display:grid;grid-template-columns:1fr 1fr}.vp-detail img{width:100%;height:100%;max-height:680px;object-fit:cover}.vp-detail-info{padding:35px}.vp-detail h3{font:400 32px Georgia,serif;margin:10px 0 14px}.vp-detail-price{font-size:20px;font-weight:bold}.vp-size{display:flex;gap:8px;margin:12px 0}.vp-size button{background:white;border:1px solid #d5d0c8;min-width:42px;height:42px;cursor:pointer}.vp-size button.active{background:#272621;color:white;border-color:#272621}.vp-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 20px}.vp-tabs button{background:none;border:1px solid #ded9d0;padding:9px;cursor:pointer;font-size:11px}.vp-tabs button.active{background:#292824;color:white}.vp-order{border:1px solid #e3dfd7;padding:16px;margin:12px 0}.vp-order h3{font-size:14px;margin:0}.vp-order p{font-size:12px;margin:6px 0}.vp-status{display:inline-block;background:#e9eee5;color:#415b3f;padding:6px 8px;font-size:10px}.vp-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.vp-stat{background:#f2eee7;padding:15px}.vp-stat strong{display:block;font:24px Georgia;margin-top:8px}.vp-toast{position:fixed;bottom:25px;left:50%;transform:translateX(-50%);z-index:10001;background:#292824;color:white;padding:14px 22px;font:13px Arial;box-shadow:0 5px 20px #0003}.vp-empty{color:#817a70;padding:35px 0;font-size:14px}.vp-product-image img{color:#80796f}.vp-inline-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}@media(max-width:650px){.vp-overlay.center{padding:0;align-items:stretch}.vp-overlay.center .vp-panel{height:100%;max-height:none}.vp-detail{grid-template-columns:1fr}.vp-detail img{max-height:380px}.vp-detail-info{padding:24px}.vp-stats{grid-template-columns:1fr 1fr}.vp-body{padding:20px}.vp-head{padding:20px}}
  `;
  const filterCss=`
    .vp-stock{font-size:12px;color:#615b56;margin:7px 0 0}.vp-filter-form{display:flex;flex-direction:column;min-height:calc(100% - 76px);background:#fff}.vp-filter-content{flex:1;padding:12px 28px 25px}.vp-filter-group{border:0;border-bottom:1px solid #eee8e4;padding:14px 0 22px;margin:0}.vp-filter-group summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-size:15px;font-weight:600;letter-spacing:.04em;padding:5px 0 13px}.vp-filter-group summary::-webkit-details-marker{display:none}.vp-filter-group summary:after{content:'⌃';font-size:16px}.vp-filter-group:not([open]) summary:after{content:'⌄'}.vp-filter-check{display:flex;align-items:center;justify-content:space-between;gap:16px;font-size:14px;padding:6px 0;cursor:pointer}.vp-filter-check input{width:17px;height:17px;accent-color:#26211f;cursor:pointer}.vp-filter-check:has(input:disabled){color:#aaa;cursor:not-allowed}.vp-color-grid{display:flex;flex-wrap:wrap;gap:10px;padding:4px 0}.vp-color-choice{display:inline-flex;position:relative;cursor:pointer}.vp-color-choice input{position:absolute;width:1px;height:1px;opacity:0}.vp-color-choice span{display:block;width:29px;height:29px;background:var(--swatch);border:3px solid white;border-radius:50%;box-shadow:0 0 0 1px #c9c9c9}.vp-color-choice input:checked+span{box-shadow:0 0 0 2px #251f1d}.vp-color-choice input:focus-visible+span{outline:2px solid #70272e;outline-offset:4px}.vp-filter-actions{position:sticky;bottom:0;display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#fff;padding:16px 28px;border-top:1px solid #eee}.vp-filter-actions .vp-btn{width:100%;padding:13px 8px;min-height:46px}.vp-filter-hint{font-size:12px;color:#777;line-height:1.6;margin:4px 0 12px}@media(max-width:520px){.vp-filter-content{padding-left:18px;padding-right:18px}.vp-filter-actions{padding:12px 18px}.vp-filter-group summary{font-size:14px}}
  `;
  const style=document.createElement('style');style.textContent=css+filterCss;document.head.appendChild(style);
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
  function detail(id){let p=find(id);if(!p)return;selectedProduct=id;selectedSize=sizesFor(p).includes('M')?'M':sizesFor(p)[0];renderDetail();}
  function renderDetail(){const p=find(selectedProduct);modal('Chi tiết sản phẩm',`<div class="vp-detail"><img src="${p.img}" alt="${esc(p.name)}"><div class="vp-detail-info"><div class="vp-muted">${esc(p.category)} / VIỆT PHỤC</div><h3>${esc(p.name)}</h3><div class="vp-detail-price">${money(p.price)}</div><p>Một thiết kế mang nét đẹp truyền thống vào những khoảnh khắc đáng nhớ.</p><div class="vp-line"></div><p><b>Màu sắc:</b> ${esc(p.color)}<br><b>Chất liệu:</b> ${esc(p.material)}</p><p><b>Kích thước:</b> ${selectedSize}</p><div class="vp-size">${sizesFor(p).map(s=>`<button class="${s===selectedSize?'active':''}" data-action="size" data-size="${s}">${s}</button>`).join('')}</div><p class="vp-muted">Còn ${available(p.id,selectedSize)} sản phẩm ở size ${selectedSize}.${p.category==='Phụ kiện'?' Kích thước dùng chung.':' Bảng size tham khảo: S 40–47 kg · M 48–54 kg · L 55–61 kg · XL 62–68 kg.'}</p><button class="vp-btn vp-full" data-action="add" ${available(p.id,selectedSize)<1?'disabled':''}>THÊM VÀO GIỎ HÀNG — ${money(p.price)}</button><button class="vp-btn secondary vp-full" data-action="buy" ${available(p.id,selectedSize)<1?'disabled':''}>MUA NGAY</button><div class="vp-note">Giặt nhẹ bằng tay, tránh ngâm lâu và phơi dưới nắng gắt. Đổi trả đề xuất trong 7 ngày theo điều kiện cửa hàng.</div></div></div>`,true);}
  async function add(){try{const productId=selectedProduct,size=selectedSize;const p=find(productId),existing=state.cart.find(i=>i.id===productId&&i.size===size);if(!p||(existing?.qty||0)>=available(productId,size))throw new Error('Số lượng đã đạt mức tồn kho.');if(serverMode){await trackPublic('cart');}else{await commitShared(()=>{state.cartEvents=(state.cartEvents||0)+1;});}if(existing)existing.qty++;else state.cart.push({id:productId,size,qty:1});save();updateCount();return true;}catch(err){toast(err.message);return false;}}
  function cart(){modal('Giỏ hàng của bạn',`<div class="vp-body">${state.cart.length?state.cart.map((i,n)=>{const p=find(i.id);return `<div class="vp-item"><img src="${p.img}" alt=""><div class="vp-item-info"><h3>${esc(p.name)}</h3><p>${esc(p.color)} / ${i.size}</p><b>${money(p.price)}</b><div class="vp-row"><div class="vp-qty"><button data-action="qty" data-index="${n}" data-delta="-1">−</button><span>${i.qty}</span><button data-action="qty" data-index="${n}" data-delta="1">+</button></div><button class="vp-link" data-action="remove" data-index="${n}">Xóa</button></div></div></div>`}).join('')+`<div class="vp-row" style="margin-top:24px"><b>Tạm tính</b><b>${money(subtotal())}</b></div><p class="vp-muted">Phí vận chuyển được tính tại bước thanh toán.</p><button class="vp-btn vp-full" data-action="checkout">TIẾN HÀNH THANH TOÁN →</button><button class="vp-btn secondary vp-full" data-action="close">TIẾP TỤC MUA SẮM</button>`:'<p class="vp-empty">Giỏ hàng của bạn đang trống.</p><button class="vp-btn vp-full" data-action="close">KHÁM PHÁ SẢN PHẨM</button>'}</div>`);}
  const ORDER_STATUS_VI={pending:'Chờ xác nhận',pending_payment:'Chờ thanh toán',confirmed:'Đã xác nhận',packing:'Đang đóng gói',shipping:'Đang giao hàng',delivered:'Đã giao',cancelled:'Đã hủy'};
  const PAYMENT_STATUS_VI={unpaid:'Chưa thanh toán',pending:'Đang thanh toán',paid:'Đã thanh toán',failed:'Thanh toán thất bại',refund_pending:'Chờ hoàn tiền',refunded:'Đã hoàn tiền'};
  function fmtOrderStatus(s){return ORDER_STATUS_VI[s]||s||'—';}
  function fmtPaymentStatus(s){return PAYMENT_STATUS_VI[s]||s||'—';}
  function fmtDateVi(iso){if(!iso)return '—';const d=new Date(iso);return Number.isNaN(d.getTime())?String(iso):d.toLocaleString('vi-VN');}
  function pwField(name,placeholder,minlen){return `<div class="vp-pw-wrap"><input name="${name}" type="password" required${minlen?` minlength="${minlen}"`:''} placeholder="${esc(placeholder||'')}"><button type="button" class="vp-pw-toggle" data-action="toggle-pw">Hiện</button></div>`;}
  function customerOrderCard(o){
    const items=(o.items||[]).map(i=>`${esc(i.name||i.productName||'Sản phẩm')} (${esc(i.size||'')}) × ${i.qty||1}`).join('<br>');
    return `<div class="vp-order"><div class="vp-row"><h3>${esc(o.id)}</h3><span class="vp-status">${esc(fmtOrderStatus(o.orderStatus||o.status))}</span></div><p>${esc(fmtDateVi(o.createdAt||o.date))} · <b>${money(o.total||0)}</b></p>${items?`<p>${items}</p>`:''}<p>Thanh toán: ${esc(fmtPaymentStatus(o.paymentStatus))}</p><div class="vp-inline-actions"><button type="button" class="vp-link" data-action="customer-order-detail" data-id="${esc(o.id)}">Xem chi tiết →</button></div></div>`;
  }
  async function loadCustomerOrders(){
    const box=document.getElementById('vp-customer-orders');
    if(!box)return;
    box.innerHTML='<p class="vp-muted">Đang tải danh sách đơn hàng…</p>';
    try{
      const data=await apiCustomer('/api/customer/orders');
      const list=Array.isArray(data.orders)?data.orders:[];
      box.innerHTML=list.length?list.map(customerOrderCard).join(''):'<p class="vp-empty">Bạn chưa có đơn hàng nào.</p>';
    }catch(err){
      if(err.status===401||err.code==='account_locked'){toast(err.message);account('login',err.message);return;}
      box.innerHTML=`<div class="vp-error">${esc(err.message)}</div>`;
    }
  }
  async function loadCustomerOrderDetail(orderId){
    const box=document.getElementById('vp-customer-orders');
    if(!box)return;
    box.innerHTML='<p class="vp-muted">Đang tải chi tiết đơn hàng…</p>';
    try{
      const data=await apiCustomer(`/api/customer/orders/${encodeURIComponent(orderId)}`);
      const o=data.order;
      const addr=o.receiver?`${o.receiver}${o.phone?` · ${o.phone}`:''}${o.address?` · ${o.address}`:''}`:(o.shippingAddress&&typeof o.shippingAddress==='object'?`${o.shippingAddress.receiver||''} · ${o.shippingAddress.phone||''} · ${o.shippingAddress.address||''}`:(o.shippingAddress||'—'));
      const items=(o.items||[]).map(i=>`<div class="vp-row"><span>${esc(i.name||i.productName||'Sản phẩm')} (${esc(i.color||'')}${i.size?` / ${esc(i.size)}`:''}) × ${i.qty||1}</span><b>${money((i.unitPrice??i.price??0)*(i.qty||1))}</b></div>`).join('');
      box.innerHTML=`<button type="button" class="vp-link" data-action="customer-tab" data-tab="orders">← Quay lại danh sách đơn hàng</button><div class="vp-order-detail"><div class="vp-row"><h3>Đơn ${esc(o.id)}</h3><span class="vp-status">${esc(fmtOrderStatus(o.orderStatus||o.status))}</span></div><p><b>Ngày đặt:</b> ${esc(fmtDateVi(o.createdAt||o.date))}</p><p><b>Thanh toán:</b> ${esc(fmtPaymentStatus(o.paymentStatus))}</p><p><b>Giao nhận:</b> ${esc(addr)}</p>${o.note?`<p><b>Ghi chú:</b> ${esc(o.note)}</p>`:''}<div class="vp-line"></div>${items}<div class="vp-line"></div><div class="vp-row"><strong>Tổng cộng</strong><strong>${money(o.total||0)}</strong></div></div>`;
    }catch(err){
      if(err.status===401||err.code==='account_locked'){toast(err.message);account('login',err.message);return;}
      box.innerHTML=`<div class="vp-error">${esc(err.message)}</div><button type="button" class="vp-link" data-action="customer-tab" data-tab="orders">← Quay lại danh sách</button>`;
    }
  }
  function account(tab='login',errMsg=''){
    if(!serverMode){
      modal('Tài khoản',`<div class="vp-body">${state.user?`<p>Xin chào, <b>${esc(state.user.name)}</b></p><p class="vp-muted">${esc(state.user.email)}</p><button class="vp-btn vp-full" data-action="orders">ĐƠN HÀNG CỦA TÔI</button><button class="vp-btn secondary vp-full" data-action="logout">ĐĂNG XUẤT</button>`:`<p>Chào mừng bạn đến với Việt Phục.</p><div class="vp-note">Đây là danh tính dùng thử trên trình duyệt.</div><form class="vp-form" data-form="login"><label>Họ và tên</label><input name="name" required placeholder="Tên của bạn"><label>Email dùng thử</label><input name="email" type="email" required placeholder="ban@example.com"><button class="vp-btn vp-full">TIẾP TỤC</button></form>`}</div>`);
      return;
    }
    const errHtml=errMsg?`<div class="vp-error">${esc(errMsg)}</div>`:'';
    if(!state.user){
      const activeTab=tab==='register'?'register':'login';
      const tabs=`<div class="vp-tabs"><button type="button" class="vp-tab${activeTab==='login'?' active':''}" data-action="customer-tab" data-tab="login">Đăng nhập</button><button type="button" class="vp-tab${activeTab==='register'?' active':''}" data-action="customer-tab" data-tab="register">Đăng ký</button></div>`;
      const body=activeTab==='register'
        ?`<form class="vp-form" data-form="customer-register"><label>Họ và tên</label><input name="name" required placeholder="Nguyễn Văn A"><label>Email</label><input name="email" type="email" required placeholder="ban@example.com"><label>Số điện thoại</label><input name="phone" type="tel" required placeholder="0912345678"><label>Mật khẩu</label>${pwField('password','Tối thiểu 8 ký tự',8)}<label>Xác nhận mật khẩu</label>${pwField('confirmPassword','Nhập lại mật khẩu',8)}<button class="vp-btn vp-full">TẠO TÀI KHOẢN</button></form>`
        :`<form class="vp-form" data-form="customer-login"><label>Email</label><input name="email" type="email" required placeholder="ban@example.com"><label>Mật khẩu</label>${pwField('password','Nhập mật khẩu')}<button class="vp-btn vp-full">ĐĂNG NHẬP</button></form>`;
      modal('Tài khoản khách hàng',`<div class="vp-body">${tabs}${errHtml}${body}</div>`);
      return;
    }
    const activeTab=['profile','password','orders'].includes(tab)?tab:'profile';
    const tabs=`<div class="vp-tabs"><button type="button" class="vp-tab${activeTab==='profile'?' active':''}" data-action="customer-tab" data-tab="profile">Hồ sơ</button><button type="button" class="vp-tab${activeTab==='password'?' active':''}" data-action="customer-tab" data-tab="password">Đổi mật khẩu</button><button type="button" class="vp-tab${activeTab==='orders'?' active':''}" data-action="customer-tab" data-tab="orders">Đơn hàng</button></div>`;
    let body='';
    if(activeTab==='profile'){
      body=`<p>Xin chào, <b>${esc(state.user.name)}</b></p><form class="vp-form" data-form="customer-profile"><label>Email (không thể thay đổi)</label><input value="${esc(state.user.email)}" readonly disabled><label>Họ và tên</label><input name="name" required value="${esc(state.user.name)}"><label>Số điện thoại</label><input name="phone" type="tel" required value="${esc(state.user.phone||'')}"><label>Địa chỉ mặc định</label><input name="defaultAddress" value="${esc(state.user.defaultAddress||'')}" placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành"><button class="vp-btn vp-full">LƯU THAY ĐỔI</button></form><button type="button" class="vp-btn secondary vp-full" data-action="customer-logout">ĐĂNG XUẤT</button>`;
    }else if(activeTab==='password'){
      body=`<div class="vp-note">Sau khi đổi mật khẩu, toàn bộ phiên đăng nhập hiện tại sẽ được đăng xuất để bảo mật.</div><form class="vp-form" data-form="customer-change-password"><label>Mật khẩu hiện tại</label>${pwField('currentPassword','Nhập mật khẩu hiện tại')}<label>Mật khẩu mới</label>${pwField('newPassword','Tối thiểu 8 ký tự',8)}<label>Xác nhận mật khẩu mới</label>${pwField('confirmNewPassword','Nhập lại mật khẩu mới',8)}<button class="vp-btn vp-full">CẬP NHẬT MẬT KHẨU</button></form>`;
    }else{
      body=`<div id="vp-customer-orders"></div>`;
    }
    modal('Tài khoản của tôi',`<div class="vp-body">${tabs}${errHtml}${body}</div>`);
    if(activeTab==='orders')loadCustomerOrders();
  }
  function checkout(){if(!state.cart.length){cart();return;}if(serverMode){if(!state.user){toast('Vui lòng đăng nhập tài khoản khách hàng trước khi đặt hàng.');account('login');return;}modal('Đặt hàng',`<div class="vp-body"><p>Bạn đang đăng nhập với tài khoản <b>${esc(state.user.name)}</b> (${esc(state.user.email)}).</p><div class="vp-note">Luồng tạo đơn hàng và thanh toán trực tuyến sẽ được hoàn thiện ở GĐ3.</div><button class="vp-btn secondary vp-full" data-action="close">ĐÓNG</button></div>`);return;}if(!state.user){toast('Vui lòng tạo tài khoản dùng thử trước khi đặt hàng.');account();return;}modal('Thông tin đặt hàng',`<div class="vp-body"><div class="vp-note">ĐƠN HÀNG THỬ NGHIỆM · Không có giao dịch hay vận chuyển thực tế. Vui lòng không nhập thông tin thật.</div><form class="vp-form" data-form="checkout"><label>Người nhận</label><input name="receiver" required value="${esc(state.user.name)}"><label>Số điện thoại dùng thử</label><input name="phone" required placeholder="Ví dụ: 0900000000"><label>Địa chỉ nhận hàng dùng thử</label><input name="address" required placeholder="Số nhà, đường, phường/xã, tỉnh/thành"><label>Vận chuyển</label><select name="shipping"><option value="30000">Giao hàng tiêu chuẩn · 30.000₫</option><option value="45000">Giao hàng nhanh · 45.000₫</option></select><label>Phương thức thanh toán</label><select name="payment"><option value="COD">Thanh toán khi nhận hàng (COD mô phỏng)</option><option value="online">Thanh toán trực tuyến mô phỏng</option></select><div class="vp-line"></div><div class="vp-row"><span>Tiền hàng</span><b>${money(subtotal())}</b></div><div class="vp-row"><span>Phí giao hàng</span><b data-checkout-shipping>${money(30000)}</b></div><div class="vp-row"><strong>Tổng thanh toán</strong><strong data-checkout-total>${money(subtotal()+30000)}</strong></div><label><input type="checkbox" required style="width:auto"> Tôi đồng ý với điều kiện mua hàng và chính sách đổi trả thử nghiệm.</label><button class="vp-btn vp-full">XÁC NHẬN ĐẶT HÀNG</button></form></div>`);}
  function orders(){let list=state.orders.filter(o=>o.email===state.user?.email);modal('Đơn hàng của tôi',`<div class="vp-body"><p class="vp-muted">${serverMode?'Đơn thử nghiệm được lưu trong file JSON trên máy.':'Thông tin chỉ được lưu trên trình duyệt này.'}</p>${list.length?list.slice().reverse().map(o=>orderCard(o,false)).join(''):'<p class="vp-empty">Bạn chưa có đơn hàng nào.</p>'}</div>`);}
  function orderCard(o,admin){return `<div class="vp-order"><div class="vp-row"><h3>${esc(o.id)}</h3><span class="vp-status">${esc(o.status)}</span></div><p>${esc(o.date)} · ${money(o.total)}</p><p>${o.items.map(i=>`${esc(i.name)} (${i.size}) × ${i.qty}`).join('<br>')}</p><p>Thanh toán: ${esc(o.paymentStatus)} · Vận chuyển: ${esc(o.shipStatus)}</p>${o.returnStatus?`<p>Đổi trả: ${esc(o.returnStatus)}</p>`:''}<div class="vp-inline-actions">${!admin&&o.inventory==='reserved'&&o.status!=='Đã hủy'?`<button class="vp-link" data-action="cancel" data-id="${o.id}">Hủy đơn</button>`:''}${!admin&&o.payment==='online'&&o.paymentStatus==='Thanh toán thất bại'?`<button class="vp-link" data-action="retry" data-id="${o.id}">Thanh toán lại</button>`:''}${!admin&&o.status==='Đã giao'&&!o.returnStatus?`<button class="vp-link" data-action="return" data-id="${o.id}">Yêu cầu đổi trả</button>`:''}${admin?`<button class="vp-link" data-action="admin-order" data-id="${o.id}">Xử lý đơn →</button>`:''}</div></div>`;}
  function payment(o){modal('Thanh toán mô phỏng',`<div class="vp-body"><div class="vp-note">GIAO DỊCH THỬ NGHIỆM · Không thu tiền thật và không kết nối cổng thanh toán.</div><p>Mã đơn: <b>${esc(o.id)}</b><br>Tổng thanh toán: <b>${money(o.total)}</b></p><p>Chọn kết quả để kiểm thử luồng thanh toán:</p><button class="vp-btn vp-full" data-action="pay-result" data-id="${o.id}" data-result="ok">MÔ PHỎNG THÀNH CÔNG</button><button class="vp-btn secondary vp-full" data-action="pay-result" data-id="${o.id}" data-result="fail">MÔ PHỎNG THẤT BẠI</button></div>`);}
  function admin(tab='dashboard'){if(!adminLogged){modal('Đăng nhập quản trị',`<div class="vp-body"><div class="vp-note">Khu vực mô phỏng trên trình duyệt, không có xác thực bảo mật. Tài khoản: admin / admin123.</div><form data-form="admin-login" class="vp-form"><label>Tên đăng nhập</label><input name="username" required><label>Mật khẩu</label><input name="password" type="password" required><button class="vp-btn vp-full">ĐĂNG NHẬP</button></form></div>`);return;}
    let content='';const os=state.orders;
    if(tab==='dashboard')content=`<div class="vp-stats"><div class="vp-stat">Tổng đơn<strong>${os.length}</strong></div><div class="vp-stat">Chờ xử lý<strong>${os.filter(o=>o.status==='Chờ xác nhận').length}</strong></div><div class="vp-stat">Đã giao<strong>${os.filter(o=>o.status==='Đã giao').length}</strong></div></div><div class="vp-note">${serverMode?'Dữ liệu thử nghiệm lưu trong file JSON trên máy.':'Dữ liệu thử nghiệm trong trình duyệt này.'} Giá trị đơn hàng: ${money(os.reduce((a,o)=>a+o.total,0))} · Số phiên thử: ${state.visits} · Lượt thêm giỏ: ${state.cartEvents||0}. Không đại diện cho dữ liệu kinh doanh thực tế.</div><h3>Đơn hàng gần đây</h3>${os.length?os.slice(-3).reverse().map(o=>orderCard(o,true)).join(''):'<p class="vp-empty">Chưa có đơn hàng thử nghiệm.</p>'}`;
    if(tab==='orders')content=os.length?os.slice().reverse().map(o=>orderCard(o,true)).join(''):'<p class="vp-empty">Chưa có đơn hàng.</p>';
    if(tab==='stock')content=`<p class="vp-muted">Tồn khả dụng theo biến thể. ${serverMode?'Thay đổi lưu trong file JSON trên máy.':'Thay đổi chỉ lưu trên trình duyệt này.'}</p>${products.map(p=>`<div class="vp-order"><b>${esc(p.name)}</b><p>${esc(p.color)}</p><div class="vp-inline-actions">${sizesFor(p).map(s=>`<button class="vp-link" data-action="stock" data-id="${p.id}" data-size="${s}">${s}: ${available(p.id,s)} (+1)</button>`).join('')}</div></div>`).join('')}`;
    if(tab==='returns')content=os.filter(o=>o.returnStatus).map(o=>orderCard(o,true)).join('')||'<p class="vp-empty">Chưa có yêu cầu đổi trả.</p>';
    modal('Quản trị cửa hàng',`<div class="vp-body"><div class="vp-note">CHẾ ĐỘ MÔ PHỎNG · ${serverMode?'Dữ liệu lưu trong file JSON trên máy.':'Dữ liệu lưu trong trình duyệt.'} Không dùng cho vận hành thật.</div><div class="vp-tabs">${[['dashboard','Tổng quan'],['orders','Đơn hàng'],['stock','Tồn kho'],['returns','Đổi trả']].map(([k,v])=>`<button class="${tab===k?'active':''}" data-action="admin-tab" data-tab="${k}">${v}</button>`).join('')}<button data-action="admin-logout">Đăng xuất</button></div>${content}</div>`,true);
  }
  function adminOrder(id){const o=state.orders.find(x=>x.id===id);if(!o)return;modal('Xử lý '+o.id,`<div class="vp-body">${orderCard(o,false)}<div class="vp-line"></div><p><b>Cập nhật đơn & vận chuyển</b></p><div class="vp-inline-actions">${o.status==='Chờ xác nhận'?`<button class="vp-btn" data-action="order-step" data-id="${id}" data-step="confirm">Xác nhận đơn</button>`:''}${o.status==='Đã xác nhận'?`<button class="vp-btn" data-action="order-step" data-id="${id}" data-step="ship">Bàn giao vận chuyển</button>`:''}${o.status==='Đang giao'?`<button class="vp-btn" data-action="order-step" data-id="${id}" data-step="delivered">Giao thành công</button><button class="vp-btn secondary" data-action="order-step" data-id="${id}" data-step="failed">Giao thất bại</button>`:''}</div>${o.returnStatus&&o.returnStatus!=='Đã hoàn tất'?`<div class="vp-line"></div><p>Yêu cầu: ${esc(o.returnReason)}</p><button class="vp-btn" data-action="complete-return" data-id="${id}">XÁC NHẬN HOÀN TẤT VÀ NHẬP LẠI HÀNG</button>`:''}${o.status==='Đã giao'&&o.payment==='COD'?`<div class="vp-line"></div><p>Đối soát COD: ${esc(o.settlement||'Chưa đối soát')}</p><button class="vp-btn secondary" data-action="settle" data-id="${id}">GHI NHẬN ĐÃ THỰC NHẬN</button>`:''}<button class="vp-btn secondary vp-full" data-action="admin-tab" data-tab="orders">QUAY LẠI DANH SÁCH</button></div>`);}
  document.addEventListener('click',async e=>{const el=e.target.closest('[data-action], [data-category]');if(!el)return;const action=el.dataset.action;if(el.dataset.category!==undefined&&!action){e.preventDefault();category=el.dataset.category;search='';renderProducts();document.getElementById('product-grid')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
    if(action==='filter-reset'){el.closest('form')?.querySelectorAll('input[type="checkbox"]').forEach(input=>{input.checked=false;});return;}
    if(action==='mobile-menu'){const nav=document.querySelector('.main-nav');if(nav){nav.classList.toggle('open');el.setAttribute('aria-expanded',String(nav.classList.contains('open')));}return;} if(action==='close'){close();return;} if(action==='product'){detail(el.dataset.id);return;} if(action==='size'){selectedSize=el.dataset.size;renderDetail();return;} if(action==='add'){if(await add()){toast('Đã thêm sản phẩm vào giỏ hàng.');cart();}return;} if(action==='buy'){if(await add())checkout();return;}
    if(action==='policy'){const std=businessConfig?.shipping?.standardFee??30000,rem=businessConfig?.shipping?.remoteFee??45000,retDays=businessConfig?.returnWindowDays??7;const pItems=publicPolicies?.items||{};const policies={size:['Hướng dẫn chọn size',pItems.size||'Bảng size tham khảo: S 40–47 kg; M 48–54 kg; L 55–61 kg; XL 62–68 kg.'],shipping:['Chính sách vận chuyển',pItems.shipping||`Giao hàng cơ bản ${money(std)} hoặc khu vực xa ${money(rem)} là mức phí mô phỏng.`],returns:['Đổi trả và hoàn tiền',pItems.returns||`Tiếp nhận yêu cầu đổi trả trong ${retDays} ngày từ khi nhận hàng theo điều kiện cửa hàng.`],privacy:['Chính sách bảo mật',pItems.privacy||(serverMode?'Bản thử nghiệm lưu dữ liệu trên máy chủ cục bộ. Không nhập dữ liệu thật.':'Bản thử nghiệm lưu dữ liệu trên trình duyệt. Không nhập dữ liệu thật.')]};const item=policies[el.dataset.policy];if(item)modal(item[0],`<div class="vp-body"><p>${esc(item[1])}</p><div class="vp-note">Chính sách được đề xuất cho đồ án và không áp dụng cho giao dịch thực tế.</div></div>`);return;}
    if(action==='open-cart'){cart();return;}if(action==='open-account'){account(state.user?'profile':'login');return;}if(action==='open-admin'){window.location.href='admin.html';return;}if(action==='open-orders'){if(serverMode){if(state.user)account('orders');else{toast('Vui lòng đăng nhập để xem đơn hàng.');account('login');}return;}try{await refreshDatabase();state.user?orders():account();}catch(err){toast(err.message);}return;}
    if(action==='customer-tab'){account(el.dataset.tab);return;}
    if(action==='customer-order-detail'){loadCustomerOrderDetail(el.dataset.id);return;}
    if(action==='toggle-pw'){const inp=el.previousElementSibling;if(inp){const show=inp.type==='password';inp.type=show?'text':'password';el.textContent=show?'Ẩn':'Hiện';}return;}
    if(action==='customer-logout'){try{await apiCustomer('/api/customer/logout','POST');}catch(_){}state.user=null;updateAccountIndicator();toast('Đã đăng xuất.');account('login');return;}
    if(action==='open-search'){modal('Tìm kiếm',`<div class="vp-body"><form class="vp-form" data-form="search"><label>Bạn đang tìm kiếm điều gì?</label><input name="query" placeholder="Tên sản phẩm, danh mục..." autofocus><button class="vp-btn vp-full">TÌM KIẾM</button></form></div>`);return;}
    if(action==='qty'){const i=state.cart[+el.dataset.index];if(!i)return;let n=i.qty+(+el.dataset.delta);if(n<1)state.cart.splice(+el.dataset.index,1);else if(n<=available(i.id,i.size))i.qty=n;else toast('Số lượng vượt quá tồn kho.');save();updateCount();cart();return;}
    if(action==='remove'){state.cart.splice(+el.dataset.index,1);save();updateCount();cart();return;}if(action==='checkout'){checkout();return;}if(action==='orders'){try{await refreshDatabase();orders();}catch(err){toast(err.message);}return;}if(action==='logout'){state.user=null;save();account();return;}
    if(action==='cancel'){try{await commitShared(()=>{const o=state.orders.find(x=>x.id===el.dataset.id);if(!o||o.inventory!=='reserved')throw new Error('Đơn không còn đủ điều kiện hủy.');o.items.forEach(i=>changeStock(i.id,i.size,i.qty));o.inventory='released';o.status='Đã hủy';if(o.paymentStatus==='Thanh toán thành công')o.refund='Chờ hoàn tiền';o.history.push('Đã hủy đơn và giải phóng hàng giữ');});orders();}catch(err){toast(err.message);}return;}
    if(action==='retry'){payment(state.orders.find(x=>x.id===el.dataset.id));return;}if(action==='pay-result'){try{const paymentStatus=await commitShared(()=>{const o=state.orders.find(x=>x.id===el.dataset.id);if(!o||o.status==='Đã hủy')throw new Error('Đơn hàng không còn hợp lệ.');o.paymentStatus=el.dataset.result==='ok'?'Thanh toán thành công':'Thanh toán thất bại';o.history.push(o.paymentStatus+' (mô phỏng)');return o.paymentStatus;});toast(paymentStatus+' (mô phỏng)');orders();}catch(err){toast(err.message);}return;}
    if(action==='return'){modal('Yêu cầu đổi trả',`<div class="vp-body"><div class="vp-note">Yêu cầu đổi trả thử nghiệm cho đơn ${esc(el.dataset.id)}.</div><form class="vp-form" data-form="return" data-id="${esc(el.dataset.id)}"><label>Lý do</label><textarea name="reason" required placeholder="Mô tả vấn đề bạn gặp phải"></textarea><button class="vp-btn vp-full">GỬI YÊU CẦU</button></form></div>`);return;}
    if(action==='admin-tab'){try{await refreshDatabase();admin(el.dataset.tab);}catch(err){toast(err.message);}return;}if(action==='admin-logout'){adminLogged=false;admin();return;}if(action==='admin-order'){try{await refreshDatabase();adminOrder(el.dataset.id);}catch(err){toast(err.message);}return;}if(action==='stock'){try{await commitShared(()=>changeStock(el.dataset.id,el.dataset.size,1));admin('stock');}catch(err){toast(err.message);}return;}
    if(action==='order-step'){try{await commitShared(()=>{const o=state.orders.find(x=>x.id===el.dataset.id),step=el.dataset.step;if(!o)throw new Error('Không tìm thấy đơn hàng.');if(step==='confirm'&&o.status==='Chờ xác nhận')o.status='Đã xác nhận';else if(step==='ship'&&o.status==='Đã xác nhận'){o.status='Đang giao';o.shipStatus='Đang vận chuyển';o.inventory='issued';}else if(step==='delivered'&&o.status==='Đang giao'){o.status='Đã giao';o.shipStatus='Giao thành công';if(o.payment==='COD')o.paymentStatus='Thanh toán thành công';}else if(step==='failed'&&o.status==='Đang giao'){o.shipStatus='Giao thất bại';}else throw new Error('Trạng thái đơn đã thay đổi. Vui lòng kiểm tra lại.');o.history.push(o.status+' / '+o.shipStatus);});adminOrder(el.dataset.id);}catch(err){toast(err.message);}return;}
    if(action==='complete-return'||action==='refund'||action==='settle'){try{await commitShared(()=>{const o=state.orders.find(x=>x.id===el.dataset.id);if(!o)throw new Error('Không tìm thấy đơn hàng.');if(action==='complete-return'){if(!o.returnStatus||o.returnStatus==='Đã hoàn tất')throw new Error('Yêu cầu đổi trả đã thay đổi.');if(o.inventory==='issued'){o.items.forEach(i=>changeStock(i.id,i.size,i.qty));o.inventory='returned';}o.returnStatus='Đã hoàn tất';o.refund='Chờ hoàn tiền';o.history.push('Đã nhận lại và kiểm tra hàng');}if(action==='refund'){o.refund='Đã hoàn tiền (mô phỏng)';o.paymentStatus='Đã hoàn toàn bộ';o.history.push(o.refund);}if(action==='settle'){o.settlement='Đã thực nhận tiền (mô phỏng)';o.history.push(o.settlement);}});adminOrder(el.dataset.id);}catch(err){toast(err.message);}return;}
  });
  document.addEventListener('change',e=>{if(e.target.matches('[data-form="checkout"] select[name="shipping"]')){const form=e.target.closest('form'),fee=Number(e.target.value);form.querySelector('[data-checkout-shipping]').textContent=money(fee);form.querySelector('[data-checkout-total]').textContent=money(subtotal()+fee);}});
  document.addEventListener('submit',async e=>{const form=e.target.closest('[data-form]');if(!form)return;e.preventDefault();const data=new FormData(form),type=form.dataset.form;
    if(type==='filters'){filters={sizes:data.getAll('sizes'),colors:data.getAll('colors'),prices:data.getAll('prices')};close();renderProducts();return;}
    if(type==='search'){search=String(data.get('query')||'').trim();category='Tất cả';close();renderProducts();document.getElementById('product-grid')?.scrollIntoView({behavior:'smooth'});return;}
    if(type==='login'){state.user={name:String(data.get('name')).trim(),email:String(data.get('email')).trim().toLowerCase()};save();toast('Đã đăng nhập tài khoản thử nghiệm.');account();return;}
    if(type==='customer-login'){
      const email=String(data.get('email')||'').trim().toLowerCase(),password=String(data.get('password')||'');
      try{
        const res=await apiCustomer('/api/customer/login','POST',{email,password});
        state.user=res.customer;updateAccountIndicator();toast('Đăng nhập thành công.');account('profile');
      }catch(err){account('login',err.message);}
      return;
    }
    if(type==='customer-register'){
      const name=String(data.get('name')||'').trim(),email=String(data.get('email')||'').trim().toLowerCase(),phone=String(data.get('phone')||'').trim(),password=String(data.get('password')||''),confirmPassword=String(data.get('confirmPassword')||'');
      if(password.length<8){account('register','Mật khẩu phải có ít nhất 8 ký tự.');return;}
      if(password!==confirmPassword){account('register','Xác nhận mật khẩu không khớp.');return;}
      try{
        const res=await apiCustomer('/api/customer/register','POST',{name,email,phone,password});
        state.user=res.customer;updateAccountIndicator();toast('Đăng ký tài khoản thành công.');account('profile');
      }catch(err){account('register',err.message);}
      return;
    }
    if(type==='customer-profile'){
      const name=String(data.get('name')||'').trim(),phone=String(data.get('phone')||'').trim(),defaultAddress=String(data.get('defaultAddress')||'').trim();
      try{
        const res=await apiCustomer('/api/customer/profile','PUT',{name,phone,defaultAddress});
        state.user=res.customer;updateAccountIndicator();toast('Đã cập nhật thông tin tài khoản.');account('profile');
      }catch(err){account(state.user?'profile':'login',err.message);}
      return;
    }
    if(type==='customer-change-password'){
      const currentPassword=String(data.get('currentPassword')||''),newPassword=String(data.get('newPassword')||''),confirmNewPassword=String(data.get('confirmNewPassword')||'');
      if(newPassword.length<8){account('password','Mật khẩu mới phải có ít nhất 8 ký tự.');return;}
      if(newPassword!==confirmNewPassword){account('password','Xác nhận mật khẩu mới không khớp.');return;}
      try{
        const res=await apiCustomer('/api/customer/change-password','PUT',{currentPassword,newPassword});
        state.user=null;updateAccountIndicator();toast(res.message||'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.');account('login');
      }catch(err){account(err.status===401&&err.code!=='invalid_current_password'?'login':'password',err.message);}
      return;
    }
    if(type==='admin-login'){if(data.get('username')==='admin'&&data.get('password')==='admin123'){adminLogged=true;admin();}else toast('Tài khoản hoặc mật khẩu không đúng.');return;}
    if(type==='return'){try{await commitShared(()=>{const o=state.orders.find(x=>x.id===form.dataset.id);if(!o||o.status!=='Đã giao'||o.returnStatus)throw new Error('Đơn không còn đủ điều kiện đổi trả.');o.returnStatus='Chờ xử lý';o.returnReason=String(data.get('reason'));o.history.push('Đã gửi yêu cầu đổi trả');});toast('Đã gửi yêu cầu thử nghiệm.');orders();}catch(err){toast(err.message);}return;}
    if(type==='checkout'){
      try{const o=await commitShared(()=>{
        for(const i of state.cart){if(!find(i.id)||i.qty>available(i.id,i.size))throw new Error('Một sản phẩm không còn đủ hàng. Vui lòng kiểm tra giỏ hàng.');}
        const ship=Number(data.get('shipping')),items=state.cart.map(i=>{let p=find(i.id);return {id:i.id,name:p.name,color:p.color,size:i.size,qty:i.qty,price:p.price};});
        items.forEach(i=>changeStock(i.id,i.size,-i.qty));const id='VP'+Date.now().toString(36).toUpperCase()+Math.random().toString(36).slice(2,6).toUpperCase();let order={id,date:new Date().toLocaleString('vi-VN'),email:state.user.email,receiver:String(data.get('receiver')),phone:String(data.get('phone')),address:String(data.get('address')),items,total:subtotal()+ship,shippingFee:ship,payment:String(data.get('payment')),status:'Chờ xác nhận',shipStatus:'Chờ bàn giao',paymentStatus:'Chưa thanh toán',inventory:'reserved',settlement:'Chưa đối soát',policy:'Chính sách thử nghiệm: đổi trả trong 7 ngày theo điều kiện cửa hàng.',history:['Tạo đơn và giữ hàng']};state.orders.push(order);return order;});
        state.cart=[];save();updateCount();if(o.payment==='online')payment(o);else {toast('Đã tạo đơn hàng thử nghiệm '+o.id);orders();}
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
