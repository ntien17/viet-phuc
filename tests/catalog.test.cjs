const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const handlers = {};
let overlay;
function element(id) {return {id, value:'', textContent:'', innerHTML:'', dataset:{}, listeners:{}, style:{}, classList:{toggle(){}}, addEventListener(type,fn){this.listeners[type]=fn;}, scrollIntoView(){}, focus(){}, remove(){if(this===overlay)overlay=null;}}}
const ids=Object.fromEntries(['product-grid','filter-summary','catalog-search','catalog-category','catalog-sort','filter-open','cart-count'].map(id=>[id,element(id)]));
const document={
 getElementById(id){return ids[id]||null;},
 querySelector(sel){if(sel==='.vp-overlay')return overlay||null; return null;},
 querySelectorAll(sel){return sel==='#cart-count,[data-cart-count]'?[ids['cart-count']]:[];},
 createElement(){return element();},
 addEventListener(type,fn){(handlers[type]||=[]).push(fn);},
 head:{appendChild(){}}, body:{style:{},appendChild(el){if(el.className?.startsWith('vp-overlay'))overlay=el;}}
};
const storage={getItem(){return null;},setItem(){}};
class FormDataMock {constructor(form){this.values=form.values||{};} getAll(key){return this.values[key]||[];} get(key){return (this.values[key]||[])[0]||null;}}
const ctx={document,window:{},localStorage:storage,sessionStorage:storage,FormData:FormDataMock,Intl,console,setTimeout(){},clearTimeout(){}};
vm.runInNewContext(fs.readFileSync('dist/app.js','utf8'),ctx,{filename:'app.js'});
const api=ctx.window.VietPhuc;
function idsShown(){return [...new Set([...ids['product-grid'].innerHTML.matchAll(/data-action="product" data-id="([^"]+)"/g)].map(m=>m[1]))];}
function filter(values={}){const form={dataset:{form:'filters'},values,closest(){return this;}};for(const fn of handlers.submit)fn({target:form,preventDefault(){}});}
function input(id,type,value){ids[id].value=value;ids[id].listeners[type]({target:ids[id]});}
function reset(){filter();input('catalog-search','input','');input('catalog-category','change','Tất cả');input('catalog-sort','change','featured');}
let n=0;function test(name,fn){try{fn();n++;console.log('PASS '+name);}catch(e){console.error('FAIL '+name+' '+e.message);process.exitCode=1;}}
test('catalog renders all nine products with name, image, price and availability',()=>{assert.equal(idsShown().length,9);assert.match(ids['product-grid'].innerHTML,/assets\/accessory.png/);assert.match(ids['product-grid'].innerHTML,/Còn hàng/);});
test('category choice shows matching accessory',()=>{input('catalog-category','change','Phụ kiện');assert.deepEqual(idsShown(),['p9']);});
test('search matches product name case-insensitively and composes with category',()=>{input('catalog-search','input','MẤN');assert.deepEqual(idsShown(),['p9']);input('catalog-category','change','Áo bà ba');assert.deepEqual(idsShown(),[]);assert.match(ids['product-grid'].innerHTML,/Không tìm thấy/);});
test('category, color, size, price intersect and multiselect values union',()=>{reset();filter({sizes:['One Size','M'],colors:['Đỏ trầm','Hồng sen'],prices:['under500','500to1m']});assert.deepEqual(idsShown(),['p4','p9']);assert.match(ids['filter-summary'].textContent,/6 lựa chọn lọc/);});
test('size filtering respects per-size available stock',()=>{reset();api.getState().stock['p1|M']=0;filter({sizes:['M'],colors:['Đỏ trầm']});assert.deepEqual(idsShown(),[]);filter({sizes:['S'],colors:['Đỏ trầm']});assert.deepEqual(idsShown(),['p1']);});
test('out of stock badge reflects all variants and one-size accessory',()=>{reset();for(const s of ['S','M','L','XL'])api.getState().stock['p1|'+s]=0;api.getState().stock['p9|One Size']=0;api.renderProducts();const html=ids['product-grid'].innerHTML;assert.equal((html.match(/Hết hàng/g)||[]).length,2);});
test('price ranges include exact boundaries without overlap',()=>{reset();const p=api.products.find(x=>x.id==='p9');const old=p.price;for(const [value,range] of [[499999,'under500'],[500000,'500to1m'],[1000000,'1to2m'],[2000000,'2to3m'],[3000000,'over3m']]){p.price=value;filter({prices:[range]});assert.ok(idsShown().includes('p9'),`${value} in ${range}`);const others=['under500','500to1m','1to2m','2to3m','over3m'].filter(x=>x!==range);for(const other of others){filter({prices:[other]});assert.ok(!idsShown().includes('p9'),`${value} not in ${other}`);}}p.price=old;});
test('sort prices ascending, descending and newest',()=>{reset();input('catalog-sort','change','price-asc');assert.deepEqual(idsShown(),['p9','p6','p4','p8','p2','p7','p3','p1','p5']);input('catalog-sort','change','price-desc');assert.deepEqual(idsShown(),['p5','p1','p3','p7','p2','p8','p4','p6','p9']);input('catalog-sort','change','newest');assert.equal(idsShown()[0],'p9');});
test('drawer contains controls and checked applied selections',()=>{reset();filter({sizes:['M'],colors:['Đỏ trầm'],prices:['under500']});ids['filter-open'].listeners.click();assert.match(overlay.innerHTML,/KÍCH THƯỚC/);assert.match(overlay.innerHTML,/MÀU SẮC/);assert.match(overlay.innerHTML,/KHOẢNG GIÁ/);assert.match(overlay.innerHTML,/value="M" checked/);assert.match(overlay.innerHTML,/value="Đỏ trầm" aria-label="Đỏ trầm" checked/);});
test('reset clears draft without applying until form submit',()=>{const checkboxes=[{checked:true},{checked:true}];const form={querySelectorAll(){return checkboxes;}};const button={dataset:{action:'filter-reset'},closest(sel){return sel==='form'?form:this;}};for(const fn of handlers.click)fn({target:button});assert.deepEqual(checkboxes.map(x=>x.checked),[false,false]);assert.match(ids['filter-summary'].textContent,/3 lựa chọn lọc/);filter();assert.equal(ids['filter-summary'].textContent,'9 sản phẩm');});
console.log(`${n} tests passed`);
