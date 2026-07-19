# Fellowship Case Logbook

A mobile-first operative case logbook for an orthopedic traumatology fellowship, built with React, TypeScript, and Vite. Implements the `Logbook.dc.html` design from the [User-friendly logbook form](https://claude.ai/design/p/39eaa4f0-89ae-4e95-acff-82d17df132a7) project.

## Features

- LINE login (via LIFF) gated behind a physician whitelist, with email + one-time-code verification on first use — see [SETUP.md](./SETUP.md) for how the login flow works and how to configure it.
- New Entry form covering date/timing, diagnosis, AO/OTA fracture classification (with an interactive body-region diagram), approach & position, procedure, procedure type, role, operative time, and place.
- Case Log tab listing saved cases with expandable detail and delete.
- Client-side validation on required fields.
- Cases are stored in Supabase (Postgres), scoped per physician via Row-Level Security.
- Desktop viewports (>1024px) are gated behind a "Mobile & Tablet Only" notice, matching the intended point-of-care usage.

## Backend setup

This app needs a Supabase project (database + auth + two Edge Functions) and
a LINE LIFF app configured before login will work end to end. See
[SETUP.md](./SETUP.md) for the one-time steps.

## Development

```sh
npm install
cp .env.example .env   # fill in your Supabase + LIFF values
npm run dev
```

## Build

```sh
npm run build
```

## Lint

```sh
npm run lint
```
