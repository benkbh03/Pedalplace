/* ============================================================
   CYKELBØRSEN – main.js
   ============================================================ */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://ktufgncydxhkhfttojkh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bxJ_gRDrsJ-XCWWUD6NiQA_1nlPDA2B';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ============================================================
   ANNONCER
   ============================================================ */

async function loadBikes(filters = {}) {
  const grid = document.getElementById('listings-grid');
  grid.innerHTML = '<p style="color:var(--muted);padding:20px">Henter annoncer...</p>';

  let query = supabase
    .from('bikes')
    .select('*, profiles(name, seller_type, shop_name), bike_images(url, is_primary)')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (filters.type)       query = query.eq('type', filters.type);
  if (filters.sellerType) query = query.eq('profiles.seller_type', filters.sellerType);
  if (filters.maxPrice)   query = query.lte('price', filters.maxPrice);
  if (filters.search)     query = query.or(`brand.ilike.%${filters.search}%,model.ilike.%${filters.search}%,title.ilike.%${filters.search}%`);

  const { data, error } = await query;
  if (error) {
    grid.innerHTML = '<p style="color:var(--rust);padding:20px">Kunne ikke hente annoncer.</p>';
    return;
  }
  renderBikes(data);
}

function renderBikes(bikes) {
  const grid = document.getElementById('listings-grid');
  if (!bikes || bikes.length === 0) {
    grid.innerHTML = '<p style="color:var(--muted);padding:20px">Ingen annoncer fundet.</p>';
    return;
  }
  grid.innerHTML = bikes.map((b, i) => {
    const profile    = b.profiles || {};
    const sellerType = profile.seller_type || 'private';
    const sellerName = sellerType === 'dealer' ? profile.shop_name : profile.name;
    const initials   = (sellerName || 'U').substring(0, 2).toUpperCase();
    const primaryImg = b.bike_images?.find(img => img.is_primary)?.url;
    const imgContent = primaryImg
      ? `<img src="${primaryImg}" alt="${b.brand} ${b.model}" style="width:100%;height:100%;object-fit:cover;">`
      : '<span style="font-size:4rem">🚲</span>';
    return `
      <div class="bike-card" style="animation-delay:${i * 50}ms">
        <div class="bike-card-img">
          ${imgContent}
          <span class="condition-tag">${b.condition}</span>
          <button class="save-btn" onclick="event.stopPropagation();toggleSave(this,'${b.id}')">🤍</button>
        </div>
        <div class="bike-card-body">
          <div class="card-top">
            <div class="bike-title">${b.brand} ${b.model}</div>
            <div class="bike-price">${b.price.toLocaleString('da-DK')} kr.</div>
          </div>
          <div class="bike-meta">
            <span>${b.type}</span><span>${b.year || '–'}</span><span>Str. ${b.size || '–'}</span>
          </div>
          <div class="card-footer">
            <div class="seller-info">
              <div class="seller-avatar">${initials}</div>
              <div>
                <div class="seller-name">${sellerName || 'Ukendt'}</div>
                <span class="badge ${sellerType === 'dealer' ? 'badge-dealer' : 'badge-private'}">
                  ${sellerType === 'dealer' ? '🏪 Forhandler' : '👤 Privat'}
                </span>
              </div>
            </div>
            <div class="card-location">📍 ${b.city}</div>
          </div>
        </div>
      </div>`;
  }).join('');
}

function searchBikes() {
  const search = document.getElementById('search-input').value;
  const type   = document.getElementById('search-type').value;
  loadBikes({ search, type });
}

function sortBikes(value) {
  const grid = document.getElementById('listings-grid');
  const cards = [...grid.querySelectorAll('.bike-card')];
  cards.sort((a, b) => {
    const priceA = parseInt(a.querySelector('.bike-price').textContent.replace(/\D/g, ''));
    const priceB = parseInt(b.querySelector('.bike-price').textContent.replace(/\D/g, ''));
    if (value === 'price_asc')  return priceA - priceB;
    if (value === 'price_desc') return priceB - priceA;
    return 0;
  });
  cards.forEach(c => grid.appendChild(c));
}

/* ============================================================
   FILTER TÆLLER
   ============================================================ */

