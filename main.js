/* ============================================================
   CYKELBØRSEN – main.js
   ============================================================ */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://ktufgncydxhkhfttojkh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bxJ_gRDrsJ-XCWWUD6NiQA_1nlPDA2B';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Global bruger-cache — hentes én gang ved init
let currentUser    = null;
let currentProfile = null;

/* ============================================================
   INIT – hent session én gang og sæt alt op
   ============================================================ */

async function init() {
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    currentUser = session.user;

    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', currentUser.id).single();
    currentProfile = profile;

    updateNav(true, profile?.name);
    startRealtimeNotifications();
    // Vis admin knap hvis admin
    if (profile && profile.is_admin) {
      var adminBtn = document.getElementById('nav-admin');
      if (adminBtn) adminBtn.style.display = 'flex';
    }
  } else {
    updateNav(false);
  }

  // Opdater nav når bruger logger ind/ud
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session) {
      currentUser = session.user;
      const { data: profile } = await supabase
        .from('profiles').select('*').eq('id', currentUser.id).single();
      currentProfile = profile;
      updateNav(true, profile?.name);
    } else {
      currentUser    = null;
      currentProfile = null;
      updateNav(false);
    }
  });

  loadBikes();
  updateFilterCounts();

  // Klik uden for modal lukker den
  document.getElementById('inbox-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeInboxModal();
  });
  document.getElementById('dealer-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeBecomeDealerModal();
  });
  document.getElementById('footer-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeFooterModal();
  });
  document.getElementById('admin-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeAdminPanel();
  });
  document.getElementById('share-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeShareModal();
  });
}

function updateNav(loggedIn, name) {
  const sellBtn    = document.querySelector('.btn-sell');
  const navProfile = document.getElementById('nav-profile');

  if (loggedIn) {
    if (sellBtn) { sellBtn.textContent = '+ Sæt til salg'; sellBtn.setAttribute('onclick', 'openModal()'); }
    if (navProfile) navProfile.style.display = 'flex';
    updateNavAvatar(name);
    checkUnreadMessages();
  } else {
    if (sellBtn) { sellBtn.textContent = 'Log ind / Sælg'; sellBtn.setAttribute('onclick', 'openLoginModal()'); }
    if (navProfile) navProfile.style.display = 'none';
  }
}

function updateNavAvatar(name) {
  const el = document.getElementById('nav-initials');
  if (el) el.textContent = (name || '?').substring(0, 2).toUpperCase();
}

async function checkUnreadMessages() {
  if (!currentUser) return;
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('receiver_id', currentUser.id)
    .eq('read', false);
  const badge = document.getElementById('inbox-badge');
  if (badge && count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline';
  }
}

/* ============================================================
   ANNONCER
   ============================================================ */

async function loadBikes(filters = {}) {
  const grid = document.getElementById('listings-grid');
  grid.innerHTML = '<p style="color:var(--muted);padding:20px">Henter annoncer...</p>';

  let query = supabase
    .from('bikes')
    .select('*, profiles(name, seller_type, shop_name, verified, id_verified), bike_images(url, is_primary)')
    .order('created_at', { ascending: false });

  if (filters.type)       query = query.eq('type', filters.type);
  if (filters.maxPrice)   query = query.lte('price', filters.maxPrice);
  if (filters.search)     query = query.or(`brand.ilike.%${filters.search}%,model.ilike.%${filters.search}%`);

  const { data, error } = await query;

  if (error) {
    console.error('loadBikes fejl:', error);
    grid.innerHTML = '<p style="color:var(--rust);padding:20px">Kunne ikke hente annoncer.</p>';
    return;
  }

  renderBikes(data);
}

