"""Turns data/raw/*.csv into the static files the web app reads.

Usage: python3 etl/build.py
Output: web/public/data/
  map.json          points for every building with any record against it
  b/<shard>.json    building reports, keyed by BBL (shard = BBL digits 2-5)
  p/<shard>.json    portfolios (owners) and management companies
  names.json        search index of owner, company and manager names
  meta.json         build date, counts, score cutoffs
"""

import json
import re
import shutil
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "web" / "public" / "data"
TODAY = pd.Timestamp(date.today())
WEIGHT = {"A": 1, "B": 2, "C": 3}
OWNER_TYPES = {"HeadOfficer", "IndividualOwner", "CorporateOwner", "JointOwner", "Officer", "Shareholder"}
PERSON_LINK_TYPES = {"HeadOfficer", "IndividualOwner", "JointOwner"}
AGENT_TYPES = {"Agent"}


def read(name, **kw):
    return pd.read_csv(RAW / f"{name}.csv", dtype=str, keep_default_na=False, **kw)


def norm_bbl(s):
    s = s.astype(str).str.split(".").str[0].str.strip()
    return s.where(s.str.fullmatch(r"\d{10}"), "")


def clean(s):
    s = re.sub(r"['`\.\x1a]", "", (s or "").upper())
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


STREET_ABBR = {"STREET": "ST", "STRRET": "ST", "AVENUE": "AVE", "AV": "AVE", "ROAD": "RD", "PLACE": "PL",
               "BOULEVARD": "BLVD", "PARKWAY": "PKWY", "DRIVE": "DR", "LANE": "LN", "COURT": "CT",
               "EAST": "E", "WEST": "W", "NORTH": "N", "SOUTH": "S", "SUITE": "", "STE": "", "FLOOR": "", "FL": ""}


def street_key(s):
    s = re.sub(r"\b(\d+)(ST|ND|RD|TH)(?=\b|[A-Z])", r"\1 ", clean(s))
    return " ".join(STREET_ABBR.get(w, w) for w in s.split() if STREET_ABBR.get(w, w))


CORP_SUFFIX = re.compile(r"\b(LLC|L L C|INC|CORP|CORPORATION|CO|LP|LTD|COMPANY|THE)\b")


def corp_key(s):
    return re.sub(r"\s+", "", CORP_SUFFIX.sub(" ", clean(s).replace("&", " ")))


def year(s):
    return pd.to_datetime(s, errors="coerce").dt.year


print("pluto")
pluto = read("pluto")
pluto["bbl"] = norm_bbl(pluto["bbl"])
pluto = pluto[pluto.bbl != ""].drop_duplicates("bbl").set_index("bbl")
units = pd.to_numeric(pluto.unitsres, errors="coerce").fillna(0).astype(int)

B = defaultdict(dict)  # bbl -> report fields

print("violations")
vo = read("violations_open")
vo["bbl"] = norm_bbl(vo.bbl)
vo = vo[vo.bbl != ""]
for (bbl, cls), n in vo.groupby(["bbl", "class"]).size().items():
    B[bbl].setdefault("open", {})[cls] = int(n)
for bbl, n in vo[vo.rentimpairing == "Y"].groupby("bbl").size().items():
    B[bbl]["rentImpairing"] = int(n)

vr = read("violations_recent")
vr["bbl"] = norm_bbl(vr.bbl)
vr = vr[vr.bbl != ""]
vr["y"] = year(vr.inspectiondate)
for (bbl, cls), n in vr.groupby(["bbl", "class"]).size().items():
    B[bbl].setdefault("v5", {})[cls] = int(n)
for (bbl, y), n in vr.groupby(["bbl", "y"]).size().items():
    B[bbl].setdefault("vByYear", {})[str(int(y))] = int(n)

print("complaints")
hc = read("complaints")
hc["bbl"] = norm_bbl(hc.bbl)
hc = hc[hc.bbl != ""]
for bbl, n in hc.groupby("bbl").complaint_id.nunique().items():
    B[bbl]["complaints3"] = int(n)
heat = hc[hc.major_category == "HEAT/HOT WATER"]
for bbl, n in heat.groupby("bbl").complaint_id.nunique().items():
    B[bbl]["heat3"] = int(n)

