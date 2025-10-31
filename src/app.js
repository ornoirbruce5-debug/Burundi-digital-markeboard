// src/app.js
// Burundi Digital Marketboard — SPA logic (Step 1-5)
// IMPORTANT: Replace SUPABASE_URL and SUPABASE_ANON at deploy time via CI secrets.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

/* Replace these placeholders during CI deploy (do not commit real keys) */
const SUPABASE_URL = 'https://xeyehhfumcvfvajpnkrr.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhleWVoaGZ1bWN2ZnZhanBua3JyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0Njk5OTMsImV4cCI6MjA3NzA0NTk5M30.XOxP39uQE6b4A4DIglWD9KEWujfobED9Y_DLTNtN5Qs';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  realtime: { params: { eventsPerSecond: 10 } }
});

/* ---------- i18n (basic rw.json loader) ---------- */
let i18n = {
  status: { pending: 'Itegerejwe', approved: 'Vyemejwe', denied: 'Vyanzwe', featured: 'Vyihariye' },
  messages: { offline: 'Uri offline — ongera ugerageze uri online.', product_submitted: 'Igicuruzwa cashyizwe kuri review', product_failed: 'Ntivyashobotse gukora igicuruzwa' }
};
async function loadI18n(){
  try{
    const r = await fetch('/src/i18n/rw.json');
    if(!r.ok) return;
    i18n = await r.json();
  }catch(e){}
}
loadI18n();

/* ---------- DOM refs ---------- */
const app = document.getElementById('app');
const toastContainer = document.getElementById('toast');
const offlineBanner = document.getElementById('offline-banner');

/* Templates */
const tplLanding = document.getElementById('tpl-landing');
const tplLogin = document.getElementById('tpl-login');
const tplProvider = document.getElementById('tpl-provider');
const tplProviderCreate = document.getElementById('tpl-provider-create-urls');
const tplAdmin = document.getElementById('tpl-admin');

/* Nav buttons */
document.getElementById('nav-landing').onclick = () => showLanding();
document.getElementById('nav-provider').onclick = () => showProvider();
document.getElementById('nav-admin').onclick = () => showAdmin();
document.getElementById('btn-login').onclick = () => showLogin();
document.getElementById('btn-logout').onclick = async () => { await supabase.auth.signOut(); updateUserUI(null); showLanding(); };

/* ---------- State ---------- */
let currentUser = null;
let currentRole = 'guest';
let realtimeSub = null;

