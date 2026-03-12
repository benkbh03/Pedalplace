/* ============================================================
   CYKELBØRSEN – main.js
   ============================================================ */

/* ── CYKELDATA ──────────────────────────────────────────────
   I en rigtig app ville dette komme fra en backend/API.
   Strukturen for hvert objekt:
   {
     emoji:      String  – midlertidig visuel placeholder (erstattes af rigtige billeder)
     title:      String  – mærke + model
     type:       String  – cykeltype
     price:      String  – formateret pris
     year:       Number  – produktionsår
     size:       String  – rammestørrelse
     city:       String  – sælgers by
     condition:  String  – stand (Ny / Som ny / God stand / Brugt)
     seller:     String  – initialer til avatar
     sellerName: String  – sælgers navn
     sellerType: String  – 'private' eller 'dealer'
     delay:      Number  – animation-delay i ms (staggered indgang)
   }
   ──────────────────────────────────────────────────────── */
const bikes = [
  {
    emoji: '🚴',
    title: 'Trek FX 3 Disc',
    type: 'Citybike',
    price: '4.500',
    year: 2021,
    size: 'M',
    city: 'København',
    condition: 'Som ny',
    seller: 'MK',
    sellerName: 'Mikkel K.',
    sellerType: 'private',
    delay: 0,
  },
  {
    emoji: '⚡',
    title: 'Giant Quick-E+ 2022',
    type: 'El-cykel',
    price: '12.800',
    year: 2022,
    size: 'L',
    city: 'Aarhus',
    condition: 'God stand',
    seller: 'VE',
    sellerName: 'VeloShop',
    sellerType: 'dealer',
    delay: 50,
  },
  {
    emoji: '🏔️',
    title: 'Specialized Rockhopper',
    type: 'MTB',
    price: '3.200',
    year: 2020,
    size: 'M',
    city: 'Odense',
    condition: 'Brugt',
    seller: 'LH',
    sellerName: 'Lars H.',
    sellerType: 'private',
    delay: 100,
  },
  {
    emoji: '🚵',
    title: 'Canyon Grail CF 7',
    type: 'Gravel',
    price: '9.900',
    year: 2023,
    size: 'L',
    city: 'Frederiksberg',
    condition: 'Som ny',
    seller: 'NB',
    sellerName: 'Nordic Bikes',
    sellerType: 'dealer',
    delay: 150,
  },
  {
    emoji: '🛵',
    title: 'Christiania Ladcykel',
    type: 'Ladcykel',
    price: '6.400',
    year: 2019,
    size: 'One size',
    city: 'København N',
    condition: 'God stand',
    seller: 'SF',
    sellerName: 'Sara F.',
    sellerType: 'private',
    delay: 200,
  },
  {
    emoji: '🚲',
    title: 'Peugeot City Sport',
    type: 'Racercykel',
    price: '1.800',
    year: 2017,
    size: 'S',
    city: 'Aalborg',
    condition: 'Brugt',
    seller: 'PL',
    sellerName: 'Peter L.',
    sellerType: 'private',
    delay: 250,
  },
  {
    emoji: '⚡',
    title: 'Raleigh Array E',
    type: 'El-cykel',
    price: '8.200',
    year: 2022,
    size: 'M',
    city: 'Aarhus',
    condition: 'God stand',
    seller: 'CE',
    sellerName: 'Cykel Expert',
    sellerType: 'dealer',
    delay: 300,
  },
  {
    emoji: '🚴',
    title: 'Trek Émonda SL 5',
    type: 'Racercykel',
    price: '14.500',
    year: 2023,
    size: 'M',
    city: 'Gentofte',
    condition: 'Som ny',
    seller: 'AJ',
    sellerName: 'Anders J.',
    sellerType: 'private',
    delay: 350,
  },
];

/* ── RENDER ANNONCEKORT ─────────────────────────────────────
   Genererer HTML for hvert cykelobjekt og indsætter det i
   #listings-grid. Skift til rigtige <img>-tags når du har
   et backend med billedupload.
   ──────────────────────────────────────────────────────── */
