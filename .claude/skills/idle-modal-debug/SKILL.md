---
name: idle-modal-debug
description: Debugger CykelBørsen bugs hvor annonce- eller profilmodals hænger på loading, især efter inaktivitet, visibilitychange eller Supabase auth-events. Brug når bruger nævner annonce, profil, modal, idle, loading, visibilitychange, SIGNED_IN, TOKEN_REFRESHED, main.js eller Supabase session refresh.
---

# Idle Modal Debug (CykelBørsen)

## Formål
Find og isolér bugs hvor modals (bike, user, dealer) bliver stående på loading, især efter idle eller tab-switch.

## Vigtige regler
- Gæt aldrig root cause
- Find første fejl i flowet før fixes
- Vis konkrete kodeblokke i main.js
- Lav kun minimale ændringer (ingen refactor)
- Bevis problemet med logs før løsning

## Fokusområder
Undersøg kun disse funktioner:
- visibilitychange listener
- onAuthStateChange()
- openBikeModal(bikeId)
- openUserProfile(userId)
- openDealerProfile(dealerId)

## Debug workflow

### Step 1: Identificér trigger
- Sker bug efter idle?
- Efter tab-switch?
- Under modal load?
- Er visibilitychange involveret?

### Step 2: Find første async operation
Find første:
- supabase.from(...)
- await kald
- state change

### Step 3: Find hvor flow stopper
Check:
- mangler success log?
- mangler error log?
- loading HTML bliver ikke erstattet?

### Step 4: Check for race conditions
Specielt:
- visibilitychange → loadBikes()
- onAuthStateChange → SIGNED_IN
- modal fetch samtidig med refresh

### Step 5: Check global state
- currentUser
- currentProfile
- activeThread

Er de undefined eller stale?

### Step 6: Output format
Svar altid med:

1. Reproduktion (hvordan bug opstår)
2. Første fejlpunkt (konkret linje / funktion)
3. Root cause (med kodebevis)
4. Minimal fix
5. Risiko ved fix

## Typiske fejl i dette projekt
- visibilitychange spammer reloads
- SIGNED_IN trigger load unødvendigt
- modal fetch bliver afbrudt
- loading state bliver aldrig cleared
- flere async flows overlapper
