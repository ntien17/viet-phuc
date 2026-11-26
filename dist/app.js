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
  let dbReady=!serverMode, dbBusy=false, publicPolicies=null, publicPromotions=[], businessConfig={shipping:{standardFee:30000,remoteFee:45000},returnWindowDays:7,warrantyWindowDays:30,refundProcessingDays:5,complaintResponseDays:1};
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
    publicPromotions=Array.isArray(data.promotions)?data.promotions:[];
    if(data.config)businessConfig=data.config;
    const regEl=document.getElementById('footer-store-region');
    const hrsEl=document.getElementById('footer-store-hours');
    const fEmail=document.getElementById('footer-contact-email');
    const fPhone=document.getElementById('footer-contact-phone');
    if(regEl&&publicPolicies?.storeInfo?.region)regEl.textContent=publicPolicies.storeInfo.region;
    if(hrsEl&&publicPolicies?.storeInfo?.hours)hrsEl.textContent=publicPolicies.storeInfo.hours;
    if(fEmail&&publicPolicies?.storeInfo?.email)fEmail.textContent=publicPolicies.storeInfo.email;
    if(fPhone&&publicPolicies?.storeInfo?.hotline)fPhone.textContent=publicPolicies.storeInfo.hotline;
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

    try{const result=await readDatabase();applyPublicBootstrap(result);await syncCustomerSession();dbReady=true;;if(!sessionStorage.getItem('vietphuc-json-visit')){await trackPublic('visit');sessionStorage.setItem('vietphuc-json-visit','1');}}
    catch(error){dbReady=false;status('Không kết nối được máy chủ. Hãy chạy npm start rồi tải lại trang.',true);}
  }
  async function refreshDatabase(){
    if(!serverMode)return;
    if(dbBusy)throw new Error('Đang tải dữ liệu, vui lòng chờ.');
    try{const latest=await readDatabase();applyPublicBootstrap(latest);dbReady=true;}
    catch(error){dbReady=false;status('Không kết nối được máy chủ. Hãy kiểm tra và thử lại.',true);throw new Error('Không thể tải dữ liệu. Hãy kiểm tra máy chủ và thử lại.');}
  }
  async function commitShared(mutate){
    if(!serverMode){const result=mutate();renderProducts();save();return result;}
    throw new Error('Thao tác này yêu cầu đăng nhập tài khoản khách hàng (triển khai ở GĐ2).');
  }
  let category='Tất cả', search='', sort='featured', selectedSize='M', selectedColor='', selectedQty=1, selectedProduct=null, adminLogged=false, isSubmittingOrder=false, checkoutPromoCode='', checkoutQuote=null, checkoutIdemKey='';
  let filters={sizes:[],colors:[],prices:[]};
  const colorsFor=p=>{const vs=Array.isArray(p?.variants)?p.variants.filter(v=>v.active!==false):[];return vs.length?[...new Set(vs.map(v=>v.color))]:(p?.color?[p.color]:[]);};
  const sizesFor=(p,color)=>{const vs=Array.isArray(p?.variants)?p.variants.filter(v=>v.active!==false&&(!color||v.color===color)):[];return vs.length?[...new Set(vs.map(v=>v.size))]:(p?.sizes || ['S','M','L','XL']);};
  const colors={'Đỏ':'#b91c1c','Đen':'#242424','Trắng':'#ffffff','Đỏ trầm':'#80252c','Trắng ngà':'#f3eee2','Nâu đất':'#805d48','Hồng sen':'#dd8a99','Hồng phấn':'#eac5c9','Xanh nhạt':'#a9c9cb','Xanh rêu':'#4b5d46'};
  const priceRanges=[['under500','Dưới 500.000đ',0,500000],['500to1m','500.000đ - 1.000.000đ',500000,1000000],['1to2m','1.000.000đ - 2.000.000đ',1000000,2000000],['2to3m','2.000.000đ - 3.000.000đ',2000000,3000000],['over3m','Từ 3.000.000đ',3000000,Infinity]];
  // Ngày thêm minh họa của dữ liệu sản phẩm trong bản trình diễn.
  const addedDates=['2026-01-10','2026-03-14','2026-02-02','2026-04-05','2026-01-21','2026-02-25','2026-05-12','2026-06-08','2026-07-01'];
  products.forEach((p,i)=>p.addedAt=addedDates[i]);
  const money=n=>new Intl.NumberFormat('vi-VN').format(n)+'₫';
  const esc=s=>String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const find=id=>products.find(p=>p.id===id);
  const key=(id,size)=>id+'|'+size;
  const variantFor=(id,size,color)=>{const p=find(id);return p?.variants?.find(v=>v.size===size&&(!color||v.color===color)&&v.active!==false)||null;};
  const skuFor=(id,size,color)=>variantFor(id,size,color)?.sku||null;
  const unitPriceFor=(p,v)=>(v&&v.priceOverride!==null&&v.priceOverride!==undefined)?v.priceOverride:(p?.price||0);
  const available=(id,size,color)=>{if(Object.prototype.hasOwnProperty.call(state.stock,key(id,size)))return state.stock[key(id,size)];const sku=skuFor(id,size,color);if(sku&&Object.prototype.hasOwnProperty.call(state.stock,sku))return state.stock[sku];return serverMode?0:8;};
  const changeStock=(id,size,n)=>{const sku=skuFor(id,size);const k=(sku&&Object.prototype.hasOwnProperty.call(state.stock,sku))?sku:key(id,size);state.stock[k]=Math.max(0,available(id,size)+n);};
  const cartCount=()=>state.cart.reduce((s,i)=>s+i.qty,0);
  const subtotal=()=>state.cart.reduce((s,i)=>{const p=find(i.id);const v=i.sku?(p?.variants?.find(x=>x.sku===i.sku)):variantFor(i.id,i.size,i.color);return s+unitPriceFor(p,v)*i.qty;},0);
  function quantityInCart(id,size,color){
    const sku=skuFor(id,size,color);
    return state.cart.reduce((total,item)=>{
      const match=sku&&item.sku?item.sku===sku:(item.id===id&&item.size===size&&(!color||!item.color||item.color===color));
      return match?total+item.qty:total;
    },0);
  }
  function cartStockIssue(item){
    const p=find(item.id);
    if(!p||p.active===false)return 'Sản phẩm này đã ngừng kinh doanh.';
    const v=item.sku?(p.variants?.find(x=>x.sku===item.sku&&x.active!==false)):variantFor(item.id,item.size,item.color);
    if(serverMode&&!v)return 'Phân loại này đã ngừng bán.';
    const stock=available(item.id,item.size,item.color||v?.color);
    if(stock<1)return 'Phân loại này đã hết hàng.';
    if(item.qty>stock)return `Chỉ còn ${stock} sản phẩm trong kho. Vui lòng giảm số lượng.`;
    return '';
  }
  function catalogStock(p){
    const cols=colorsFor(p);
    const szs=sizesFor(p);
    const inStock=szs.filter(s=>cols.some(c=>sizesFor(p,c).includes(s)&&available(p.id,s,c)>0));
    if(!inStock.length)return '<p class="vp-stock vp-stock-out">Hết hàng</p>';
    if(szs.length===1)return '<p class="vp-stock vp-stock-in">Còn hàng</p>';
    const outOfStock=szs.filter(s=>!inStock.includes(s));
    return `<p class="vp-stock"><span class="vp-stock-in">Còn hàng: ${esc(inStock.join(', '))}</span>${outOfStock.length?`<span class="vp-stock-out">Hết size: ${esc(outOfStock.join(', '))}</span>`:''}</p>`;
  }
  function normalizeSearch(value){
    return String(value||'').toLocaleLowerCase('vi').normalize('NFD').replace(/\p{M}/gu,'').replace(/đ/g,'d').trim().replace(/\s+/g,' ');
  }
  function matchesSearch(product,query){
    if(!query)return true;
    return normalizeSearch(product.name).includes(query)||normalizeSearch(product.category).includes(query);
  }
  function searchSuggestions(value=''){
    const query=normalizeSearch(value);
    const cats=[...new Set(products.map(p=>p.category))].filter(name=>normalizeSearch(name).includes(query));
    const results=products.filter(p=>matchesSearch(p,query)).slice(0,4);
    if(!cats.length&&!results.length)return '<p class="vp-muted">Không tìm thấy tên sản phẩm hoặc danh mục phù hợp.</p>';
    return `${cats.length?`<h3>Danh mục</h3><div class="vp-search-categories">${cats.map(name=>`<button type="button" data-action="search-category" data-name="${esc(name)}">${esc(name)}</button>`).join('')}</div>`:''}${results.length?`<h3>${query?'Sản phẩm phù hợp':'Sản phẩm gợi ý'}</h3>${results.map(p=>`<button type="button" class="vp-search-product" data-action="product" data-id="${esc(p.id)}"><img src="${esc(p.img)}" alt=""><span><b>${esc(p.name)}</b><small>${money(p.price)}</small></span></button>`).join('')}`:''}`;
  }
  function showSearchResults(query,selectedCategory='Tất cả'){
    search=String(query||'').trim();category=selectedCategory;filters={sizes:[],colors:[],prices:[]};close();renderProducts();
    if(productPage && !productPage.hidden) location.hash='san-pham';
    else document.getElementById('product-grid')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function updateCount(){
    document.querySelectorAll('#cart-count,[data-cart-count]').forEach(x=>x.textContent=cartCount());
    if(selectedProduct && productPage && !productPage.hidden && find(selectedProduct)) renderProductSummary();
  }
  function renderProducts(){
    const grid=document.getElementById('product-grid'); if(!grid) return;
    const query=normalizeSearch(search);
    let list=products.filter(p=>{
      const pColors=colorsFor(p);
      const matchedColors=filters.colors.length?pColors.filter(c=>filters.colors.includes(c)):pColors;
      return (category==='Tất cả'||p.category===category)
        && matchesSearch(p,query)
        && matchedColors.length>0
        && (!filters.sizes.length || filters.sizes.some(s=>matchedColors.some(c=>sizesFor(p,c).includes(s)&&available(p.id,s,c)>0)))
        && (!filters.prices.length || priceRanges.some(([id,,min,max])=>filters.prices.includes(id)&&p.price>=min&&p.price<max));
    });
    if(sort==='price-asc') list.sort((a,b)=>a.price-b.price);
    if(sort==='price-desc') list.sort((a,b)=>b.price-a.price);
    if(sort==='newest') list.sort((a,b)=>String(b.addedAt||'').localeCompare(String(a.addedAt||'')));
    const count=document.querySelector('[data-product-count]');if(count) count.textContent=list.length+' sản phẩm';
    const summary=document.getElementById('filter-summary');if(summary) summary.textContent=list.length+' sản phẩm'+(filters.sizes.length+filters.colors.length+filters.prices.length?' · '+(filters.sizes.length+filters.colors.length+filters.prices.length)+' lựa chọn lọc':'');
    const searchInput=document.getElementById('catalog-search');if(searchInput && searchInput.value!==search)searchInput.value=search;
    const categoryInput=document.getElementById('catalog-category');if(categoryInput)categoryInput.value=category;
    const sortInput=document.getElementById('catalog-sort');if(sortInput)sortInput.value=sort;
    grid.innerHTML=list.length?list.map((p,i)=>{const hasDisc=p.old&&p.old>p.price;const discPct=hasDisc?Math.round((p.old-p.price)/p.old*100):0;return `<article class="vp-product"><button class="vp-product-image" data-action="product" data-id="${p.id}" aria-label="Xem ${esc(p.name)}"><img src="${p.img}" alt="${esc(p.name)}" loading="${i<4?'eager':'lazy'}"><span class="vp-product-tag">${p.tag}</span><span class="vp-product-view">KHÁM PHÁ SẢN PHẨM</span></button><div class="vp-product-info"><div class="vp-product-category">${esc(p.category)}</div><button class="vp-product-name" data-action="product" data-id="${p.id}">${esc(p.name)}</button><div class="vp-product-price">${money(p.price)} ${hasDisc?`<del>${money(p.old)}</del> <small class="vp-disc-tag">-${discPct}%</small>`:''}</div><div class="vp-swatches"><span style="background:${colors[p.color]||'#aaa'}"></span><small>${esc(p.color)}</small></div>${catalogStock(p)}</div></article>`;}).join(''):'<p class="vp-empty">Không tìm thấy sản phẩm phù hợp. Hãy thử thay đổi từ khóa hoặc bộ lọc.</p>';
    document.querySelectorAll('[data-category]').forEach(el=>el.classList.toggle('active',el.dataset.category===category));
  }
  const css=`
  .vp-product{min-width:0}.vp-product-image{position:relative;display:block;width:100%;aspect-ratio:3/4;border:0;padding:0;background:#ede9e3;overflow:hidden;cursor:pointer}.vp-product-image img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .6s}.vp-product-image:hover img{transform:scale(1.04)}.vp-product-tag{position:absolute;left:12px;top:12px;background:#f8f6f0;padding:6px 8px;font:600 9px Arial;letter-spacing:.08em}.vp-product-view{position:absolute;bottom:0;left:0;right:0;padding:14px;color:white;background:#25231f;font:600 10px Arial;letter-spacing:.1em;transform:translateY(100%);transition:.25s}.vp-product-image:hover .vp-product-view{transform:translateY(0)}.vp-product-info{padding:15px 0 23px}.vp-product-category{font-size:11px;color:#8f8980;margin-bottom:7px}.vp-product-name{border:0;background:none;padding:0;text-align:left;cursor:pointer;font-size:14px;font-weight:600;color:#25231f}.vp-product-price{font-size:14px;margin-top:8px;font-weight:600}.vp-product-price del{font-weight:400;color:#aaa;margin-left:7px}.vp-swatches{display:flex;align-items:center;gap:7px;margin-top:11px;color:#928a80}.vp-swatches span{width:13px;height:13px;border-radius:50%;background:#8f5147;border:2px solid white;outline:1px solid #b8a79e}.vp-swatches small{font-size:10px}.vp-overlay{position:fixed;inset:0;z-index:9999;background:rgba(26,24,21,.5);display:flex;justify-content:flex-end;align-items:stretch}.vp-overlay.center{align-items:center;justify-content:center;padding:24px}.vp-panel{background:#fcfbf8;color:#292824;width:min(100%,510px);height:100%;overflow:auto;box-shadow:0 12px 48px #0002;font-family:Arial,sans-serif}.vp-overlay.center .vp-panel{width:min(100%,900px);height:auto;max-height:90vh}.vp-head{position:sticky;top:0;background:#fcfbf8;z-index:2;display:flex;justify-content:space-between;align-items:center;padding:23px 26px;border-bottom:1px solid #e9e6df}.vp-head h2{font:400 25px Georgia,serif;margin:0}.vp-close{font-size:26px;line-height:1;border:0;background:none;cursor:pointer;color:#222}.vp-body{padding:26px}.vp-body p{line-height:1.65}.vp-muted{font-size:12px;color:#807b72;line-height:1.6}.vp-note{background:#f2eee5;padding:13px 15px;font-size:12px;line-height:1.6;margin:15px 0}.vp-btn{display:inline-flex;justify-content:center;align-items:center;gap:8px;border:1px solid #272621;background:#272621;color:white;padding:14px 18px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;cursor:pointer;text-decoration:none}.vp-btn:hover{background:#5a3a33}.vp-btn.secondary{background:transparent;color:#25231f}.vp-btn:disabled{opacity:.4;cursor:not-allowed}.vp-full{width:100%;margin-top:12px}.vp-form label{font-size:12px;font-weight:600;display:block;margin:16px 0 7px}.vp-form input,.vp-form select,.vp-form textarea,.vp-input{width:100%;border:1px solid #d9d5cc;background:#fff;padding:13px;font:14px Arial;color:#292824;border-radius:0;box-sizing:border-box}.vp-form textarea{min-height:80px;resize:vertical}.vp-row{display:flex;justify-content:space-between;gap:12px;align-items:center}.vp-line{border-top:1px solid #e9e6df;margin:20px 0}.vp-item{display:flex;gap:16px;padding:16px 0;border-bottom:1px solid #eeeae3}.vp-item img{width:80px;height:105px;object-fit:cover;background:#eee}.vp-item-info{flex:1;min-width:0}.vp-item h3{font-size:14px;margin:2px 0 8px}.vp-item p{font-size:12px;color:#827c74;margin:5px 0}.vp-link{border:0;background:none;padding:0;text-decoration:underline;cursor:pointer;font-size:12px;color:#5d544d}.vp-qty{display:inline-flex;border:1px solid #ddd;align-items:center;margin-top:8px}.vp-qty button{border:0;background:none;padding:7px 11px;cursor:pointer}.vp-qty span{font-size:12px}.vp-detail{display:grid;grid-template-columns:1fr 1fr}.vp-detail img{width:100%;height:100%;max-height:680px;object-fit:cover}.vp-detail-info{padding:35px}.vp-detail h3{font:400 32px Georgia,serif;margin:10px 0 14px}.vp-detail-price{font-size:20px;font-weight:bold}.vp-size{display:flex;gap:8px;margin:12px 0}.vp-size button{background:white;border:1px solid #d5d0c8;min-width:42px;height:42px;cursor:pointer}.vp-size button.active{background:#272621;color:white;border-color:#272621}.vp-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 20px}.vp-tabs button{background:none;border:1px solid #ded9d0;padding:9px;cursor:pointer;font-size:11px}.vp-tabs button.active{background:#292824;color:white}.vp-order{border:1px solid #e3dfd7;padding:16px;margin:12px 0}.vp-order h3{font-size:14px;margin:0}.vp-order p{font-size:12px;margin:6px 0}.vp-status{display:inline-block;background:#e9eee5;color:#415b3f;padding:6px 8px;font-size:10px}.vp-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.vp-stat{background:#f2eee7;padding:15px}.vp-stat strong{display:block;font:24px Georgia;margin-top:8px}.vp-toast{position:fixed;bottom:25px;left:50%;transform:translateX(-50%);z-index:10001;background:#292824;color:white;padding:14px 22px;font:13px Arial;box-shadow:0 5px 20px #0003}.vp-empty{color:#817a70;padding:35px 0;font-size:14px}.vp-product-image img{color:#80796f}.vp-inline-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}@media(max-width:650px){.vp-overlay.center{padding:0;align-items:stretch}.vp-overlay.center .vp-panel{height:100%;max-height:none}.vp-detail{grid-template-columns:1fr}.vp-detail img{max-height:380px}.vp-detail-info{padding:24px}.vp-stats{grid-template-columns:1fr 1fr}.vp-body{padding:20px}.vp-head{padding:20px}}
  `;
  const filterCss=`
    .vp-stock{display:flex;flex-wrap:wrap;gap:3px 10px;font-size:12px;margin:7px 0 0}.vp-stock-in{color:#21603d;font-weight:600}.vp-stock-out{color:#912d37;font-weight:600}.vp-search-suggestions{margin-top:20px}.vp-search-suggestions h3{margin:14px 0 8px;font-size:14px}.vp-search-categories{display:flex;flex-wrap:wrap;gap:8px}.vp-search-categories button{background:#fff;border:1px solid #ded7cf;border-radius:16px;color:#362d28;padding:7px 12px;cursor:pointer;text-align:left;font-size:12px}.vp-search-product{width:100%;display:flex;align-items:center;gap:12px;padding:10px 0;background:none;border:0;border-bottom:1px solid #eee8e4;text-align:left;color:#26211f;cursor:pointer}.vp-search-product img{width:44px;height:55px;object-fit:cover;border-radius:4px}.vp-search-product span{min-width:0;overflow-wrap:anywhere}.vp-search-product small{display:block;margin-top:4px;color:#615b56}.vp-search-product:hover,.vp-search-categories button:hover{background:#f3ece5}.vp-filter-form{display:flex;flex-direction:column;min-height:calc(100% - 76px);background:#fff}.vp-filter-content{flex:1;padding:12px 28px 25px}.vp-filter-group{border:0;border-bottom:1px solid #eee8e4;padding:14px 0 22px;margin:0}.vp-filter-group summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-size:15px;font-weight:600;letter-spacing:.04em;padding:5px 0 13px}.vp-filter-group summary::-webkit-details-marker{display:none}.vp-filter-group summary:after{content:'⌃';font-size:16px}.vp-filter-group:not([open]) summary:after{content:'⌄'}.vp-filter-check{display:flex;align-items:center;justify-content:space-between;gap:16px;font-size:14px;padding:6px 0;cursor:pointer}.vp-filter-check input{width:17px;height:17px;accent-color:#26211f;cursor:pointer}.vp-filter-check:has(input:disabled){color:#aaa;cursor:not-allowed}.vp-color-grid{display:flex;flex-wrap:wrap;gap:10px;padding:4px 0}.vp-color-choice{display:inline-flex;position:relative;cursor:pointer}.vp-color-choice input{position:absolute;width:1px;height:1px;opacity:0}.vp-color-choice span{display:block;width:29px;height:29px;background:var(--swatch);border:3px solid white;border-radius:50%;box-shadow:0 0 0 1px #c9c9c9}.vp-color-choice input:checked+span{box-shadow:0 0 0 2px #251f1d}.vp-color-choice input:focus-visible+span{outline:2px solid #70272e;outline-offset:4px}.vp-filter-actions{position:sticky;bottom:0;display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#fff;padding:16px 28px;border-top:1px solid #eee}.vp-filter-actions .vp-btn{width:100%;padding:13px 8px;min-height:46px}.vp-filter-hint{font-size:12px;color:#777;line-height:1.6;margin:4px 0 12px}@media(max-width:520px){.vp-filter-content{padding-left:18px;padding-right:18px}.vp-filter-actions{padding:12px 18px}.vp-filter-group summary{font-size:14px}}
  `;
  const policyCss=`
    .vp-disc-tag{display:inline-block;background:#f4e8e6;color:#762F38;font-size:10px;font-weight:700;padding:2px 6px;margin-left:4px;vertical-align:middle}
    .vp-policy-overlay{position:fixed;inset:0;z-index:10000;background:rgba(26,24,21,.52);display:flex;justify-content:flex-end;align-items:stretch;opacity:0;transition:opacity .24s ease}
    .vp-policy-overlay.open{opacity:1}
    .vp-policy-drawer{width:min(740px,100vw);height:100vh;max-height:100vh;background:#F7F3EB;color:#352C28;display:flex;flex-direction:column;box-shadow:-10px 0 36px rgba(26,24,21,.22);transform:translateX(100%);transition:transform .28s cubic-bezier(.22,1,.36,1);font-family:Arial,sans-serif;overflow:hidden}
    .vp-policy-overlay.open .vp-policy-drawer{transform:translateX(0)}
    .vp-policy-head{flex:0 0 auto;background:#F7F3EB;border-bottom:1px solid #E8DDCB;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;gap:12px}
    .vp-policy-head h2{font:500 22px Georgia,serif;margin:0;color:#762F38}
    .vp-policy-head .vp-muted{margin:4px 0 0;color:#82766B;font-size:12px}
    .vp-policy-close{min-width:44px;min-height:44px;border:1px solid #E8DDCB;background:#F7F3EB;color:#352C28;font-size:24px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
    .vp-policy-close:hover{background:#E8DDCB;color:#762F38}
    .vp-policy-layout{display:grid;grid-template-columns:225px 1fr;flex:1;min-height:0}
    .vp-policy-nav{border-right:1px solid #E8DDCB;background:#E8DDCB;padding:12px 8px;overflow-y:auto}
    .vp-policy-nav button{display:block;width:100%;text-align:left;background:none;border:0;border-left:3px solid transparent;padding:10px 12px;font-size:13px;color:#352C28;cursor:pointer;margin-bottom:3px;line-height:1.4}
    .vp-policy-nav button:hover{background:rgba(247,243,235,.65);color:#762F38}
    .vp-policy-nav button.active{background:#F7F3EB;border-left-color:#762F38;color:#762F38;font-weight:700}
    .vp-policy-content{padding:24px 28px;overflow-y:auto;min-width:0;background:#F7F3EB}
    .vp-policy-content h3{font:600 21px Georgia,serif;margin:0 0 6px;color:#762F38}
    .vp-policy-text{font-size:14px;line-height:1.75;color:#352C28;margin:14px 0}.vp-policy-text h4{font:600 16px Georgia,serif;color:#762F38;margin:22px 0 8px}.vp-policy-text p{margin:0 0 12px}.vp-policy-text ul,.vp-policy-text ol{padding-left:24px;margin:8px 0 16px}.vp-policy-text li{padding-left:3px;margin:4px 0}.vp-policy-table-wrap{max-width:100%;overflow-x:auto;margin:12px 0 18px}
    .vp-policy-table{width:100%;border-collapse:collapse;font-size:12.5px;margin:14px 0;background:#fcf9f2}
    .vp-policy-table th,.vp-policy-table td{border:1px solid #E8DDCB;padding:8px 10px;text-align:left;vertical-align:top}
    .vp-policy-table th{background:#E8DDCB;color:#352C28;font-weight:700}
    .vp-promo-box{border:1px dashed #B99A62;background:#fcf9f2;padding:10px 12px;margin:10px 0;font-size:12px;line-height:1.6;color:#352C28}
    .vp-policy-links{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}
    .vp-error{background:#fbe5e5;color:#762F38;padding:10px 12px;font-size:12.5px;margin:10px 0;border-left:3px solid #762F38}
    @media(max-width:700px){.vp-policy-drawer{width:100vw}.vp-policy-head{padding:14px 16px}.vp-policy-head h2{font-size:19px}.vp-policy-layout{grid-template-columns:1fr;grid-template-rows:auto 1fr}.vp-policy-nav{border-right:0;border-bottom:1px solid #d9cbb6;display:flex;overflow-x:auto;gap:6px;padding:10px 12px;-webkit-overflow-scrolling:touch}.vp-policy-nav button{white-space:nowrap;width:auto;border-left:0;border-bottom:3px solid transparent;margin:0;padding:8px 10px}.vp-policy-nav button.active{border-bottom-color:#762F38;background:#F7F3EB}.vp-policy-content{padding:18px 16px}}
  `;
  const style=document.createElement('style');style.textContent=css+filterCss+policyCss;document.head.appendChild(style);
  const toast=msg=>{document.querySelector('.vp-toast')?.remove();let t=document.createElement('div');t.className='vp-toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),3000);};
  let savedScrollY=null;
  function lockBodyScroll(){if(savedScrollY===null)savedScrollY=window.scrollY||0;document.body.style.overflow='hidden';}
  function unlockBodyScroll(){if(!document.querySelector('.vp-overlay')&&!document.querySelector('.vp-policy-overlay')){document.body.style.overflow='';if(savedScrollY!==null){const y=savedScrollY;savedScrollY=null;if(window.scrollY!==y&&typeof window.scrollTo==='function')window.scrollTo(0,y);}}}
  function modal(title,body,center=false){document.querySelector('.vp-overlay')?.remove();let el=document.createElement('div');el.className='vp-overlay'+(center?' center':'');el.innerHTML=`<section class="vp-panel" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="vp-head"><h2>${esc(title)}</h2><button class="vp-close" data-action="close" aria-label="Đóng">×</button></div>${body}</section>`;document.body.appendChild(el);lockBodyScroll();}
  function closePolicyDrawer(){const ov=document.querySelector('.vp-policy-overlay');if(ov){ov.remove();}unlockBodyScroll();}
  function close(){document.querySelector('.vp-overlay')?.remove();document.querySelector('.vp-policy-overlay')?.remove();unlockBodyScroll();}
  function openFilters(){
    const allSizes=['XS','S','M','L','XL','XXL','Freesize','One Size'];
    const sizeRows=allSizes.map(s=>{const offered=products.some(p=>sizesFor(p).includes(s)&&available(p.id,s)>0);return `<label class="vp-filter-check"><span>${esc(s)}</span><input type="checkbox" name="sizes" value="${esc(s)}" ${filters.sizes.includes(s)?'checked':''} ${!offered&&!filters.sizes.includes(s)?'disabled':''}></label>`;}).join('');
    const colorRows=Object.entries(colors).map(([name,color])=>`<label class="vp-color-choice" title="${esc(name)}"><input type="checkbox" name="colors" value="${esc(name)}" aria-label="${esc(name)}" ${filters.colors.includes(name)?'checked':''}><span style="--swatch:${color}"></span></label>`).join('');
    const priceRows=priceRanges.map(([id,label])=>`<label class="vp-filter-check"><span>${label}</span><input type="checkbox" name="prices" value="${id}" ${filters.prices.includes(id)?'checked':''}></label>`).join('');
    modal('Bộ lọc sản phẩm',`<form class="vp-filter-form" data-form="filters"><div class="vp-filter-content"><p class="vp-filter-hint">Chọn một hoặc nhiều giá trị trong mỗi nhóm.</p><details class="vp-filter-group" open><summary>KÍCH THƯỚC</summary>${sizeRows}</details><details class="vp-filter-group" open><summary>MÀU SẮC</summary><div class="vp-color-grid">${colorRows}</div></details><details class="vp-filter-group" open><summary>KHOẢNG GIÁ</summary>${priceRows}</details></div><div class="vp-filter-actions"><button type="button" class="vp-btn secondary" data-action="filter-reset">XÓA BỘ LỌC</button><button type="submit" class="vp-btn">XEM KẾT QUẢ</button></div></form>`);
    document.querySelector('.vp-overlay .vp-close')?.focus();
  }
  function detail(id){let p=find(id);if(!p)return;selectedProduct=id;const cols=colorsFor(p);selectedColor=cols[0]||p.color||'';const szs=sizesFor(p,selectedColor);selectedSize=szs.includes('M')?'M':szs[0];selectedQty=1;renderDetail();}
  function renderDetail(){
    const p=find(selectedProduct);if(!p)return;
    const cols=colorsFor(p);if(!cols.includes(selectedColor))selectedColor=cols[0]||p.color||'';
    const szs=sizesFor(p,selectedColor);if(!szs.includes(selectedSize))selectedSize=szs[0];
    const v=variantFor(p.id,selectedSize,selectedColor);
    const stockAvail=available(p.id,selectedSize,selectedColor);
    const inCart=quantityInCart(p.id,selectedSize,selectedColor);
    const remaining=Math.max(0,stockAvail-inCart);
    if(selectedQty>remaining&&remaining>0)selectedQty=remaining;
    if(selectedQty<1)selectedQty=1;
    const price=unitPriceFor(p,v);
    const hasDisc=p.old&&p.old>price;
    const discPct=hasDisc?Math.round((p.old-price)/p.old*100):0;
    const colorButtons=cols.length>1?`<p><b>Màu sắc:</b> ${esc(selectedColor)}</p><div class="vp-size">${cols.map(c=>`<button class="${c===selectedColor?'active':''}" data-action="detail-color" data-color="${esc(c)}">${esc(c)}</button>`).join('')}</div>`:`<p><b>Màu sắc:</b> ${esc(selectedColor)}<br><b>Chất liệu:</b> ${esc(p.material)}</p>`;
    modal('Chi tiết sản phẩm',`<div class="vp-detail"><img src="${esc(p.img)}" alt="${esc(p.name)}"><div class="vp-detail-info"><div class="vp-muted">${esc(p.category)} / VIỆT PHỤC</div><h3>${esc(p.name)}</h3><div class="vp-detail-price">${money(price)} ${hasDisc?`<del style="font-size:15px;color:#999;font-weight:400;margin-left:6px">${money(p.old)}</del> <span class="vp-disc-tag">Giảm ${money(p.old-price)} (-${discPct}%)</span>`:''}</div><p>${esc(p.description||'Một thiết kế mang nét đẹp truyền thống vào những khoảnh khắc đáng nhớ.')}</p><div class="vp-line"></div>${colorButtons}${cols.length>1?`<p><b>Chất liệu:</b> ${esc(p.material)}</p>`:''}<p><b>Kích thước:</b> ${esc(selectedSize)}${v?.sku?` · <small class="vp-muted">SKU: ${esc(v.sku)}</small>`:''}</p><div class="vp-size">${szs.map(s=>`<button class="${s===selectedSize?'active':''}" data-action="size" data-size="${esc(s)}">${esc(s)}</button>`).join('')}</div><div class="vp-row" style="margin:12px 0"><span><b>Số lượng</b></span><div class="vp-qty"><button type="button" data-action="detail-qty" data-delta="-1">−</button><span style="padding:0 12px">${selectedQty}</span><button type="button" data-action="detail-qty" data-delta="1">+</button></div></div><p class="vp-muted">Còn ${stockAvail} sản phẩm ở phân loại này${inCart?` (trong giỏ: ${inCart} · có thể thêm: ${remaining})`:''}.${p.category==='Phụ kiện'?' Kích thước dùng chung.':' Bảng size tham khảo: S 40–47 kg · M 48–54 kg · L 55–61 kg · XL 62–68 kg.'}</p><button class="vp-btn vp-full" data-action="add" ${remaining<1?'disabled':''}>THÊM VÀO GIỎ HÀNG — ${money(price*selectedQty)}</button><button class="vp-btn secondary vp-full" data-action="buy" ${remaining<1?'disabled':''}>MUA NGAY</button><div class="vp-note">Giặt nhẹ bằng tay, tránh ngâm lâu và phơi dưới nắng gắt. Đổi size/mẫu trong <b>7 ngày</b> từ khi nhận hàng · Hỗ trợ lỗi may sẵn trong <b>30 ngày</b>.<div class="vp-policy-links"><button type="button" class="vp-link" data-action="policy" data-policy="returns">Chính sách đổi trả</button><button type="button" class="vp-link" data-action="policy" data-policy="warranty">Hỗ trợ chất lượng</button><button type="button" class="vp-link" data-action="policy" data-policy="size">Bảng size</button><button type="button" class="vp-link" data-action="policy" data-policy="pricing">Chính sách giá</button></div></div></div></div>`,true);
  }
  const productPage = document.getElementById('product-page');
  const homePage = document.getElementById('home');
  const homeTitle = document.title;
  let catalogLoaded = !serverMode;
  let currentHash;

  function navigateToProduct(id) {
    const hash = '#/product/' + encodeURIComponent(id);
    if (location.hash === hash) return;
    if (homePage && !homePage.hidden) {
      history.replaceState({...history.state, catalogScroll: window.scrollY}, '');
    }
    history.pushState(null, '', hash);
    router();
  }

  function renderHomePage() {
    const returning = !productPage.hidden;
    productPage.hidden = true;
    productPage.replaceChildren();
    homePage.hidden = false;
    selectedProduct = null;
    document.title = homeTitle;
    if (!returning) return;
    const anchor = document.getElementById(location.hash.slice(1));
    if (Number.isFinite(history.state?.catalogScroll)) {
      window.scrollTo({top: history.state.catalogScroll, behavior: 'instant'});
    } else if (anchor) {
      anchor.scrollIntoView();
    } else {
      window.scrollTo({top: 0, behavior: 'instant'});
    }
  }

  function renderProductSummary() {
    const p = find(selectedProduct);
    const sizes = sizesFor(p, selectedColor);
    if (!sizes.includes(selectedSize)) selectedSize = sizes[0];
    const variant = variantFor(p.id, selectedSize, selectedColor);
    const stock = available(p.id, selectedSize, selectedColor);
    const inCart = quantityInCart(p.id, selectedSize, selectedColor);
    const remaining = Math.max(0, stock - inCart);
    const price = unitPriceFor(p, variant);
    selectedQty = Math.min(selectedQty, Math.max(1, remaining));
    const summary = productPage.querySelector('.product-summary');
    const focused = summary.contains(document.activeElement) ? document.activeElement : null;
    function choices(values, field, active, action) {
      return values.map(value => `<button type="button" data-action="${action}" data-${field}="${esc(value)}"
        aria-pressed="${value === active}">${esc(value)}</button>`).join('');
    }
    summary.innerHTML = `<p class="product-category">${esc(p.category)}</p>
      <h1>${esc(p.name)}</h1>
      <p class="product-price">${money(price)} ${p.old > price ? `<del>${money(p.old)}</del>` : ''}</p>
      <fieldset><legend>Màu sắc</legend>${choices(colorsFor(p), 'color', selectedColor, 'detail-color')}</fieldset>
      <fieldset><legend>Kích thước</legend>${choices(sizes, 'size', selectedSize, 'size')}</fieldset>
      <p class="product-stock">Còn ${stock} sản phẩm${inCart ? ` (trong giỏ: ${inCart} · có thể thêm: ${remaining})` : ''}${variant?.sku ? ' · SKU ' + esc(variant.sku) : ''}</p>
      <div class="product-quantity"><strong>Số lượng</strong>
        <button data-action="detail-qty" data-delta="-1" aria-label="Giảm số lượng" ${selectedQty <= 1 ? 'disabled' : ''}>−</button>
        <output>${selectedQty}</output>
        <button data-action="detail-qty" data-delta="1" aria-label="Tăng số lượng" ${selectedQty >= remaining ? 'disabled' : ''}>+</button>
      </div>
      <div class="product-actions mobile-action-bar">
        <button class="vp-btn secondary" data-action="add" ${remaining < 1 ? 'disabled' : ''}>THÊM VÀO GIỎ</button>
        <button class="vp-btn" data-action="buy" ${remaining < 1 ? 'disabled' : ''}>MUA NGAY</button>
      </div>`;
    if (focused) Array.from(summary.querySelectorAll('button')).find(button =>
      button.dataset.action === focused.dataset.action && button.textContent === focused.textContent
    )?.focus({preventScroll: true});
  }

  function renderProductPage(id) {
    homePage.hidden = true;
    productPage.hidden = false;
    const p = find(id);
    if (!catalogLoaded || !p || p.active === false || (serverMode && !dbReady)) {
      selectedProduct = null;
      const message = !catalogLoaded ? 'Đang tải sản phẩm…' : serverMode && !dbReady
        ? 'Chưa tải được sản phẩm.' : 'Sản phẩm không còn hiển thị.';
      document.title = message + ' | Việt Phục';
      productPage.innerHTML = `<h1>${message}</h1><a href="#san-pham">Về danh sách sản phẩm</a>`;
      return;
    }
    selectedProduct = id;
    selectedColor = colorsFor(p)[0] || '';
    const sizes = sizesFor(p, selectedColor);
    selectedSize = sizes.includes('M') ? 'M' : sizes[0];
    selectedQty = 1;
    document.title = p.name + ' | Việt Phục';
    const photos = [...new Set([p.img, ...(Array.isArray(p.images) ? p.images : [])]
      .filter(src => typeof src === 'string' && src))];
    const description = esc(p.description || (p.name + ' thuộc bộ sưu tập ' + p.category + ' của Việt Phục.'));
    const accordion = (title, content, open = false) => `<details ${open ? 'open' : ''}>
      <summary>${title}</summary><div>${content}</div></details>`;
    const policy = (title, key) => publicPolicies?.visibility?.[key] === false ? '' :
      accordion(title, renderPolicyDocument(publicPolicies?.items?.[key] || POLICY_FALLBACK[key]));
    const related = products.filter(item => item.id !== id && item.active !== false && item.category === p.category).slice(0, 4);
    productPage.innerHTML = `<nav class="product-crumbs" aria-label="Đường dẫn">
      <a href="#home">Trang chủ</a> / <a href="#san-pham">Sản phẩm</a> / <span aria-current="page">${esc(p.name)}</span></nav>
      <div class="product-layout">
        <div class="product-gallery">
          <img class="product-main-image" src="${esc(photos[0])}" alt="${esc(p.name)}">
          <div class="product-thumbnails">${photos.map((src,i) => `<button data-action="product-photo" aria-label="Xem ảnh ${i+1}" aria-pressed="${i === 0}">
            <img src="${esc(src)}" alt=""></button>`).join('')}</div>
        </div><section class="product-summary"></section>
      </div>
      <section class="product-accordion" aria-label="Thông tin sản phẩm">
        ${accordion('Mô tả sản phẩm', description, true)}
        ${accordion('Chất liệu', esc(p.material || 'Đang cập nhật'))}
        ${policy('Hướng dẫn chọn size', 'size')}
        ${policy('Chính sách giao hàng', 'shipping')}
        ${policy('Chính sách đổi trả', 'returns')}
        ${accordion('Hướng dẫn bảo quản', esc(p.care || 'Giặt nhẹ bằng tay, tránh ngâm lâu và phơi dưới nắng gắt.'))}
      </section>
      ${related.length ? `<section class="product-related"><h2>Sản phẩm liên quan</h2><div>
        ${related.map(item => `<a href="#/product/${encodeURIComponent(item.id)}" data-action="product" data-id="${esc(item.id)}">
          <img src="${esc(item.img)}" alt="" loading="lazy"><strong>${esc(item.name)}</strong><span>${money(item.price)}</span></a>`).join('')}
      </div></section>` : ''}`;
    renderProductSummary();
  }

  function router() {
    if (!productPage || currentHash === location.hash) return;
    currentHash = location.hash;
    const match = /^#\/product\/([^/]+)$/.exec(currentHash);
    if (!match && productPage.hidden) return;
    if (document.querySelector('.vp-overlay')) close();
    if (document.querySelector('.vp-policy-overlay')) closePolicyDrawer();
    if (!match) { renderHomePage(); return; }
    let id;
    try { id = decodeURIComponent(match[1]); } catch { id = ''; }
    renderProductPage(id);
    window.scrollTo({top: 0, behavior: 'instant'});
  }

  async function add(){
    try{
      const productId=selectedProduct,size=selectedSize,color=selectedColor,qty=Math.max(1,Number(selectedQty)||1);
      const p=find(productId);
      if(!p||p.active===false)throw new Error('Sản phẩm hiện không còn kinh doanh.');
      const v=variantFor(productId,size,color);
      const sku=v?.sku||null;
      if(serverMode&&!sku)throw new Error('Biến thể sản phẩm không hợp lệ hoặc đã ngừng bán.');
      const existing=state.cart.find(i=>sku?(i.sku===sku):(i.id===productId&&i.size===size));
      const maxAvail=available(productId,size,color);
      if((existing?.qty||0)+qty>maxAvail)throw new Error('Số lượng vượt quá tồn kho hiện tại.');
      if(serverMode){await trackPublic('cart');}else{await commitShared(()=>{state.cartEvents=(state.cartEvents||0)+1;});}
      if(existing)existing.qty+=qty;else state.cart.push({id:productId,sku,color:v?.color||color||p.color,size,qty});
      save();updateCount();return true;
    }catch(err){toast(err.message);return false;}
  }
  function cart(){
    let removedCount=0;
    if(serverMode&&products.length){
      state.cart=state.cart.filter(i=>{
        const p=find(i.id);
        const v=i.sku?(p?.variants?.find(x=>x.sku===i.sku&&x.active!==false)):variantFor(i.id,i.size,i.color);
        if(!p||p.active===false||!v){removedCount++;return false;}
        if(!i.sku)i.sku=v.sku;
        if(!i.color)i.color=v.color;
        return true;
      });
      if(removedCount>0){save();updateCount();toast('Một số sản phẩm không còn kinh doanh đã được gỡ khỏi giỏ hàng.');}
    }
    const promoHint=publicPromotions.length?`<div class="vp-promo-box"><b>Khuyến mãi đang mở:</b> ${publicPromotions.map(pr=>`<code>${esc(pr.code)}</code> (${pr.type==='percent'?`Giảm ${pr.value}%`:`Giảm ${money(pr.value)}`}${pr.minOrder?`, đơn từ ${money(pr.minOrder)}`:''})`).join(' · ')}</div>`:'';
    let hasIssue=false;
    modal('Giỏ hàng của bạn',`<div class="vp-body">${state.cart.length?state.cart.map((i,n)=>{
      const p=find(i.id);if(!p)return '';
      const v=i.sku?(p.variants?.find(x=>x.sku===i.sku)):variantFor(i.id,i.size,i.color);
      const unit=unitPriceFor(p,v);
      const issue=cartStockIssue(i);if(issue)hasIssue=true;
      return `<div class="vp-item"><img src="${esc(p.img)}" alt=""><div class="vp-item-info"><h3>${esc(p.name)}</h3><p>${esc(i.color||v?.color||p.color)} / ${esc(i.size)}${i.sku?` · <small>${esc(i.sku)}</small>`:''}</p><p>Đơn giá: ${money(unit)} · Thành tiền: <b>${money(unit*i.qty)}</b></p>${issue?`<p class="vp-stock-out">${esc(issue)}</p>`:''}<div class="vp-row"><div class="vp-qty"><button data-action="qty" data-index="${n}" data-delta="-1">−</button><span>${i.qty}</span><button data-action="qty" data-index="${n}" data-delta="1">+</button></div><button class="vp-link" data-action="remove" data-index="${n}">Xóa</button></div></div></div>`;
    }).join('')+`${promoHint}<div class="vp-row" style="margin-top:20px"><b>Tạm tính (tiền hàng)</b><b>${money(subtotal())}</b></div><p class="vp-muted">Giá đã niêm yết theo VNĐ. Phí vận chuyển và mã khuyến mãi được tính minh bạch tại bước thanh toán. <button type="button" class="vp-link" data-action="policy" data-policy="pricing">Chính sách giá</button> · <button type="button" class="vp-link" data-action="policy" data-policy="shipping">Vận chuyển</button></p><button class="vp-btn vp-full" data-action="checkout" ${hasIssue?'disabled':''}>TIẾN HÀNH THANH TOÁN →</button><button class="vp-btn secondary vp-full" data-action="clear-cart">XÓA TOÀN BỘ GIỎ HÀNG</button><button class="vp-btn secondary vp-full" data-action="close">TIẾP TỤC MUA SẮM</button>`:'<p class="vp-empty">Giỏ hàng của bạn đang trống.</p><button class="vp-btn vp-full" data-action="close">KHÁM PHÁ SẢN PHẨM</button>'}</div>`);
  }
  const POLICY_TABS=[
    ['pricing','1. Giá bán & Khuyến mãi'],
    ['purchase','2. Mua hàng & Đặt hàng'],
    ['payment','3. Thanh toán'],
    ['shipping','4. Vận chuyển'],
    ['returns','5. Đổi trả & Hoàn tiền'],
    ['warranty','6. Hỗ trợ chất lượng (30 ngày)'],
    ['privacy','7. Bảo mật thông tin'],
    ['complaints','8. Giải quyết khiếu nại'],
    ['rights','9. Quyền & Nghĩa vụ'],
    ['orderProcess','10. Quản lý đơn hàng'],
    ['size','11. Hướng dẫn chọn size'],
  ];
  const POLICY_LEGACY_MAP={about:'purchase',terms:'rights',support:'complaints',quality:'warranty'};
  const POLICY_FALLBACK={
    pricing:'Giá niêm yết bằng VNĐ (₫). Công thức: Tổng thanh toán = Tiền hàng − Giảm giá + Phí vận chuyển.',
    purchase:'Quy trình 7 bước từ chọn sản phẩm, xem chi tiết/tồn kho, thêm giỏ, nhập thông tin, chọn thanh toán & vận chuyển, kiểm tra chi phí và xác nhận đơn.',
    payment:'Hỗ trợ COD mô phỏng và thanh toán trực tuyến mô phỏng. Không tuyên bố tích hợp ngân hàng hoặc cổng thanh toán thật.',
    shipping:'Giao hàng toàn quốc. Thời gian dự kiến: Nội thành Đắk Lắk 1–2 ngày; khác trong tỉnh 2–3 ngày; tỉnh/TP lớn 2–4 ngày; vùng sâu/xa/hải đảo 4–7 ngày hoặc lâu hơn.',
    returns:'Đổi hàng theo nhu cầu trong 07 ngày từ khi nhận hàng (còn nguyên tem/nhãn/phụ kiện, chưa giặt/sửa). Hoàn tiền dự kiến trong 05 ngày làm việc sau khi duyệt.',
    warranty:'Hỗ trợ lỗi may sẵn (bung chỉ, đường may, phụ kiện) trong 30 ngày từ khi nhận hàng (chính sách đề xuất).',
    privacy:'Dữ liệu lưu cục bộ trên máy chủ local phục vụ đồ án, không tuyên bố HTTPS hay bảo mật đám mây.',
    complaints:'Mục tiêu phản hồi khiếu nại thông thường trong 01 ngày làm việc. Gửi khiếu nại tại Tài khoản > Hỗ trợ & Khiếu nại.',
    rights:'Công khai quyền và nghĩa vụ của Người bán và Khách hàng theo báo cáo.',
    orderProcess:'Phân biệt 3 nhóm trạng thái: Đơn hàng, Thanh toán và Vận chuyển cùng quy trình đối soát minh bạch.',
    size:'S: 40–47 kg · M: 48–54 kg · L: 55–61 kg · XL: 62–68 kg · Phụ kiện: One Size.',
  };
  function renderPolicyDocument(source){
    const lines=String(source||'').replace(/\r\n?/g,'\n').split('\n');
    const blocks=[];let i=0;
    while(i<lines.length){
      if(!lines[i].trim()){i++;continue;}
      if(lines[i].trim().startsWith('|')){
        const rows=[];
        while(i<lines.length&&lines[i].trim().startsWith('|')){
          const cells=lines[i++].trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim());
          if(cells.every(x=>/^:?-{3,}:?$/.test(x)))continue;
          rows.push(cells);
        }
        if(rows.length){const [head,...body]=rows;blocks.push(`<div class="vp-policy-table-wrap"><table class="vp-policy-table"><thead><tr>${head.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${body.map(row=>`<tr>${head.map((_,n)=>`<td>${esc(row[n]||'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);}
        continue;
      }
      const isList=line=>/^\s*(?:[-*]|\d+[.)])\s+/.test(line);
      if(isList(lines[i])){
        const ordered=/^\s*\d+[.)]/.test(lines[i]);const items=[];
        while(i<lines.length&&isList(lines[i]))items.push(lines[i++].replace(/^\s*(?:[-*]|\d+[.)])\s+/,''));
        const tag=ordered?'ol':'ul';blocks.push(`<${tag}>${items.map(x=>`<li>${esc(x)}</li>`).join('')}</${tag}>`);continue;
      }
      const paragraph=[];
      while(i<lines.length&&lines[i].trim()&&!lines[i].trim().startsWith('|')&&!isList(lines[i]))paragraph.push(lines[i++].trim());
      const text=paragraph.join(' ');
      if(/^#{1,3}\s+/.test(text))blocks.push(`<h4>${esc(text.replace(/^#{1,3}\s+/,''))}</h4>`);
      else if(paragraph.length===1&&text.length<90&&!/[.!?。:]$/.test(text))blocks.push(`<h4>${esc(text)}</h4>`);
      else blocks.push(`<p>${esc(text)}</p>`);
    }
    return blocks.join('');
  }
  function openPolicyCenter(requestedKey='pricing'){
    const mappedKey=POLICY_LEGACY_MAP[requestedKey]||requestedKey;
    const items=publicPolicies?.items||{};
    const vis=publicPolicies?.visibility||{};
    const availableTabs=POLICY_TABS.filter(([k])=>vis[k]!==false&&(items[k]!==undefined||!publicPolicies));
    const tabs=availableTabs.length?availableTabs:POLICY_TABS;
    const activeKey=tabs.some(([k])=>k===mappedKey)?mappedKey:(tabs[0]?.[0]||'pricing');
    const activeLabel=tabs.find(([k])=>k===activeKey)?.[1]||'Chính sách';
    const contentText=items[activeKey]||POLICY_FALLBACK[activeKey]||'Nội dung đang được cập nhật.';
    const si=publicPolicies?.storeInfo||{};
    let extraHtml='';
    if(activeKey==='complaints'){
      extraHtml+=`<div class="vp-policy-table-wrap"><table class="vp-policy-table"><tr><th>Kênh liên hệ</th><th>Thông tin cấu hình</th></tr><tr><td>Tên cửa hàng</td><td>${esc(si.name||'VIỆT PHỤC — Traditional Clothing')}</td></tr><tr><td>Hotline</td><td>${esc(si.hotline||'Chưa cấu hình')}</td></tr><tr><td>Email</td><td>${esc(si.email||'Chưa cấu hình')}</td></tr><tr><td>Địa chỉ</td><td>${esc(si.address||'Chưa cấu hình')}</td></tr><tr><td>Mạng xã hội</td><td>${esc(si.social||'Chưa cấu hình')}</td></tr><tr><td>Thời gian hỗ trợ</td><td>${esc(si.hours||'Thứ 2 – Thứ 7: 08:00 – 17:00 (cần xác nhận)')}</td></tr></table></div>`;
    }
    if(activeKey==='pricing'){
      extraHtml+=publicPromotions.length
        ? `<div class="vp-promo-box"><b>Chương trình khuyến mãi đang áp dụng (${publicPromotions.length}):</b><ul style="margin:6px 0 0 18px;padding:0">${publicPromotions.map(pr=>`<li><b>${esc(pr.code)}</b> (${esc(pr.name)}): ${pr.type==='percent'?`Giảm ${pr.value}%${pr.maxDiscount?` (tối đa ${money(pr.maxDiscount)})`:''}`:`Giảm ${money(pr.value)}`} · Đơn tối thiểu ${money(pr.minOrder)} · Áp dụng cho tất cả sản phẩm · Còn ${pr.remainingUses} lượt · HSD: ${esc(fmtDateVi(pr.startAt))} – ${esc(fmtDateVi(pr.endAt))}</li>`).join('')}</ul></div>`
        : `<div class="vp-note">Hiện chưa có mã khuyến mãi công khai nào đang hoạt động.</div>`;
    }
    if(activeKey==='shipping'){
      extraHtml+=`<div class="vp-policy-table-wrap"><table class="vp-policy-table"><thead><tr><th>Khu vực giao hàng</th><th>Thời gian dự kiến (sau khi bàn giao ĐVVC)</th></tr></thead><tbody><tr><td>Nội thành Đắk Lắk</td><td>1–2 ngày làm việc</td></tr><tr><td>Khu vực khác trong tỉnh Đắk Lắk</td><td>2–3 ngày làm việc</td></tr><tr><td>Các tỉnh, thành phố lớn</td><td>2–4 ngày làm việc</td></tr><tr><td>Vùng sâu, vùng xa, hải đảo</td><td>4–7 ngày làm việc hoặc lâu hơn</td></tr></tbody></table></div>`;
    }
    if(activeKey==='orderProcess'||activeKey==='purchase'){
      extraHtml+=`<div class="vp-policy-table-wrap"><table class="vp-policy-table"><thead><tr><th>Nhóm trạng thái</th><th>Các trạng thái theo quy trình</th></tr></thead><tbody><tr><td>Đơn hàng</td><td>Chờ xác nhận · Đã xác nhận · Đang chuẩn bị · Hoàn tất · Đã hủy</td></tr><tr><td>Thanh toán</td><td>Chưa thanh toán · Chờ xác nhận · Đã thanh toán · Thanh toán thất bại · Đã hoàn tiền</td></tr><tr><td>Vận chuyển</td><td>Chờ lấy hàng · Đang vận chuyển · Giao thành công · Giao thất bại · Hoàn hàng</td></tr></tbody></table></div>`;
    }
    const verInfo=publicPolicies?`Phiên bản công khai: <b>v${publicPolicies.version||1}</b> · Cập nhật: ${esc(fmtDateVi(publicPolicies.updatedAt))}`:'Phiên bản mặc định (offline)';
    const layoutHtml=`<div class="vp-policy-layout"><nav class="vp-policy-nav" aria-label="Danh mục chính sách">${tabs.map(([k,lbl])=>`<button type="button" class="${k===activeKey?'active':''}" data-action="policy" data-policy="${esc(k)}">${esc(lbl)}</button>`).join('')}</nav><div class="vp-policy-content"><h3>${esc(activeLabel)}</h3><div class="vp-policy-text">${renderPolicyDocument(contentText)}</div>${extraHtml}</div></div>`;
    let ov=document.querySelector('.vp-policy-overlay');
    if(ov){
      const bodyWrap=ov.querySelector('.vp-policy-body-wrap');
      const verEl=ov.querySelector('.vp-policy-ver');
      if(verEl)verEl.innerHTML=verInfo;
      if(bodyWrap)bodyWrap.innerHTML=layoutHtml;
      const contentEl=ov.querySelector('.vp-policy-content');
      if(contentEl)contentEl.scrollTop=0;
      return;
    }
    ov=document.createElement('div');
    ov.className='vp-policy-overlay';
    ov.innerHTML=`<aside class="vp-policy-drawer" role="dialog" aria-modal="true" aria-label="Trung tâm Chính sách & Quy trình"><div class="vp-policy-head"><div><h2>Trung tâm Chính sách & Quy trình</h2><p class="vp-muted vp-policy-ver">${verInfo}</p></div><button type="button" class="vp-policy-close" data-action="close-policy" aria-label="Đóng chính sách">×</button></div><div class="vp-policy-body-wrap" style="flex:1;min-height:0;display:flex;flex-direction:column">${layoutHtml}</div></aside>`;
    document.body.appendChild(ov);
    lockBodyScroll();
    requestAnimationFrame(()=>{ov.classList.add('open');});
    ov.querySelector('.vp-policy-close')?.focus();
  }
  const ORDER_STATUS_VI={pending:'Chờ xác nhận',pending_payment:'Chờ thanh toán',confirmed:'Đã xác nhận',packing:'Đang chuẩn bị',shipping:'Đang giao hàng',delivered:'Hoàn tất (Đã giao)',delivery_failed:'Giao thất bại',returning:'Đang hoàn hàng',returned:'Đã hoàn hàng',cancelled:'Đã hủy'};
  const PAYMENT_STATUS_VI={unpaid:'Chưa thanh toán',pending:'Chờ xác nhận',paid:'Đã thanh toán',failed:'Thanh toán thất bại',partially_refunded:'Hoàn tiền một phần',refund_pending:'Chờ hoàn tiền',refunded:'Đã hoàn tiền'};
  const SHIP_STATUS_VI={pending:'Chờ lấy hàng',picking:'Chờ lấy hàng',shipping:'Đang vận chuyển',delivered:'Giao thành công',failed:'Giao thất bại',returning:'Hoàn hàng',returned:'Hoàn hàng'};
  function fmtOrderStatus(s){return ORDER_STATUS_VI[s]||s||'—';}
  function fmtPaymentStatus(s){return PAYMENT_STATUS_VI[s]||s||'—';}
  function fmtShipStatus(s){return SHIP_STATUS_VI[s]||s||'—';}
  function fmtDateVi(iso){if(!iso)return '—';const d=new Date(iso);return Number.isNaN(d.getTime())?String(iso):d.toLocaleString('vi-VN');}
  function pwField(name,placeholder,minlen){return `<div class="vp-pw-wrap"><input name="${name}" type="password" required${minlen?` minlength="${minlen}"`:''} placeholder="${esc(placeholder||'')}"><button type="button" class="vp-pw-toggle" data-action="toggle-pw">Hiện</button></div>`;}
  function customerOrderCard(o){
    const items=(o.items||[]).map(i=>`${esc(i.name||i.productName||'Sản phẩm')} (${esc(i.size||'')}) × ${i.qty||1}`).join('<br>');
    return `<div class="vp-order"><div class="vp-row"><h3>${esc(o.id)}</h3><span class="vp-status">${esc(fmtOrderStatus(o.orderStatus||o.status))}</span></div><p>${esc(fmtDateVi(o.createdAt||o.date))} · <b>${money(o.total||0)}</b></p>${items?`<p>${items}</p>`:''}<p>Thanh toán: ${esc(fmtPaymentStatus(o.paymentStatus))}</p><div class="vp-inline-actions"><button type="button" class="vp-link" data-action="customer-order-detail" data-id="${esc(o.id)}">Xem chi tiết đơn hàng →</button></div></div>`;
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
  function demoQr(order) {
    return `<section class="demo-qr" aria-label="Đối chiếu thanh toán QR">
      <img src="assets/demo-payment.svg" width="154" height="154" alt="QR chứa thông tin tài khoản thử nghiệm Việt Phục">
      <div><h3>Đối chiếu thanh toán QR</h3>
        <p>Ngân hàng: VIET PHUC DEMO<br>Chủ tài khoản: VIET PHUC DEMO<br>Số tài khoản: <b>VP-DEMO-0001</b></p>
        <p>Số tiền: <b>${money(order.total)}</b><br>Nội dung chuyển khoản: <b>${esc(order.id)}</b></p>
        <small>QR chỉ chứa thông tin mẫu. Vui lòng không chuyển tiền thật.</small>
      </div></section>`;
  }

  function cancellationForm(id) {
    return `<details class="order-change"><summary>Hủy đơn hàng</summary>
      <form class="vp-form" data-form="cancel-order" data-id="${esc(id)}">
        <label>Lý do hủy đơn<textarea name="reason" rows="3" maxlength="300" required></textarea></label>
        <button class="vp-btn" type="submit">Xác nhận hủy đơn</button>
      </form></details>`;
  }

  function editableOrderDetails(order) {
    if (order.orderStatus !== 'confirmed' || order.inventoryStatus !== 'reserved' || order.shipment?.shipStatus !== 'pending') return '';
    const fields = order.items.map(item => {
      const product = find(item.productId);
      const variants = (product?.variants || []).filter(v => product.active && v.active && v.sku !== item.sku);
      return `<label>${esc(item.name)} × ${item.qty}
        <select name="sku"><option value="${esc(item.sku)}">${esc(item.color)} / ${esc(item.size)} (đã chọn)</option>
          ${variants.map(v => {
            const samePrice = (v.priceOverride ?? product.price) === item.unitPrice;
            return `<option value="${esc(v.sku)}" ${samePrice ? '' : 'disabled'}>${esc(v.color)} / ${esc(v.size)}${samePrice ? '' : ' (khác giá)'}</option>`;
          }).join('')}</select></label>`;
    }).join('');
    return `<details class="order-change"><summary>Thay đổi địa chỉ, màu sắc hoặc kích thước</summary>
      <form class="vp-form" data-form="edit-order-details" data-id="${esc(order.id)}" data-version="${order.history.length}">
        <label>Địa chỉ nhận hàng đầy đủ<textarea name="address" rows="2" minlength="5" maxlength="600" required>${esc(order.address)}</textarea></label>
        ${fields}<p class="vp-muted">Chọn phân loại cùng giá. Cửa hàng kiểm tra tồn kho khi lưu.</p>
        <button class="vp-btn" type="submit">Lưu thay đổi</button>
      </form></details>`;
  }

  async function loadCustomerOrderDetail(orderId){
    const box=document.getElementById('vp-customer-orders');
    if(!box)return;
    box.innerHTML='<p class="vp-muted">Đang tải chi tiết đơn hàng…</p>';
    try{
      const [data, retRes]=await Promise.all([
        apiCustomer(`/api/customer/orders/${encodeURIComponent(orderId)}`),
        apiCustomer('/api/customer/returns').catch(()=>({returns:[]})),
      ]);
      const o=data.order;
      const orderReturns=(retRes.returns||[]).filter(r=>r.orderId===o.id);
      const addr=o.receiver?`${o.receiver}${o.phone?` · ${o.phone}`:''}${o.address?` · ${o.address}`:''}`:(o.shippingAddress&&typeof o.shippingAddress==='object'?`${o.shippingAddress.receiver||''} · ${o.shippingAddress.phone||''} · ${o.shippingAddress.address||''}`:(o.shippingAddress||'—'));
      const items=(o.items||[]).map(i=>`<div class="vp-row"><span>${esc(i.name||i.productName||'Sản phẩm')} (${esc(i.color||'')}${i.size?` / ${esc(i.size)}`:''})${i.sku?` <small class="vp-muted">[${esc(i.sku)}]</small>`:''} × ${i.qty||1}</span><b>${money((i.unitPrice??i.price??0)*(i.qty||1))}</b></div>`).join('');
      const payMethodLabel=o.paymentMethod==='online'?'Thanh toán trực tuyến':'Thanh toán khi nhận hàng';
      const canPaySim=o.paymentMethod==='online'&&o.orderStatus!=='cancelled'&&(o.paymentStatus==='pending'||o.paymentStatus==='failed');
      const canCancel=['pending','confirmed'].includes(o.orderStatus);
      const canReturn=o.orderStatus==='delivered';
      const deliveredAt=o.shipment?.deliveredAt||null;
      const retDays=o.policySnapshot?.returnWindowDays||businessConfig?.returnWindowDays||7;
      const warDays=o.policySnapshot?.warrantyWindowDays||businessConfig?.warrantyWindowDays||30;
      let windowHint='';
      if(deliveredAt){
        const daysPassed=Math.floor((Date.now()-Date.parse(deliveredAt))/86400000);
        windowHint=`Đã nhận hàng ngày ${fmtDateVi(deliveredAt)} (${daysPassed} ngày trước). Đổi theo nhu cầu: ${retDays} ngày · Hỗ trợ lỗi may sẵn: ${warDays} ngày.`;
      }else if(canReturn){
        windowHint=`Đổi theo nhu cầu: ${retDays} ngày từ khi nhận hàng · Hỗ trợ chất lượng: ${warDays} ngày.`;
      }
      const snapHtml=o.policySnapshot?.version
        ? `<div class="vp-note"><b>Chính sách áp dụng khi đặt đơn:</b> Phiên bản <b>v${o.policySnapshot.version}</b>${o.policySnapshot.updatedAt?` (${esc(fmtDateVi(o.policySnapshot.updatedAt))})`:''} · Đổi trả ${retDays} ngày · Hoàn tiền dự kiến ${o.policySnapshot.refundProcessingDays||5} ngày làm việc.<div class="vp-policy-links"><button type="button" class="vp-link" data-action="policy" data-policy="shipping">Chính sách vận chuyển</button><button type="button" class="vp-link" data-action="policy" data-policy="payment">Thanh toán</button><button type="button" class="vp-link" data-action="policy" data-policy="returns">Đổi trả & Hoàn tiền</button><button type="button" class="vp-link" data-action="policy" data-policy="orderProcess">Quản lý đơn hàng</button></div></div>`
        : '';
      const returnsHtml=orderReturns.length
        ? `<div class="vp-line"></div><p><b>Yêu cầu đổi trả / hỗ trợ chất lượng (${orderReturns.length}):</b></p>${orderReturns.map(r=>`<div class="vp-promo-box"><b>${esc(r.id)}</b> · ${esc(r.type)} · <span class="vp-status">${esc(r.status)}</span><br>Lý do: ${esc(r.reason)}${r.shippingFeeBearer?`<br>Phí VC đổi trả: ${r.shippingFeeBearer==='store'?'Cửa hàng chịu (lỗi SP/giao sai)':'Khách hàng chịu (đổi theo nhu cầu)'}`:''}${r.adminNote?`<br>Phản hồi: ${esc(r.adminNote)}`:''}</div>`).join('')}`
        : '';
      box.innerHTML=`<button type="button" class="vp-link" data-action="customer-tab" data-tab="orders">← Quay lại danh sách đơn hàng</button><div class="vp-order-detail"><div class="vp-row"><h3>Đơn ${esc(o.id)}</h3><span class="vp-status">${esc(fmtOrderStatus(o.orderStatus||o.status))}</span></div><p><b>Ngày đặt:</b> ${esc(fmtDateVi(o.createdAt||o.date))}</p><p><b>Trạng thái đơn hàng:</b> ${esc(fmtOrderStatus(o.orderStatus))} · <b>Thanh toán:</b> ${esc(fmtPaymentStatus(o.paymentStatus))} · <b>Vận chuyển:</b> ${esc(fmtShipStatus(o.shipment?.shipStatus||'pending'))}</p><p><b>Phương thức:</b> ${esc(payMethodLabel)}</p><p><b>Giao nhận:</b> ${esc(addr)}</p>${o.note?`<p><b>Ghi chú:</b> ${esc(o.note)}</p>`:''}${o.orderStatus==='cancelled' && o.history?.length ? `<p><b>Lý do hủy:</b> ${esc(o.history.filter(h=>h.status==='cancelled').at(-1)?.note || '—')}</p>` : ''}${snapHtml}<div class="vp-line"></div>${items}<div class="vp-line"></div>${o.subtotal!==undefined?`<div class="vp-row"><span>Tiền hàng</span><span>${money(o.subtotal)}</span></div>`:''}${o.discountAmount?`<div class="vp-row"><span>Giảm giá${o.discountCode?` (${esc(o.discountCode)})`:''}</span><span>−${money(o.discountAmount)}</span></div>`:''}${o.shippingFee!==undefined?`<div class="vp-row"><span>Phí vận chuyển</span><span>${money(o.shippingFee)}</span></div>`:''}<div class="vp-row"><strong>Tổng thanh toán</strong><strong>${money(o.total||0)}</strong></div>${windowHint?`<p class="vp-muted" style="margin-top:8px">${esc(windowHint)}</p>`:''}${canPaySim ? demoQr(o) : ''}${editableOrderDetails(o)}${canCancel ? cancellationForm(o.id) : ''}<div class="vp-inline-actions">${canPaySim?`<button type="button" class="vp-btn" data-action="customer-pay-sim" data-id="${esc(o.id)}" data-sim="success">MÔ PHỎNG THANH TOÁN THÀNH CÔNG</button><button type="button" class="vp-btn secondary" data-action="customer-pay-sim" data-id="${esc(o.id)}" data-sim="fail">MÔ PHỎNG THẤT BẠI</button>`:''}${canReturn?`<button type="button" class="vp-btn secondary" data-action="open-return-form" data-id="${esc(o.id)}">YÊU CẦU ĐỔI TRẢ / HỖ TRỢ CHẤT LƯỢNG</button>`:''}</div>${returnsHtml}<div id="vp-return-form-wrap"></div></div>`;
    }catch(err){
      if(err.status===401||err.code==='account_locked'){toast(err.message);account('login',err.message);return;}
      box.innerHTML=`<div class="vp-error">${esc(err.message)}</div><button type="button" class="vp-link" data-action="customer-tab" data-tab="orders">← Quay lại danh sách</button>`;
    }
  }
  async function openCustomerReturnForm(orderId){
    const wrap=document.getElementById('vp-return-form-wrap');
    if(!wrap)return;
    try{
      const data=await apiCustomer(`/api/customer/orders/${encodeURIComponent(orderId)}`);
      const o=data.order;
      wrap.innerHTML=`<div class="vp-line"></div><h4>Gửi yêu cầu Đổi trả / Hỗ trợ chất lượng (${esc(o.id)})</h4><form class="vp-form" data-form="customer-return" data-id="${esc(o.id)}"><label>Loại yêu cầu</label><select name="type"><option value="exchange">Đổi hàng (đổi size / màu / sản phẩm)</option><option value="return">Trả hàng & hoàn tiền (dự kiến 5 ngày làm việc sau duyệt)</option><option value="warranty">Hỗ trợ chất lượng / lỗi may sẵn (30 ngày)</option></select><label>Nhóm nguyên nhân</label><select name="reasonCategory"><option value="customer_preference">Đổi theo nhu cầu / chọn nhầm size, màu (hạn 7 ngày, khách chịu phí VC)</option><option value="store_defect">Lỗi từ cửa hàng: giao sai mẫu/màu, lỗi may, thiếu phụ kiện, hư hỏng VC (shop chịu phí VC)</option><option value="quality_warranty">Phản ánh lỗi may sẵn / bung chỉ (hỗ trợ 30 ngày, shop chịu phí VC)</option></select><label>Sản phẩm cần đổi/trả</label>${(o.items||[]).map((it,idx)=>`<label style="font-weight:400;display:flex;gap:8px;align-items:center"><input type="checkbox" name="item_chk_${idx}" checked style="width:auto"><span>${esc(it.name)} (${esc(it.color)}/${esc(it.size)}) · SL tối đa: ${it.qty}</span><input type="number" name="item_qty_${idx}" min="1" max="${it.qty}" value="${it.qty}" style="width:70px;padding:6px"></label>`).join('')}<label>Lý do ngắn gọn *</label><input name="reason" required placeholder="Ví dụ: Đổi từ size M sang L / Áo bị bung chỉ tay áo"><label>Mô tả tình trạng chi tiết</label><textarea name="description" placeholder="Mô tả tình trạng tem nhãn, phụ kiện, lỗi gặp phải..."></textarea><label>Link / Ghi chú hình ảnh hoặc video minh họa (nếu có, mỗi dòng 1 mục)</label><textarea name="images" placeholder="Ví dụ: https://... hoặc mô tả ảnh đính kèm"></textarea><button type="submit" class="vp-btn vp-full">GỬI YÊU CẦU ĐỔI TRẢ</button></form>`;
    }catch(err){toast(err.message);}
  }
  async function loadCustomerSupport(){
    const box=document.getElementById('vp-customer-support');
    if(!box)return;
    box.innerHTML='<p class="vp-muted">Đang tải dữ liệu hỗ trợ & khiếu nại…</p>';
    try{
      const [ordRes, tktRes, retRes]=await Promise.all([
        apiCustomer('/api/customer/orders'),
        apiCustomer('/api/customer/support-tickets'),
        apiCustomer('/api/customer/returns'),
      ]);
      const ordersList=ordRes.orders||[];
      const tickets=tktRes.tickets||[];
      const rets=retRes.returns||[];
      const si=publicPolicies?.storeInfo||{};
      const STATUS_TKT={open:'Mới tiếp nhận',in_progress:'Đang xác minh',resolved:'Đã giải quyết',closed:'Đã đóng'};
      box.innerHTML=`
        <div class="vp-note"><b>Kênh tiếp nhận khiếu nại & hỗ trợ:</b> Hotline: ${esc(si.hotline||'Chưa cấu hình')} · Email: ${esc(si.email||'Chưa cấu hình')} · Thời gian hỗ trợ dự kiến: ${esc(si.hours||'Thứ 2 – Thứ 7, 08:00 – 17:00')}. Mục tiêu phản hồi tiếp nhận: <b>01 ngày làm việc</b>. <button type="button" class="vp-link" data-action="policy" data-policy="complaints">Xem quy trình khiếu nại</button></div>
        <form class="vp-form" data-form="customer-support">
          <label>Đơn hàng liên quan (nếu có)</label>
          <select name="orderId"><option value="">-- Không gắn mã đơn --</option>${ordersList.map(o=>`<option value="${esc(o.id)}">${esc(o.id)} (${money(o.total||0)} · ${esc(fmtOrderStatus(o.orderStatus))})</option>`).join('')}</select>
          <label>Nhóm vấn đề</label>
          <select name="category"><option value="order">Khiếu nại đơn hàng / giao nhận</option><option value="product">Sản phẩm lỗi / thiếu phụ kiện</option><option value="payment">Thanh toán / hoàn tiền</option><option value="privacy">Dữ liệu cá nhân / bảo mật</option><option value="other">Hỗ trợ khác</option></select>
          <label>Tiêu đề *</label><input name="subject" required placeholder="Tóm tắt nội dung khiếu nại hoặc yêu cầu hỗ trợ">
          <label>Nội dung chi tiết *</label><textarea name="message" required placeholder="Mô tả rõ sự việc, mã đơn và bằng chứng liên quan..."></textarea>
          <button type="submit" class="vp-btn vp-full">GỬI YÊU CẦU HỖ TRỢ / KHIẾU NẠI</button>
        </form>
        <div class="vp-line"></div>
        <h4>Lịch sử khiếu nại & hỗ trợ (${tickets.length})</h4>
        ${tickets.length?tickets.map(t=>`<div class="vp-order"><div class="vp-row"><b>${esc(t.subject)}</b><span class="vp-status">${esc(STATUS_TKT[t.status]||t.status)}</span></div><p class="vp-muted">${esc(fmtDateVi(t.createdAt))}${t.orderId?` · Đơn: ${esc(t.orderId)}`:''}</p><p>${esc(t.message)}</p>${t.adminReply?`<div class="vp-note"><b>Phản hồi từ cửa hàng:</b> ${esc(t.adminReply)}</div>`:''}</div>`).join(''):'<p class="vp-muted">Chưa có yêu cầu hỗ trợ/khiếu nại nào.</p>'}
        <div class="vp-line"></div>
        <h4>Yêu cầu đổi trả / bảo hành đã gửi (${rets.length})</h4>
        ${rets.length?rets.map(r=>`<div class="vp-order"><div class="vp-row"><b>${esc(r.id)} (${esc(r.orderId)})</b><span class="vp-status">${esc(r.status)}</span></div><p>${esc(r.type)} · ${esc(r.reason)}</p>${r.adminNote?`<p class="vp-muted">Ghi chú Admin: ${esc(r.adminNote)}</p>`:''}</div>`).join(''):'<p class="vp-muted">Chưa có yêu cầu đổi trả nào.</p>'}
      `;
    }catch(err){
      if(err.status===401||err.code==='account_locked'){toast(err.message);account('login',err.message);return;}
      box.innerHTML=`<div class="vp-error">${esc(err.message)}</div>`;
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
    const activeTab=['profile','password','orders','support'].includes(tab)?tab:'profile';
    const tabs=`<div class="vp-tabs"><button type="button" class="vp-tab${activeTab==='profile'?' active':''}" data-action="customer-tab" data-tab="profile">Hồ sơ</button><button type="button" class="vp-tab${activeTab==='password'?' active':''}" data-action="customer-tab" data-tab="password">Đổi mật khẩu</button><button type="button" class="vp-tab${activeTab==='orders'?' active':''}" data-action="customer-tab" data-tab="orders">Đơn hàng</button><button type="button" class="vp-tab${activeTab==='support'?' active':''}" data-action="customer-tab" data-tab="support">Hỗ trợ & Khiếu nại</button></div>`;
    let body='';
    if(activeTab==='profile'){
      body=`<p>Xin chào, <b>${esc(state.user.name)}</b></p><form class="vp-form" data-form="customer-profile"><label>Email (không thể thay đổi)</label><input value="${esc(state.user.email)}" readonly disabled><label>Họ và tên</label><input name="name" required value="${esc(state.user.name)}"><label>Số điện thoại</label><input name="phone" type="tel" required value="${esc(state.user.phone||'')}"><label>Địa chỉ mặc định</label><input name="defaultAddress" value="${esc(state.user.defaultAddress||'')}" placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành"><button class="vp-btn vp-full">LƯU THAY ĐỔI</button></form><button type="button" class="vp-btn secondary vp-full" data-action="customer-logout">ĐĂNG XUẤT</button>`;
    }else if(activeTab==='password'){
      body=`<div class="vp-note">Sau khi đổi mật khẩu, toàn bộ phiên đăng nhập hiện tại sẽ được đăng xuất để bảo mật.</div><form class="vp-form" data-form="customer-change-password"><label>Mật khẩu hiện tại</label>${pwField('currentPassword','Nhập mật khẩu hiện tại')}<label>Mật khẩu mới</label>${pwField('newPassword','Tối thiểu 8 ký tự',8)}<label>Xác nhận mật khẩu mới</label>${pwField('confirmNewPassword','Nhập lại mật khẩu mới',8)}<button class="vp-btn vp-full">CẬP NHẬT MẬT KHẨU</button></form>`;
    }else if(activeTab==='support'){
      body=`<div id="vp-customer-support"></div>`;
    }else{
      body=`<div class="vp-policy-links" style="margin-bottom:12px"><button type="button" class="vp-link" data-action="policy" data-policy="orderProcess">Quy trình quản lý đơn hàng</button><button type="button" class="vp-link" data-action="policy" data-policy="returns">Chính sách đổi trả (7 ngày)</button><button type="button" class="vp-link" data-action="policy" data-policy="complaints">Giải quyết khiếu nại</button></div><div id="vp-customer-orders"></div>`;
    }
    modal('Tài khoản của tôi',`<div class="vp-body">${tabs}${errHtml}${body}</div>`);
    if(activeTab==='orders')loadCustomerOrders();
    if(activeTab==='support')loadCustomerSupport();
  }
  async function refreshCheckoutPreview(){
    if(!serverMode)return;
    const form=document.querySelector('[data-form="customer-checkout"]');
    if(!form)return;
    const msgEl=document.getElementById('vp-promo-msg');
    const items=state.cart.map(i=>({productId:i.id,sku:i.sku||skuFor(i.id,i.size,i.color),qty:i.qty}));
    try{
      const quote=await apiCustomer('/api/customer/checkout/preview','POST',{
        items,
        shippingType:form.querySelector('[name="shippingType"]').value,
        province:form.querySelector('[name="province"]').value,
        address:form.querySelector('[name="address"]').value,
        paymentMethod:form.querySelector('[name="paymentMethod"]').value,
        promotionCode:checkoutPromoCode,
      });
      checkoutQuote=quote;
      const setTxt=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val;};
      setTxt('vp-co-subtotal',money(quote.subtotal));
      setTxt('vp-co-discount',quote.discountAmount?`−${money(quote.discountAmount)}`:'0₫');
      setTxt('vp-co-shipping',money(quote.shippingFee));
      setTxt('vp-co-fees',money((quote.codFee||0)+(quote.paymentFee||0)));
      setTxt('vp-co-total',money(quote.total));
      if(msgEl){
        if(checkoutPromoCode&&!quote.promoValid){msgEl.className='vp-error';msgEl.textContent=quote.promoError||'Mã khuyến mãi không hợp lệ.';}
        else if(quote.discountCode){msgEl.className='vp-note';msgEl.textContent=`Đã áp dụng mã ${quote.discountCode} (giảm ${money(quote.discountAmount)}).`;}
        else{msgEl.className='';msgEl.textContent='';}
      }
    }catch(err){
      if(msgEl){msgEl.className='vp-error';msgEl.textContent=err.message;}
    }
  }
  function showOrderConfirmation(o){
    const payLabel=o.paymentMethod==='online'?'Thanh toán trực tuyến (mô phỏng)':'Thanh toán khi nhận hàng (COD)';
    const itemsHtml=(o.items||[]).map(i=>`<div class="vp-row"><span>${esc(i.name)} (${esc(i.color)} / ${esc(i.size)}) × ${i.qty}</span><b>${money((i.unitPrice??0)*i.qty)}</b></div>`).join('');
    const isPendingOnline=o.paymentMethod==='online'&&o.orderStatus!=='cancelled'&&(o.paymentStatus==='pending'||o.paymentStatus==='failed');
    modal('Xác nhận đơn hàng',`<div class="vp-body">
      <div class="vp-note">Đặt hàng thành công! Mã đơn hàng của bạn là <b>${esc(o.id)}</b>.</div>
      <p><b>Thời gian đặt:</b> ${esc(fmtDateVi(o.createdAt))}<br><b>Trạng thái đơn:</b> <span class="vp-status">${esc(fmtOrderStatus(o.orderStatus))}</span><br><b>Thanh toán:</b> ${esc(fmtPaymentStatus(o.paymentStatus))} (${esc(payLabel)})</p>
      <p><b>Người nhận:</b> ${esc(o.receiver)} · ${esc(o.phone)}<br><b>Địa chỉ:</b> ${esc(o.address)}</p>
      <div class="vp-line"></div>${itemsHtml}<div class="vp-line"></div>
      <div class="vp-row"><span>Tạm tính</span><span>${money(o.subtotal)}</span></div>
      ${o.discountAmount?`<div class="vp-row"><span>Khuyến mãi (${esc(o.discountCode||'')})</span><span>−${money(o.discountAmount)}</span></div>`:''}
      <div class="vp-row"><span>Phí vận chuyển</span><span>${money(o.shippingFee)}</span></div>
      <div class="vp-row"><strong>Tổng thanh toán</strong><strong>${money(o.total)}</strong></div>
      ${isPendingOnline?`${demoQr(o)}<div class="vp-note">Đơn thanh toán trực tuyến mô phỏng đang giữ hàng 15 phút. Chọn kết quả mô phỏng bên dưới:</div><button type="button" class="vp-btn vp-full" data-action="customer-pay-sim" data-id="${esc(o.id)}" data-sim="success" data-confirm="1">MÔ PHỎNG THANH TOÁN THÀNH CÔNG</button><button type="button" class="vp-btn secondary vp-full" data-action="customer-pay-sim" data-id="${esc(o.id)}" data-sim="fail" data-confirm="1">MÔ PHỎNG THANH TOÁN THẤT BẠI</button>`:''}
      <button type="button" class="vp-btn secondary vp-full" data-action="open-orders">XEM LỊCH SỬ ĐƠN HÀNG</button>
    </div>`);
  }
  function checkout(){
    if(!state.cart.length){cart();return;}
    if(serverMode){
      if(!state.user){toast('Vui lòng đăng nhập tài khoản khách hàng trước khi đặt hàng.');account('login');return;}
      checkoutPromoCode='';checkoutQuote=null;
      checkoutIdemKey='ck_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
      const std=businessConfig?.shipping?.standardFee??30000,rem=businessConfig?.shipping?.remoteFee??45000;
      const itemsPreview=state.cart.map(i=>{const p=find(i.id);const v=i.sku?(p?.variants?.find(x=>x.sku===i.sku)):variantFor(i.id,i.size,i.color);return `<div class="vp-row" style="font-size:12px"><span>${esc(p?.name||'')} (${esc(i.color||v?.color||'')}/${esc(i.size)}) × ${i.qty}</span><b>${money(unitPriceFor(p,v)*i.qty)}</b></div>`;}).join('');
      modal('Thanh toán đơn hàng',`<div class="vp-body">
        <div class="vp-note">MÔI TRƯỜNG MÔ PHỎNG · Không thu tiền thật. Giá, khuyến mãi và tồn kho được máy chủ xác minh lại khi đặt hàng.</div>
        <form class="vp-form" data-form="customer-checkout">
          <div id="vp-co-error"></div>
          <label>Họ và tên người nhận *</label><input name="receiver" required value="${esc(state.user.name||'')}">
          <label>Số điện thoại nhận hàng *</label><input name="phone" type="tel" required value="${esc(state.user.phone||'')}" placeholder="0912345678">
          <label>Tỉnh / Thành phố *</label><input name="province" required placeholder="Ví dụ: TP. Hồ Chí Minh, Hà Nội...">
          <label>Địa chỉ cụ thể *</label><input name="address" required value="${esc(state.user.defaultAddress||'')}" placeholder="Số nhà, tên đường, phường/xã">
          <label>Ghi chú đơn hàng</label><input name="note" placeholder="Ghi chú giao hàng (không bắt buộc)">
          <label>Phương thức vận chuyển</label>
          <select name="shippingType"><option value="standard">Giao hàng tiêu chuẩn (mô phỏng) · ${money(std)}</option><option value="remote">Giao hàng khu vực xa / hải đảo (mô phỏng) · ${money(rem)}</option></select>
          <p class="vp-muted">Thời gian giao dự kiến: Nội thành Đắk Lắk 1–2 ngày; khác trong tỉnh 2–3 ngày; tỉnh/TP lớn 2–4 ngày; vùng sâu/xa/hải đảo 4–7 ngày hoặc lâu hơn (chỉ mang tính dự kiến).</p>
          <label>Phương thức thanh toán</label>
          <select name="paymentMethod"><option value="COD">Thanh toán khi nhận hàng(COD)</option><option value="online">Thanh toán bằng QR (demo)</option></select>
          <p class="vp-muted">Khi chọn QR, mã và thông tin tài khoản demo sẽ hiển thị sau khi xác nhận đặt hàng.</p>
          <label>Mã khuyến mãi (tối đa 1 mã)</label>
          <div class="vp-row"><input id="vp-promo-input" placeholder="Nhập mã giảm giá" style="flex:1"><button type="button" class="vp-btn secondary" data-action="apply-promo" style="padding:13px 14px">Áp dụng</button><button type="button" class="vp-link" data-action="remove-promo">Xóa</button></div>
          <div id="vp-promo-msg" style="margin-top:8px"></div>
          ${publicPromotions.length?`<div class="vp-promo-box">Mã hiện có: ${publicPromotions.map(pr=>`<b>${esc(pr.code)}</b> (${pr.type==='percent'?`${pr.value}%`:money(pr.value)}, đơn từ ${money(pr.minOrder)})`).join(' · ')}</div>`:''}
          <div class="vp-line"></div>
          ${itemsPreview}
          <div class="vp-line"></div>
          <div class="vp-row"><span>Tiền hàng (Tạm tính)</span><b id="vp-co-subtotal">${money(subtotal())}</b></div>
          <div class="vp-row"><span>Giảm giá khuyến mãi</span><b id="vp-co-discount">0₫</b></div>
          <div class="vp-row"><span>Phí vận chuyển</span><b id="vp-co-shipping">${money(std)}</b></div>
          <div class="vp-row"><span>Phụ phí thanh toán / COD</span><b id="vp-co-fees">0₫</b></div>
          <div class="vp-row" style="margin-top:8px"><strong>Tổng thanh toán</strong><strong id="vp-co-total">${money(subtotal()+std)}</strong></div>
          <p class="vp-muted">Công thức: Tổng thanh toán = Tiền hàng − Giảm giá + Phí vận chuyển. Không phát sinh phụ phí ngoài bảng kê.</p>
          <label style="display:flex;gap:8px;align-items:flex-start;font-weight:400;margin-top:12px"><input type="checkbox" name="agreePolicy" required style="width:auto;margin-top:3px"><span>Tôi đã kiểm tra thông tin đơn hàng và đồng ý với <button type="button" class="vp-link" data-action="policy" data-policy="purchase">Mua hàng</button>, <button type="button" class="vp-link" data-action="policy" data-policy="payment">Thanh toán</button>, <button type="button" class="vp-link" data-action="policy" data-policy="shipping">Vận chuyển</button>, <button type="button" class="vp-link" data-action="policy" data-policy="returns">Đổi trả</button> và <button type="button" class="vp-link" data-action="policy" data-policy="privacy">Bảo mật</button>.</span></label>
          <button type="submit" id="vp-co-submit" class="vp-btn vp-full">XÁC NHẬN ĐẶT HÀNG</button>
        </form>
      </div>`);
      refreshCheckoutPreview();
      return;
    }
    if(!state.user){toast('Vui lòng tạo tài khoản dùng thử trước khi đặt hàng.');account();return;}modal('Thông tin đặt hàng',`<div class="vp-body"><div class="vp-note">ĐƠN HÀNG THỬ NGHIỆM · Không có giao dịch hay vận chuyển thực tế. Vui lòng không nhập thông tin thật.</div><form class="vp-form" data-form="checkout"><label>Người nhận</label><input name="receiver" required value="${esc(state.user.name)}"><label>Số điện thoại dùng thử</label><input name="phone" required placeholder="Ví dụ: 0900000000"><label>Địa chỉ nhận hàng dùng thử</label><input name="address" required placeholder="Số nhà, đường, phường/xã, tỉnh/thành"><label>Vận chuyển</label><select name="shipping"><option value="30000">Giao hàng tiêu chuẩn · 30.000₫</option><option value="45000">Giao hàng nhanh · 45.000₫</option></select><label>Phương thức thanh toán</label><select name="payment"><option value="COD">Thanh toán khi nhận hàng (COD mô phỏng)</option><option value="online">Thanh toán bằng QR (demo)</option></select><div class="vp-line"></div><div class="vp-row"><span>Tiền hàng</span><b>${money(subtotal())}</b></div><div class="vp-row"><span>Phí giao hàng</span><b data-checkout-shipping>${money(30000)}</b></div><div class="vp-row"><strong>Tổng thanh toán</strong><strong data-checkout-total>${money(subtotal()+30000)}</strong></div><label><input type="checkbox" required style="width:auto"> Tôi đồng ý với điều kiện mua hàng và chính sách đổi trả thử nghiệm.</label><button class="vp-btn vp-full">XÁC NHẬN ĐẶT HÀNG</button></form></div>`);
  }
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
  function payment(o){modal('Thanh toán mô phỏng',`<div class="vp-body"><div class="vp-note">GIAO DỊCH THỬ NGHIỆM · Không thu tiền thật và không kết nối cổng thanh toán.</div>${demoQr(o)}<p>Chọn kết quả để kiểm thử luồng thanh toán:</p><button class="vp-btn vp-full" data-action="pay-result" data-id="${o.id}" data-result="ok">MÔ PHỎNG THÀNH CÔNG</button><button class="vp-btn secondary vp-full" data-action="pay-result" data-id="${o.id}" data-result="fail">MÔ PHỎNG THẤT BẠI</button></div>`);}
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
  function showContactInfo() {
    const info = publicPolicies?.storeInfo || {};
    const phone = info.phone || 'Chưa cập nhật';
    const email = info.email || 'Chưa cập nhật';
    const hours = info.supportHours || 'Thứ 2 – Thứ 7, 08:00 – 17:00';
    modal('LIÊN HỆ VỚI CHÚNG TÔI', `<div class="vp-body contact-details">
      <section class="contact-card">
        <h3>VIỆT PHỤC</h3>
        <p>Việt Phục là dự án giới thiệu và kinh doanh các sản phẩm trang phục truyền thống Việt Nam.</p>
        <p>Chúng tôi luôn sẵn sàng hỗ trợ khách hàng trong quá trình tìm hiểu sản phẩm, đặt hàng, thanh toán, đổi trả và các vấn đề phát sinh sau mua.</p>
      </section>
      <section class="contact-card">
        <h3>THÔNG TIN LIÊN HỆ</h3>
        <dl><dt>Hotline</dt><dd>${info.phone ? `<a href="tel:${esc(info.phone)}">${esc(phone)}</a>` : esc(phone)}</dd>
          <dt>Email</dt><dd>${info.email ? `<a href="mailto:${esc(info.email)}">${esc(email)}</a>` : esc(email)}</dd>
          <dt>Thời gian làm việc</dt><dd>${esc(hours)}</dd></dl>
      </section>
      <section class="contact-card"><h3>HỖ TRỢ KHÁCH HÀNG</h3>
        <ul><li>Tư vấn sản phẩm</li><li>Hướng dẫn chọn size</li><li>Kiểm tra đơn hàng</li>
          <li>Thanh toán đơn hàng</li><li>Đổi trả và hoàn tiền</li><li>Hỗ trợ khiếu nại</li>
          <li>Tư vấn sử dụng và bảo quản sản phẩm</li></ul>
      </section>
    </div>`);
    document.querySelector('.vp-overlay .vp-close')?.focus();
  }

  document.addEventListener('click',async e=>{const el=e.target.closest('[data-action], [data-category]');if(!el)return;const action=el.dataset.action;if(el.dataset.category!==undefined&&!action){e.preventDefault();category=el.dataset.category;search='';renderProducts();document.getElementById('product-grid')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
    if (action === 'contact') {
      showContactInfo();
      return;
    }
    if(action==='filter-reset'){el.closest('form')?.querySelectorAll('input[type="checkbox"]').forEach(input=>{input.checked=false;});return;}
    if(action==='mobile-menu'){const nav=document.querySelector('.main-nav');if(nav){nav.classList.toggle('open');el.setAttribute('aria-expanded',String(nav.classList.contains('open')));}return;} if(action==='close'){close();return;} if(action==='product'){
      if(productPage){
        if(el.tagName==='A'&&(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey))return;
        e.preventDefault();
        if(document.querySelector('.vp-overlay'))close();
        navigateToProduct(el.dataset.id);
        return;
      }
      detail(el.dataset.id);return;
    }
    if(action==='product-photo'){
      if(productPage){
        productPage.querySelector('.product-main-image').src=el.querySelector('img').src;
        productPage.querySelectorAll('[data-action="product-photo"]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn===el)));
      }
      return;
    }
    if(action==='detail-color'){selectedColor=el.dataset.color;selectedQty=1;if(productPage&&!productPage.hidden)renderProductSummary();else renderDetail();return;}
    if(action==='size'){selectedSize=el.dataset.size;selectedQty=1;if(productPage&&!productPage.hidden)renderProductSummary();else renderDetail();return;}
    if(action==='detail-qty'){const maxQ=Math.max(1,available(selectedProduct,selectedSize,selectedColor)-quantityInCart(selectedProduct,selectedSize,selectedColor));selectedQty=Math.max(1,Math.min(maxQ,selectedQty+(+el.dataset.delta)));if(productPage&&!productPage.hidden)renderProductSummary();else renderDetail();return;}
    if(action==='add'){if(await add()){toast('Đã thêm sản phẩm vào giỏ hàng.');cart();}return;} if(action==='buy'){if(await add())checkout();return;}
    if(action==='open-cart'){cart();return;}if(action==='open-account'){account(state.user?'profile':'login');return;}if(action==='open-admin'){window.location.href='admin.html';return;}if(action==='policy'){e.preventDefault();openPolicyCenter(el.dataset.policy||'pricing');return;}if(action==='close-policy'){closePolicyDrawer();return;}if(action==='open-return-form'){openCustomerReturnForm(el.dataset.id);return;}if(action==='open-orders'){if(serverMode){if(state.user)account('orders');else{toast('Vui lòng đăng nhập để xem đơn hàng.');account('login');}return;}try{await refreshDatabase();state.user?orders():account();}catch(err){toast(err.message);}return;}
    if(action==='customer-tab'){account(el.dataset.tab);return;}
    if(action==='customer-order-detail'){loadCustomerOrderDetail(el.dataset.id);return;}
    if(action==='toggle-pw'){const inp=el.previousElementSibling;if(inp){const show=inp.type==='password';inp.type=show?'text':'password';el.textContent=show?'Ẩn':'Hiện';}return;}
    if(action==='customer-logout'){try{await apiCustomer('/api/customer/logout','POST');}catch(_){}state.user=null;checkoutPromoCode='';checkoutQuote=null;save();updateAccountIndicator();toast('Đã đăng xuất.');account('login');return;}
    if(action==='open-search'){modal('Tìm kiếm',`<div class="vp-body"><form class="vp-form" data-form="search"><label>Bạn đang tìm kiếm điều gì?</label><input name="query" value="${esc(search)}" placeholder="Tên sản phẩm, danh mục (có hoặc không dấu)..." autofocus><button class="vp-btn vp-full">TÌM KIẾM</button></form><div class="vp-search-suggestions" id="vp-search-suggestions">${searchSuggestions(search)}</div></div>`);return;}
    if(action==='search-category'){showSearchResults('',el.dataset.name);return;}
    if(action==='qty'){const i=state.cart[+el.dataset.index];if(!i)return;let n=i.qty+(+el.dataset.delta);if(n<1)state.cart.splice(+el.dataset.index,1);else if(n<=available(i.id,i.size,i.color))i.qty=n;else toast('Số lượng vượt quá tồn kho.');save();updateCount();cart();return;}
    if(action==='remove'){state.cart.splice(+el.dataset.index,1);save();updateCount();cart();return;}if(action==='clear-cart'){state.cart=[];save();updateCount();cart();return;}if(action==='apply-promo'){const inp=document.getElementById('vp-promo-input');checkoutPromoCode=String(inp?.value||'').trim().toUpperCase();refreshCheckoutPreview();return;}if(action==='remove-promo'){checkoutPromoCode='';const inp=document.getElementById('vp-promo-input');if(inp)inp.value='';refreshCheckoutPreview();return;}if(action==='customer-pay-sim'){try{const res=await apiCustomer(`/api/customer/orders/${encodeURIComponent(el.dataset.id)}/pay-simulate`,'POST',{action:el.dataset.sim});await refreshDatabase();if(res.expired)toast('Đơn hàng đã hết hạn giữ hàng 15 phút và đã giải phóng tồn kho.');else toast(el.dataset.sim==='success'?'Thanh toán mô phỏng thành công!':'Thanh toán mô phỏng thất bại.');if(el.dataset.confirm==='1')showOrderConfirmation(res.order);else loadCustomerOrderDetail(el.dataset.id);}catch(err){toast(err.message);}return;}if(action==='checkout'){checkout();return;}if(action==='orders'){try{await refreshDatabase();orders();}catch(err){toast(err.message);}return;}if(action==='logout'){state.user=null;save();account();return;}
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
  document.addEventListener('input',e=>{
    if(e.target.matches('[data-form="search"] input[name="query"]')){const box=document.getElementById('vp-search-suggestions');if(box)box.innerHTML=searchSuggestions(e.target.value);}
  });
  document.addEventListener('change',e=>{
    if(e.target.matches('[data-form="checkout"] select[name="shipping"]')){const form=e.target.closest('form'),fee=Number(e.target.value);form.querySelector('[data-checkout-shipping]').textContent=money(fee);form.querySelector('[data-checkout-total]').textContent=money(subtotal()+fee);}
    if(e.target.matches('[data-form="customer-checkout"] select[name="shippingType"], [data-form="customer-checkout"] select[name="paymentMethod"], [data-form="customer-checkout"] input[name="province"]')){refreshCheckoutPreview();}
  });
  document.addEventListener('submit',async e=>{const form=e.target.closest('[data-form]');if(!form)return;e.preventDefault();const data=new FormData(form),type=form.dataset.form;
    if (type === 'cancel-order' || type === 'edit-order-details') {
      const button = form.querySelector('button[type="submit"]');
      if (button.disabled) return;
      button.disabled = true;
      try {
        const reason = String(data.get('reason') || '').trim();
        const cancelling = type === 'cancel-order';
        if (cancelling && !reason) throw new Error('Vui lòng nhập lý do hủy đơn.');
        if (!serverMode && cancelling) {
          await commitShared(()=>{const o=state.orders.find(x=>x.id===form.dataset.id);if(!o||o.email!==state.user?.email||o.inventory!=='reserved')throw new Error('Đơn không còn đủ điều kiện hủy.');o.items.forEach(i=>changeStock(i.id,i.size,i.qty));o.inventory='released';o.status='Đã hủy';if(o.paymentStatus==='Thanh toán thành công')o.refund='Chờ hoàn tiền';o.history.push('Khách hủy đơn: '+reason);});
          orders();
        } else {
          const endpoint = cancelling ? 'cancel' : 'details';
          const payload = cancelling ? {reason} : {
            address: data.get('address'), skus: data.getAll('sku'), version: Number(form.dataset.version)
          };
          await apiCustomer(`/api/customer/orders/${encodeURIComponent(form.dataset.id)}/${endpoint}`, 'POST', payload);
          await loadCustomerOrderDetail(form.dataset.id);
          await refreshDatabase();
        }
        toast(cancelling ? 'Đã hủy đơn hàng.' : 'Đã lưu thay đổi đơn hàng.');
      } catch (err) { toast(err.message); }
      finally { button.disabled = false; }
      return;
    }
    if (type === 'contact-feedback') {
      form.reset();
      toast('Chúng tôi đã nhận được phản hồi của bạn.');
      return;
    }
    if(type==='customer-checkout'){
      if(isSubmittingOrder)return;
      isSubmittingOrder=true;
      const btn=document.getElementById('vp-co-submit');
      const errBox=document.getElementById('vp-co-error');
      if(btn){btn.disabled=true;btn.textContent='ĐANG XỬ LÝ ĐƠN HÀNG…';}
      if(errBox){errBox.className='';errBox.textContent='';}
      try{
        const items=state.cart.map(i=>({productId:i.id,sku:i.sku||skuFor(i.id,i.size,i.color),qty:i.qty}));
        const res=await apiCustomer('/api/customer/orders','POST',{
          items,
          receiver:String(data.get('receiver')||'').trim(),
          phone:String(data.get('phone')||'').trim(),
          province:String(data.get('province')||'').trim(),
          address:String(data.get('address')||'').trim(),
          note:String(data.get('note')||'').trim(),
          shippingType:String(data.get('shippingType')||'standard'),
          paymentMethod:String(data.get('paymentMethod')||'COD'),
          promotionCode:checkoutPromoCode,
          idempotencyKey:checkoutIdemKey,
        });
        state.cart=[];checkoutPromoCode='';checkoutQuote=null;save();updateCount();
        await refreshDatabase();
        toast(`Đặt hàng thành công: ${res.order.id}`);
        showOrderConfirmation(res.order);
      }catch(err){
        if(errBox){errBox.className='vp-error';errBox.textContent=err.message;}
        else toast(err.message);
      }finally{
        isSubmittingOrder=false;
        if(btn){btn.disabled=false;btn.textContent='XÁC NHẬN ĐẶT HÀNG';}
      }
      return;
    }
    if(type==='filters'){filters={sizes:data.getAll('sizes'),colors:data.getAll('colors'),prices:data.getAll('prices')};close();renderProducts();return;}
    if(type==='search'){showSearchResults(String(data.get('query') || ''));return;}
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
    if(type==='customer-return'){
      const orderId=form.dataset.id;
      try{
        const ordRes=await apiCustomer(`/api/customer/orders/${encodeURIComponent(orderId)}`);
        const ordItems=ordRes.order?.items||[];
        const selected=[];
        ordItems.forEach((it,idx)=>{
          const chk=form.querySelector(`[name="item_chk_${idx}"]`);
          const qtyInp=form.querySelector(`[name="item_qty_${idx}"]`);
          if(chk&&chk.checked){
            selected.push({productId:it.productId,sku:it.sku,qty:Math.max(1,Number(qtyInp?.value||1))});
          }
        });
        if(!selected.length)throw new Error('Vui lòng chọn ít nhất 1 sản phẩm.');
        const imgs=String(data.get('images')||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
        await apiCustomer('/api/customer/returns','POST',{
          orderId,
          type:String(data.get('type')||'exchange'),
          reasonCategory:String(data.get('reasonCategory')||'customer_preference'),
          reason:String(data.get('reason')||'').trim(),
          description:String(data.get('description')||'').trim(),
          images:imgs,
          items:selected,
        });
        toast('Đã gửi yêu cầu đổi trả / hỗ trợ chất lượng!');
        loadCustomerOrderDetail(orderId);
      }catch(err){toast(err.message);}
      return;
    }
    if(type==='customer-support'){
      try{
        await apiCustomer('/api/customer/support-tickets','POST',{
          orderId:String(data.get('orderId')||'').trim()||null,
          category:String(data.get('category')||'order'),
          subject:String(data.get('subject')||'').trim(),
          message:String(data.get('message')||'').trim(),
        });
        toast('Đã gửi yêu cầu hỗ trợ / khiếu nại! Mục tiêu phản hồi: 01 ngày làm việc.');
        loadCustomerSupport();
      }catch(err){toast(err.message);}
      return;
    }
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
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(document.querySelector('.vp-policy-overlay'))closePolicyDrawer();else close();}});
  document.addEventListener('click',e=>{if(e.target.classList?.contains('vp-policy-overlay'))closePolicyDrawer();else if(e.target.classList?.contains('vp-overlay'))close();});
  document.getElementById('filter-open')?.addEventListener('click',openFilters);
  document.getElementById('catalog-search')?.addEventListener('input',e=>{search=e.target.value;renderProducts();});
  document.getElementById('catalog-category')?.addEventListener('change',e=>{category=e.target.value;renderProducts();});
  document.getElementById('catalog-sort')?.addEventListener('change',e=>{sort=e.target.value;renderProducts();});
  window.VietPhuc={products,getState:()=>state,renderProducts};
  renderProducts();updateCount();
  if (productPage) {
    window.addEventListener('hashchange', router);
    window.addEventListener('popstate', router);
    router();
  }
  initializeDatabase().then(() => {
    if (!serverMode) return;
    catalogLoaded = true;
    renderProducts();
    if (productPage && !productPage.hidden) {
      currentHash = undefined;
      router();
    }
  });
})();
