// app.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

/* ====== Supabase credentials ====== */
const SUPABASE_URL = 'https://xeyehhfumcvfvajpnkrr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhleWVoaGZ1bWN2ZnZhanBua3JyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0Njk5OTMsImV4cCI6MjA3NzA0NTk5M30.XOxP39uQE6b4A4DIglWD9KEWujfobED9Y_DLTNtN5Qs';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ====== DOM refs ====== */
const productListEl = document.getElementById('product-list');
const searchEl = document.getElementById('search');
const categoryEl = document.getElementById('category');
const loadingEl = document.getElementById('loading');
const toastEl = document.getElementById('toast');

/* ====== State ====== */
let fullProducts = [];      // cache of approved products
let filteredProducts = [];  // current filtered list
let searchTerm = '';
let selectedCategory = '';

/* ====== Utilities ====== */
function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.style.display = 'block';
  setTimeout(() => (toastEl.style.display = 'none'), 4000);
}

function setLoading(visible) {
  if (!loadingEl) return;
  loadingEl.style.display = visible ? 'block' : 'none';
}

function fbu(amount) {
  try {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount);
  } catch {
    return amount;
  }
}

function safeImg(src) {
  return src && typeof src === 'string' && src.trim().length > 5
    ? src
    : 'assets/fallback.jpg';
}

function matchesSearch(product, term) {
  if (!term) return true;
  const t = term.toLowerCase();
  return (
    (product.name || '').toLowerCase().includes(t) ||
    (product.description || '').toLowerCase().includes(t)
  );
}

function matchesCategory(product, category) {
  if (!category) return true;
  return (product.category || '') === category;
}

/* ====== Rendering ====== */
function renderProducts(products) {
  if (!productListEl) return;

  productListEl.innerHTML = '';

  if (!products || products.length === 0) {
    productListEl.innerHTML = '<p>😔 Nta bicuruzwa vyemejwe biraboneka ubu.</p>';
    return;
  }

  products.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <img src="${safeImg(p.image_url)}" alt="${p.name || 'Product'}" style="width:100%; border-radius:8px;">
      <h3>✨ ${p.name || 'Igicuruzwa'}</h3>
      <p>${p.description || ''}</p>
      <strong>💰 ${fbu(p.price)} Fbu</strong>
    `;
    productListEl.appendChild(card);
  });
}

/* ====== Filtering pipeline ====== */
function applyFilters() {
  filteredProducts = fullProducts
    .filter((p) => matchesSearch(p, searchTerm))
    .filter((p) => matchesCategory(p, selectedCategory));

  renderProducts(filteredProducts);
}

/* ====== Data fetch ====== */
async function loadCatalogue() {
  setLoading(true);

  const { data, error } = await supabase
    .from('products')
    .select('id, name, price, description, image_url, category, provider_id, status, created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: false });

  setLoading(false);

  if (error) {
    console.error('Catalogue fetch error:', error);
    showToast('🛑 Ntitwashoboye kubona ibicuruzwa.');
    return;
  }

  fullProducts = Array.isArray(data) ? data : [];
  applyFilters();
}

/* ====== Debounced search ====== */
function debounce(fn, delay = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const onSearchInput = debounce((e) => {
  searchTerm = (e.target.value || '').trim().toLowerCase();
  applyFilters();
}, 300);

/* ====== Event listeners ====== */
if (searchEl) {
  searchEl.addEventListener('input', onSearchInput);
}

if (categoryEl) {
  categoryEl.addEventListener('change', (e) => {
    selectedCategory = e.target.value || '';
    applyFilters();
  });
}

/* ====== Init ====== */
document.addEventListener('DOMContentLoaded', loadCatalogue);
