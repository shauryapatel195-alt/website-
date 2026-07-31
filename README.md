# STANFLEX — Interactive 3D Website

An interactive 3D product website for **STANFLEX** (Standard Precision Bellows,
Vadodara, India), manufacturer of multi-ply metallic bellows expansion joints.
Content, data tables and visual identity are taken from the STANFLEX Product
Catalogue, Edition 2026.

![Brand](https://img.shields.io/badge/style-dark%20%2B%20industrial%20orange-e25a22)

## Running it

The 3D code loads as ES modules, so the site must be served over HTTP
(opening `index.html` from the filesystem won't work in most browsers):

```bash
# any static server works, e.g.
python3 -m http.server 8080
# then open http://localhost:8080
```

No build step, no package manager, no network access required at runtime —
every dependency is vendored in this repository.

## What's inside

A multi-page static site — no build step, no framework:

| Path | Purpose |
| --- | --- |
| `index.html` | Home: 3D hero, brand pillars, stats, company excerpt, section teasers |
| `company.html` … `installation.html` | One page per catalogue section (company, engineering, 3D lab, configurations, standard range with beginner explainer, special joints, quality, installation) |
| `quote.html` | Enquiry form (replaces the old mailto link) — writes to Supabase when configured, demo mode otherwise |
| `admin.html` | Staff inbox: Supabase email sign-in, lists submitted enquiries |
| `js/config.js` | **Paste your Supabase URL + anon key here** (see `SETUP-SUPABASE.md`) |
| `js/enquiries.js` | Quote form + inbox client (plain fetch against Supabase REST/Auth, localStorage demo fallback) |
| `js/three-scene.js` | ES module. Procedural 3D: parametric corrugation profile → LatheGeometry bellows, four joint configurations, ply cutaway, movement drive |
| `js/main.js` | Shared UI: nav, GSAP reveals & counters, range-table rendering/filtering, 3D lab bindings — each block guards on its own page's elements |
| `js/data.js` | Full standard-range tables (6 & 10 kg/cm² series), support-spacing data, configuration copy |
| `tools/build-artifact.py` | Bundles the whole site into one self-contained HTML file (`dist/`) with a hash router — used for the claude.ai preview |
| `vendor/` | Three.js r160 (module build) + OrbitControls, GSAP 3.12 + ScrollTrigger |
| `assets/fonts/`, `assets/img/` | Self-hosted Poppins/Inter subsets, duotone bellows photograph |
| `SETUP-SUPABASE.md` | 10-minute walkthrough to make the enquiry database live |

## The 3D lab

The centrepiece is a fully procedural expansion-joint model — no downloaded
meshes. The bellows is a `LatheGeometry` built from a parametric corrugation
profile (the same `d / h / p` parameters described on the catalogue's
engineering page), so the controls are true model inputs:

- **Configuration** — axial, universal, lateral (tie-rod), angular (hinged)
- **End fittings** — flanged (with bolt circle) or weld ends
- **Convolutions** — 6–18, regenerates the profile live
- **Plies + section cut** — a clipping plane opens the wall to show the
  multi-ply build-up (outer steel, tinted mid ply, inner ply)
- **Movement drive** — axial travel opens/closes the convolutions; lateral
  offset shears each bellows into the real cosine-eased S-shape; angulation
  bends the element in a smooth arc about the hinge axis. A "cycle" mode
  runs the movement continuously.

## Performance

- Pixel ratio clamped to 2; scenes render **only while their canvas is on
  screen** (IntersectionObserver) and the tab is visible.
- Axial travel uses a scale transform (no vertex writes); lateral/angular
  deformation rewrites the position buffer in place with no per-frame
  allocations, then recomputes normals.
- Geometries are disposed on every rebuild; lighting is three analytic
  lights plus a tiny PMREM environment generated from a canvas (no HDR
  downloads).
- `prefers-reduced-motion` disables auto-rotation, breathing and scroll
  animations; the site is fully readable with JavaScript disabled.

## Content notice

All dimensions, movements and ratings shown are indicative and subject to
change without notice — confirm specifications with Standard Precision
Bellows at the time of enquiry or order.