function renderBikes(bikes) {
  const grid = document.getElementById('listings-grid');

  if (!bikes || bikes.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;">
        <div style="font-size:4rem;margin-bottom:16px;">🚲</div>
        <h3 style="font-family:'Fraunces',serif;font-size:1.4rem;margin-bottom:10px;color:var(--charcoal);">Ingen cykler her endnu</h3>
        <p style="color:var(--muted);font-size:0.9rem;max-width:340px;margin:0 auto 24px;line-height:1.6;">Vær den første til at sælge din cykel på Cykelbørsen — det er gratis og tager kun 2 minutter.</p>
        <button onclick="openModal()" style="background:var(--rust);color:#fff;border:none;padding:13px 28px;border-radius:8px;font-size:0.92rem;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">+ Sæt din cykel til salg</button>
      </div>`;
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

    var isSold = !b.is_active;
    return `
      <div class="bike-card" style="animation-delay:${i * 50}ms;${isSold ? 'opacity:0.7' : ''}" onclick="${isSold ? '' : "openBikeModal('" + b.id + "')"}">
        <div class="bike-card-img">
          ${imgContent}
          ${isSold ? '<div class="sold-tag"><span>SOLGT</span></div>' : ''}
          <span class="condition-tag">${b.condition}</span>
          ${!isSold ? `<button class="save-btn" onclick="event.stopPropagation();toggleSave(this,'${b.id}')">🤍</button>` : ''}
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
                <div class="seller-name">${sellerName || 'Ukendt'}${profile.verified ? ' <span class="verified-badge" title="Verificeret forhandler">✓</span>' : ''}${profile.id_verified ? ' <span class="id-badge" title="ID verificeret">🪪</span>' : ''}</div>
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
  const grid  = document.getElementById('listings-grid');
  const cards = [...grid.querySelectorAll('.bike-card')];
  cards.sort((a, b) => {
    const pA = parseInt(a.querySelector('.bike-price').textContent.replace(/\D/g, ''));
    const pB = parseInt(b.querySelector('.bike-price').textContent.replace(/\D/g, ''));
    if (value === 'price_asc')  return pA - pB;
    if (value === 'price_desc') return pB - pA;
    return 0;
  });
  cards.forEach(c => grid.appendChild(c));
}

/* ============================================================
   FILTER TÆLLER
   ============================================================ */

async function updateFilterCounts() {
  // Hent aktive annoncer til filtre
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

  const countEl   = document.getElementById('listings-count');
  const statTotal = document.getElementById('stat-total');
  if (countEl)   countEl.textContent   = `${total} cykler til salg`;
  if (statTotal) statTotal.textContent = total > 0 ? total.toLocaleString('da-DK') : '0';

  // Hent antal verificerede forhandlere
  const { count: dealerCount } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('seller_type', 'dealer')
    .eq('verified', true);

  const statDealers = document.getElementById('stat-dealers');
  if (statDealers) statDealers.textContent = dealerCount > 0 ? dealerCount.toLocaleString('da-DK') : '0';

  // Hent antal solgte cykler (gennemførte handler)
  const { count: soldCount } = await supabase
    .from('bikes')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', false);

  const statSold = document.getElementById('stat-sold');
  if (statSold) statSold.textContent = (soldCount || 0).toLocaleString('da-DK') + (soldCount > 0 ? '+' : '');
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
  if (!currentUser) { showToast('⚠️ Log ind for at gemme annoncer'); return; }
  const isSaved = btn.textContent === '❤️';
  if (isSaved) {
    await supabase.from('saved_bikes').delete().eq('user_id', currentUser.id).eq('bike_id', bikeId);
    btn.textContent = '🤍';
  } else {
    await supabase.from('saved_bikes').insert({ user_id: currentUser.id, bike_id: bikeId });
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

function openModal() {
  if (!currentUser) { openLoginModal(); showToast('⚠️ Log ind for at oprette en annonce'); return; }
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
  if (!currentUser) { showToast('⚠️ Log ind for at oprette en annonce'); return; }

  // Hent felter specifikt fra opret-annonce modalen (#modal)
  const modalEl = document.getElementById('modal');
  const brand   = modalEl.querySelector('[placeholder="f.eks. Trek, Giant, Specialized"]').value.trim();
  const model   = modalEl.querySelector('[placeholder="f.eks. FX 3 Disc"]').value.trim();
  const price   = parseInt(modalEl.querySelector('[placeholder="f.eks. 4500"]').value);
  const year    = parseInt(modalEl.querySelector('[placeholder="f.eks. 2021"]').value) || null;
  const city    = modalEl.querySelector('[placeholder="f.eks. København"]').value.trim();
  const desc    = modalEl.querySelector('textarea').value.trim();
  const selects = modalEl.querySelectorAll('select');
  const type      = selects[0].value;
  const size      = selects[1].value;
  const condition = selects[2].value;

  const bikeData = {
    user_id:     currentUser.id,
    brand, model, price, year, city,
    description: desc,
    type, size, condition,
    title:       `${brand} ${model}`,
    is_active:   true,
  };

  if (!bikeData.brand || !bikeData.model || !bikeData.price || !bikeData.city) {
    showToast('⚠️ Udfyld alle påkrævede felter (*)'); return;
  }

  const { data: newBike, error } = await supabase.from('bikes').insert(bikeData).select().single();
  if (error) { showToast('❌ Noget gik galt – prøv igen'); console.error(error); return; }

  // Upload billeder hvis der er valgt nogle
  if (selectedFiles.length > 0) {
    showToast('⏳ Uploader billeder...');
    await uploadImages(newBike.id);
  }

  closeModal();
  resetImageUpload();
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
  // Fane-knapper kun for login/register
  document.getElementById('tab-login').classList.toggle('selected', tab === 'login');
  document.getElementById('tab-register').classList.toggle('selected', tab === 'register');

  document.getElementById('form-login').style.display    = tab === 'login'    ? 'block' : 'none';
  document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('form-forgot').style.display   = tab === 'forgot'   ? 'block' : 'none';

  // Opdater modal-titel
  const titles = { login: 'Log ind', register: 'Opret konto', forgot: 'Glemt adgangskode' };
  document.querySelector('#login-modal .modal-header h2').textContent = titles[tab] || 'Log ind';
}

async function handleForgotPassword() {
  const email = document.getElementById('forgot-email').value.trim();
  if (!email) { showToast('⚠️ Indtast din email'); return; }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://benkbh03.github.io/CykelBoersen/',
  });

  if (error) {
    showToast('❌ Kunne ikke sende link – tjek emailen');
  } else {
    closeLoginModal();
    showToast('✅ Tjek din email for nulstillingslinket');
  }
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

function openProfileModal() {
  if (!currentUser) return;
  document.getElementById('profile-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  showProfileData();
  switchProfileTab('info');
}
function closeProfileModal() {
  document.getElementById('profile-modal').classList.remove('open');
  document.body.style.overflow = '';
}
document.getElementById('profile-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeProfileModal();
});

function showProfileData() {
  // Brug den cachede profil — ingen ekstra netværkskald
  const profile = currentProfile || {};
  const name    = profile.name || currentUser?.email?.split('@')[0] || 'Ukendt';
  const initials = name.substring(0, 2).toUpperCase();

  document.getElementById('profile-big-avatar').textContent   = initials;
  document.getElementById('profile-display-name').textContent  = name;
  document.getElementById('profile-display-email').textContent = currentUser?.email || '';

  const badge = document.getElementById('profile-type-badge');
  if (profile.seller_type === 'dealer') {
    badge.textContent = '🏪 Forhandler';
    badge.className   = 'badge badge-dealer';
  } else {
    badge.textContent = '👤 Privat';
    badge.className   = 'badge badge-private';
  }

  document.getElementById('edit-name').value        = profile.name || '';
  document.getElementById('edit-phone').value       = profile.phone || '';
  document.getElementById('edit-city').value        = profile.city || '';
  document.getElementById('edit-seller-type').value = profile.seller_type || 'private';
  document.getElementById('edit-shop-name').value   = profile.shop_name || '';

  const shopGroup = document.getElementById('edit-shop-group');
  shopGroup.style.display = profile.seller_type === 'dealer' ? 'flex' : 'none';

  document.getElementById('edit-seller-type').onchange = function () {
    shopGroup.style.display = this.value === 'dealer' ? 'flex' : 'none';
  };
  updateIdVerifyUI();
}

function switchProfileTab(tab) {
  ['info', 'listings', 'saved', 'inbox'].forEach(t => {
    document.getElementById(`profile-${t}`).style.display = t === tab ? 'block' : 'none';
    document.getElementById(`ptab-${t}`).classList.toggle('active', t === tab);
  });
  if (tab === 'listings') loadMyListings();
  if (tab === 'saved')    loadSavedListings();
  if (tab === 'inbox')    loadInbox();
}

async function saveProfile() {
  if (!currentUser) return;

  const updates = {
    name:        document.getElementById('edit-name').value,
    phone:       document.getElementById('edit-phone').value,
    city:        document.getElementById('edit-city').value,
    seller_type: document.getElementById('edit-seller-type').value,
    shop_name:   document.getElementById('edit-shop-name').value,
  };

  const { error } = await supabase.from('profiles').update(updates).eq('id', currentUser.id);
  if (error) { showToast('❌ Kunne ikke gemme profil'); return; }

  // Opdater cache
  currentProfile = { ...currentProfile, ...updates };
  showProfileData();
  updateNavAvatar(updates.name);
  showToast('✅ Profil opdateret!');
}

async function loadMyListings() {
  if (!currentUser) return;

  const { data, error } = await supabase
    .from('bikes').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });

  const grid = document.getElementById('my-listings-grid');
  if (error || !data || data.length === 0) {
    grid.innerHTML = '<p style="color:var(--muted)">Du har ingen aktive annoncer.</p>';
    return;
  }

  grid.innerHTML = data.map(b => {
    var isSold = !b.is_active;
    return `<div class="my-listing-row" style="${isSold ? 'opacity:0.65' : ''}">
      <div class="my-listing-info">
        <div class="my-listing-title">${b.brand} ${b.model} ${isSold ? '<span style="background:var(--charcoal);color:#fff;font-size:.68rem;padding:2px 7px;border-radius:4px;vertical-align:middle;">SOLGT</span>' : ''}</div>
        <div class="my-listing-meta">${b.type} · ${b.city} · ${b.condition}</div>
      </div>
      <div class="my-listing-price">${b.price.toLocaleString('da-DK')} kr.</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${!isSold ? `<button class="btn-sold" onclick="toggleSold('${b.id}', false)">Sæt solgt</button>` : `<button class="btn-unsold" onclick="toggleSold('${b.id}', true)">Genaktiver</button>`}
        <button class="btn-edit" onclick="openEditModal('${b.id}')">✏️</button>
        <button class="btn-delete" onclick="deleteListing('${b.id}')">Slet</button>
      </div>
    </div>`;
  }).join('');
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
  if (!currentUser) return;

  const { data, error } = await supabase
    .from('saved_bikes')
    .select('bike_id, bikes(brand, model, price, type, city, condition)')
    .eq('user_id', currentUser.id);

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
   LOGOUT
   ============================================================ */

async function logout() {
  await supabase.auth.signOut();
  currentUser    = null;
  currentProfile = null;
  closeProfileModal();
  var adminBtn = document.getElementById('nav-admin');
  if (adminBtn) adminBtn.style.display = 'none';
  showToast('👋 Du er logget ud');
}

/* ============================================================
   TOAST & NAVIGATION SCROLL
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
   ANNONCE DETALJE MODAL
   ============================================================ */

async function openBikeModal(bikeId) {
  document.getElementById('bike-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('bike-modal-body').innerHTML = '<p style="color:var(--muted)">Indlæser...</p>';

  const { data: b, error } = await supabase
    .from('bikes')
    .select('*, profiles(id, name, seller_type, shop_name, phone, city, verified, id_verified), bike_images(url, is_primary)')
    .eq('id', bikeId)
    .single();

  if (error || !b) {
    document.getElementById('bike-modal-body').innerHTML = '<p style="color:var(--rust)">Kunne ikke hente annonce.</p>';
    return;
  }

  const profile    = b.profiles || {};
  const sellerType = profile.seller_type || 'private';
  const sellerName = sellerType === 'dealer' ? profile.shop_name : profile.name;
  const initials   = (sellerName || 'U').substring(0, 2).toUpperCase();

  // Sorter billeder: primærbillede først
  const allImages = (b.bike_images || []).slice().sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));
  window._galleryImages = allImages.map(img => img.url);
  window._galleryIndex  = 0;

  // Byg galleri HTML
  let galleryHtml;
  if (allImages.length === 0) {
    galleryHtml = `<div class="bike-detail-img"><span style="font-size:4rem">🚲</span></div>`;
  } else if (allImages.length === 1) {
    galleryHtml = `<div class="bike-detail-img"><img src="${allImages[0].url}" alt="${b.brand} ${b.model}"></div>`;
  } else {
    const thumbsHtml = allImages.map((img, i) => `
      <button class="gallery-thumb${i === 0 ? ' active' : ''}" onclick="galleryGoto(${i})" aria-label="Billede ${i + 1}">
        <img src="${img.url}" alt="Billede ${i + 1}">
      </button>`).join('');
    galleryHtml = `
      <div class="bike-gallery">
        <div class="gallery-main">
          <img id="gallery-main-img" src="${allImages[0].url}" alt="${b.brand} ${b.model}">
          <button class="gallery-nav-btn gallery-prev" onclick="galleryNav(-1)" aria-label="Forrige billede">&#8249;</button>
          <button class="gallery-nav-btn gallery-next" onclick="galleryNav(1)" aria-label="Næste billede">&#8250;</button>
          <span class="gallery-counter" id="gallery-counter">1 / ${allImages.length}</span>
        </div>
        <div class="gallery-thumbs">${thumbsHtml}</div>
      </div>`;
  }

  const isOwner = currentUser && currentUser.id === profile.id;

  document.getElementById('bike-modal-title').textContent = `${b.brand} ${b.model}`;

  document.getElementById('bike-modal-body').innerHTML = `
    <div class="bike-detail-grid">
      <div>
        ${galleryHtml}
      </div>
      <div class="bike-detail-info">
        <div class="bike-detail-price">${b.price.toLocaleString('da-DK')} kr.</div>
        <div class="bike-detail-tags">
          <span class="detail-tag">${b.type}</span>
          ${b.year ? `<span class="detail-tag">${b.year}</span>` : ''}
          ${b.size ? `<span class="detail-tag">Str. ${b.size}</span>` : ''}
          ${b.condition ? `<span class="detail-tag">${b.condition}</span>` : ''}
          ${b.city ? `<span class="detail-tag">📍 ${b.city}</span>` : ''}
        </div>
        <div class="bike-detail-seller">
          <div class="seller-avatar-large">${initials}</div>
          <div>
            <div class="seller-detail-name">${sellerName || 'Ukendt'}${profile.verified ? ' <span class="verified-badge-large" title="Verificeret forhandler">✓</span>' : ''}${profile.id_verified ? ' <span class="id-badge" title="ID verificeret">🪪</span>' : ''}</div>
            <div class="seller-detail-city">${profile.city || ''}</div>
            <span class="badge ${sellerType === 'dealer' ? 'badge-dealer' : 'badge-private'}">
              ${sellerType === 'dealer' ? '🏪 Forhandler' : '👤 Privat'}
            </span>
          </div>
        </div>
        ${!isOwner ? `
        <div class="action-buttons">
          <button class="btn-bid" onclick="toggleBidBox()">💰 Giv et bud</button>
          <div class="bid-box" id="bid-box">
            <div class="bid-box-inner">
              <input type="number" id="bid-amount" placeholder="Dit bud i kr.">
              <button onclick="sendBid('${b.id}', '${profile.id}')">Send bud</button>
            </div>
          </div>
          <button class="btn-contact" onclick="toggleMessageBox()">✉️ Kontakt sælger</button>
          <div class="message-box" id="message-box">
            <textarea id="message-text" placeholder="Skriv en besked til sælgeren..."></textarea>
            <button onclick="sendMessage('${b.id}', '${profile.id}')">Send besked</button>
          </div>
          <button class="btn-save-listing" onclick="toggleSaveFromModal(this, '${b.id}')">🤍 Gem annonce</button>
          <button class="btn-save-listing" onclick="event.stopPropagation();openShareModal('${b.id}', '${b.brand} ${b.model}')">🔗 Del annonce</button>
        </div>
        ` : `<p style="color:var(--muted);font-size:.85rem">Dette er din egen annonce.</p>`}
      </div>
    </div>
    ${b.description ? `
    <div style="margin-top:20px;">
      <h3 style="font-family:'Fraunces',serif;font-size:1rem;margin-bottom:10px;">Beskrivelse</h3>
      <div class="bike-detail-description">${b.description}</div>
    </div>` : ''}
  `;

  // Tilknyt swipe-navigation på mobil
  attachGallerySwipe();
}

function closeBikeModal() {
  document.getElementById('bike-modal').classList.remove('open');
  document.body.style.overflow = '';
}
document.getElementById('bike-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeBikeModal();
});

/* ── Billedgalleri navigation ── */