print("311")
sr = read("sr311")
sr["bbl"] = norm_bbl(sr.bbl)
sr = sr[sr.bbl != ""]
for (bbl, t), n in sr.groupby(["bbl", "complaint_type"]).size().items():
    B[bbl].setdefault("sr311", {})[t] = int(n)

print("litigation")
lit = read("litigation")
lit["bbl"] = norm_bbl(lit.bbl)
lit = lit[lit.bbl != ""]
for bbl, g in lit.groupby("bbl"):
    B[bbl]["litigation"] = {
        "total": len(g),
        "open": int((g.casestatus == "OPEN").sum()),
        "harassment": int(g.findingofharassment.str.upper().str.contains("AFTER").sum() + (g.findingofharassment.str.upper() == "YES").sum()),
        "types": {k: int(v) for k, v in g.casetype.value_counts().items()},
    }

print("evictions")
ev = read("evictions")
ev["bbl"] = norm_bbl(ev.bbl)
ev = ev[(ev.bbl != "") & (ev.residential_commercial_ind.str.lower() == "residential")]
for bbl, n in ev.groupby("bbl").size().items():
    B[bbl]["evictions5"] = int(n)

print("aep")
aep = read("aep")
aep["bbl"] = norm_bbl(aep.bbl)
for _, r in aep[aep.bbl != ""].iterrows():
    B[r.bbl]["aep"] = {"start": r.aep_start_date[:10], "status": r.current_status, "discharged": r.discharge_date[:10] or None}

print("registrations + contacts")
reg = read("registrations")
reg["bbl"] = "3" + reg.block.str.zfill(5) + reg.lot.str.zfill(4)
reg["end"] = pd.to_datetime(reg.registrationenddate, errors="coerce")
reg = reg.sort_values("lastregistrationdate").drop_duplicates("bbl", keep="last")
reg["active"] = reg.end >= TODAY
regid_to_bbl = dict(zip(reg.registrationid, reg.bbl))

con = read("contacts")
con = con[con.registrationid.isin(regid_to_bbl)]
con["bbl"] = con.registrationid.map(regid_to_bbl)
con["person"] = (con.firstname.map(clean) + " " + con.lastname.map(clean)).str.strip()
con["corp"] = con.corporationname.map(clean)
con["addr"] = (con.businesshousenumber.map(clean) + " " + con.businessstreetname.map(street_key) + " " + con.businesszip.str[:5]).str.strip()

for bbl, g in con.groupby("bbl"):
    contacts = []
    for _, r in g.iterrows():
        name = r.corp if r.type == "CorporateOwner" or (r.corp and not r.person) else r.person.title()
        contacts.append({"type": r.type, "name": name, "title": r.title or None, "address": r.addr.title() or None})
    B[bbl]["contacts"] = contacts
for _, r in reg.iterrows():
    B[r.bbl]["registration"] = {"id": r.registrationid, "buildingId": r.buildingid, "expires": r.registrationenddate[:10], "active": bool(r.active)}

# Portfolios: registrations are linked when an owner-side person shares a name,
# or a corporate owner shares a name. Business addresses are linked only if the
# address is shared by few distinct owner names, which skips law offices and
# registration agents that front for hundreds of unrelated owners.
print("portfolios")
parent = {}


def find(x):
    while parent.setdefault(x, x) != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x


def union(a, b):
    ra, rb = find(a), find(b)
    if ra != rb:
        parent[ra] = rb


owners = con[con.type.isin(OWNER_TYPES)]
for bbl in con.bbl.unique():
    find(bbl)
link_keys = []
# A person links two buildings only when the same name appears with the same
# business address on both, so two different people named Mohammed Rahman stay
# apart. Managing agents don't link owners: one agent often serves many unrelated
# owners. This follows JustFix Who Owns What.
linkers = con[con.type.isin(OWNER_TYPES) & (con.person.str.count(" ") >= 1) & (con.addr.str.len() > 8)]
link_keys.append(("pa:" + linkers.person + "|" + linkers.addr, linkers.bbl))
# Company names link at the same business address, including managing-agent
# companies, the way Who Owns What groups buildings run by one operator.
cc = con[con.type.isin(OWNER_TYPES | AGENT_TYPES) & (con.corp != "") & (con.addr.str.len() > 8)]
link_keys.append(("ca:" + cc.corp.map(corp_key) + "|" + cc.addr, cc.bbl))
for keys, bbls in link_keys:
    first = {}
    for k, b in zip(keys, bbls):
        if k in first:
            union(first[k], b)
        else:
            first[k] = b

