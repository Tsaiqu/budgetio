# Budgetio

Aplikacja do planowania budżetu domowego. Dostępna z przeglądarki (desktop + telefon),
docelowo też jako aplikacja mobilna. Hostowana na własnym VPS.

**Status:** faza 0 — szkielet repo. Aplikacja jeszcze nie działa.

## Dokumentacja

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack, model danych, decyzje i ich uzasadnienie
- [docs/ROADMAP.md](docs/ROADMAP.md) — plan pracy rozbity na małe chunki z kryteriami odbioru

## Stack

FastAPI (Python 3.12) · PostgreSQL 17 · Next.js + TypeScript + Tailwind · React Native/Expo (później) · Docker Compose + Caddy na VPS

## Struktura

```
apps/api      backend FastAPI — cała logika biznesowa
apps/web      frontend Next.js — UI + cienki BFF do obsługi cookie z tokenem
apps/mobile   aplikacja React Native (faza 8)
infra         compose produkcyjny, Caddyfile, deploy
docs          architektura i roadmapa
```

## Uruchomienie lokalne

Jeszcze nic do uruchomienia — pierwszy działający kawałek powstaje w chunku 0.2
(Postgres w Dockerze) i 1.1 (API z endpointem `/health`).
Ta sekcja rośnie razem z kolejnymi chunkami.
