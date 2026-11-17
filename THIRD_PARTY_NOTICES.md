# Third-party notices

This file lists the material in this repository that was not created for
Irradia, with its source and licence. Everything else is covered by
[`LICENSE`](LICENSE).

Last checked: 17 November 2026.

## Fonts (SIL Open Font License 1.1)

The fonts are served by the app itself (no external font service). The files in
[`src/assets/fonts/`](src/assets/fonts) are unmodified copies of the files
published by [Fontsource](https://fontsource.org) on npm. Their SHA-256 hashes
match the files in package version 5.3.0 (also in earlier versions).

| File | Family | npm package | SHA-256 |
|---|---|---|---|
| `barlow-latin-400-normal.woff2` | Barlow | `@fontsource/barlow` 5.3.0 | `b0a8ad37ac45f5fb22ced461576db72e44e295107aad7a9c8a7a4bad728fd03b` |
| `barlow-latin-500-normal.woff2` | Barlow | `@fontsource/barlow` 5.3.0 | `cd759df8ef9efc98fee14307b4eb5ba27f08b1f8f2f3ad2872432e25c89907a8` |
| `barlow-latin-600-normal.woff2` | Barlow | `@fontsource/barlow` 5.3.0 | `4b52ddd4836b592df0e4832b8286956883cdc651b015126bdd18f184b7f90cc3` |
| `barlow-semi-condensed-latin-600-normal.woff2` | Barlow Semi Condensed | `@fontsource/barlow-semi-condensed` 5.3.0 | `f158417e9207b5362f9b71a2fe779ce5bb836ad972f38445c3163af39d2c998d` |
| `figtree-latin-wght-normal.woff2` | Figtree (variable) | `@fontsource-variable/figtree` 5.3.0 | `4ba7d3d096695818fe0686be4f1e82c6b05134e18a22260336130335027462dd` |

- **Barlow** and **Barlow Semi Condensed**: Copyright 2017 The Barlow Project
  Authors (https://github.com/jpt/barlow). Licence: [`licenses/OFL-Barlow.txt`](licenses/OFL-Barlow.txt).
- **Figtree**: Copyright 2022 The Figtree Project Authors
  (https://github.com/erikdkennedy/figtree). Licence: [`licenses/OFL-Figtree.txt`](licenses/OFL-Figtree.txt).

The licence texts are copied unchanged from the official Google Fonts
repository (`google/fonts`, files `ofl/barlow/OFL.txt` and `ofl/figtree/OFL.txt`,
branch `main`, retrieved on 17 November 2026). The Barlow Semi Condensed text
(`ofl/barlowsemicondensed/OFL.txt`) is byte-for-byte identical to the Barlow
one. None of these licences declares a Reserved Font Name.

## Skill `frontend-design` (Apache License 2.0)

[`.claude/skills/frontend-design/`](.claude/skills/frontend-design) is an
unmodified copy of the `frontend-design` skill from
[`anthropics/skills`](https://github.com/anthropics/skills) (commit `2c5958e`).
It is guidance text for an AI agent, not part of the app. Its licence is in
[`.claude/skills/frontend-design/LICENSE.txt`](.claude/skills/frontend-design/LICENSE.txt),
identical to the one published in the source repository. The source repository
has no `NOTICE` file. Its `THIRD_PARTY_NOTICES.md` covers only components of
other skills that are not copied here.

## PVGIS data

The JSON files in [`src/engine/__fixtures__/`](src/engine/__fixtures__) are
responses of the PVGIS 5.3 online service, saved so that the tests run offline.
At run time the app downloads the same kind of data for the location the user
chooses.

Source: **Photovoltaic Geographical Information System (PVGIS) of the
European Commission Joint Research Centre** —
https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis_en

PVGIS usage conditions (read on the official page on 17 November 2026):
"The information provided by PVGIS is free and there are no restrictions on its
use. We simply ask users to acknowledge the source as Photovoltaic Geographic
Information System (PVGIS) of the European Commission Joint Research Centre and
to cite the main link Photovoltaic Geographical Information System (PVGIS) -
Joint Research Centre." The same page states that PVGIS output does not
necessarily reflect the position of the European Commission, and that the
Commission is not responsible for the use made of it.

The responses state the databases PVGIS used: PVGIS-SARAH3 (solar radiation)
and ERA5 (temperature and wind).

Irradia is an independent project. It is not affiliated with or endorsed by
the European Commission or the JRC.

## OpenStreetMap

The map in the app loads tiles from the OpenStreetMap tile service at run
time and shows the attribution "© OpenStreetMap contributors" on the map. No
OpenStreetMap data or tiles are stored in this repository: the browser tests
use an image generated in code.

## npm dependencies

The npm packages (React, Leaflet, Vite and the development tools) are not
included in this repository. `npm install` downloads them, each under its own
licence. The ones that end up in the app are `react`, `react-dom` and
`scheduler` (MIT) and `leaflet` (BSD-2-Clause).

**For the public release (phase 6):** the production build currently drops the
licence comments of these libraries from the JavaScript files, so the published
app will need to ship their licence notices separately.