/* ---------- Toast & Spinner helpers ---------- */
function showToast(message, type = 'info', ms = 4000){
  if(!toastContainer) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<div style="flex:1">${escapeHtml(message)}</div>`;
  toastContainer.hidden = false;
  toastContainer.appendChild(el);
  setTimeout(()=> {
    el.style.opacity = '0';
    setTimeout(()=> { el.remove(); if(!toastContainer.children.length) toastContainer.hidden = true; }, 300);
  }, ms);
}

function withSpinner(btn){
  const spinner = document.createElement('span');
  spinner.className = 'spinner';
  spinner.style.marginLeft = '8px';
  btn.disabled = true;
  btn.appendChild(spinner);
  return () => { btn.disabled = false; spinner.remove(); };
}

/* ---------- Util ---------- */
function escapeHtml(s = ''){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function debounce(fn, wait = 300){ let t; return (...a)=>{ clearTimeout(t); t = setTimeout(()=>fn(...a), wait); }; }
function formatBadge(status){ return `<span class="badge ${status}">${escapeHtml(i18n.status[status] || status)}</span>`; }

/* ---------- Auth init ---------- */
supabase.auth.onAuthStateChange(async (event, session) => {
  currentUser = session?.user ?? null;
  updateUserUI(currentUser);
  if(currentUser) await fetchProfileRole();
  cleanUrlAfterMagicLink();
});

(async function init(){
  const session = supabase.auth.session();
  currentUser = session?.user ?? null;
  if(currentUser) await fetchProfileRole();
  updateUserUI(currentUser);
  showLanding();
})();

/* ---------- UI updates ---------- */
function updateUserUI(user){
  const badge = document.getElementById('user-badge');
  if(user){
    badge.textContent = user.email || 'User';
    document.getElementById('btn-login').style.display = 'none';
    document.getElementById('btn-logout').style.display = 'inline-block';
  } else {
    badge.textContent = 'Not signed';
    document.getElementById('btn-login').style.display = 'inline-block';
    document.getElementById('btn-logout').style.display = 'none';
    currentRole = 'guest';
  }
}

/* Fetch profile role from public.profiles */
async function fetchProfileRole(){
  try{
    const uid = supabase.auth.user()?.id;
    if(!uid) return;
    const { data, error } = await supabase.from('profiles').select('role,display_name').eq('id', uid).single();
    if(error) { currentRole = 'user'; return; }
    currentRole = data?.role || 'user';
    document.getElementById('user-badge').textContent = data?.display_name || supabase.auth.user()?.email;
  }catch(e){ currentRole = 'user'; }
}

/* Clean magic link query params after sign-in */
function cleanUrlAfterMagicLink(){
  try{
    const url = new URL(window.location.href);
    if(url.searchParams.has('access_token') || url.searchParams.has('refresh_token') || url.searchParams.has('type')){
      url.search = '';
      history.replaceState({}, document.title, url.toString());
    }
  }catch(e){}
}

/* ---------- Offline banner ---------- */
function setOfflineBanner(){
  if(!offlineBanner) return;
  if(navigator.onLine){ offlineBanner.setAttribute('aria-hidden','true'); offlineBanner.style.display = 'none'; }
  else { offlineBanner.setAttribute('aria-hidden','false'); offlineBanner.style.display = 'block'; }
}
window.addEventListener('online', setOfflineBanner);
window.addEventListener('offline', setOfflineBanner);
window.addEventListener('load', setOfflineBanner);

/* ---------- Landing / Catalogue ---------- */
async function showLanding(){
  if(realtimeSub){ supabase.removeSubscription(realtimeSub); realtimeSub = null; }

  app.innerHTML = '';
  app.appendChild(tplLanding.content.cloneNode(true));
  const catalog = document.getElementById('catalog');
  const search = document.getElementById('search');
  const sort = document.getElementById('sort');
  const darkToggle = document.getElementById('toggle-dark');

  darkToggle.onclick = () => document.body.classList.toggle('dark');

  async function loadProducts(filterTerm = null, order = null){
    catalog.innerHTML = '<div class="card">Loading...</div>';
    try{
      let q = supabase.from('products').select('id,title,description,price,currency,images,featured,created_at').eq('status','approved');
      if(filterTerm) q = q.ilike('title', `%${filterTerm}%`);
      if(order === 'price_asc') q = q.order('price',{ascending:true});
      else if(order === 'price_desc') q = q.order('price',{ascending:false});
      else q = q.order('created_at',{ascending:false});
      const { data, error } = await q.limit(200);
      if(error){ catalog.innerHTML = `<div class="card">Error loading products</div>`; console.error(error); return; }
      renderProducts(data || []);
    }catch(err){ console.error(err); catalog.innerHTML = `<div class="card">Network error</div>`; }
  }

  function renderProducts(items){
    catalog.innerHTML = '';
    if(!items.length){ catalog.innerHTML = '<div class="card">No products yet</div>'; return; }
    items.forEach(p => {
      const el = document.createElement('article'); el.className = 'product';
      const img = (Array.isArray(p.images) && p.images[0]) ? p.images[0] : '/placeholder.png';
      el.innerHTML = `
        <img class="p-img" src="${escapeHtml(img)}" alt="${escapeHtml(p.title)}" onerror="this.src='/placeholder.png'"/>
        <div>
          <div class="p-title">${escapeHtml(p.title)} ${p.featured ? ' ' + formatBadge('featured') : ''}</div>
          <div class="p-price">${p.price} ${p.currency}</div>
          <p class="muted">${escapeHtml((p.description||'').slice(0,120))}</p>
        </div>
      `;
      catalog.appendChild(el);
    });
  }

  search.oninput = debounce(async (e) => {
    const term = e.target.value.trim();
    await loadProducts(term || null);
  }, 300);

  sort.onchange = async (e) => {
    const v = e.target.value;
    if(v === 'price_asc') await loadProducts(null,'price_asc');
    else if(v === 'price_desc') await loadProducts(null,'price_desc');
    else await loadProducts();
  };

  await loadProducts();

  const refresh = debounce(() => loadProducts(), 300);
  realtimeSub = supabase
    .from('products')
    .on('INSERT', refresh)
    .on('UPDATE', refresh)
    .subscribe();
}

/* ---------- Login ---------- */
function showLogin(){
  app.innerHTML = '';
  app.appendChild(tplLogin.content.cloneNode(true));
  const emailInput = document.getElementById('login-email');
  const sendBtn = document.getElementById('send-otp');
  const msg = document.getElementById('login-msg');

  sendBtn.onclick = async () => {
    const email = emailInput.value.trim();
    if(!email){ msg.textContent = 'Tegereza email'; return; }
    try{
      const redirectTo = window.location.origin + '/';
      const { error } = await supabase.auth.signIn({ email }, { redirectTo });
      if(error){ msg.textContent = 'Error sending link'; console.error(error); return; }
      msg.textContent = 'Magic link yoherejwe. Reba email yawe.';
    }catch(e){ msg.textContent = 'Failed to send magic link'; console.error(e); }
  };
}

/* ---------- Provider views ---------- */
function showProvider(){
  if(!supabase.auth.user()){ showLogin(); return; }
  app.innerHTML = '';
  app.appendChild(tplProvider.content.cloneNode(true));
  document.getElementById('btn-create-product').onclick = () => showProviderCreate();
  document.getElementById('btn-my-products').onclick = () => showProviderList();
  showProviderList();
}

async function showProviderList(){
  const container = document.getElementById('provider-list');
  container.innerHTML = '<div class="card">Loading...</div>';
  try{
    const uid = supabase.auth.user()?.id;
    if(!uid) { container.innerHTML = '<div class="card">Sign in to view your products</div>'; return; }
    const { data, error } = await supabase.from('products').select('id,title,status,created_at,featured').eq('provider_id', uid).order('created_at',{ascending:false});
    if(error){ container.innerHTML = '<div class="card">Error loading</div>'; console.error(error); return; }
    if(!data.length){ container.innerHTML = '<div class="card">No products yet</div>'; return; }
    container.innerHTML = data.map(p => {
      return `<div class="card" style="margin-bottom:8px;padding:10px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <strong>${escapeHtml(p.title)}</strong>
          <div class="small muted">${escapeHtml(p.status)} ${p.featured ? ' • ' + escapeHtml(i18n.status.featured) : ''}</div>
        </div>
        <div>${formatBadge(p.status)} ${p.featured ? formatBadge('featured') : ''}</div>
      </div>`;
    }).join('');
  }catch(e){ console.error(e); container.innerHTML = '<div class="card">Network error</div>'; }
}

function showProviderCreate(){
  app.innerHTML = '';
  app.appendChild(tplProviderCreate.content.cloneNode(true));
  const form = document.getElementById('product-form-url');
  const preview = document.getElementById('img-preview');
  const msg = document.getElementById('provider-msg');

  function toast(t){ msg.textContent = t; setTimeout(()=> msg.textContent='', 5000); }
  function sanitizeUrls(raw){
    return raw.split(/\r?\n|,/).map(s=>s.trim()).filter(Boolean).slice(0,8);
  }
  function isHttpUrl(s){
    try{ const u = new URL(s); return (u.protocol === 'http:' || u.protocol === 'https:'); }
    catch(e){ return false; }
  }

  const input = document.getElementById('p-image-urls');
  input.addEventListener('input', () => {
    preview.innerHTML = '';
    const urls = sanitizeUrls(input.value);
    urls.forEach(u=>{
      if(isHttpUrl(u)){
        const img = document.createElement('img');
        img.src = u;
        img.style.width='88px';
        img.style.height='88px';
        img.style.objectFit='cover';
        img.style.borderRadius='8px';
        img.onerror = () => img.style.display = 'none';
        preview.appendChild(img);
      }
    });
  });

  document.getElementById('cancel-create').onclick = () => showProvider();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.submitter || form.querySelector('button[type="submit"]');
    const stopSpinner = withSpinner(btn);

    const title = document.getElementById('p-title').value.trim();
    const desc = document.getElementById('p-desc').value.trim();
    const price = parseFloat(document.getElementById('p-price').value || 0);
    const tags = document.getElementById('p-tags').value.split(',').map(s=>s.trim()).filter(Boolean);
    const wantFeatured = document.getElementById('p-featured').checked;
    const rawUrls = document.getElementById('p-image-urls').value;
    const urls = sanitizeUrls(rawUrls);

    if(!title || price <= 0){ stopSpinner(); return showToast('Injiza umutwe n\'igiciro vyemewe', 'error'); }
    const bad = urls.find(u => !isHttpUrl(u) || u.length > 2000);
    if(bad){ stopSpinner(); return showToast('URL imwe nabi. Reba neza', 'error'); }

    if(!navigator.onLine){ stopSpinner(); showToast(i18n.messages.offline || 'Uri offline', 'error'); return; }

    try{
      const { data, error } = await supabase.rpc('create_product_safe', {
        _title: title,
        _description: desc,
        _price: price,
        _currency: 'Fbu',
        _images: JSON.stringify(urls),
        _tags: tags
      });
      if(error){
        console.error('RPC error', error);
        stopSpinner();
        if(error.message && error.message.includes('freemium_limit_reached')) return showToast('Urampaka rwa freemium rwaruzuye. Ongera upgrade.', 'error');
        return showToast(i18n.messages.product_failed || 'Failed creating product', 'error');
      }
      const newProductId = data;
      if(wantFeatured){
        const { error: payErr } = await supabase.from('payments').insert([{
          provider_id: supabase.auth.user()?.id,
          amount: 2000, currency:'Fbu', purpose:'featured', reference_text: null, linked_product: newProductId
        }]);
        if(payErr) console.error('payment request failed', payErr);
      }
      stopSpinner();
      showToast(i18n.messages.product_submitted || 'Submitted for review', 'success');
      setTimeout(()=> showProvider(), 900);
    }catch(err){
      console.error(err);
      stopSpinner();
      showToast(i18n.messages.product_failed || 'Unexpected error', 'error');
    }
  };
}

/* ---------- Admin UI ---------- */
async function showAdmin(){
  if(currentRole !== 'admin'){ app.innerHTML = '<div class="card">Admin only area</div>'; return; }
  app.innerHTML = '';
  app.appendChild(tplAdmin.content.cloneNode(true));
  const body = document.getElementById('admin-body');
  body.innerHTML = '<div class="card">Loading pending products...</div>';

  try{
    const { data, error } = await supabase
      .from('products')
      .select('id,title,description,price,currency,images,provider_id,created_at,images_verified')
      .eq('status','pending')
      .order('created_at',{ascending:false})
      .limit(200);

    if(error){ body.innerHTML = '<div class="card">Error loading pending products</div>'; console.error(error); return; }
    if(!data.length){ body.innerHTML = '<div class="card">No pending products</div>'; return; }

    body.innerHTML = data.map(p => renderPendingCard(p)).join('');
    body.querySelectorAll('.admin-approve').forEach(btn => btn.addEventListener('click', onApprove));
    body.querySelectorAll('.admin-deny').forEach(btn => btn.addEventListener('click', onDeny));
    body.querySelectorAll('.admin-verify-images').forEach(btn => btn.addEventListener('click', onVerifyImages));
  }catch(e){ console.error(e); body.innerHTML = '<div class="card">Network error</div>'; }
}

function renderPendingCard(p){
  const imgs = Array.isArray(p.images) ? p.images.slice(0,3).map(u => `<img src="${escapeHtml(u)}" style="width:88px;height:88px;object-fit:cover;border-radius:8px;margin-right:8px" onerror="this.style.display='none'">`).join('') : '';
  return `
    <div class="card" style="margin-bottom:12px;padding:12px">
      <div style="display:flex;gap:12px">
        <div style="min-width:240px">
          <strong>${escapeHtml(p.title)}</strong>
          <div class="small muted">${escapeHtml((p.description||'').slice(0,160))}</div>
          <div style="margin-top:8px"><strong>${p.price} ${escapeHtml(p.currency)}</strong></div>
          <div class="small" style="margin-top:6px">Provider: <code>${escapeHtml(p.provider_id)}</code></div>
        </div>
        <div style="flex:1">${imgs}</div>
        <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
          <button class="admin-approve" data-id="${p.id}" style="background:linear-gradient(90deg,#a7f3d0,#bfdbfe);border:none;padding:8px;border-radius:8px;cursor:pointer">Approve</button>
          <button class="admin-deny" data-id="${p.id}" style="background:#ffd6d6;border:none;padding:8px;border-radius:8px;cursor:pointer">Deny</button>
          <button class="admin-verify-images" data-id="${p.id}" style="background:#fff3bf;border:none;padding:8px;border-radius:8px;cursor:pointer">Mark images verified</button>
        </div>
      </div>
    </div>
  `;
}

async function onApprove(e){
  const id = e.currentTarget.dataset.id;
  if(!confirm('Approve this product?')) return;
  const btn = e.currentTarget;
  const stop = withSpinner(btn);
  const { error } = await supabase.from('products').update({ status: 'approved' }).eq('id', id);
  stop();
  if(error) return showToast('Approve failed: ' + error.message, 'error');
  showToast('Product approved ✅', 'success');
  showAdmin();
}

async function onDeny(e){
  const id = e.currentTarget.dataset.id;
  if(!confirm('Deny this product?')) return;
  const btn = e.currentTarget;
  const stop = withSpinner(btn);
  const { error } = await supabase.from('products').update({ status: 'denied' }).eq('id', id);
  stop();
  if(error) return showToast('Deny failed: ' + error.message, 'error');
  showToast('Product denied', 'info');
  showAdmin();
}

async function onVerifyImages(e){
  const id = e.currentTarget.dataset.id;
  if(!confirm('Mark images as verified?')) return;
  const btn = e.currentTarget;
  const stop = withSpinner(btn);
  const { error } = await supabase.from('products').update({ images_verified: true }).eq('id', id);
  stop();
  if(error) return showToast('Mark failed: ' + error.message, 'error');
  showToast('Images marked verified', 'success');
  showAdmin();
}

/* ---------- Debug helpers ---------- */
window._bdm = {
  supabase,
  getCurrentUser: () => supabase.auth.user(),
  getSession: () => supabase.auth.session()
};
