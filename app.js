/* app.js — Burundi Digital Marketboard
   Full frontend: Supabase integration, catalogue, UX, realtime, SW registration,
   video-fallback handling, dark mode, toasts, testimonials, jokes, chatbot placeholder.
*/

/* -------------------------
   Config
   ------------------------- */
const SUPABASE_URL = "https://wmcxagrcnfrpxwjbaggq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtY3hhZ3JjbmZycHh3amJhZ2dxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0NzM2NDQsImV4cCI6MjA3NzA0OTY0NH0.hxmdIqeEXrxbZX9MVuJtmh-UWvt-h96GGqMUf-QyCZo";

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* -------------------------
   Utilities
   ------------------------- */
function showToast(message, ms = 3200) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.style.display = "block";
  toast.setAttribute("aria-hidden", "false");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    toast.style.display = "none";
    toast.setAttribute("aria-hidden", "true");
  }, ms);
}

function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* -------------------------
   Theme
   ------------------------- */
function toggleDarkMode() {
  const isDark = document.body.classList.toggle("dark");
  try { localStorage.setItem("theme", isDark ? "dark" : "light"); } catch {}
  showToast(isDark ? "Dark mode yahinduwe 🌙" : "Light mode isubijwe ☀️", 1400);
}
function initTheme() {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") document.body.classList.add("dark");
  } catch {}
  const btn = document.getElementById("themeToggle");
  if (btn) btn.addEventListener("click", toggleDarkMode);
}

/* -------------------------
   Background media handling
   ------------------------- */
function initBackgroundMedia() {
  const video = document.querySelector(".bg-video");
  const overlay = document.querySelector(".bg-overlay");
  if (!video) return;

  video.addEventListener("error", () => {
    if (overlay) overlay.style.background = "rgba(0,0,0,0.45)";
    showToast("Video ntikinnye, image fallback iriho 🖼️", 2800);
  });

  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn && conn.saveData) {
    try { video.pause(); } catch {}
    if (overlay) overlay.style.background = "rgba(0,0,0,0.45)";
  }
}

/* -------------------------
   Product card rendering
   ------------------------- */
function renderProductCard(product = {}) {
  const wrap = document.createElement("div");
  wrap.className = "product-card";
  const image = escapeHtml(product.image_url || "/fallback-product.jpg");
  const name = escapeHtml(product.name || "Izina ribuze");
  const desc = escapeHtml(product.description || "");
  const price = Number.isFinite(product.price) ? product.price : 0;
  const badge = product.is_paid ? `<span class="badge">Paid</span>` : "";

  wrap.innerHTML = `
    <img src="${image}" alt="${name}" class="product-img" onerror="this.src='/fallback-product.jpg'"/>
    <h3>${name} ✨</h3>
    <p>${desc}</p>
    <p><strong>${price} FBu</strong></p>
    ${badge}
  `;
  return wrap;
}

/* -------------------------
   Cache helpers
   ------------------------- */
function cacheProducts(list = []) {
  try { localStorage.setItem("catalogue_cache_v1", JSON.stringify({ts: Date.now(), items: list})); } catch {}
}
function getCachedProducts(maxAgeMs = 1000 * 60 * 5) {
  try {
    const raw = localStorage.getItem("catalogue_cache_v1");
    if (!raw) return null;
    const { ts, items } = JSON.parse(raw);
    if (!ts || Date.now() - ts > maxAgeMs) return null;
    return items || null;
  } catch { return null; }
}

/* -------------------------
   Load catalogue (cache-first then fresh)
   ------------------------- */
async function loadCatalogue({ useCacheFirst = true } = {}) {
  const container = document.getElementById("catalogue");
  const loading = document.getElementById("loading");
  if (!container) return;

  if (useCacheFirst) {
    const cached = getCachedProducts();
    if (cached && cached.length) {
      container.innerHTML = "";
      cached.forEach(p => container.appendChild(renderProductCard(p)));
      if (loading) loading.style.display = "none";
      showToast("Catalogue yihuse (cache) ⚡", 1200);
    }
  }

  try {
    const { data, error } = await supabase
      .from("products")
      .select("id,name,description,price,image_url,is_paid,status,updated_at")
      .eq("status", "approved")
      .order("updated_at", { ascending: false });

    if (loading) loading.style.display = "none";

    if (error) {
      console.error("Supabase error:", error);
      if (!container.children.length) container.innerHTML = "<p>Nta bicuruzwa byemejwe biraboneka cyangwa hari ikibazo 🛒</p>";
      showToast("Ntibyakunze gukurura catalogue ❌", 2400);
      return;
    }

    if (!data || data.length === 0) {
      container.innerHTML = "<p>Nta bicuruzwa byemejwe biraboneka 🛒</p>";
      cacheProducts([]);
      return;
    }

    container.innerHTML = "";
    data.forEach(p => container.appendChild(renderProductCard(p)));
    cacheProducts(data);
    showToast("Catalogue ivuguruye ✅", 1200);
  } catch (e) {
    console.error("Unexpected load error:", e);
    if (loading) loading.style.display = "none";
    showToast("Hari ikibazo mu gukurura data ❌", 2400);
  }
}

