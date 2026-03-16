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
    .select('*, profiles(name, seller_type, shop_name), bike_images(url, is_primary)')
    .eq('is_active', true)
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
      <div class="bike-card" style="animation-delay:${i * 50}ms" onclick="openBikeModal('${b.id}')">
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
  if (statTotal) statTotal.textContent = total.toLocaleString('da-DK') + '+';
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

  grid.innerHTML = data.map(b => `
    <div class="my-listing-row">
      <div class="my-listing-info">
        <div class="my-listing-title">${b.brand} ${b.model}</div>
        <div class="my-listing-meta">${b.type} · ${b.city} · ${b.condition}</div>
      </div>
      <div class="my-listing-price">${b.price.toLocaleString('da-DK')} kr.</div>
      <div style="display:flex;gap:8px;">
        <button class="btn-edit" onclick="openEditModal('${b.id}')">✏️ Rediger</button>
        <button class="btn-delete" onclick="deleteListing('${b.id}')">Slet</button>
      </div>
    </div>`).join('');
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
    .select('*, profiles(id, name, seller_type, shop_name, phone, city), bike_images(url, is_primary)')
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
  const primaryImg = b.bike_images?.find(img => img.is_primary)?.url;
  const imgContent = primaryImg
    ? `<img src="${primaryImg}" alt="${b.brand} ${b.model}">`
    : '<span>🚲</span>';

  const isOwner = currentUser && currentUser.id === profile.id;

  document.getElementById('bike-modal-title').textContent = `${b.brand} ${b.model}`;

  document.getElementById('bike-modal-body').innerHTML = `
    <div class="bike-detail-grid">
      <div>
        <div class="bike-detail-img">${imgContent}</div>
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
            <div class="seller-detail-name">${sellerName || 'Ukendt'}</div>
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
}

function closeBikeModal() {
  document.getElementById('bike-modal').classList.remove('open');
  document.body.style.overflow = '';
}
document.getElementById('bike-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeBikeModal();
});

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

  const { error } = await supabase.from('messages').insert({
    bike_id:     bikeId,
    sender_id:   currentUser.id,
    receiver_id: receiverId,
    content,
  });

  if (error) { showToast('❌ Kunne ikke sende besked'); console.error(error); return; }
  document.getElementById('message-text').value = '';
  document.getElementById('message-box').style.display = 'none';
  showToast('✅ Besked sendt!');
}

async function sendBid(bikeId, receiverId) {
  if (!currentUser) { showToast('⚠️ Log ind for at give bud'); return; }
  const amount = document.getElementById('bid-amount').value;
  if (!amount) { showToast('⚠️ Indtast et bud'); return; }

  const content = `💰 Bud: ${parseInt(amount).toLocaleString('da-DK')} kr.`;

  const { error } = await supabase.from('messages').insert({
    bike_id:     bikeId,
    sender_id:   currentUser.id,
    receiver_id: receiverId,
    content,
  });

  if (error) { showToast('❌ Kunne ikke sende bud'); return; }
  document.getElementById('bid-amount').value = '';
  document.getElementById('bid-box').style.display = 'none';
  showToast('✅ Bud sendt til sælgeren!');
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

  supabase
    .channel('new-messages')
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'messages',
      filter: 'receiver_id=eq.' + currentUser.id,
    }, function(payload) {
      // Ny besked modtaget
      const msg    = payload.new;
      const isBid  = msg.content && msg.content.indexOf('💰') === 0;
      const label  = isBid ? '💰 Nyt bud modtaget!' : '✉️ Ny besked modtaget!';
      showToast(label);
      updateInboxBadge();

      // Puls-animation på indbakke-knappen
      const btn = document.getElementById('nav-inbox-btn');
      if (btn) {
        btn.classList.add('inbox-pulse');
        setTimeout(function() { btn.classList.remove('inbox-pulse'); }, 2000);
      }
    })
    .subscribe();
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
window.closeInboxModal  = closeInboxModal;
window.openInboxThread  = openInboxThread;
window.closeInboxThread = closeInboxThread;
window.sendInboxReply   = sendInboxReply;