groups = defaultdict(list)
for bbl in parent:
    groups[find(bbl)].append(bbl)

# Name each portfolio after its most common head officer / owner.
portfolio_of = {}
portfolios = {}
for pid_n, (root, bbls) in enumerate(sorted(groups.items(), key=lambda kv: -len(kv[1]))):
    pid = f"p{pid_n}"
    g = owners[owners.bbl.isin(bbls)]
    people = g[g.type.isin(PERSON_LINK_TYPES) & (g.person != "")].person.value_counts()
    corps = g[g.corp != ""].corp.value_counts()
    label = people.index[0].title() if len(people) else (corps.index[0] if len(corps) else "Unknown owner")
    for b in bbls:
        portfolio_of[b] = pid
    portfolios[pid] = {
        "id": pid,
        "kind": "owner",
        "name": label,
        "people": [p.title() for p in people.index[:8]],
        "companies": list(corps.index[:12]),
        "bbls": sorted(bbls),
    }

print("management companies")
ag = con[con.type.isin(AGENT_TYPES) & (con.corp != "")]
for i, (key, g) in enumerate(ag.groupby(ag.corp.map(corp_key))):
    if not key:
        continue
    mid = f"m{i}"
    bbls = sorted(g.bbl.unique())
    portfolios[mid] = {"id": mid, "kind": "manager", "name": g.corp.value_counts().index[0], "people": [], "companies": [], "bbls": bbls}
    for b in bbls:
        B[b].setdefault("managers", []).append(mid)

print("scores")
for bbl, d in B.items():
    u = int(units.get(bbl, 0))
    d["units"] = u
    if bbl in pluto.index:
        p = pluto.loc[bbl]
        d["address"] = p.address.title()
        d["zip"] = p.zipcode
        d["yearBuilt"] = p.yearbuilt
        d["floors"] = p.numfloors.split(".")[0]
        d["pluto_owner"] = p.ownername
        d["lat"] = float(p.latitude) if p.latitude else None
        d["lon"] = float(p.longitude) if p.longitude else None
    o = d.get("open", {})
    d["points"] = sum(WEIGHT.get(k, 0) * v for k, v in o.items())
    d["score"] = round(d["points"] / max(u, 1), 3)
    if bbl in portfolio_of:
        d["portfolio"] = portfolio_of[bbl]

# A record is anything a renter would want to know about. Registration and
# contacts alone are not records against a building.
RECORD_KEYS = ["open", "v5", "complaints3", "sr311", "litigation", "evictions5", "aep"]
has_record = {b for b, d in B.items() if any(d.get(k) for k in RECORD_KEYS)}

# Percentile among Brooklyn buildings with 3+ units (the ones HPD requires to register).
mf = pd.Series({b: d["score"] for b, d in B.items() if d["units"] >= 3 and b in pluto.index})
mf_all = pd.concat([mf, pd.Series(0.0, index=[b for b in pluto.index[units >= 3] if b not in mf.index])])
ranks = mf_all.rank(pct=True, method="max")
for b, d in B.items():
    if b in ranks.index and d["score"] > 0:
        d["pct"] = round(float(ranks[b]) * 100, 1)

for pid, p in portfolios.items():
    pts = sum(B[b].get("points", 0) for b in p["bbls"])
    u = sum(B[b].get("units", 0) for b in p["bbls"])
    p["units"] = u
    p["buildings"] = len(p["bbls"])
    p["points"] = pts
    p["score"] = round(pts / max(u, 1), 3)
    p["openC"] = sum(B[b].get("open", {}).get("C", 0) for b in p["bbls"])
    p["evictions5"] = sum(B[b].get("evictions5", 0) for b in p["bbls"])
    p["harassment"] = sum(B[b].get("litigation", {}).get("harassment", 0) for b in p["bbls"])
    p["withRecords"] = sum(1 for b in p["bbls"] if b in has_record)
owner_multi = pd.Series({pid: p["score"] for pid, p in portfolios.items() if p["kind"] == "owner" and p["buildings"] >= 2})
prank = owner_multi.rank(pct=True, method="max")
for pid, v in prank.items():
    if portfolios[pid]["score"] > 0:
        portfolios[pid]["pct"] = round(float(v) * 100, 1)

