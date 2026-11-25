// Downloads the raw Brooklyn datasets from NYC Open Data (Socrata) as CSV.
// Usage: node etl/fetch.mjs [name ...]   (no args = all)
// Output: data/raw/<name>.csv
import { createWriteStream, mkdirSync, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const BASE = "https://data.cityofnewyork.us/resource";
const OUT = new URL("../data/raw/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const now = new Date();
const yearsAgo = (n) => {
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
};
const SINCE3 = yearsAgo(3);
const SINCE5 = yearsAgo(5);

// Each job: dataset id, columns, filter. Kept narrow so downloads stay small.
export const JOBS = {
  pluto: {
    id: "64uk-42ks",
    select: "bbl,address,zipcode,unitsres,unitstotal,ownername,bldgclass,yearbuilt,numfloors,latitude,longitude",
    where: "borough='BK' AND unitsres > 0",
  },
  violations_open: {
    id: "wvxf-dwi5",
    select: "violationid,bbl,class,inspectiondate,novdescription,rentimpairing",
    where: "boroid='3' AND violationstatus='Open'",
  },
  violations_recent: {
    id: "wvxf-dwi5",
    select: "violationid,bbl,class,inspectiondate,violationstatus",
    where: `boroid='3' AND inspectiondate >= '${SINCE5}'`,
  },
  complaints: {
    id: "ygpa-z7cr",
    select: "complaint_id,problem_id,bbl,received_date,major_category,type",
    where: `borough='BROOKLYN' AND received_date >= '${SINCE3}'`,
  },
  sr311: {
    id: "erm2-nwe9",
    select: "unique_key,bbl,created_date,complaint_type,agency",
    // HPD complaints arrive via 311 too, so they are skipped here to avoid double counting.
    where: `borough='BROOKLYN' AND created_date >= '${SINCE3}' AND agency != 'HPD' AND complaint_type in ('Rodent','Noise - Residential','Building/Use','Elevator','Indoor Air Quality','Lead','Mold','Unsanitary Animal Pvt Property','Non-Residential Heat','General Construction/Plumbing')`,
  },
  litigation: {
    id: "59kj-x8nc",
    select: "litigationid,bbl,casetype,caseopendate,casestatus,casejudgement,findingofharassment,respondent",
    where: "boroid='3'",
  },
  evictions: {
    id: "6z8x-wfk4",
    select: "court_index_number,bbl,executed_date,residential_commercial_ind",
    where: `borough='BROOKLYN' AND executed_date >= '${SINCE5}'`,
  },
  aep: {
    id: "hcir-3275",
    select: "building_id,bbl,aep_start_date,current_status,discharge_date,total_units",
    where: "boro='Brooklyn'",
  },
  registrations: {
    id: "tesw-yqqr",
    select: "registrationid,buildingid,bin,boroid,block,lot,housenumber,streetname,zip,lastregistrationdate,registrationenddate",
    where: "boroid='3'",
  },
  contacts: {
    id: "feu5-w2e2",
    select: "registrationcontactid,registrationid,type,contactdescription,corporationname,title,firstname,middleinitial,lastname,businesshousenumber,businessstreetname,businessapartment,businesscity,businessstate,businesszip",
    where: null,
  },
};

async function run(name) {
  const job = JOBS[name];
  const params = new URLSearchParams({ $select: job.select, $limit: "5000000" });
  if (job.where) params.set("$where", job.where);
  const url = `${BASE}/${job.id}.csv?${params}`;
  const dest = new URL(`${name}.csv`, OUT);
  const t = Date.now();
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
      const mb = (statSync(dest).size / 1e6).toFixed(1);
      console.log(`${name}: ${mb} MB in ${((Date.now() - t) / 1000).toFixed(0)}s`);
      return;
    } catch (e) {
      console.error(`${name} attempt ${attempt} failed: ${e.message.slice(0, 200)}`);
    }
  }
  throw new Error(`${name} failed`);
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(JOBS);
await Promise.all(names.map(run));