function galleryGoto(index) {
  const images = window._galleryImages || [];
  if (!images.length) return;
  window._galleryIndex = (index + images.length) % images.length;
  const mainImg = document.getElementById('gallery-main-img');
  if (mainImg) {
    mainImg.style.opacity = '0';
    setTimeout(() => {
      mainImg.src = images[window._galleryIndex];
      mainImg.style.opacity = '1';
    }, 150);
  }
  const counter = document.getElementById('gallery-counter');
  if (counter) counter.textContent = `${window._galleryIndex + 1} / ${images.length}`;
  document.querySelectorAll('.gallery-thumb').forEach((btn, i) => {
    btn.classList.toggle('active', i === window._galleryIndex);
  });
}

function galleryNav(dir) {
  galleryGoto((window._galleryIndex || 0) + dir);
}

function attachGallerySwipe() {
  const mainEl = document.querySelector('.gallery-main');
  if (!mainEl || mainEl._swipeAttached) return;
  mainEl._swipeAttached = true;
  let startX = 0;
  mainEl.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
  }, { passive: true });
  mainEl.addEventListener('touchend', (e) => {
    const diff = startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) galleryNav(diff > 0 ? 1 : -1);
  }, { passive: true });
}

window.galleryNav  = galleryNav;
window.galleryGoto = galleryGoto;

function toggleBidBox() {
  const box = document.getElementById('bid-box');
  const msgBox = document.getElementById('message-box');
  if (msgBox) msgBox.style.display = 'none';
  box.style.display = box.style.display === 'block' ? 'none' : 'block';
  if (box.style.display === 'block') document.getElementById('bid-amount').focus();
}

function toggleMessageBox() {
  const box = document.getElementById('message-box');
  const bidBox = document.getElementById('bid-box');
  if (bidBox) bidBox.style.display = 'none';
  box.style.display = box.style.display === 'block' ? 'none' : 'block';
  if (box.style.display === 'block') document.getElementById('message-text').focus();
}

async function sendMessage(bikeId, receiverId) {
  if (!currentUser) { showToast('⚠️ Log ind for at sende beskeder'); return; }
  const content = document.getElementById('message-text').value.trim();
  if (!content) { showToast('⚠️ Skriv en besked først'); return; }

  const { data: msgData, error } = await supabase.from('messages').insert({
    bike_id:     bikeId,
    sender_id:   currentUser.id,
    receiver_id: receiverId,
    content,
  }).select('id').single();

  if (error) { showToast('❌ Kunne ikke sende besked'); console.error(error); return; }
  document.getElementById('message-text').value = '';
  document.getElementById('message-box').style.display = 'none';
  showToast('✅ Besked sendt!');

  // Send email-notifikation til sælger via Edge Function
  console.log('msgData:', msgData);
  if (msgData?.id) {
    console.log('Kalder notify-message med id:', msgData.id);
    supabase.functions.invoke('notify-message', {
      body: { message_id: msgData.id },
    }).then(({ data: fnData, error: fnErr }) => {
      console.log('notify-message svar:', fnData, fnErr);
      if (fnErr) console.error('Email notifikation fejlede:', fnErr);
    }).catch(err => console.error('Email notifikation fejlede:', err));
  } else {
    console.warn('msgData.id mangler — invoke ikke kaldt');
  }
}

async function sendBid(bikeId, receiverId) {
  if (!currentUser) { showToast('⚠️ Log ind for at give bud'); return; }
  const amount = document.getElementById('bid-amount').value;
  if (!amount) { showToast('⚠️ Indtast et bud'); return; }

  const content = `💰 Bud: ${parseInt(amount).toLocaleString('da-DK')} kr.`;

  const { data: msgData, error } = await supabase.from('messages').insert({
    bike_id:     bikeId,
    sender_id:   currentUser.id,
    receiver_id: receiverId,
    content,
  }).select('id').single();

  if (error) { showToast('❌ Kunne ikke sende bud'); return; }
  document.getElementById('bid-amount').value = '';
  document.getElementById('bid-box').style.display = 'none';
  showToast('✅ Bud sendt til sælgeren!');

  // Send email-notifikation til sælger via Edge Function
  if (msgData?.id) {
    supabase.functions.invoke('notify-message', {
      body: { message_id: msgData.id },
    }).then(({ error: fnErr }) => {
      if (fnErr) console.error('Email notifikation fejlede:', fnErr);
    }).catch(err => console.error('Email notifikation fejlede:', err));
  }
}

async function toggleSaveFromModal(btn, bikeId) {
  if (!currentUser) { showToast('⚠️ Log ind for at gemme'); return; }
  const isSaved = btn.textContent.includes('❤️');
  if (isSaved) {
    await supabase.from('saved_bikes').delete().eq('user_id', currentUser.id).eq('bike_id', bikeId);
    btn.textContent = '🤍 Gem annonce';
  } else {
    await supabase.from('saved_bikes').insert({ user_id: currentUser.id, bike_id: bikeId });
    btn.textContent = '❤️ Gemt';
  }
}


/* ============================================================
   INDBAKKE
   ============================================================ */

let activeThread = null; // { bikeId, otherUserId, otherName }

async function loadInbox() {
  if (!currentUser) return;
  const list = document.getElementById('inbox-list');
  list.innerHTML = '<p style="color:var(--muted)">Henter beskeder...</p>';

  // Hent alle beskeder hvor brugeren er afsender eller modtager
  const { data, error } = await supabase
    .from('messages')
    .select(`
      *,
      bikes(brand, model),
      sender:profiles!messages_sender_id_fkey(id, name, shop_name, seller_type),
      receiver:profiles!messages_receiver_id_fkey(id, name, shop_name, seller_type)
    `)
    .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Inbox fejl:', error);
    list.innerHTML = '<p style="color:var(--rust)">Kunne ikke hente beskeder.</p>';
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML = '<p style="color:var(--muted)">Du har ingen beskeder endnu.</p>';
    return;
  }

  // Grupper beskeder i tråde per (bike_id + anden bruger)
  const threads = {};
  data.forEach(msg => {
    const otherId   = msg.sender_id === currentUser.id ? msg.receiver_id : msg.sender_id;
    const otherProf = msg.sender_id === currentUser.id ? msg.receiver : msg.sender;
    const key       = `${msg.bike_id}_${otherId}`;
    if (!threads[key]) {
      threads[key] = {
        bikeId:      msg.bike_id,
        bike:        msg.bikes,
        otherId,
        otherName:   otherProf?.seller_type === 'dealer' ? otherProf?.shop_name : otherProf?.name,
        messages:    [],
        hasUnread:   false,
      };
    }
    threads[key].messages.push(msg);
    if (!msg.read && msg.receiver_id === currentUser.id) threads[key].hasUnread = true;
  });

  const threadList = Object.values(threads);
  const unreadCount = threadList.filter(t => t.hasUnread).length;

  // Opdater badge
  const badge = document.getElementById('inbox-badge');
  if (unreadCount > 0) {
    badge.textContent = unreadCount;
    badge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
  }

  list.innerHTML = threadList.map(t => {
    const lastMsg   = t.messages[0];
    const initials  = (t.otherName || 'U').substring(0, 2).toUpperCase();
    const preview   = lastMsg.content.length > 50 ? lastMsg.content.substring(0, 50) + '...' : lastMsg.content;
    const time      = new Date(lastMsg.created_at).toLocaleDateString('da-DK', { day:'numeric', month:'short' });
    const bikeName  = t.bike ? `${t.bike.brand} ${t.bike.model}` : 'Ukendt cykel';

    return `
      <div class="inbox-row ${t.hasUnread ? 'unread' : ''}"
           onclick="openThread('${t.bikeId}', '${t.otherId}', '${(t.otherName||'Ukendt').replace(/'/g,'')}')">
        <div class="inbox-avatar">${initials}</div>
        <div class="inbox-content">
          <div class="inbox-from">${t.otherName || 'Ukendt'}</div>
          <div class="inbox-bike">Re: ${bikeName}</div>
          <div class="inbox-preview">${preview}</div>
        </div>
        <div class="inbox-time">${time}</div>
      </div>`;
  }).join('');
}

