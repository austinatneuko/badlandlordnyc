# Bad Landlord NYC

A CARFAX-style report for NYC apartments. Search an address, landlord, or management company and see what public records say: open HPD violations by severity, HPD and 311 complaints, housing court cases and harassment findings, marshal evictions, and every other building the same owner controls.

Brooklyn only for now.

## How it works

```
etl/fetch.mjs   downloads Brooklyn data from NYC Open Data (Socrata) into data/raw/
etl/build.py    joins it on BBL, groups owners into portfolios, scores buildings,
                writes static JSON to web/public/data/
etl/verify.py   checks the output against outside sources, writes etl/verify-report.md
web/            Vite + React app (MapLibre map, UI SDK search box), fully static
```

The site is static: every building report is a small JSON shard plus a live call to NYC Open Data for the latest violations. A GitHub Action refreshes the data nightly and deploys to GitHub Pages.

### Data sources

| What | Dataset |
|---|---|
| HPD violations (open, and last 5 years) | `wvxf-dwi5` |
| HPD complaints (last 3 years) | `ygpa-z7cr` |
| 311 complaints outside HPD: rodents, noise, elevators, mold, lead (last 3 years) | `erm2-nwe9` |
| Housing court cases and harassment findings | `59kj-x8nc` |
| Marshal evictions (last 5 years) | `6z8x-wfk4` |
| Alternative Enforcement Program | `hcir-3275` |
| Owner and manager registrations | `tesw-yqqr`, `feu5-w2e2` |
| Units, address, location | PLUTO `64uk-42ks` |

### Ranking

Open HPD violations count 1 point (class A), 2 (class B) or 3 (class C, immediately hazardous). Points are divided by the number of apartments and ranked against every Brooklyn building with 3+ apartments. Portfolios are ranked the same way against Brooklyn owners with 2+ buildings.

### Portfolios

Many owners use one LLC per building. Buildings are linked when their HPD registrations share an owner-side person (head officer, individual or joint owner), a corporate owner name, or a business address. Addresses shared by more than 6 different owner names are not used as links, which keeps law offices and registration agents from merging unrelated owners.

## Run it

```bash
node etl/fetch.mjs          # ~5 min, ~700 MB of CSV
pip install pandas
python3 etl/build.py        # ~4 min
python3 etl/verify.py       # optional, needs network
cd web && npm install && npm run dev
```

## Accuracy checks

`etl/verify.py` runs three checks and writes [`etl/verify-report.md`](etl/verify-report.md):

1. Open violation counts for 20 random buildings match a live query of HPD's data (and Who Owns What).
2. Portfolio sizes for 10 random owners are within 10% of JustFix Who Owns What on at least 8.
3. At least 13 of 15 Brooklyn buildings on the Public Advocate's Worst Landlords Watchlist rank in our worst 10%.
