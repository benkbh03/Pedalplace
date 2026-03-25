# CykelBoersen

Danmarks dedikerede markedsplads for køb og salg af brugte cykler. Single-page vanilla JS app hostet via GitHub Pages, med Supabase som backend.

## Projektstruktur

```
CykelBoersen/
├── index.html          # Al HTML og modal-markup
├── main.js             # Al applogik (~3000+ linjer vanilla JS)
├── style.css           # Al styling
├── CNAME               # GitHub Pages domæne
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
- De fleste modaler bruger `style.display = 'flex'` / `style.display = 'none'`
- `document.body.style.overflow = 'hidden'` ved åbning, `''` ved lukning

### Fejl-HTML med "Prøv igen"-knap
Brug den eksisterende `retryHTML(msg, fn)` helper (defineret nær `showToast`):
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
- Modale kontekst-vars følger mønstret `_entityId`, `_entityTitle` (f.eks. `_reportBikeId`)

### Window-eksporter
Alle funktioner der kaldes fra HTML `onclick` skal eksporteres nederst i `main.js`:
```js
window.functionName = functionName;
```

## Teknologier
- **Frontend**: Vanilla JS, HTML, CSS (ingen frameworks)
- **Backend**: Supabase (auth, database, Edge Functions)
- **Betaling**: Stripe
- **Hosting**: GitHub Pages