print("write")
if OUT.exists():
    shutil.rmtree(OUT)
(OUT / "b").mkdir(parents=True)
(OUT / "p").mkdir(parents=True)


def dump(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"))


shards = defaultdict(dict)
for b, d in B.items():
    if b in has_record or "portfolio" in d or "registration" in d:
        d["hasRecord"] = b in has_record
        shards[b[1:5]][b] = d
for k, v in shards.items():
    dump(OUT / "b" / f"{k}.json", v)

pshards = defaultdict(dict)
for pid, p in portfolios.items():
    pshards[pid[0] + str(int(pid[1:]) % 64)][pid] = p
for k, v in pshards.items():
    dump(OUT / "p" / f"{k}.json", v)

points = []
for b in has_record:
    d = B[b]
    if d.get("lat") and d.get("lon"):
        points.append([round(d["lon"], 5), round(d["lat"], 5), b, d.get("pct", 0), d["units"]])
dump(OUT / "map.json", points)

# Zones: a square grid over Brooklyn, each cell shaded by open-violation points per
# apartment across every 3+ unit building in it (clean buildings count too).
# Cells are about 380m on a side, roughly three or four city blocks.
ZONE_DLAT, ZONE_DLON, ZONE_LAT0, ZONE_LON0 = 0.0034, 0.0045, 40.55, -74.06
cells = defaultdict(lambda: [0.0, 0, 0, 0])  # points, units, buildings, worst-5% buildings
for b in pluto.index[units >= 3]:
    p = pluto.loc[b]
    if not p.latitude or not p.longitude:
        continue
    k = (int((float(p.longitude) - ZONE_LON0) / ZONE_DLON), int((float(p.latitude) - ZONE_LAT0) / ZONE_DLAT))
    c = cells[k]
    d = B.get(b, {})
    c[0] += d.get("points", 0)
    c[1] += int(units[b])
    c[2] += 1
    c[3] += d.get("pct", 0) >= 95
zs = pd.Series({k: c[0] / c[1] for k, c in cells.items() if c[1] >= 30})
zr = zs.rank(pct=True, method="max")
zones = [[k[0], k[1], round(float(zr[k]) * 100, 1) if zs[k] > 0 else 0, cells[k][1], cells[k][2], cells[k][3]] for k in zs.index]
dump(OUT / "zones.json", {"lon0": ZONE_LON0, "lat0": ZONE_LAT0, "dlon": ZONE_DLON, "dlat": ZONE_DLAT, "cells": zones})

names = []
for pid, p in portfolios.items():
    if p["kind"] == "manager":
        names.append([p["name"], "manager", pid, p["buildings"]])
        continue
    names.append([p["name"], "owner", pid, p["buildings"]])
    for n in p["people"][1:]:
        names.append([n, "person", pid, p["buildings"]])
    for n in p["companies"]:
        names.append([n, "company", pid, p["buildings"]])
dump(OUT / "names.json", names)

dump(OUT / "meta.json", {
    "built": datetime.now().isoformat(timespec="minutes"),
    "borough": "Brooklyn",
    "buildingsWithRecords": len(has_record),
    "multifamilyBuildings": int(len(mf_all)),
    "portfolios": sum(1 for p in portfolios.values() if p["kind"] == "owner"),
    "managers": sum(1 for p in portfolios.values() if p["kind"] == "manager"),
    "sources": {
        "violations": "HPD Housing Maintenance Code Violations (wvxf-dwi5)",
        "complaints": "HPD Complaints and Problems (ygpa-z7cr)",
        "sr311": "311 Service Requests (erm2-nwe9), non-HPD building complaints",
        "litigation": "HPD Housing Litigations (59kj-x8nc)",
        "evictions": "Marshal Evictions (6z8x-wfk4)",
        "aep": "HPD Alternative Enforcement Program (hcir-3275)",
        "registrations": "HPD Multiple Dwelling Registrations + Contacts (tesw-yqqr, feu5-w2e2)",
        "pluto": "DCP PLUTO (64uk-42ks)",
    },
})
print(f"done: {len(has_record)} buildings with records, {len(points)} on map, {len(portfolios)} portfolios+managers")