async function updateFilterCounts() {
  const { data, error } = await supabase
    .from('bikes')
    .select('type, condition, profiles(seller_type)')
    .eq('is_active', true);

  if (error || !data) return;

  const total    = data.length;
  const dealers  = data.filter(b => b.profiles?.seller_type === 'dealer').length;
  const privates = data.filter(b => b.profiles?.seller_type !== 'dealer').length;

  setCount('Alle sælgere', total);
  setCount('Forhandlere',  dealers);
  setCount('Private',      privates);
  setCount('Racercykel',   data.filter(b => b.type === 'Racercykel').length);
  setCount('Mountainbike', data.filter(b => b.type === 'Mountainbike').length);
  setCount('El-cykel',     data.filter(b => b.type === 'El-cykel').length);
  setCount('Citybike',     data.filter(b => b.type === 'Citybike').length);
  setCount('Ladcykel',     data.filter(b => b.type === 'Ladcykel').length);
  setCount('Børnecykel',   data.filter(b => b.type === 'Børnecykel').length);
  setCount('Gravel',       data.filter(b => b.type === 'Gravel').length);
  setCount('Ny',           data.filter(b => b.condition === 'Ny').length);
  setCount('Som ny',       data.filter(b => b.condition === 'Som ny').length);
  setCount('God stand',    data.filter(b => b.condition === 'God stand').length);
  setCount('Brugt',        data.filter(b => b.condition === 'Brugt').length);

  const countEl = document.getElementById('listings-count');
  if (countEl) countEl.textContent = `${total} cykler til salg`;

  const statTotal = document.getElementById('stat-total');
  if (statTotal) statTotal.textContent = total > 0 ? total.toLocaleString('da-DK') + '+' : '0';
}

function setCount(label, count) {
  document.querySelectorAll('.filter-option').forEach(el => {
    if (el.textContent.trim().startsWith(label)) {
      const countEl = el.querySelector('.filter-count');
      if (countEl) countEl.textContent = count.toLocaleString('da-DK');
    }
  });
}

/* ============================================================
   GEM / FJERN ANNONCE
   ============================================================ */

async function toggleSave(btn, bikeId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { showToast('⚠️ Log ind for at gemme annoncer'); return; }
  const isSaved = btn.textContent === '❤️';
  if (isSaved) {
    await supabase.from('saved_bikes').delete().eq('user_id', user.id).eq('bike_id', bikeId);
    btn.textContent = '🤍';
  } else {
    await supabase.from('saved_bikes').insert({ user_id: user.id, bike_id: bikeId });
    btn.textContent = '❤️';
  }
}

/* ============================================================
   FILTER PILLS
   ============================================================ */

function togglePill(el) {
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  const text = el.textContent.trim();
  if      (text === 'Alle')            loadBikes();
  else if (text === 'El-cykler')       loadBikes({ type: 'El-cykel' });
  else if (text === 'Kun forhandlere') loadBikes({ sellerType: 'dealer' });
  else if (text === 'Kun private')     loadBikes({ sellerType: 'private' });
  else if (text === 'Under 3.000 kr') loadBikes({ maxPrice: 3000 });
}

/* ============================================================
   OPRET ANNONCE MODAL
   ============================================================ */

async function openModal() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { openLoginModal(); showToast('⚠️ Log ind for at oprette en annonce'); return; }
  document.getElementById('modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  document.getElementById('modal').classList.remove('open');
  document.body.style.overflow = '';
}
document.getElementById('modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

function selectType(type) {
  const isDealer = type === 'dealer';
  document.getElementById('type-private').classList.toggle('selected', !isDealer);
  document.getElementById('type-dealer').classList.toggle('selected', isDealer);
  document.getElementById('dealer-fields').style.display = isDealer ? 'block' : 'none';
}

async function submitListing() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { showToast('⚠️ Log ind for at oprette en annonce'); return; }

  const bikeData = {
    user_id:     user.id,
    brand:       document.querySelector('[placeholder="f.eks. Trek, Giant, Specialized"]').value,
    model:       document.querySelector('[placeholder="f.eks. FX 3 Disc"]').value,
    price:       parseInt(document.querySelector('[placeholder="f.eks. 4500"]').value),
    year:        parseInt(document.querySelector('[placeholder="f.eks. 2021"]').value) || null,
    city:        document.querySelector('[placeholder="f.eks. København"]').value,
    description: document.querySelector('textarea').value,
    type:        document.querySelectorAll('.form-grid select')[0].value,
    size:        document.querySelectorAll('.form-grid select')[1].value,
    condition:   document.querySelectorAll('.form-grid select')[2].value,
    title:       `${document.querySelector('[placeholder="f.eks. Trek, Giant, Specialized"]').value} ${document.querySelector('[placeholder="f.eks. FX 3 Disc"]').value}`,
  };

  if (!bikeData.brand || !bikeData.model || !bikeData.price || !bikeData.city) {
    showToast('⚠️ Udfyld alle påkrævede felter (*)'); return;
  }

  const { error } = await supabase.from('bikes').insert(bikeData);
  if (error) { showToast('❌ Noget gik galt – prøv igen'); console.error(error); return; }

  closeModal();
  showToast('✅ Din annonce er oprettet!');
  loadBikes();
  updateFilterCounts();
}

