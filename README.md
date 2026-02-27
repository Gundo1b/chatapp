# MyAwesomeApp

Dating/chat app built with Expo Router + Supabase.

## Prerequisites

- Node.js 18+
- npm
- A Supabase project

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and set:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

3. In Supabase SQL editor, run `supabase/profiles.sql`.

4. Start app:

```bash
npm run web
```

## Web Build (Static)

Create static web output in `dist/`:

```bash
npm run build:web
```

## Deploy

### Option A: Vercel

1. Import repo.
2. Set build command: `npm run build:web`
3. Set output directory: `dist`
4. Add env vars in Vercel project settings:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`

### Option B: Netlify

1. Build command: `npm run build:web`
2. Publish directory: `dist`
3. Add env vars:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## Notes

- This app uses Expo web static output (`app.json -> expo.web.output = static`).
- If env vars are missing at build time, Supabase client initialization will fail.
