/* provider.js
   Provider page: auth, submit product (backend-backed upload preferred),
   provider dashboard, admin pending list, payment request trigger.
   Assumes backend endpoints:
     POST /api/upload  (optional) -> { publicUrl }
     POST /api/submit-product -> { ok, product }
     POST /api/create-payment-request -> { paymentUrl }
     POST /api/admin/approve-product -> { ok }
     GET  /api/admin/check -> { is_admin }
*/

const SUPABASE_URL = "https://wmcxagrcnfrpxwjbaggq.supabase.co";
const SUPABASE_ANON_KEY = "REPLACE_WITH_ANON_KEY";
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* Helpers */
function showToast(msg, ms = 3200) {
  const t = document.getElementById('toast');
  if (!t) { alert(msg); return; }
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.style.display = 'none'; }, ms);
}
function escapeHtml(s = '') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

/* Upload: try backend first, fallback to Supabase storage */
async function uploadViaBackend(file) {
  if (!file) return null;
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('backend upload failed');
    const json = await res.json();
    return json.publicUrl || null;
  } catch (e) {
    console.warn('backend upload failed', e);
    return null;
  }
}
async function uploadToSupabaseStorage(file) {
  if (!file) return null;
  const ext = file.name.split('.').pop();
  const fileName = `products/${Date.now()}-${Math.random().toString(36).slice(2,10)}.${ext}`;
  const { data, error } = await supabase.storage.from('products').upload(fileName, file, { cacheControl: '3600', upsert: false, contentType: file.type });
  if (error) throw error;
  return supabase.storage.from('products').getPublicUrl(data.path).publicURL;
}

/* Submit product to backend */
async function submitProduct({ name, description, price, imageFile }) {
  try {
    showToast('Turimo kohereza igicuruzwa...');
    let image_url = null;
    if (imageFile) {
      image_url = await uploadViaBackend(imageFile) || await uploadToSupabaseStorage(imageFile);
    }

    const user = supabase.auth.getUser ? (await supabase.auth.getUser()).data.user : supabase.auth.user();
    if (!user) {
      showToast('Banza winjire mbere yo kohereza', 4000);
      return { error: 'not_authenticated' };
    }

    const res = await fetch('/api/submit-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider_id: user.id, name, description, price, image_url })
    });

    const json = await res.json();
    if (!res.ok) {
      console.error('submit-product failed', json);
      return { error: json };
    }

    showToast('Igicuruzwa coherejwe — gategereje approval ✅', 4000);
    return { ok: true, product: json.product || json };
  } catch (e) {
    console.error('submitProduct exception', e);
    showToast('Ntibyashobotse kohereza. Ongera ugerageze.', 4200);
    return { error: e.message || e };
  }
}

/* UI wiring */
function initProviderForm() {
  const form = document.getElementById('productForm');
  if (!form) return;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const name = form.name.value.trim();
    const description = form.description.value.trim();
    const price = parseFloat(form.price.value) || 0;
    const fileInput = document.getElementById('productImage');
    const file = fileInput && fileInput.files && fileInput.files[0];

    const r = await submitProduct({ name, description, price, imageFile: file });
    if (r.ok) {
      form.reset();
      document.getElementById('providerStatus').textContent = 'Coherejwe — tegereza approval';
      loadMyProducts();
    } else {
      document.getElementById('providerStatus').textContent = 'Ntibyakozwe — reba console';
    }
  });
}

/* Load provider's products (uses Supabase client; RLS expected) */
async function loadMyProducts() {
  const container = document.getElementById('myProducts');
  if (!container) return;
  container.innerHTML = '<div class="loading">⏳ Kurura ibicuruzwa byawe...</div>';
  try {
    const user = supabase.auth.getUser ? (await supabase.auth.getUser()).data.user : supabase.auth.user();
    if (!user) {
      container.innerHTML = '<p>Winjire kugira urebe ibicuruzwa byawe.</p>';
      return;
    }
    const { data, error } = await supabase.from('products').select('id,name,description,price,image_url,status,created_at').eq('provider_id', user.id).order('created_at', { ascending: false });
    if (error) throw error;
    container.innerHTML = '';
    if (!data || data.length === 0) {
      container.innerHTML = '<p>Ntihazwi ibicuruzwa — ohereza ibyawe!</p>';
      return;
    }
    data.forEach(p => {
      const el = document.createElement('div');
      el.className = 'product-card';
      el.innerHTML = `
        <img src="${escapeHtml(p.image_url || '/fallback-product.jpg')}" alt="${escapeHtml(p.name)}" class="product-img" />
        <h3>${escapeHtml(p.name)}</h3>
        <p class="muted small">${escapeHtml(p.description || '')}</p>
        <div class="product-meta"><strong>${p.price} FBu</strong> • <em>${escapeHtml(p.status)}</em></div>
        <div class="product-actions">
          ${p.status === 'approved' ? `<button class="btn small request-pay" data-id="${p.id}">Request Payment</button>` : ''}
        </div>
      `;
      container.appendChild(el);
    });

    container.querySelectorAll('.request-pay').forEach(b => b.addEventListener('click', (ev) => {
      const id = ev.currentTarget.dataset.id;
      const amount = prompt('Shyiramo amount yo gusaba (FBu):');
      if (amount) createPaymentRequest(id, parseFloat(amount));
    }));

  } catch (e) {
    console.error('loadMyProducts', e);
    container.innerHTML = '<p>Ntibyakunze gukurura ibicuruzwa byawe.</p>';
  }
}