/* ============================================================
   LOGIN MODAL
   ============================================================ */

function openLoginModal() {
  document.getElementById('login-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeLoginModal() {
  document.getElementById('login-modal').classList.remove('open');
  document.body.style.overflow = '';
}
document.getElementById('login-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeLoginModal();
});

function switchTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tab-login').classList.toggle('selected', isLogin);
  document.getElementById('tab-register').classList.toggle('selected', !isLogin);
  document.getElementById('form-login').style.display    = isLogin ? 'block' : 'none';
  document.getElementById('form-register').style.display = isLogin ? 'none'  : 'block';
}

async function handleLogin() {
  const email    = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  if (!email || !password) { showToast('⚠️ Udfyld email og adgangskode'); return; }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) showToast('❌ Forkert email eller adgangskode');
  else { closeLoginModal(); showToast('✅ Du er nu logget ind'); }
}

async function handleRegister() {
  const name     = document.getElementById('register-name').value;
  const email    = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  if (!name || !email || !password) { showToast('⚠️ Udfyld alle felter'); return; }
  const { error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
  if (error) showToast('❌ ' + error.message);
  else { closeLoginModal(); showToast('✅ Tjek din email for at bekræfte kontoen'); }
}

/* ============================================================
   PROFIL MODAL
   ============================================================ */

async function openProfileModal() {
  document.getElementById('profile-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  await loadProfileData();
  switchProfileTab('info');
}
function closeProfileModal() {
  document.getElementById('profile-modal').classList.remove('open');
  document.body.style.overflow = '';
}
document.getElementById('profile-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeProfileModal();
});

async function loadProfileData() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single();

  if (!profile) return;

  const name     = profile.name || 'Ukendt';
  const initials = name.substring(0, 2).toUpperCase();

  // Opdater header
  document.getElementById('profile-big-avatar').textContent  = initials;
  document.getElementById('profile-display-name').textContent = name;
  document.getElementById('profile-display-email').textContent = user.email;

  const badge = document.getElementById('profile-type-badge');
  if (profile.seller_type === 'dealer') {
    badge.textContent = '🏪 Forhandler';
    badge.className = 'badge badge-dealer';
  } else {
    badge.textContent = '👤 Privat';
    badge.className = 'badge badge-private';
  }

  // Udfyld redigeringsfelter
  document.getElementById('edit-name').value        = profile.name || '';
  document.getElementById('edit-phone').value       = profile.phone || '';
  document.getElementById('edit-city').value        = profile.city || '';
  document.getElementById('edit-seller-type').value = profile.seller_type || 'private';
  document.getElementById('edit-shop-name').value   = profile.shop_name || '';

  // Vis/skjul butiksnavnfelt
  const shopGroup = document.getElementById('edit-shop-group');
  shopGroup.style.display = profile.seller_type === 'dealer' ? 'flex' : 'none';

  document.getElementById('edit-seller-type').addEventListener('change', function () {
    shopGroup.style.display = this.value === 'dealer' ? 'flex' : 'none';
  });
}

function switchProfileTab(tab) {
  ['info', 'listings', 'saved'].forEach(t => {
    document.getElementById(`profile-${t}`).style.display = t === tab ? 'block' : 'none';
    document.getElementById(`ptab-${t}`).classList.toggle('active', t === tab);
  });
  if (tab === 'listings') loadMyListings();
  if (tab === 'saved')    loadSavedListings();
}

async function saveProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const updates = {
    name:        document.getElementById('edit-name').value,
    phone:       document.getElementById('edit-phone').value,
    city:        document.getElementById('edit-city').value,
    seller_type: document.getElementById('edit-seller-type').value,
    shop_name:   document.getElementById('edit-shop-name').value,
  };

  const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
  if (error) { showToast('❌ Kunne ikke gemme profil'); return; }

  showToast('✅ Profil opdateret!');
  await loadProfileData();
  updateNavAvatar(updates.name);
}