async function openThread(bikeId, otherId, otherName) {
  activeThread = { bikeId, otherId, otherName };

  document.getElementById('inbox-list').style.display     = 'none';
  document.getElementById('message-thread').style.display = 'block';

  // Sæt tråd-header
  document.getElementById('thread-header').innerHTML =
    `<strong>${otherName}</strong> — <span style="color:var(--muted)">besked om annonce</span>`;

  // Hent alle beskeder i denne tråd
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('bike_id', bikeId)
    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${currentUser.id})`)
    .order('created_at', { ascending: true });

  const threadEl = document.getElementById('thread-messages');
  if (error || !data) {
    threadEl.innerHTML = '<p style="color:var(--rust)">Kunne ikke hente beskeder.</p>';
    return;
  }

  threadEl.innerHTML = data.map(msg => {
    const isSent = msg.sender_id === currentUser.id;
    const time   = new Date(msg.created_at).toLocaleString('da-DK', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
    return `
      <div class="message-bubble ${isSent ? 'sent' : 'received'}">
        ${msg.content}
        <div class="msg-time">${time}</div>
      </div>`;
  }).join('');

  // Scroll til bunden
  threadEl.scrollTop = threadEl.scrollHeight;

  // Marker ulæste som læst
  await supabase.from('messages')
    .update({ read: true })
    .eq('bike_id', bikeId)
    .eq('sender_id', otherId)
    .eq('receiver_id', currentUser.id);
}

function closeThread() {
  activeThread = null;
  document.getElementById('inbox-list').style.display     = 'flex';
  document.getElementById('inbox-list').style.flexDirection = 'column';
  document.getElementById('message-thread').style.display = 'none';
  document.getElementById('reply-text').value = '';
  loadInbox();
}

async function sendReply() {
  if (!activeThread || !currentUser) return;
  const content = document.getElementById('reply-text').value.trim();
  if (!content) { showToast('⚠️ Skriv et svar først'); return; }

  const { error } = await supabase.from('messages').insert({
    bike_id:     activeThread.bikeId,
    sender_id:   currentUser.id,
    receiver_id: activeThread.otherId,
    content,
  });

  if (error) { showToast('❌ Kunne ikke sende svar'); return; }
  document.getElementById('reply-text').value = '';
  showToast('✅ Svar sendt!');
  openThread(activeThread.bikeId, activeThread.otherId, activeThread.otherName);
}


/* ============================================================
   SIDEBAR FILTRE
   ============================================================ */

function applyFilters() {
  // Sælgertype — hvis "alle" er checket, ignorer de andre
  const sellerAll     = document.querySelector('[data-filter="seller"][data-value="all"]');
  const sellerDealer  = document.querySelector('[data-filter="seller"][data-value="dealer"]');
  const sellerPrivate = document.querySelector('[data-filter="seller"][data-value="private"]');

  // Hvis "Alle sælgere" klikkes på, fjern de andre
  if (sellerAll?.checked) {
    if (sellerDealer)  sellerDealer.checked  = false;
    if (sellerPrivate) sellerPrivate.checked = false;
  }
  // Hvis en specifik sælger vælges, fjern "alle"
  if ((sellerDealer?.checked || sellerPrivate?.checked) && sellerAll?.checked) {
    sellerAll.checked = false;
  }

  // Saml valgte typer
  const types = [...document.querySelectorAll('[data-filter="type"]:checked')]
    .map(el => el.dataset.value);

  // Saml valgte stande
  const conditions = [...document.querySelectorAll('[data-filter="condition"]:checked')]
    .map(el => el.dataset.value);

  // Pris
  const minPrice = parseInt(document.querySelector('.price-range input:first-of-type')?.value) || null;
  const maxPrice = parseInt(document.querySelector('.price-range input:last-of-type')?.value) || null;

  // Sælgertype
  let sellerType = null;
  if (sellerDealer?.checked && !sellerPrivate?.checked) sellerType = 'dealer';
  if (sellerPrivate?.checked && !sellerDealer?.checked) sellerType = 'private';

  loadBikesWithFilters({ types, conditions, minPrice, maxPrice, sellerType });
}

async function loadBikesWithFilters({ types, conditions, minPrice, maxPrice, sellerType }) {
  const grid = document.getElementById('listings-grid');
  grid.innerHTML = '<p style="color:var(--muted);padding:20px">Henter annoncer...</p>';

  let query = supabase
    .from('bikes')
    .select('*, profiles(name, seller_type, shop_name), bike_images(url, is_primary)')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (types.length > 0)      query = query.in('type', types);
  if (conditions.length > 0) query = query.in('condition', conditions);
  if (minPrice)              query = query.gte('price', minPrice);
  if (maxPrice)              query = query.lte('price', maxPrice);

  const { data, error } = await query;
  if (error) {
    console.error('Filter fejl:', error);
    grid.innerHTML = '<p style="color:var(--rust);padding:20px">Kunne ikke hente annoncer.</p>';
    return;
  }

  // Filtrer sælgertype lokalt (da det er en join-kolonne)
  let filtered = data;
  if (sellerType) {
    filtered = data.filter(b => b.profiles?.seller_type === sellerType);
  }

  renderBikes(filtered);
}


/* ============================================================
   MOBIL FILTER DRAWER
   ============================================================ */

function openMobileFilter() {
  document.getElementById('mobile-filter-drawer').classList.add('open');
  document.getElementById('mobile-filter-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeMobileFilter() {
  document.getElementById('mobile-filter-drawer').classList.remove('open');
  document.getElementById('mobile-filter-overlay').classList.remove('open');
  document.body.style.overflow = '';
}


/* ============================================================
   NULSTIL ADGANGSKODE – håndter token fra email-link
   ============================================================ */

async function handleResetPassword() {
  const pw1 = document.getElementById('reset-pw1').value;
  const pw2 = document.getElementById('reset-pw2').value;

  if (!pw1 || pw1.length < 6) { showToast('⚠️ Adgangskode skal være mindst 6 tegn'); return; }
  if (pw1 !== pw2)             { showToast('⚠️ Adgangskoderne matcher ikke'); return; }

  const { error } = await supabase.auth.updateUser({ password: pw1 });
  if (error) { showToast('❌ Kunne ikke opdatere adgangskode'); console.error(error); return; }

  document.getElementById('reset-modal').classList.remove('open');
  document.body.style.overflow = '';
  history.replaceState(null, '', window.location.pathname);
  showToast('✅ Adgangskode opdateret! Du er nu logget ind.');
}

function closeResetModal() {
  document.getElementById('reset-modal').classList.remove('open');
  document.body.style.overflow = '';
  history.replaceState(null, '', window.location.pathname);
}

// Lyt efter PASSWORD_RECOVERY event fra Supabase
supabase.auth.onAuthStateChange((_event, session) => {
  if (_event === 'PASSWORD_RECOVERY') {
    document.getElementById('reset-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
});


/* ============================================================
   REDIGER ANNONCE
   ============================================================ */

async function openEditModal(id) {
  const { data: b, error } = await supabase
    .from('bikes').select('*').eq('id', id).single();
  if (error || !b) { showToast('❌ Kunne ikke hente annonce'); return; }

  // Udfyld felterne
  document.getElementById('edit-bike-id').value       = b.id;
  document.getElementById('edit-brand').value         = b.brand || '';
  document.getElementById('edit-model').value         = b.model || '';
  document.getElementById('edit-price').value         = b.price || '';
  document.getElementById('edit-year').value          = b.year || '';
  document.getElementById('edit-city').value          = b.city || '';
  document.getElementById('edit-description').value   = b.description || '';
  document.getElementById('edit-type').value          = b.type || '';
  document.getElementById('edit-size').value          = b.size || '';
  document.getElementById('edit-condition').value     = b.condition || '';
  document.getElementById('edit-is-active').checked   = b.is_active;

  document.getElementById('edit-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('open');
  document.body.style.overflow = '';
}

async function saveEditedListing() {
  const id = document.getElementById('edit-bike-id').value;

  const updates = {
    brand:       document.getElementById('edit-brand').value,
    model:       document.getElementById('edit-model').value,
    title:       document.getElementById('edit-brand').value + ' ' + document.getElementById('edit-model').value,
    price:       parseInt(document.getElementById('edit-price').value),
    year:        parseInt(document.getElementById('edit-year').value) || null,
    city:        document.getElementById('edit-city').value,
    description: document.getElementById('edit-description').value,
    type:        document.getElementById('edit-type').value,
    size:        document.getElementById('edit-size').value,
    condition:   document.getElementById('edit-condition').value,
    is_active:   document.getElementById('edit-is-active').checked,
  };

  if (!updates.brand || !updates.model || !updates.price || !updates.city) {
    showToast('⚠️ Udfyld alle påkrævede felter'); return;
  }

  const { error } = await supabase.from('bikes').update(updates).eq('id', id);
  if (error) { showToast('❌ Kunne ikke gemme ændringer'); console.error(error); return; }

  closeEditModal();
  showToast('✅ Annonce opdateret!');
  loadMyListings();
  loadBikes();
  updateFilterCounts();
}


/* ============================================================
   BILLEDE UPLOAD
   ============================================================ */

let selectedFiles = []; // { file, url, isPrimary }

function previewImages(input) {
  const files = Array.from(input.files);
  if (!files.length) return;

  // Maks 8 billeder i alt
  const remaining = 8 - selectedFiles.length;
  const toAdd = files.slice(0, remaining);

  toAdd.forEach((file, i) => {
    const url = URL.createObjectURL(file);
    selectedFiles.push({
      file,
      url,
      isPrimary: selectedFiles.length === 0 && i === 0, // Første billede er primær
    });
  });

  renderImagePreviews();
  document.getElementById('upload-label').textContent =
    `${selectedFiles.length} billede${selectedFiles.length !== 1 ? 'r' : ''} valgt`;
}

function renderImagePreviews() {
  const grid = document.getElementById('img-preview-grid');
  if (!grid) return;

  grid.innerHTML = selectedFiles.map((item, i) => `
    <div class="img-preview-item ${item.isPrimary ? 'primary' : ''}">
      <img src="${item.url}" alt="Billede ${i+1}">
      ${item.isPrimary ? '<span class="primary-badge">Primær</span>' : ''}
      ${!item.isPrimary ? `<button class="set-primary" onclick="setPrimary(${i})">★</button>` : ''}
      <button class="remove-img" onclick="removeImage(${i})">✕</button>
    </div>
  `).join('');
}

function setPrimary(index) {
  selectedFiles = selectedFiles.map((item, i) => ({ ...item, isPrimary: i === index }));
  renderImagePreviews();
}

function removeImage(index) {
  URL.revokeObjectURL(selectedFiles[index].url);
  selectedFiles.splice(index, 1);
  // Sæt første som primær hvis den primære blev fjernet
  if (selectedFiles.length > 0 && !selectedFiles.some(f => f.isPrimary)) {
    selectedFiles[0].isPrimary = true;
  }
  renderImagePreviews();
  const label = document.getElementById('upload-label');
  if (label) label.textContent = selectedFiles.length > 0
    ? `${selectedFiles.length} billede${selectedFiles.length !== 1 ? 'r' : ''} valgt`
    : 'Klik for at vælge billeder';
}

async function uploadImages(bikeId) {
  if (selectedFiles.length === 0) return;

  for (const item of selectedFiles) {
    const ext      = item.file.name.split('.').pop();
    const filename = `${bikeId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { data, error } = await supabase.storage
      .from('bike-images')
      .upload(filename, item.file, { contentType: item.file.type, upsert: false });

    if (error) { console.error('Upload fejl:', error); continue; }

    const { data: { publicUrl } } = supabase.storage
      .from('bike-images')
      .getPublicUrl(filename);

    await supabase.from('bike_images').insert({
      bike_id:    bikeId,
      url:        publicUrl,
      is_primary: item.isPrimary,
    });
  }

  // Ryd valgte filer
  selectedFiles.forEach(f => URL.revokeObjectURL(f.url));
  selectedFiles = [];
}

function resetImageUpload() {
  selectedFiles = [];
  const grid  = document.getElementById('img-preview-grid');
  const label = document.getElementById('upload-label');
  const input = document.getElementById('img-file-input');
  if (grid)  grid.innerHTML = '';
  if (label) label.textContent = 'Klik for at vælge billeder';
  if (input) input.value = '';
}



/* ============================================================
   REAL-TIME NOTIFIKATIONER
   ============================================================ */

function startRealtimeNotifications() {
  if (!currentUser) return;

  // Tjek badge med det samme ved opstart
  updateInboxBadge();

  const channel = supabase
    .channel('new-messages-' + currentUser.id)
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'messages',
    }, function(payload) {
      const msg = payload.new;
      // Kun hvis vi er modtageren
      if (msg.receiver_id !== currentUser.id) return;

      const isBid = msg.content && msg.content.indexOf('💰') === 0;
      showToast(isBid ? '💰 Nyt bud modtaget!' : '✉️ Ny besked modtaget!');
      updateInboxBadge();

      const btn = document.getElementById('nav-inbox-btn');
      if (btn) {
        btn.classList.add('inbox-pulse');
        setTimeout(function() { btn.classList.remove('inbox-pulse'); }, 2000);
      }
    });

  channel.subscribe(function(status) {
    console.log('Realtime status:', status);
  });
}