/* Admin: load pending and approve/reject via backend */
async function loadPendingProductsAdmin() {
  const list = document.getElementById('pendingList');
  if (!list) return;
  list.innerHTML = '<div class="loading">⏳ Kurura pending...</div>';
  try {
    // prefer backend admin list
    const res = await fetch('/api/admin/pending-products');
    let pending = [];
    if (res.ok) pending = (await res.json()).pending || [];
    else {
      // fallback to supabase select (works only if caller has admin permissions)
      const { data, error } = await supabase.from('products').select('*').eq('status', 'pending').order('created_at', { ascending: true });
      if (error) throw error;
      pending = data;
    }

    list.innerHTML = '';
    if (!pending.length) { list.innerHTML = '<p>Ntahari pending products.</p>'; return; }

    pending.forEach(p => {
      const row = document.createElement('div');
      row.className = 'product-card';
      row.innerHTML = `
        <img src="${escapeHtml(p.image_url || '/fallback-product.jpg')}" alt="${escapeHtml(p.name)}" width="90" style="border-radius:8px" />
        <div style="flex:1;margin-left:12px">
          <strong>${escapeHtml(p.name)}</strong>
          <div class="muted small">${escapeHtml(p.description || '')}</div>
          <div style="margin-top:8px"><strong>${p.price} FBu</strong></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn small approve" data-id="${p.id}">Approve</button>
          <button class="btn small reject" data-id="${p.id}" style="background:rgba(255,138,138,0.9)">Reject</button>
        </div>
      `;
      list.appendChild(row);
    });

    list.querySelectorAll('button.approve').forEach(b => b.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      await adminApproveProduct(id, true);
      loadPendingProductsAdmin();
    }));
    list.querySelectorAll('button.reject').forEach(b => b.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      await adminApproveProduct(id, false);
      loadPendingProductsAdmin();
    }));

  } catch (e) {
    console.error('loadPendingProductsAdmin', e);
    list.innerHTML = '<p>Ntibyakunze gukurura pending items.</p>';
  }
}
async function adminApproveProduct(productId, approve = true) {
  try {
    const res = await fetch('/api/admin/approve-product', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ product_id: productId, approve })
    });
    const json = await res.json();
    if (!res.ok) { console.error('admin approve error', json); showToast('Ntibyakunze guhindura status', 3000); return; }
    showToast(approve ? 'Product yemejwe ✅' : 'Product yanenzwe ❌', 2200);
  } catch (e) {
    console.error('adminApproveProduct', e);
    showToast('Server error muri approval', 3000);
  }
}

/* Payment request creation */
async function createPaymentRequest(productId, amount) {
  try {
    const user = supabase.auth.getUser ? (await supabase.auth.getUser()).data.user : supabase.auth.user();
    if (!user) { showToast('Banza winjire'); return; }

    const res = await fetch('/api/create-payment-request', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ product_id: productId, provider_id: user.id, amount, currency: 'FBu' })
    });
    const json = await res.json();
    if (!res.ok) { console.error('createPaymentRequest error', json); showToast('Ntibyakunze gukora payment request', 3200); return; }
    if (json.paymentUrl) window.location.href = json.paymentUrl;
    else showToast('Payment session yabonetse ariko nta url', 3200);
  } catch (e) {
    console.error('createPaymentRequest', e);
    showToast('Ntibyakunze – reba internet', 3200);
  }
}

/* Auth simple UI (email OTP) */
async function initAuthUI() {
  const authBtn = document.getElementById('authBtn');
  const signOutBtn = document.getElementById('signOutBtn');

  authBtn.addEventListener('click', async () => {
    const email = prompt('Andika email yawe (OTP izoherezwa):');
    if (!email) return;
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) showToast('Ntibyakunze: ' + error.message);
    else showToast('Twandikiye email — reba inbox');
  });

  signOutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    showToast('Wusohotse', 1200);
    updateAuthState();
  });

  supabase.auth.onAuthStateChange(() => updateAuthState());
  updateAuthState();
}

async function updateAuthState() {
  const authBtn = document