/* -------------------------
   Realtime subscription (debounced refresh)
   ------------------------- */
function initRealtimeCatalogue() {
  try {
    let t = null;
    const schedule = () => {
      if (t) return;
      t = setTimeout(async () => {
        t = null;
        await loadCatalogue({ useCacheFirst: false });
        showToast("Catalogue ivuguruye (realtime) 🌀", 1200);
      }, 1000);
    };

    supabase
      .channel("public:products")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, payload => {
        schedule();
      })
      .subscribe()
      .then(() => console.log("Subscribed to products realtime"))
      .catch(e => console.warn("Realtime subscribe failed", e));
  } catch (e) {
    console.warn("Realtime init skipped", e);
  }
}

/* -------------------------
   Testimonials rotation
   ------------------------- */
function rotateTestimonials() {
  const nodes = document.querySelectorAll(".testimonial");
  if (!nodes.length) return;
  let i = 0;
  nodes.forEach((n, idx) => n.classList.toggle("active", idx === 0));
  setInterval(() => {
    nodes[i].classList.remove("active");
    i = (i + 1) % nodes.length;
    nodes[i].classList.add("active");
  }, 4800);
}

/* -------------------------
   Jokes spinner
   ------------------------- */
const JOKES = [
  "Kubera iki computer ikunda ikawa? ☕ Kuko ikora 'Java'!",
  "Umukiriya: 'Nshaka website yoroshe' → Developer: 'Ok, turayita easy.com' 😂",
  "Database nayo irakunda urukundo... ikunda 'relations' ❤️",
  "Frontend: 'ndakeye' — Backend: 'ndafise RLS, humura' 🛡️"
];
function initJokes() {
  const btn = document.getElementById("jokeBtn");
  const text = document.getElementById("jokeText");
  if (!btn || !text) return;
  btn.addEventListener("click", () => {
    const n = Math.floor(Math.random() * JOKES.length);
    text.textContent = JOKES[n];
    showToast("Urwenya rushya rwaje 🎉", 1300);
  });
}

/* -------------------------
   Accessibility helpers
   ------------------------- */
function initA11y() {
  const loading = document.getElementById("loading");
  if (loading) loading.setAttribute("aria-live", "polite");
}

/* -------------------------
   Chatbot placeholder
   ------------------------- */
function initChatbotPlaceholder() {
  const chatWindow = document.getElementById("chatWindow");
  if (!chatWindow) return;
  chatWindow.innerHTML = `<p><em>🤖 Chatbot ikomeye izashyirwa hano mu gihe kiri imbere. Iri ni placeholder.</em></p>`;
}

/* -------------------------
   Service Worker registration
   ------------------------- */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      console.log('SW registered', reg);

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showToast('Update yabonetse. Refresh kugira ugire version nshya', 6000);
          }
        });
      });
    } catch (e) {
      console.warn('SW registration failed', e);
    }
  });
}

/* -------------------------
   Bootstrap
   ------------------------- */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    initTheme();
    initBackgroundMedia();
    initA11y();
    initJokes();
    rotateTestimonials();

    await loadCatalogue({ useCacheFirst: true });
    initRealtimeCatalogue();

    initChatbotPlaceholder();
    initNetworkStatus && initNetworkStatus(); // optional network hints
    registerServiceWorker();
  } catch (e) {
    console.error('App init error', e);
    showToast('Hari ikibazo mu gutangiza app ❌', 3000);
  } finally {
    const loading = document.getElementById("loading");
    if (loading) loading.removeAttribute('aria-busy');
  }
});

/* -------------------------
   Optional network status (defined here to avoid missing ref)
   ------------------------- */
function initNetworkStatus() {
  function status() {
    if (navigator.onLine) showToast("Muri online ✅", 1400);
    else showToast("Uri offline — hari limitations", 2200);
  }
  window.addEventListener("online", status);
  window.addEventListener("offline", status);
  if (!navigator.onLine) showToast("Uri offline — hari limitations", 2200);
}