/* ============================================================
   BLIV FORHANDLER MODAL
   ============================================================ */

function openBecomeDealerModal() {
  document.getElementById('dealer-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeBecomeDealerModal() {
  document.getElementById('dealer-modal').classList.remove('open');
  document.body.style.overflow = '';
}

async function submitDealerApplication() {
  const shopName = document.getElementById('dealer-shop-name').value.trim();
  const cvr      = document.getElementById('dealer-cvr').value.trim();
  const contact  = document.getElementById('dealer-contact').value.trim();
  const email    = document.getElementById('dealer-email').value.trim();
  const phone    = document.getElementById('dealer-phone').value.trim();
  const city     = document.getElementById('dealer-city').value.trim();

  if (!shopName || !cvr || !contact || !email) {
    showToast('⚠️ Udfyld alle påkrævede felter (*)'); return;
  }

  // Gem ansøgning som besked til admin eller gem i profiles hvis logget ind
  if (currentUser) {
    const { error } = await supabase.from('profiles').update({
      shop_name:   shopName,
      cvr:         cvr,
      phone:       phone,
      city:        city,
      seller_type: 'dealer',
    }).eq('id', currentUser.id);

    if (error) { showToast('❌ Noget gik galt – prøv igen'); return; }
  }

  closeBecomeDealerModal();
  showToast('✅ Ansøgning modtaget! Vi kontakter dig inden for 2 hverdage.');

  // Ryd felter
  ['dealer-shop-name','dealer-cvr','dealer-contact','dealer-email','dealer-phone','dealer-city']
    .forEach(function(id) { document.getElementById(id).value = ''; });
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
window.handleForgotPassword = handleForgotPassword;
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
window.applyFilters       = applyFilters;
window.openMobileFilter   = openMobileFilter;
window.closeMobileFilter  = closeMobileFilter;
window.closeResetModal    = closeResetModal;
window.handleResetPassword = handleResetPassword;
window.openEditModal      = openEditModal;
window.closeEditModal     = closeEditModal;
window.saveEditedListing  = saveEditedListing;
window.previewImages      = previewImages;
window.setPrimary         = setPrimary;
window.removeImage        = removeImage;
window.openBikeModal      = openBikeModal;
window.closeBikeModal     = closeBikeModal;
window.toggleBidBox       = toggleBidBox;
window.toggleMessageBox   = toggleMessageBox;
window.sendMessage        = sendMessage;
window.sendBid            = sendBid;
window.toggleSaveFromModal= toggleSaveFromModal;
window.loadInbox          = loadInbox;
window.openThread         = openThread;
window.closeThread        = closeThread;
window.sendReply          = sendReply;
window.openInboxModal     = openInboxModal;
window.closeInboxModal    = closeInboxModal;
window.openInboxThread    = openInboxThread;
window.closeInboxThread   = closeInboxThread;
window.sendInboxReply     = sendInboxReply;

/* ============================================================
   START
   ============================================================ */

init();

/* ============================================================
   INDBAKKE MODAL (nav-knap)
   ============================================================ */

let activeInboxThread = null;

async function openInboxModal() {
  document.getElementById('inbox-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('inbox-modal-list').style.display = 'flex';
  document.getElementById('inbox-modal-thread').style.display = 'none';
  await loadInboxModal();
}

function closeInboxModal() {
  document.getElementById('inbox-modal').classList.remove('open');
  document.body.style.overflow = '';
}

async function loadInboxModal() {
  if (!currentUser) return;
  const list = document.getElementById('inbox-modal-list');
  list.innerHTML = '<p style="color:var(--muted)">Henter beskeder...</p>';

  const { data, error } = await supabase
    .from('messages')
    .select('*, bikes(brand, model), sender:profiles!messages_sender_id_fkey(id, name, shop_name, seller_type), receiver:profiles!messages_receiver_id_fkey(id, name, shop_name, seller_type)')
    .or('sender_id.eq.' + currentUser.id + ',receiver_id.eq.' + currentUser.id)
    .order('created_at', { ascending: false });

  if (error || !data || data.length === 0) {
    list.innerHTML = '<p style="color:var(--muted)">Du har ingen beskeder endnu.</p>';
    return;
  }

  const threads = {};
  data.forEach(function(msg) {
    const otherId   = msg.sender_id === currentUser.id ? msg.receiver_id : msg.sender_id;
    const otherProf = msg.sender_id === currentUser.id ? msg.receiver : msg.sender;
    const key       = msg.bike_id + '_' + otherId;
    if (!threads[key]) {
      threads[key] = {
        bikeId:    msg.bike_id,
        bike:      msg.bikes,
        otherId:   otherId,
        otherName: otherProf && otherProf.seller_type === 'dealer' ? otherProf.shop_name : (otherProf ? otherProf.name : 'Ukendt'),
        messages:  [],
        hasUnread: false,
      };
    }
    threads[key].messages.push(msg);
    if (!msg.read && msg.receiver_id === currentUser.id) threads[key].hasUnread = true;
  });

  const threadList = Object.values(threads);

  list.innerHTML = threadList.map(function(t) {
    const lastMsg  = t.messages[0];
    const initials = (t.otherName || 'U').substring(0, 2).toUpperCase();
    const preview  = lastMsg.content.length > 55 ? lastMsg.content.substring(0, 55) + '...' : lastMsg.content;
    const time     = new Date(lastMsg.created_at).toLocaleDateString('da-DK', { day:'numeric', month:'short' });
    const bikeName = t.bike ? t.bike.brand + ' ' + t.bike.model : 'Ukendt cykel';
    const isBid    = lastMsg.content.indexOf('💰') === 0;
    const safeName = (t.otherName || 'Ukendt').replace(/'/g, '');

    return '<div class="inbox-row ' + (t.hasUnread ? 'unread' : '') + '" onclick="openInboxThread(\'' + t.bikeId + '\', \'' + t.otherId + '\', \'' + safeName + '\')">'
      + '<div class="inbox-avatar">' + initials + '</div>'
      + '<div class="inbox-content">'
      + '<div class="inbox-from">' + (t.otherName || 'Ukendt')
      + (isBid ? ' <span style="background:#FBF0E8;color:#8A4A20;font-size:.7rem;padding:2px 7px;border-radius:4px;margin-left:6px;">💰 Bud</span>' : '')
      + (t.hasUnread ? ' <span style="background:var(--rust);color:#fff;font-size:.65rem;padding:2px 6px;border-radius:100px;margin-left:6px;">Ny</span>' : '')
      + '</div>'
      + '<div class="inbox-bike">Re: ' + bikeName + '</div>'
      + '<div class="inbox-preview">' + preview + '</div>'
      + '</div>'
      + '<div class="inbox-time">' + time + '</div>'
      + '</div>';
  }).join('');
}

async function openInboxThread(bikeId, otherId, otherName) {
  activeInboxThread = { bikeId: bikeId, otherId: otherId, otherName: otherName };

  document.getElementById('inbox-modal-list').style.display   = 'none';
  document.getElementById('inbox-modal-thread').style.display = 'block';
  document.getElementById('inbox-modal-thread-header').innerHTML =
    '<strong>' + otherName + '</strong> — <span style="color:var(--muted)">besked om annonce</span>';

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('bike_id', bikeId)
    .or('and(sender_id.eq.' + currentUser.id + ',receiver_id.eq.' + otherId + '),and(sender_id.eq.' + otherId + ',receiver_id.eq.' + currentUser.id + ')')
    .order('created_at', { ascending: true });

  const threadEl = document.getElementById('inbox-modal-thread-messages');
  if (error || !data) { threadEl.innerHTML = '<p style="color:var(--rust)">Kunne ikke hente beskeder.</p>'; return; }

  threadEl.innerHTML = data.map(function(msg) {
    const isSent = msg.sender_id === currentUser.id;
    const time   = new Date(msg.created_at).toLocaleString('da-DK', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
    const isBid  = msg.content.indexOf('💰') === 0;
    return '<div class="message-bubble ' + (isSent ? 'sent' : 'received') + '" ' + (isBid ? 'style="border:2px solid var(--rust-light)"' : '') + '>'
      + msg.content
      + '<div class="msg-time">' + time + '</div>'
      + '</div>';
  }).join('');

  threadEl.scrollTop = threadEl.scrollHeight;

  await supabase.from('messages')
    .update({ read: true })
    .eq('bike_id', bikeId)
    .eq('sender_id', otherId)
    .eq('receiver_id', currentUser.id);

  updateInboxBadge();
}

function closeInboxThread() {
  activeInboxThread = null;
  document.getElementById('inbox-modal-list').style.display   = 'flex';
  document.getElementById('inbox-modal-thread').style.display = 'none';
  document.getElementById('inbox-modal-reply-text').value = '';
  loadInboxModal();
}

async function sendInboxReply() {
  if (!activeInboxThread || !currentUser) return;
  const content = document.getElementById('inbox-modal-reply-text').value.trim();
  if (!content) { showToast('⚠️ Skriv et svar først'); return; }

  const { error } = await supabase.from('messages').insert({
    bike_id:     activeInboxThread.bikeId,
    sender_id:   currentUser.id,
    receiver_id: activeInboxThread.otherId,
    content:     content,
  });

  if (error) { showToast('❌ Kunne ikke sende svar'); return; }
  document.getElementById('inbox-modal-reply-text').value = '';
  openInboxThread(activeInboxThread.bikeId, activeInboxThread.otherId, activeInboxThread.otherName);
}

async function updateInboxBadge() {
  if (!currentUser) return;
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('receiver_id', currentUser.id)
    .eq('read', false);

  const badge = document.getElementById('nav-inbox-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

window.openInboxModal   = openInboxModal;
window.startRealtimeNotifications = startRealtimeNotifications;
window.updateInboxBadge        = updateInboxBadge;
window.openBecomeDealerModal   = openBecomeDealerModal;
window.openFooterModal         = openFooterModal;
window.closeFooterModal        = closeFooterModal;
window.submitContactForm       = submitContactForm;
window.closeBecomeDealerModal  = closeBecomeDealerModal;
window.submitDealerApplication = submitDealerApplication;
window.closeInboxModal  = closeInboxModal;
window.openInboxThread  = openInboxThread;
window.closeInboxThread = closeInboxThread;
window.sendInboxReply   = sendInboxReply;

/* ============================================================
   FOOTER MODALER
   ============================================================ */

var footerContent = {
  terms: {
    title: 'Vilkår og betingelser',
    body: `
      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">1. Generelt</h3>
      <p style="margin-bottom:16px;">Disse vilkår gælder for alle brugere af Cykelbørsen. Ved at benytte platformen accepterer du nedenstående betingelser. Cykelbørsen er en formidlingsplatform mellem køber og sælger — vi er ikke part i selve handlen.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">2. Oprettelse af annonce</h3>
      <p style="margin-bottom:16px;">Det er gratis at oprette annoncer på Cykelbørsen. Du er selv ansvarlig for at dine annoncer er korrekte og ikke krænker andres rettigheder. Vildledende eller falske annoncer vil blive slettet uden varsel.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">3. Handel og betaling</h3>
      <p style="margin-bottom:16px;">Cykelbørsen formidler kontakt mellem køber og sælger men er ikke ansvarlig for gennemførelsen af handlen, betaling eller levering. Vi anbefaler altid at mødes på et offentligt sted og inspicere cyklen inden køb.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">4. Misbrug og rapportering</h3>
      <p style="margin-bottom:16px;">Svindel, spam eller chikane tolereres ikke. Mistænkelige annoncer kan rapporteres via kontaktformularen. Vi forbeholder os ret til at slette konti der misbruger platformen.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">5. Ansvarsbegrænsning</h3>
      <p>Cykelbørsen er ikke ansvarlig for tab opstået i forbindelse med handler formidlet via platformen. Vi garanterer ikke for ægtheden af annoncer eller brugeres identitet.</p>
    `
  },
  privacy: {
    title: 'Privatlivspolitik',
    body: `
      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">Hvilke data indsamler vi?</h3>
      <p style="margin-bottom:16px;">Når du opretter en konto indsamler vi dit navn, e-mail og eventuelle profiloplysninger du selv vælger at tilføje. Annoncedata som beskrivelser, billeder og priser gemmes i vores database.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">Hvordan bruger vi dine data?</h3>
      <p style="margin-bottom:16px;">Dine data bruges udelukkende til at drive platformen — herunder at vise dine annoncer, sende beskeder og forbedre brugeroplevelsen. Vi sælger aldrig dine data til tredjepart.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">Cookies</h3>
      <p style="margin-bottom:16px;">Vi bruger tekniske cookies der er nødvendige for at siden fungerer korrekt, herunder at holde dig logget ind. Vi bruger ikke tracking-cookies til reklameformål.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">Dine rettigheder</h3>
      <p style="margin-bottom:16px;">Du har ret til indsigt i, rettelse af og sletning af dine persondata. Kontakt os på kontakt@cykelborsen.dk for at udøve dine rettigheder.</p>

      <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">Kontakt</h3>
      <p>Spørgsmål om privatlivspolitikken kan rettes til: <strong>kontakt@cykelborsen.dk</strong></p>
    `
  },
  contact: {
    title: 'Kontakt os',
    body: `
      <p style="margin-bottom:22px;color:#8A8578;">Har du spørgsmål, oplever du problemer eller vil du rapportere en annonce? Vi svarer inden for 1-2 hverdage.</p>

      <div style="display:flex;flex-direction:column;gap:16px;margin-bottom:24px;">
        <div style="display:flex;align-items:center;gap:12px;padding:14px;background:var(--sand);border-radius:10px;border:1px solid var(--border);">
          <span style="font-size:1.4rem;">📧</span>
          <div>
            <div style="font-weight:600;font-size:0.88rem;">E-mail</div>
            <div style="color:var(--muted);font-size:0.85rem;">kontakt@cykelborsen.dk</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:14px;background:var(--sand);border-radius:10px;border:1px solid var(--border);">
          <span style="font-size:1.4rem;">⏱️</span>
          <div>
            <div style="font-weight:600;font-size:0.88rem;">Svartid</div>
            <div style="color:var(--muted);font-size:0.85rem;">Hverdage kl. 9–17</div>
          </div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;flex-direction:column;gap:6px;">
          <label style="font-size:0.82rem;font-weight:600;">Dit navn</label>
          <input type="text" id="contact-name" placeholder="Dit fulde navn" style="padding:11px 14px;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:0.9rem;background:var(--cream);outline:none;">
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <label style="font-size:0.82rem;font-weight:600;">E-mail</label>
          <input type="email" id="contact-email" placeholder="din@email.dk" style="padding:11px 14px;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:0.9rem;background:var(--cream);outline:none;">
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <label style="font-size:0.82rem;font-weight:600;">Besked</label>
          <textarea id="contact-message" placeholder="Beskriv dit spørgsmål eller problem..." style="padding:11px 14px;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:0.9rem;background:var(--cream);outline:none;resize:vertical;min-height:100px;"></textarea>
        </div>
        <button onclick="submitContactForm()" style="background:var(--rust);color:#fff;border:none;padding:14px;border-radius:8px;font-size:0.92rem;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;margin-top:4px;">Send besked</button>
      </div>
    `
  }
};

function openFooterModal(type) {
  var data = footerContent[type];
  if (!data) return;
  document.getElementById('footer-modal-title').textContent = data.title;
  document.getElementById('footer-modal-body').innerHTML = data.body;
  document.getElementById('footer-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeFooterModal() {
  document.getElementById('footer-modal').classList.remove('open');
  document.body.style.overflow = '';
}

function submitContactForm() {
  var name    = document.getElementById('contact-name').value.trim();
  var email   = document.getElementById('contact-email').value.trim();
  var message = document.getElementById('contact-message').value.trim();
  if (!name || !email || !message) { showToast('⚠️ Udfyld alle felter'); return; }
  closeFooterModal();
  showToast('✅ Tak! Vi vender tilbage inden for 1-2 hverdage.');
}


/* ============================================================
   ADMIN PANEL
   ============================================================ */

async function openAdminPanel() {
  document.getElementById('admin-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  switchAdminTab('applications');
}

function closeAdminPanel() {
  document.getElementById('admin-modal').classList.remove('open');
  document.body.style.overflow = '';
}

function switchAdminTab(tab) {
  document.getElementById('admin-applications').style.display = tab === 'applications' ? 'block' : 'none';
  document.getElementById('admin-users').style.display        = tab === 'users'        ? 'block' : 'none';
  document.getElementById('admin-id').style.display           = tab === 'id'           ? 'block' : 'none';
  document.getElementById('atab-applications').classList.toggle('active', tab === 'applications');
  document.getElementById('atab-users').classList.toggle('active', tab === 'users');
  document.getElementById('atab-id').classList.toggle('active', tab === 'id');
  if (tab === 'applications') loadDealerApplications();
  if (tab === 'users')        loadAllUsers();
  if (tab === 'id')           loadIdApplications();
}

async function loadDealerApplications() {
  var list = document.getElementById('admin-applications-list');
  list.innerHTML = '<p style="color:var(--muted)">Henter ansøgninger...</p>';

  var result = await supabase
    .from('profiles')
    .select('*')
    .eq('seller_type', 'dealer')
    .eq('verified', false)
    .order('created_at', { ascending: false });

  if (!result.data || result.data.length === 0) {
    list.innerHTML = '<p style="color:var(--muted)">Ingen ventende ansøgninger.</p>';
    return;
  }

  list.innerHTML = result.data.map(function(p) {
    return '<div class="admin-row">'
      + '<div class="admin-row-info">'
      + '<div class="admin-row-name">' + (p.shop_name || p.name) + '</div>'
      + '<div class="admin-row-meta">'
      + (p.name ? p.name + ' · ' : '')
      + (p.email || '') + (p.cvr ? ' · CVR: ' + p.cvr : '')
      + (p.city ? ' · ' + p.city : '') + '</div>'
      + '</div>'
      + '<div class="admin-row-actions">'
      + '<button class="btn-approve" onclick="approveDealer(\'' + p.id + '\')">✓ Godkend</button>'
      + '<button class="btn-reject" onclick="rejectDealer(\'' + p.id + '\')">✕ Afvis</button>'
      + '</div></div>';
  }).join('');
}

async function loadAllUsers() {
  var list = document.getElementById('admin-users-list');
  list.innerHTML = '<p style="color:var(--muted)">Henter brugere...</p>';

  var result = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (!result.data || result.data.length === 0) {
    list.innerHTML = '<p style="color:var(--muted)">Ingen brugere fundet.</p>';
    return;
  }

  list.innerHTML = result.data.map(function(p) {
    var isVerified = p.verified;
    var isDealer   = p.seller_type === 'dealer';
    return '<div class="admin-row">'
      + '<div class="admin-row-info">'
      + '<div class="admin-row-name">'
      + (p.name || 'Ukendt')
      + (isVerified ? ' <span class="verified-badge">✓</span>' : '')
      + '</div>'
      + '<div class="admin-row-meta">' + (p.email || '') + ' · ' + (isDealer ? '🏪 Forhandler' : '👤 Privat') + '</div>'
      + '</div>'
      + '<div class="admin-row-actions">'
      + (isDealer && !isVerified ? '<button class="btn-approve" onclick="approveDealer(\'' + p.id + '\')">✓ Verificer</button>' : '')
      + (isVerified ? '<button class="btn-reject" onclick="revokeDealer(\'' + p.id + '\')">Fjern verificering</button>' : '')
      + '</div></div>';
  }).join('');
}

async function approveDealer(userId) {
  var err = (await supabase.from('profiles').update({ verified: true }).eq('id', userId)).error;
  if (err) { showToast('❌ Kunne ikke godkende forhandler'); return; }
  showToast('✅ Forhandler godkendt og verificeret!');
  loadDealerApplications();
  loadAllUsers();
}

async function rejectDealer(userId) {
  if (!confirm('Afvis denne ansøgning og fjern forhandlerstatus?')) return;
  var err = (await supabase.from('profiles').update({ seller_type: 'private', verified: false }).eq('id', userId)).error;
  if (err) { showToast('❌ Kunne ikke afvise'); return; }
  showToast('🗑️ Ansøgning afvist');
  loadDealerApplications();
}

async function revokeDealer(userId) {
  if (!confirm('Fjern verificering fra denne forhandler?')) return;
  var err = (await supabase.from('profiles').update({ verified: false }).eq('id', userId)).error;
  if (err) { showToast('❌ Fejl'); return; }
  showToast('Verificering fjernet');
  loadAllUsers();
}

window.openAdminPanel       = openAdminPanel;
window.closeAdminPanel      = closeAdminPanel;
window.switchAdminTab       = switchAdminTab;
window.approveDealer        = approveDealer;
window.rejectDealer         = rejectDealer;
window.revokeDealer         = revokeDealer;

/* ============================================================
   AUTOCOMPLETE SØGNING
   ============================================================ */

var autocompleteTimeout = null;
var autocompleteIndex   = -1;

async function searchAutocomplete(query) {
  clearTimeout(autocompleteTimeout);
  var list = document.getElementById('autocomplete-list');

  if (!query || query.length < 2) { list.style.display = 'none'; return; }

  autocompleteTimeout = setTimeout(async function() {
    var result = await supabase
      .from('bikes')
      .select('brand, model, type, price')
      .eq('is_active', true)
      .or('brand.ilike.%' + query + '%,model.ilike.%' + query + '%,title.ilike.%' + query + '%')
      .limit(8);

    if (!result.data || result.data.length === 0) { list.style.display = 'none'; return; }

    // Deduplikér brand+model kombinationer
    var seen = {};
    var items = result.data.filter(function(b) {
      var key = b.brand + ' ' + b.model;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });

    autocompleteIndex = -1;
    list.innerHTML = items.map(function(b, i) {
      var display = b.brand + ' ' + b.model;
      var highlighted = display.replace(new RegExp('(' + query + ')', 'gi'), '<strong>$1</strong>');
      return '<div class="autocomplete-item" data-index="' + i + '" onclick="selectAutocomplete(\'' + (b.brand + ' ' + b.model).replace(/'/g, '') + '\')">'
        + '🚲 ' + highlighted
        + '<span class="autocomplete-meta">' + b.type + ' · ' + b.price.toLocaleString('da-DK') + ' kr.</span>'
        + '</div>';
    }).join('');

    list.style.display = 'block';
  }, 200);
}

function selectAutocomplete(value) {
  document.getElementById('search-input').value = value;
  document.getElementById('autocomplete-list').style.display = 'none';
  searchBikes();
}

function handleSearchKey(e) {
  var list  = document.getElementById('autocomplete-list');
  var items = list.querySelectorAll('.autocomplete-item');
  if (!items.length) return;

  if (e.key === 'ArrowDown') {
    autocompleteIndex = Math.min(autocompleteIndex + 1, items.length - 1);
  } else if (e.key === 'ArrowUp') {
    autocompleteIndex = Math.max(autocompleteIndex - 1, -1);
  } else if (e.key === 'Enter') {
    if (autocompleteIndex >= 0) {
      items[autocompleteIndex].click();
    } else {
      list.style.display = 'none';
      searchBikes();
    }
    return;
  } else if (e.key === 'Escape') {
    list.style.display = 'none'; return;
  }

  items.forEach(function(el, i) {
    el.classList.toggle('active', i === autocompleteIndex);
  });
}

// Luk autocomplete ved klik udenfor
document.addEventListener('click', function(e) {
  if (!e.target.closest('#search-input') && !e.target.closest('#autocomplete-list')) {
    var list = document.getElementById('autocomplete-list');
    if (list) list.style.display = 'none';
  }
});

/* ============================================================
   SÆT SOM SOLGT
   ============================================================ */

async function toggleSold(bikeId, currentlySold) {
  var newStatus = !currentlySold;
  var err = (await supabase.from('bikes').update({ is_active: !newStatus }).eq('id', bikeId)).error;
  if (err) { showToast('❌ Kunne ikke opdatere status'); return; }
  showToast(newStatus ? '🏷️ Annonce markeret som solgt' : '✅ Annonce aktiv igen');
  loadMyListings();
  loadBikes();
  updateFilterCounts();
}

/* ============================================================
   DEL ANNONCE
   ============================================================ */

var currentShareBikeId = null;

function openShareModal(bikeId, title) {
  currentShareBikeId = bikeId;
  var url = window.location.origin + window.location.pathname + '?bike=' + bikeId;
  var text = 'Tjek denne cykel på Cykelbørsen: ' + title;

  document.getElementById('share-link-input').value = url;
  document.getElementById('share-modal').dataset.title = title;
  document.getElementById('share-whatsapp-btn').href  = 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + url);
  document.getElementById('share-facebook-btn').href  = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);

  document.getElementById('share-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeShareModal() {
  document.getElementById('share-modal').classList.remove('open');
  document.body.style.overflow = '';
}

function copyShareLink() {
  var input = document.getElementById('share-link-input');
  navigator.clipboard.writeText(input.value).then(function() {
    showToast('✅ Link kopieret!');
  }).catch(function() {
    input.select();
    document.execCommand('copy');
    showToast('✅ Link kopieret!');
  });
}

function shareViaSMS() {
  var url  = document.getElementById('share-link-input').value;
  var text = 'Tjek denne cykel på Cykelbørsen: ' + url;
  window.location.href = 'sms:?body=' + encodeURIComponent(text);
}

function openNativeShare() {
  var url   = document.getElementById('share-link-input').value;
  var title = document.getElementById('share-modal').dataset.title || 'Cykel til salg';
  var text  = 'Tjek denne cykel på Cykelbørsen: ' + title;

  // Brug Web Share API hvis tilgængelig (mobil)
  if (navigator.share) {
    navigator.share({ title: title, text: text, url: url })
      .then(function() { showToast('✅ Delt!'); })
      .catch(function() {});
  } else {
    // Fallback: åbn en side der lader brugeren vælge
    window.open('https://www.addtoany.com/share?url=' + encodeURIComponent(url) + '&title=' + encodeURIComponent(text), '_blank', 'width=600,height=400');
  }
}

window.searchAutocomplete = searchAutocomplete;
window.selectAutocomplete = selectAutocomplete;
window.handleSearchKey    = handleSearchKey;
window.toggleSold         = toggleSold;
window.openShareModal     = openShareModal;
window.closeShareModal    = closeShareModal;
window.copyShareLink      = copyShareLink;
window.shareViaSMS        = shareViaSMS;
window.openNativeShare     = openNativeShare;

/* ============================================================
   KORTVISNING MED LEAFLET
   ============================================================ */

var mapInstance        = null;
window._getMap = function() { return mapInstance; };
var mapMarkers         = [];
var currentView        = 'list';
var userLocationMarker = null;

/* ── Nominatim geocoding cache ── */
var _geocodeCache = (function() {
  try {
    var stored = localStorage.getItem('_geocodeCache');
    return stored ? JSON.parse(stored) : {};
  } catch (e) { return {}; }
})();

function _saveGeocodeCache() {
  try { localStorage.setItem('_geocodeCache', JSON.stringify(_geocodeCache)); } catch (e) {}
}

// Slå en dansk by/adresse op via Nominatim (med cache + rate-limit)
var _geocodeQueue = Promise.resolve();
var _lastGeocodeTime = 0;

function geocodeCity(city) {
  var key = city.toLowerCase().trim();
  if (_geocodeCache[key]) return Promise.resolve(_geocodeCache[key]);

  // Kø requests så vi max laver 1 kald per sekund (Nominatim rate limit)
  _geocodeQueue = _geocodeQueue.then(function() {
    // Tjek cache igen efter kø
    if (_geocodeCache[key]) return _geocodeCache[key];

    var now = Date.now();
    var wait = Math.max(0, 1100 - (now - _lastGeocodeTime));

    return new Promise(function(resolve) { setTimeout(resolve, wait); }).then(function() {
      _lastGeocodeTime = Date.now();
      var url = 'https://nominatim.openstreetmap.org/search?q='
        + encodeURIComponent(city + ', Danmark')
        + '&format=json&limit=1&countrycodes=dk';

      return fetch(url, {
        headers: { 'Accept-Language': 'da' }
      })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data && data.length > 0) {
            var coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
            _geocodeCache[key] = coords;
            _saveGeocodeCache();
            return coords;
          }
          _geocodeCache[key] = null; // By ikke fundet — cache negativt svar
          return null;
        })
        .catch(function() { return null; });
    });
  });

  return _geocodeQueue;
}

function setView(view) {
  currentView = view;
  var listGrid  = document.getElementById('listings-grid');
  var mapDiv    = document.getElementById('listings-map');
  var btnList   = document.getElementById('btn-list-view');
  var btnMap    = document.getElementById('btn-map-view');

  if (view === 'map') {
    listGrid.style.display = 'none';
    mapDiv.style.display   = 'block';
    btnList.classList.remove('active');
    btnMap.classList.add('active');
    initMap();
  } else {
    listGrid.style.display = '';
    mapDiv.style.display   = 'none';
    btnMap.classList.remove('active');
    btnList.classList.add('active');
  }
}

async function initMap() {
  // Initialiser kort første gang
  if (!mapInstance) {
    mapInstance = L.map('listings-map', { zoomControl: true }).setView([56.0, 10.0], 7);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(mapInstance);

    // Tilføj "Find mig" knap
    var locateBtn = document.createElement('button');
    locateBtn.className   = 'locate-btn';
    locateBtn.textContent = '📍 Find mig';
    locateBtn.onclick     = locateUser;
    document.getElementById('listings-map').appendChild(locateBtn);
  }

  // Ryd gamle markører
  mapMarkers.forEach(function(m) { mapInstance.removeLayer(m); });
  mapMarkers = [];

  // Hent annoncer med by
  var result = await supabase
    .from('bikes')
    .select('*, profiles(name, seller_type, shop_name, verified)')
    .eq('is_active', true);

  if (!result.data || result.data.length === 0) return;

  // Funktion til at tilføje en markør på kortet
  function addBikeMarker(b, coords) {
    // Tilføj lille tilfældig offset så markører ikke overlapper
    var lat = coords[0] + (Math.random() - 0.5) * 0.012;
    var lng = coords[1] + (Math.random() - 0.5) * 0.012;

    var profile    = b.profiles || {};
    var sellerType = profile.seller_type || 'private';
    var sellerName = sellerType === 'dealer' ? profile.shop_name : profile.name;
    var isVerified = profile.verified;
    var isDealer   = sellerType === 'dealer';

    var color = isDealer ? '#2A3D2E' : '#C8502A';
    var icon = L.divIcon({
      html: '<div style="background:' + color + ';color:white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">'
          + (isDealer ? '🏪' : '🚲') + '</div>',
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    var marker = L.marker([lat, lng], { icon: icon }).addTo(mapInstance);

    var popupHtml = '<div class="map-popup">'
      + '<div class="map-popup-title">' + b.brand + ' ' + b.model
      + (isVerified ? ' <span style="background:#2A7D4F;color:white;border-radius:50%;width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;font-size:0.55rem;margin-left:4px;">✓</span>' : '')
      + '</div>'
      + '<div class="map-popup-price">' + b.price.toLocaleString('da-DK') + ' kr.</div>'
      + '<div class="map-popup-meta">' + b.type + ' · ' + b.condition + ' · ' + (sellerName || 'Ukendt')
      + ' <span style="background:' + (isDealer ? '#E8F0E8' : '#FBF0E8') + ';color:' + (isDealer ? '#2A3D2E' : '#8A4A20') + ';padding:2px 7px;border-radius:100px;font-size:.7rem;">'
      + (isDealer ? '🏪 Forhandler' : '👤 Privat') + '</span></div>'
      + '<button class="map-popup-btn" onclick="openFromMap(&quot;' + b.id + '&quot;)">Se annonce →</button>'
      + '</div>';

    marker.bindPopup(popupHtml, { maxWidth: 280, closeButton: false });
    marker.on('click', function() { marker.openPopup(); });
    mapMarkers.push(marker);
  }

  // Geokod alle byer via Nominatim (med cache) og tilføj markører
  var geocodePromises = result.data
    .filter(function(b) { return !!b.city; })
    .map(function(b) {
      return geocodeCity(b.city).then(function(coords) {
        if (coords) addBikeMarker(b, coords);
      });
    });

  await Promise.all(geocodePromises);

  // Zoom til markørerne hvis der er nogen
  if (mapMarkers.length > 0) {
    var group = L.featureGroup(mapMarkers);
    mapInstance.fitBounds(group.getBounds().pad(0.1));
  }

  // Tilføj legende
  if (!document.getElementById('map-legend')) {
    var legend = L.control({ position: 'bottomleft' });
    legend.onAdd = function() {
      var div = L.DomUtil.create('div');
      div.id  = 'map-legend';
      div.style.cssText = 'background:white;padding:10px 14px;border-radius:8px;font-family:DM Sans,sans-serif;font-size:.78rem;box-shadow:0 2px 8px rgba(0,0,0,.1);';
      div.innerHTML = '<div style="margin-bottom:6px;font-weight:600;">Forklaring</div>'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><div style="background:#C8502A;border-radius:50%;width:16px;height:16px;border:2px solid white;"></div> Privat sælger</div>'
        + '<div style="display:flex;align-items:center;gap:8px;"><div style="background:#2A3D2E;border-radius:50%;width:16px;height:16px;border:2px solid white;"></div> Forhandler</div>';
      return div;
    };
    legend.addTo(mapInstance);
  }

  // Trigger resize så kortet fylder korrekt
  setTimeout(function() { mapInstance.invalidateSize(); }, 100);
}

function locateUser() {
  if (!navigator.geolocation) { showToast('⚠️ Din browser understøtter ikke lokation'); return; }

  navigator.geolocation.getCurrentPosition(function(pos) {
    var lat = pos.coords.latitude;
    var lng = pos.coords.longitude;

    if (userLocationMarker) mapInstance.removeLayer(userLocationMarker);

    var userIcon = L.divIcon({
      html: '<div style="background:#1877F2;border-radius:50%;width:16px;height:16px;border:3px solid white;box-shadow:0 0 0 3px rgba(24,119,242,0.3);"></div>',
      className: '', iconSize: [16, 16], iconAnchor: [8, 8],
    });

    userLocationMarker = L.marker([lat, lng], { icon: userIcon })
      .addTo(mapInstance)
      .bindPopup('<div style="padding:8px;font-family:DM Sans,sans-serif;font-size:.85rem;font-weight:600;">📍 Din placering</div>')
      .openPopup();

    mapInstance.setView([lat, lng], 12);
    showToast('📍 Viser cykler nær dig');
  }, function() {
    showToast('⚠️ Kunne ikke hente din lokation');
  });
}

function openFromMap(bikeId) {
  setView('list');
  setTimeout(function() { openBikeModal(bikeId); }, 100);
}
window.openFromMap = openFromMap;

function _openFromMap(bikeId) {
  // Luk kortpopup
  if (mapInstance) mapInstance.closePopup();
  // Skift til listevisning bag ved
  // Åbn bike modal direkte uden at skifte visning
  setTimeout(function() { openBikeModal(bikeId); }, 100);
}
window._openFromMap = _openFromMap;

window.setView    = setView;
window.locateUser = locateUser;
window.openBikeModal = openBikeModal; // allerede defineret

/* ============================================================
   ID VERIFICERING
   ============================================================ */

var idDocFile = null;

function previewIdDoc(input) {
  if (!input.files || !input.files[0]) return;
  idDocFile = input.files[0];

  var label = document.getElementById('id-upload-label');
  if (label) label.textContent = idDocFile.name;

  // Vis preview hvis billede
  if (idDocFile.type.startsWith('image/')) {
    var preview = document.getElementById('id-preview');
    var img     = document.getElementById('id-preview-img');
    if (preview && img) {
      img.src = URL.createObjectURL(idDocFile);
      preview.style.display = 'block';
    }
  }

  var submitBtn = document.getElementById('id-submit-btn');
  if (submitBtn) submitBtn.style.display = 'block';
}

async function submitIdVerification() {
  if (!currentUser || !idDocFile) { showToast('⚠️ Vælg et dokument først'); return; }

  showToast('⏳ Uploader dokument...');

  var ext      = idDocFile.name.split('.').pop();
  var filename = 'id-docs/' + currentUser.id + '/id-' + Date.now() + '.' + ext;

  var uploadResult = await supabase.storage
    .from('bike-images')
    .upload(filename, idDocFile, { contentType: idDocFile.type, upsert: true });

  if (uploadResult.error) {
    showToast('❌ Upload fejlede — prøv igen');
    console.error(uploadResult.error);
    return;
  }

  var publicUrl = supabase.storage.from('bike-images').getPublicUrl(filename).data.publicUrl;

  // Gem URL og status i profil
  var updateResult = await supabase.from('profiles').update({
    id_doc_url:    publicUrl,
    id_verified:   false,
    id_pending:    true,
  }).eq('id', currentUser.id);

  if (updateResult.error) {
    showToast('❌ Noget gik galt — prøv igen');
    return;
  }

  // Opdater UI
  document.getElementById('id-verify-upload-section').style.display = 'none';
  document.getElementById('id-verify-pending').style.display        = 'block';
  var statusEl = document.getElementById('id-verify-status');
  if (statusEl) { statusEl.textContent = '⏳ Afventer'; statusEl.className = 'id-status-waiting'; }

  currentProfile = { ...currentProfile, id_pending: true, id_doc_url: publicUrl };
  showToast('✅ Dokument sendt til verificering!');
}

async function updateIdVerifyUI() {
  // Genindlæs profil fra database for at få seneste status
  if (currentUser) {
    var result = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    if (result.data) currentProfile = result.data;
  }
  var profile = currentProfile || {};
  var box     = document.getElementById('id-verify-box');
  if (!box) return;

  var statusEl     = document.getElementById('id-verify-status');
  var uploadSection = document.getElementById('id-verify-upload-section');
  var pendingSection = document.getElementById('id-verify-pending');

  if (profile.id_verified) {
    if (statusEl) { statusEl.textContent = '✓ Verificeret'; statusEl.className = 'id-status-verified'; }
    if (uploadSection)  uploadSection.style.display  = 'none';
    if (pendingSection) pendingSection.style.display = 'none';
    // Vis bekræftelse
    var done = document.createElement('p');
    done.style.cssText = 'font-size:.85rem;color:#2A7D4F;background:#E8F0E8;padding:12px 16px;border-radius:8px;';
    done.textContent   = '✓ Din identitet er bekræftet. Du optræder med et blåt ID-badge på dine annoncer.';
    box.appendChild(done);
  } else if (profile.id_pending) {
    if (statusEl) { statusEl.textContent = '⏳ Afventer'; statusEl.className = 'id-status-waiting'; }
    if (uploadSection)  uploadSection.style.display  = 'none';
    if (pendingSection) pendingSection.style.display = 'block';
  } else {
    if (statusEl) { statusEl.textContent = 'Ikke verificeret'; statusEl.className = 'id-status-pending'; }
  }
}

// Tilføj ID badge på annoncekort
// (kaldes fra renderBikes via profile.id_verified check)

/* ── ADMIN: ID ANSØGNINGER ── */

async function loadIdApplications() {
  var list = document.getElementById('admin-id-list');
  list.innerHTML = '<p style="color:var(--muted)">Henter ansøgninger...</p>';

  var result = await supabase
    .from('profiles')
    .select('*')
    .eq('id_pending', true)
    .eq('id_verified', false);

  if (!result.data || result.data.length === 0) {
    list.innerHTML = '<p style="color:var(--muted)">Ingen ventende ID-ansøgninger.</p>';
    return;
  }

  list.innerHTML = result.data.map(function(p) {
    return '<div class="admin-row">'
      + '<img class="admin-id-img" src="' + (p.id_doc_url || '') + '" onclick="window.open(\'' + (p.id_doc_url || '') + '\',\'_blank\')" title="Klik for at se fuldt billede">'
      + '<div class="admin-row-info">'
      + '<div class="admin-row-name">' + (p.name || 'Ukendt') + '</div>'
      + '<div class="admin-row-meta">' + (p.email || '') + ' · ' + (p.seller_type === 'dealer' ? '🏪 Forhandler' : '👤 Privat') + '</div>'
      + '</div>'
      + '<div class="admin-row-actions">'
      + '<button class="btn-approve" onclick="approveId(\'' + p.id + '\')">✓ Godkend ID</button>'
      + '<button class="btn-reject" onclick="rejectId(\'' + p.id + '\')">✕ Afvis</button>'
      + '</div></div>';
  }).join('');
}

async function approveId(userId) {
  var err = (await supabase.from('profiles').update({
    id_verified: true,
    id_pending:  false,
  }).eq('id', userId)).error;
  if (err) { showToast('❌ Fejl'); return; }
  showToast('✅ ID godkendt — bruger har nu et blåt badge');
  loadIdApplications();
  // Hvis den godkendte bruger er den indloggede, opdater cache
  if (currentUser && currentUser.id === userId) {
    currentProfile = { ...currentProfile, id_verified: true, id_pending: false };
    updateIdVerifyUI();
    loadBikes();
  }
}

async function rejectId(userId) {
  if (!confirm('Afvis denne ID-ansøgning?')) return;
  var err = (await supabase.from('profiles').update({
    id_pending:  false,
    id_doc_url:  null,
  }).eq('id', userId)).error;
  if (err) { showToast('❌ Fejl'); return; }
  showToast('ID-ansøgning afvist');
  loadIdApplications();
}

window.previewIdDoc       = previewIdDoc;
window.submitIdVerification = submitIdVerification;
window.approveId          = approveId;
window.rejectId           = rejectId;
