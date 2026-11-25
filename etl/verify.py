"""Checks the built data against outside sources.

Usage: python3 etl/verify.py   (needs network access to NYC Open Data,
       Who Owns What and the Public Advocate's Landlord Watchlist)
Writes etl/verify-report.md and exits non-zero if a check fails.

1. Open violations: 20 random Brooklyn buildings. Our count vs a live count from
   HPD's violation data right now, and vs JustFix Who Owns What.
2. Portfolios: 10 random owners with 10+ buildings. Our Brooklyn building count vs
   Who Owns What's Brooklyn count for the same portfolio. Pass: 8 of 10 within 10%.
3. Watchlist: 15 Brooklyn buildings from the Public Advocate's Worst Landlords
   Watchlist. Pass: 13 of 15 rank in our worst 10%.
"""

import glob
import json
import random
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "web" / "public" / "data"
RNG = random.Random(20261124)


def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            err = e
            time.sleep(2 * (i + 1))
    raise err


B, P = {}, {}
for f in glob.glob(str(DATA / "b" / "*.json")):
    B.update(json.load(open(f)))
for f in glob.glob(str(DATA / "p" / "*.json")):
    P.update(json.load(open(f)))

out = ["# Accuracy checks", ""]
ok_all = True


def wow(bbl):
    q = urllib.parse.urlencode({"borough": bbl[0], "block": bbl[1:6], "lot": bbl[6:]})
    return get(f"https://wow-django.herokuapp.com/api/address?{q}").get("addrs", [])


# 1. open violations
cand = sorted(b for b, d in B.items() if d.get("registration") and sum(d.get("open", {}).values()) > 0)
sample = RNG.sample(cand, 20)
out += ["## 1. Open HPD violations, 20 random buildings", "",
        "| BBL | Address | Ours | HPD data live | Who Owns What |", "|---|---|---|---|---|"]
live_match = 0
for bbl in sample:
    ours = sum(B[bbl].get("open", {}).values())
    q = urllib.parse.urlencode({"$select": "count(*)", "$where": f"bbl='{bbl}' AND violationstatus='Open'"})
    live = int(get(f"https://data.cityofnewyork.us/resource/wvxf-dwi5.json?{q}")[0]["count"])
    try:
        w = next((a.get("openviolations") for a in wow(bbl) if a.get("bbl") == bbl), None)
    except Exception:  # noqa: BLE001
        w = "error"
    live_match += ours == live
    out.append(f"| {bbl} | {B[bbl].get('address', '')} | {ours} | {live} | {w} |")
    time.sleep(1)
p1 = live_match >= 19
out += ["", f"Matches the live HPD count: **{live_match}/20** ({'PASS' if p1 else 'FAIL'}). "
        "Who Owns What refreshes on its own schedule, so small gaps there are refresh lag.", ""]
ok_all &= p1

# 2. portfolios
# Sample by building, not portfolio id, so the sample doesn't shift when grouping rules change.
pool = sorted(b for b, d in B.items() if d.get("portfolio") and P[d["portfolio"]]["buildings"] >= 10 and d["units"] >= 3)
sample = []
for b in RNG.sample(pool, 200):
    pid = B[b]["portfolio"]
    if pid not in sample:
        sample.append(pid)
    if len(sample) == 10:
        break
out += ["## 2. Owner portfolios vs Who Owns What (Brooklyn buildings only)", "",
        "| Owner | Ours | Who Owns What | Diff | Pass |", "|---|---|---|---|---|"]
good = 0
for pid in sample:
    p = P[pid]
    try:
        addrs = wow(p["bbls"][0])  # any building in the portfolio returns the same WoW portfolio
        theirs = len({a["bbl"] for a in addrs if str(a.get("bbl", "")).startswith("3")})
    except Exception:  # noqa: BLE001
        theirs = 0
    diff = abs(p["buildings"] - theirs) / max(theirs, 1)
    passed = theirs > 0 and diff <= 0.10
    good += passed
    out.append(f"| {p['name']} | {p['buildings']} | {theirs} | {diff:.0%} | {'yes' if passed else 'no'} |")
    time.sleep(1)
p2 = good >= 8
out += ["", f"Within 10%: **{good}/10** ({'PASS' if p2 else 'FAIL'})", ""]
ok_all &= p2

# 3. watchlist
bid_to_bbl = {d["registration"]["buildingId"]: b for b, d in B.items() if d.get("registration")}
top10 = get("https://www.landlordwatchlist.com/api/brooklyn")["results"]
allb = [r for r in get("https://www.landlordwatchlist.com/api/buildings")["results"] if r["Boro"] == "BROOKLYN"]
seen, picks = set(), []
for r in top10 + sorted(allb, key=lambda r: -int(r["num_avg"])):
    k = str(r["BuildingID"])
    if k not in seen:
        seen.add(k)
        picks.append(r)
    if len(picks) == 15:
        break
out += ["## 3. Public Advocate Worst Landlords Watchlist, 15 Brooklyn buildings", "",
        "| Address | Watchlist avg open violations | Our percentile | Worst 10%? |", "|---|---|---|---|"]
hits = 0
for r in picks:
    bbl = bid_to_bbl.get(str(r["BuildingID"]))
    pct = B.get(bbl, {}).get("pct") if bbl else None
    hit = pct is not None and pct >= 90
    hits += hit
    out.append(f"| {r['HouseNumber']} {r['StreetName'].title()} | {r['num_avg']} | {pct if pct is not None else 'not found'} | {'yes' if hit else 'no'} |")
p3 = hits >= 13
out += ["", f"In our worst 10%: **{hits}/15** ({'PASS' if p3 else 'FAIL'})", ""]
ok_all &= p3

(ROOT / "etl" / "verify-report.md").write_text("\n".join(out))
print("\n".join(out))
sys.exit(0 if ok_all else 1)