function renderBikes(data = bikes) {
  const grid = document.getElementById('listings-grid');

  grid.innerHTML = data.map((b) => `
    <div class="bike-card" style="animation-delay: ${b.delay}ms">

      <div class="bike-card-img">
        <span>${b.emoji}</span>
        <span class="condition-tag">${b.condition}</span>
        <button
          class="save-btn"
          aria-label="Gem annonce"
          onclick="event.stopPropagation(); toggleSave(this)"
        >🤍</button>
      </div>

      <div class="bike-card-body">
        <div class="card-top">
          <div class="bike-title">${b.title}</div>
          <div class="bike-price">${b.price} kr.</div>
        </div>

        <div class="bike-meta">
          <span>${b.type}</span>
          <span>${b.year}</span>
          <span>Str. ${b.size}</span>
        </div>

        <div class="card-footer">
          <div class="seller-info">
            <div class="seller-avatar">${b.seller}</div>
            <div>
              <div class="seller-name">${b.sellerName}</div>
              <span class="badge ${b.sellerType === 'dealer' ? 'badge-dealer' : 'badge-private'}">
                ${b.sellerType === 'dealer' ? '🏪 Forhandler' : '👤 Privat'}
              </span>
            </div>
          </div>
          <div class="card-location">📍 ${b.city}</div>
        </div>
      </div>

    </div>
  `).join('');
}

/* ── GEM / FJERN ANNONCE (hjerte-knap) ─────────────────────
   Toggler imellem 🤍 og ❤️. I en rigtig app ville dette
   kalde et API-endpoint der gemmer annoncen på brugerkontoen.
   ──────────────────────────────────────────────────────── */
function toggleSave(btn) {
  const isSaved = btn.textContent === '❤️';
  btn.textContent = isSaved ? '🤍' : '❤️';
  btn.setAttribute('aria-label', isSaved ? 'Gem annonce' : 'Fjern fra gemte');
}

/* ── HURTIGFILTER PILLS ─────────────────────────────────────
   Marker den klikkede pill som aktiv og fjern aktiv fra resten.
   Udvid med filterlogik der kalder renderBikes() med filtreret data.
   ──────────────────────────────────────────────────────── */
function togglePill(el) {
  document.querySelectorAll('.pill').forEach((p) => p.classList.remove('active'));
  el.classList.add('active');

  // TODO: filtrer bikes-arrayet baseret på el.textContent og kald renderBikes()
}

/* ── MODAL: ÅBN ─────────────────────────────────────────────
   Åbner "Opret annonce"-modalen og låser baggrunds-scroll.
   ──────────────────────────────────────────────────────── */
function openModal() {
  document.getElementById('modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

/* ── MODAL: LUK ─────────────────────────────────────────────
   Lukker modalen og genetablerer scroll.
   ──────────────────────────────────────────────────────── */
function closeModal() {
  document.getElementById('modal').classList.remove('open');
  document.body.style.overflow = '';
}

/* Luk modal ved klik på overlay (udenfor selve modal-boksen) */
document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

/* ── SÆLGER-TYPE TOGGLE ─────────────────────────────────────
   Skifter imellem "Privatperson" og "Forhandler" i formularen.
   Viser/skjuler ekstra CVR-felt til forhandlere.
   ──────────────────────────────────────────────────────── */
function selectType(type) {
  const isDealer = type === 'dealer';

  document.getElementById('type-private').classList.toggle('selected', !isDealer);
  document.getElementById('type-dealer').classList.toggle('selected',   isDealer);
  document.getElementById('dealer-fields').style.display = isDealer ? 'block' : 'none';
}

/* ── INDSEND ANNONCE ────────────────────────────────────────
   Simulerer formularindsendelse. I en rigtig app: valider
   felterne, byg et FormData-objekt og POST til dit API.
   ──────────────────────────────────────────────────────── */
function submitListing() {
  // TODO: valider formular og send data til backend
  closeModal();
  showToast('✅ Din annonce er oprettet!');
}

/* ── TOAST-BESKED ───────────────────────────────────────────
   Viser en midlertidig besked i bunden af skærmen.
   ──────────────────────────────────────────────────────── */
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

/* ── NAVIGATION SCROLL ──────────────────────────────────────
   Ruller til den relevante sektion ved klik i nav-baren.
   ──────────────────────────────────────────────────────── */
function showSection(section) {
  if (section === 'dealers') {
    document.querySelector('.dealer-strip').scrollIntoView({ behavior: 'smooth' });
  } else {
    document.querySelector('.main').scrollIntoView({ behavior: 'smooth' });
  }
}

/* ── INIT ───────────────────────────────────────────────────
   Kør når siden er klar.
   ──────────────────────────────────────────────────────── */
renderBikes();
