import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// 👉 Credentials zawe
const SUPABASE_URL = 'https://xeyehhfumcvfvajpnkrr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6...XOxP39uQE6b4A4DIglWD9KEWujfobED9Y_DLTNtN5Qs';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM elements
const loginBtn = document.getElementById('login-btn');
const emailEl = document.getElementById('email');
const passwordEl = document.getElementById('password');
const authSection = document.getElementById('auth-section');
const productForm = document.getElementById('product-form');
const toastEl = document.getElementById('toast');

function showToast(message) {
  toastEl.textContent = message;
  toastEl.style.display = 'block';
  setTimeout(() => (toastEl.style.display = 'none'), 4000);
}

// LOGIN
loginBtn.addEventListener('click', async () => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: emailEl.value,
    password: passwordEl.value
  });

  if (error) {
    showToast('🛑 Login ntivyashobotse: ' + error.message);
    return;
  }

  showToast('✅ Winjiye neza!');
  authSection.style.display = 'none';
  productForm.style.display = 'block';
});

// PRODUCT SUBMISSION
productForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;

  if (!user) {
    showToast('⚠️ Ntacyo ushobora gukora utinjiye.');
    return;
  }

  const { error } = await supabase
    .from('products')
    .insert([{
      provider_id: user.id,
      name: document.getElementById('name').value,
      price: parseInt(document.getElementById('price').value),
      description: document.getElementById('description').value,
      image_url: document.getElementById('image_url').value,
      category: document.getElementById('category').value,
      status: 'pending'
    }]);

  if (error) {
    showToast('🛑 Ntivyashobotse: ' + error.message);
    return;
  }

  showToast('✅ Igicuruzwa cashizwe neza, kirindiriye kwemezwa na Admin.');
  productForm.reset();
});
