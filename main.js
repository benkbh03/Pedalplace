/* ============================================================
   CYKELBØRSEN – main.js (med Supabase)
   ============================================================ */

/* ── SUPABASE KONFIGURATION ─────────────────────────────────
   Find disse værdier i Supabase:
   Project Settings → API → Project URL + anon/public key
   ──────────────────────────────────────────────────────── */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://ktufgncydxhkhfttojkh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bxJ_gRDrsJ-XCWWUD6NiQA_1nlPDA2B';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ── HENT OG VIS ANNONCER ───────────────────────────────────
   Henter alle aktive cykler fra databasen inkl. sælgerens
   profilinfo og det primære billede.
   ──────────────────────────────────────────────────────── */
async function loadBikes(filters = {}) {
  const grid = document.getElementById('listings-grid');
  grid.innerHTML = '<p style="color:var(--muted);padding:20px">Henter annoncer...</p>';

  let query = supabase
    .from('bikes')
    .select(`
      *,
      profiles (name, seller_type, shop_name),
      bike_images (url, is_primary)
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (filters.type)       query = query.eq('type', filters.type);
  if (filters.sellerType) query = query.eq('profiles.seller_type', filters.sellerType);
  if (filters.maxPrice)   query = query.lte('price', filters.maxPrice);

  const { data, error } = await query;

  if (error) {
    grid.innerHTML = '<p style="color:var(--rust);padding:20px">Kunne ikke hente annoncer. Prøv igen.</p>';
    console.error(error);
    return;
  }

  renderBikes(data);
}

/* ── RENDER ANNONCEKORT ─────────────────────────────────────
   Bygger HTML-kort for hvert cykelobjekt fra databasen.
   ──────────────────────────────────────────────────────── */
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
      <div class="bike-card" style="animation-delay: ${i * 50}ms" data-id="${b.id}">
        <div class="bike-card-img">
          ${imgContent}
          <span class="condition-tag">${b.condition}</span>
          <button
            class="save-btn"
            aria-label="Gem annonce"
            onclick="event.stopPropagation(); toggleSave(this, '${b.id}')"
          >🤍</button>
        </div>
        <div class="bike-card-body">
          <div class="card-top">
            <div class="bike-title">${b.brand} ${b.model}</div>
            <div class="bike-price">${b.price.toLocaleString('da-DK')} kr.</div>
          </div>
          <div class="bike-meta">
            <span>${b.type}</span>
            <span>${b.year || '–'}</span>
            <span>Str. ${b.size || '–'}</span>
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
      </div>
    `;
  }).join('');
}

/* ── GEM / FJERN ANNONCE ────────────────────────────────────
   Gemmer eller fjerner en annonce for den indloggede bruger.
   ──────────────────────────────────────────────────────── */
async function toggleSave(btn, bikeId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    showToast('⚠️ Log ind for at gemme annoncer');
    return;
  }

  const isSaved = btn.textContent === '❤️';

  if (isSaved) {
    await supabase.from('saved_bikes').delete()
      .eq('user_id', user.id).eq('bike_id', bikeId);
    btn.textContent = '🤍';
  } else {
    await supabase.from('saved_bikes').insert({ user_id: user.id, bike_id: bikeId });
    btn.textContent = '❤️';
  }
}

/* ── HURTIGFILTER PILLS ─────────────────────────────────────*/
function togglePill(el) {
  document.querySelectorAll('.pill').forEach((p) => p.classList.remove('active'));
  el.classList.add('active');

  const text = el.textContent.trim();
  if      (text === 'Alle')             loadBikes();
  else if (text === 'El-cykler')        loadBikes({ type: 'El-cykel' });
  else if (text === 'Kun forhandlere')  loadBikes({ sellerType: 'dealer' });
  else if (text === 'Kun private')      loadBikes({ sellerType: 'private' });
  else if (text === 'Under 3.000 kr')  loadBikes({ maxPrice: 3000 });
}

/* ── MODAL: ÅBN / LUK ───────────────────────────────────────*/
function openModal() {
  document.getElementById('modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  document.getElementById('modal').classList.remove('open');
  document.body.style.overflow = '';
}
document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

/* ── SÆLGER-TYPE TOGGLE ─────────────────────────────────────*/
function selectType(type) {
  const isDealer = type === 'dealer';
  document.getElementById('type-private').classList.toggle('selected', !isDealer);
  document.getElementById('type-dealer').classList.toggle('selected', isDealer);
  document.getElementById('dealer-fields').style.display = isDealer ? 'block' : 'none';
}

/* ── INDSEND ANNONCE ────────────────────────────────────────
   Samler formulardata og gemmer til Supabase.
   ──────────────────────────────────────────────────────── */
async function submitListing() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    showToast('⚠️ Log ind for at oprette en annonce');
    return;
  }

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
    showToast('⚠️ Udfyld venligst alle påkrævede felter (*)');
    return;
  }

  const { error } = await supabase.from('bikes').insert(bikeData);

  if (error) {
    showToast('❌ Noget gik galt – prøv igen');
    console.error(error);
    return;
  }

  closeModal();
  showToast('✅ Din annonce er oprettet!');
  loadBikes();
}

/* ── BRUGER LOGIN / REGISTRERING / LOGOUT ───────────────────
   Kaldes fra en login-modal du kan tilføje til index.html.
   ──────────────────────────────────────────────────────── */
async function login(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) showToast('❌ Forkert email eller adgangskode');
  else       showToast('✅ Du er nu logget ind');
}

async function register(email, password, name) {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  if (error) showToast('❌ Kunne ikke oprette bruger: ' + error.message);
  else       showToast('✅ Tjek din email for at bekræfte kontoen');
}

async function logout() {
  await supabase.auth.signOut();
  showToast('👋 Du er logget ud');
}

/* Opdater UI når login-status ændrer sig */
supabase.auth.onAuthStateChange((_event, session) => {
  const sellBtn = document.querySelector('.btn-sell');
  if (sellBtn) {
    sellBtn.textContent = session ? '+ Sæt til salg' : 'Log ind / Sælg';
  }
});

/* ── TOAST-BESKED ───────────────────────────────────────────*/
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

/* ── NAVIGATION SCROLL ──────────────────────────────────────*/
function showSection(section) {
  if (section === 'dealers') {
    document.querySelector('.dealer-strip').scrollIntoView({ behavior: 'smooth' });
  } else {
    document.querySelector('.main').scrollIntoView({ behavior: 'smooth' });
  }
}

/* ── INIT ───────────────────────────────────────────────────*/
loadBikes();
