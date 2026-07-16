# Siapp

[![CI](https://github.com/Siapp-Development/siapp/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Siapp-Development/siapp/actions/workflows/ci.yml)

Project management with built-in client visibility — WhatsApp updates, client portal, priced for SEA SMEs.

**Domain:** [siapp.app](https://siapp.app)

## Local development

Each web surface (D-036) runs on its own dev port from `apps/web`: `pnpm dev:apex` (5173, siapp.app marketing + `/p`/`/t` trees), `pnpm dev:dashboard` (5174, firm app), `pnpm dev:admin` (5175). Cross-surface links (e.g. marketing → dashboard) point at production hosts and can't be clicked through end-to-end in dev.