async function loadMyListings() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase
    .from('bikes').select('*').eq('user_id', user.id).order('created_at', { ascending: false });

  const grid = document.getElementById('my-listings-grid');
  if (error || !data || data.length === 0) {
    grid.innerHTML = '<p style="color:var(--muted)">Du har ingen aktive annoncer.</p>';
    return;
  }

  grid.innerHTML = data.map(b => `
    <div class="my-listing-row">
      <div class="my-listing-info">
        <div class="my-listing-title">${b.brand} ${b.model}</div>
        <div class="my-listing-meta">${b.type} · ${b.city} · ${b.condition}</div>
      </div>
      <div class="my-listing-price">${b.price.toLocaleString('da-DK')} kr.</div>
      <button class="btn-delete" onclick="deleteListing('${b.id}')">Slet</button>
    </div>
  `).join('');
}

async function deleteListing(id) {
  if (!confirm('Er du sikker på at du vil slette denne annonce?')) return;
  const { error } = await supabase.from('bikes').delete().eq('id', id);
  if (error) { showToast('❌ Kunne ikke slette annonce'); return; }
  showToast('🗑️ Annonce slettet');
  loadMyListings();
  loadBikes();
  updateFilterCounts();
}

async function loadSavedListings() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase
    .from('saved_bikes')
    .select('bike_id, bikes(brand, model, price, type, city, condition)')
    .eq('user_id', user.id);

  const grid = document.getElementById('my-saved-grid');
  if (error || !data || data.length === 0) {
    grid.innerHTML = '<p style="color:var(--muted)">Du har ikke gemt nogen annoncer endnu.</p>';
    return;
  }

  grid.innerHTML = data.map(s => {
    const b = s.bikes;
    if (!b) return '';
    return `
      <div class="my-listing-row">
        <div class="my-listing-info">
          <div class="my-listing-title">${b.brand} ${b.model}</div>
          <div class="my-listing-meta">${b.type} · ${b.city} · ${b.condition}</div>
        </div>
        <div class="my-listing-price">${b.price.toLocaleString('da-DK')} kr.</div>
      </div>`;
  }).join('');
}

/* ============================================================
   AUTH STATE – opdater nav når bruger logger ind/ud
   ============================================================ */

function updateNavAvatar(name) {
  const initials = (name || '?').substring(0, 2).toUpperCase();
  const btn = document.getElementById('nav-initials');
  if (btn) btn.textContent = initials;
}

supabase.auth.onAuthStateChange(async (_event, session) => {
  const sellBtn    = document.querySelector('.btn-sell');
  const navProfile = document.getElementById('nav-profile');

  if (session) {
    if (sellBtn) {
      sellBtn.textContent = '+ Sæt til salg';
      sellBtn.setAttribute('onclick', 'openModal()');
    }
    if (navProfile) navProfile.style.display = 'flex';

    // Hent navn til avatar
    const { data: profile } = await supabase
      .from('profiles').select('name').eq('id', session.user.id).single();
    if (profile) updateNavAvatar(profile.name);

  } else {
    if (sellBtn) {
      sellBtn.textContent = 'Log ind / Sælg';
      sellBtn.setAttribute('onclick', 'openLoginModal()');
    }
    if (navProfile) navProfile.style.display = 'none';
  }
});

/* ============================================================
   LOGOUT
   ============================================================ */

async function logout() {
  await supabase.auth.signOut();
  closeProfileModal();
  showToast('👋 Du er logget ud');
}

/* ============================================================
   TOAST & NAVIGATION
   ============================================================ */

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

function showSection(section) {
  if (section === 'dealers') document.querySelector('.dealer-strip').scrollIntoView({ behavior: 'smooth' });
  else document.querySelector('.main').scrollIntoView({ behavior: 'smooth' });
}

/* ============================================================
   GØR FUNKTIONER GLOBALE
   ============================================================ */

window.openModal         = openModal;
window.closeModal        = closeModal;
window.selectType        = selectType;
window.submitListing     = submitListing;
window.openLoginModal    = openLoginModal;
window.closeLoginModal   = closeLoginModal;
window.switchTab         = switchTab;
window.handleLogin       = handleLogin;
window.handleRegister    = handleRegister;
window.openProfileModal  = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.switchProfileTab  = switchProfileTab;
window.saveProfile       = saveProfile;
window.deleteListing     = deleteListing;
window.togglePill        = togglePill;
window.toggleSave        = toggleSave;
window.showSection       = showSection;
window.logout            = logout;
window.searchBikes       = searchBikes;
window.sortBikes         = sortBikes;

/* ============================================================
   INIT
   ============================================================ */

loadBikes();
updateFilterCounts();
