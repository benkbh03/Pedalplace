# CykelBoersen

Danmarks dedikerede markedsplads for køb og salg af brugte cykler. Single-page vanilla JS app hostet via GitHub Pages, med Supabase som backend.

## Projektstruktur

```
CykelBoersen/
├── index.html          # Al HTML og modal-markup
├── main.js             # Al applogik (~3500+ linjer vanilla JS)
├── style.css           # Al styling
├── CNAME               # GitHub Pages domæne (xn--cykelbrsen-5cb.dk)
└── supabase/
    └── functions/
        ├── notify-message/         # E-mail notifikationer (beskeder, rapporter, ID-godkendelse, kontaktform)
        ├── delete-account/         # Slet bruger permanent
        ├── create-checkout-session/ # Stripe betaling
        ├── create-portal-session/  # Stripe portal
        ├── stripe-webhook/         # Stripe webhooks
        └── chat-support/           # Chat support
```

## Git

- Repository: `benkbh03/CykelBoersen` på GitHub
- Arbejdsgren: `claude/email-notifications-messages-57SH8`
- Push altid til denne branch med: `git push -u origin claude/email-notifications-messages-57SH8`

## Arkitektur og mønstre

### Modaler
- Markup i `index.html`, logik i `main.js`
- Z-index hierarki (stigende prioritet):
  - `.modal-overlay` base: 1500
  - `#user-profile-modal`, `#dealer-profile-modal`: 2000
  - `#bike-modal`, `#map-bike-modal`: 2500
  - `#login-modal`, `#share-modal`, `#report-modal`: 3000
  - `#buyer-picker-modal`: 5000
  - `.toast`: 10000
- De fleste modaler bruger `style.display = 'flex'` / `style.display = 'none'`
- `document.body.style.overflow = 'hidden'` ved åbning, `''` ved lukning

### XSS-sikkerhed
Brug ALTID `esc()` helperen (defineret nær `debounce`) til al bruger-genereret tekst før den sættes i HTML:
```js
${esc(b.description)}          // Beskrivelser
${esc(msg.content)}            // Beskeder
${esc(r.comment)}              // Anmeldelser
esc(query)                     // Søge-input i autocomplete
```
For beskrivelser med linjeskift: `esc(b.description).replace(/\n/g, '<br>')`

### Hjælpere
```js
esc(str)           // Escaper HTML — forhindrer XSS
retryHTML(msg, fn) // Fejl-HTML med "Prøv igen"-knap
debounce(fn, ms)   // Debounce funktion
showToast(msg)     // Toast-notifikation (z-index: 10000)
renderMessages(messages, isSeller, bikeActive, isInbox)  // Fælles besked-renderer
```

### Beskeder og handel
- `sendReply(isInbox)` — ét unified svar-funktion for begge indbakker
- `acceptBid(content, isInbox)` — ét unified bud-accept for begge kontekster
- `renderMessages(data, isSeller, bikeActive, isInbox)` — fælles besked-renderer
- State: `activeThread` (bike-modal) og `activeInboxThread` (indbakke-modal)

### Vurderingssystem
- Brugere kan kun vurdere hinanden efter en reel handel
- `hasTraded` tjekker for beskeder med "accepteret" (fra budaccept eller "Sæt solgt"-flow)
- Tre veje til handel: accepter bud → automatisk, "Sæt solgt" → buyer-picker modal, manuel markering
- Efter handel åbnes købers profil automatisk med vurderingsformular i fokus (`openUserProfileWithReview`)

### Sælgertype-kontrol
- Privatpersoner kan IKKE skifte til forhandler via profil-dropdown
- Forhandleroprettelse sker KUN via "Bliv forhandler"-flowet (Stripe betaling)
- `saveProfile()` låser `seller_type` til nuværende værdi

### Fejl-HTML med "Prøv igen"-knap
```js
list.innerHTML = retryHTML('Kunne ikke hente X.', 'loadX');
```

### Notifikationer (fire-and-forget)
```js
supabase.functions.invoke('notify-message', {
  body: { type: 'TYPE', ...payload },
}).catch(() => {});
```
Typer: `'report_listing'`, `'id_approved'`, `'id_rejected'`, `'contact_form'`, `'message_id'`

### Globale variabler
- `currentUser` — Supabase auth user
- `currentProfile` — Profil fra `profiles`-tabellen
- `activeThread` / `activeInboxThread` — aktiv beskedtråd-kontekst
- Modale kontekst-vars: `_reportBikeId`, `_reportBikeTitle`, `currentShareBikeId`

### Window-eksporter
Alle funktioner der kaldes fra HTML `onclick` skal eksporteres nederst i `main.js`:
```js
window.functionName = functionName;
```

## Performance-mønstre

### Session og data-refresh
- `visibilitychange` listener refresher session + bikes når tab aktiveres (500ms debounce)
- `updateFilterCounts()` kaldes KUN ved initial load og efter mutationer — IKKE på tab-fokus
- `onAuthStateChange` → `TOKEN_REFRESHED` reloader IKKE data (håndteres af visibilitychange)
- `SIGNED_OUT` → fuld page reload for at rydde stale state

### Database-queries
- `loadBikes()` bruger `.eq('is_active', true)` — henter kun aktive annoncer
- Brug specifikke `.select()` felter i stedet for `select('*')` for at reducere data
- `loadBikesWithFilters()` og `loadBikes()` skal have identiske `profiles(...)` felter inkl. `verified, id_verified`

### Galleri
- Maks 5 thumbnails synlige — viser "+N" overlay på den 5. hvis flere
- `object-fit: contain` + blurred background (`.gallery-main-bg`) for at undgå cropping
- `galleryGoto()` opdaterer baggrund: `bg.style.backgroundImage = url(...)`

## Domæne
- Unicode: `cykelbørsen.dk`
- Punycode (DNS/CNAME): `xn--cykelbrsen-5cb.dk`
- Del-links bruger Unicode-versionen: `https://cykelbørsen.dk/?bike=...`
- Supabase redirect URLs bruger punycode: `https://xn--cykelbrsen-5cb.dk`

## Teknologier
- **Frontend**: Vanilla JS, HTML, CSS (ingen frameworks)
- **Backend**: Supabase (auth, database, Edge Functions)
- **Betaling**: Stripe
- **Hosting**: GitHub Pages
- **E-mail**: Resend SMTP via Supabase
