---
  Google Auth — Summary

  Step 1 — Google Cloud Console

  1. <https://console.cloud.google.com> → new project → APIs & Services → OAuth consent screen (External, fill basic info)
  2. Credentials → Create OAuth client ID — create three:
    - Web → Authorized redirect URI: <https://szebvrsjjhczhlkftlkd.supabase.co/auth/v1/callback>
    - iOS → Bundle ID: your iOS bundle ID (e.g. com.yourname.booksapp)
    - Android → Package name + SHA-1 fingerprint of your debug/release keystore
  3. Save the Web client ID + secret

  Step 2 — Supabase Dashboard

  1. Authentication → Providers → Google → enable, paste Web client ID + secret
  2. Authentication → URL Configuration → Redirect URLs → add booksapp:// and exp+booksapp://

  Step 3 — Code
  Already done. The Google button in LoginScreen.tsx calls signInWithOAuth({ provider: 'google' }) — it will work once Supabase has the credentials.

  ---
  Apple Auth — Summary

  Step 1 — Apple Developer Portal (requires $99/yr Apple Developer account)

  1. <https://developer.apple.com> → Identifiers → select your App ID → enable Sign In with Apple → Save
  2. Identifiers → + → Services IDs → create com.yourname.booksapp.siwa
    - Enable Sign In with Apple → Configure:
        - Domains: szebvrsjjhczhlkftlkd.supabase.co
      - Return URLs: <https://szebvrsjjhczhlkftlkd.supabase.co/auth/v1/callback>
  3. Keys → + → enable Sign In with Apple → select your primary App ID → download .p8 key file (note the Key ID and your Team ID from the top-right of the portal)

  Step 2 — Supabase Dashboard

  1. Authentication → Providers → Apple → enable
  2. Fill in:
    - Service ID: com.yourname.booksapp.siwa (the Services ID from step 1)
    - Team ID: your 10-char Apple team ID
    - Key ID: from the downloaded key
    - Private Key: full contents of the .p8 file (including -----BEGIN PRIVATE KEY-----)
  3. Save

  Step 3 — Code (already done)

- expo-apple-authentication installed, app.json has "usesAppleSignIn": true
- LoginScreen.tsx shows Apple's native button on iOS only; on press calls signInAsync → supabase.auth.signInWithIdToken
- Apple's native dialog handles the full auth — no browser needed

  ---
  Important notes:

- Apple Sign In only works in a real build (eas build) or Simulator — not Expo Go
- Google OAuth works in Expo Go for development
- The App Store requires Apple Sign In if you offer any other social sign-in (Google) — so both must ship together
