# Fellowship Case Logbook

A mobile-first operative case logbook for an orthopedic traumatology fellowship, built with React, TypeScript, and Vite. Implements the `Logbook.dc.html` design from the [User-friendly logbook form](https://claude.ai/design/p/39eaa4f0-89ae-4e95-acff-82d17df132a7) project.

## Features

- New Entry form covering date/timing, diagnosis, AO/OTA fracture classification (with an interactive body-region diagram), approach & position, procedure, procedure type, role, operative time, and place.
- Case Log tab listing saved cases with expandable detail and delete.
- Client-side validation on required fields.
- Cases persist to `localStorage`.
- Desktop viewports (>1024px) are gated behind a "Mobile & Tablet Only" notice, matching the intended point-of-care usage.

## Development

```sh
npm install
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
