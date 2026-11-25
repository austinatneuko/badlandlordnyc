export type ClassCounts = Partial<Record<"A" | "B" | "C" | "I", number>>

export interface Contact {
  type: string
  name: string
  title: string | null
  address: string | null
}

export interface Building {
  address?: string
  zip?: string
  yearBuilt?: string
  floors?: string
  pluto_owner?: string
  lat?: number | null
  lon?: number | null
  units: number
  open?: ClassCounts
  rentImpairing?: number
  v5?: ClassCounts
  vByYear?: Record<string, number>
  complaints3?: number
  heat3?: number
  sr311?: Record<string, number>
  litigation?: { total: number; open: number; harassment: number; types: Record<string, number> }
  evictions5?: number
  aep?: { start: string; status: string; discharged: string | null }
  contacts?: Contact[]
  registration?: { id: string; buildingId: string; expires: string; active: boolean }
  managers?: string[]
  portfolio?: string
  points: number
  score: number
  pct?: number
  hasRecord: boolean
}

export interface Portfolio {
  id: string
  kind: "owner" | "manager"
  name: string
  people: string[]
  companies: string[]
  bbls: string[]
  units: number
  buildings: number
  points: number
  score: number
  pct?: number
  openC: number
  evictions5: number
  harassment: number
  withRecords: number
}

export interface Meta {
  built: string
  borough: string
  buildingsWithRecords: number
  multifamilyBuildings: number
  portfolios: number
  managers: number
  sources: Record<string, string>
}

export type MapPoint = [lon: number, lat: number, bbl: string, pct: number, units: number]
export type NameEntry = [name: string, kind: "owner" | "person" | "company" | "manager", id: string, buildings: number]

const cache = new Map<string, Promise<unknown>>()

function load<T>(path: string): Promise<T> {
  let p = cache.get(path)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/${path}`).then((r) => {
      if (!r.ok) throw new Error(`${path}: ${r.status}`)
      return r.json()
    })
    p.catch(() => cache.delete(path))
    cache.set(path, p)
  }
  return p as Promise<T>
}

export const loadMeta = () => load<Meta>("meta.json")
export const loadMap = () => load<MapPoint[]>("map.json")
export const loadNames = () => load<NameEntry[]>("names.json")

export async function loadBuilding(bbl: string): Promise<Building | null> {
  try {
    const shard = await load<Record<string, Building>>(`b/${bbl.slice(1, 5)}.json`)
    return shard[bbl] ?? null
  } catch {
    return null
  }
}

export async function loadPortfolio(id: string): Promise<Portfolio | null> {
  const shard = await load<Record<string, Portfolio>>(`p/${id[0]}${Number(id.slice(1)) % 64}.json`)
  return shard[id] ?? null
}

export async function loadBuildings(bbls: string[]): Promise<Record<string, Building>> {
  const out: Record<string, Building> = {}
  await Promise.all(
    [...new Set(bbls.map((b) => b.slice(1, 5)))].map(async (s) => {
      try {
        const shard = await load<Record<string, Building>>(`b/${s}.json`)
        for (const b of bbls) if (shard[b]) out[b] = shard[b]
      } catch {
        /* shard missing means no records for those buildings */
      }
    }),
  )
  return out
}

export interface GeoHit {
  label: string
  bbl: string
  borough: string
  lon: number
  lat: number
}

export async function geosearch(text: string, signal?: AbortSignal): Promise<GeoHit[]> {
  const url = `https://geosearch.planninglabs.nyc/v2/autocomplete?text=${encodeURIComponent(text)}&focus.point.lat=40.65&focus.point.lon=-73.95`
  const r = await fetch(url, { signal })
  if (!r.ok) return []
  const j = await r.json()
  const hits: GeoHit[] = []
  for (const f of j.features ?? []) {
    const bbl = f.properties?.addendum?.pad?.bbl
    if (!bbl) continue
    hits.push({
      label: f.properties.label,
      bbl,
      borough: f.properties.borough,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    })
  }
  return hits
}

export interface LiveViolation {
  violationid: string
  class: string
  inspectiondate: string
  novdescription: string
  apartment?: string
  violationstatus: string
  currentstatus: string
}

export async function liveViolations(bbl: string, signal?: AbortSignal): Promise<LiveViolation[]> {
  const params = new URLSearchParams({
    $select: "violationid,class,inspectiondate,novdescription,apartment,violationstatus,currentstatus",
    $where: `bbl='${bbl.replace(/\D/g, "")}'`,
    $order: "inspectiondate DESC",
    $limit: "40",
  })
  const r = await fetch(`https://data.cityofnewyork.us/resource/wvxf-dwi5.json?${params}`, { signal })
  if (!r.ok) throw new Error(`violations ${r.status}`)
  return r.json()
}

export const tierOf = (pct: number | undefined, hasRecord: boolean) => {
  if (!hasRecord) return { key: "clean", label: "No records" }
  if (!pct) return { key: "low", label: "Records, nothing open" }
  if (pct >= 95) return { key: "worst", label: "Worst 5%" }
  if (pct >= 90) return { key: "bad", label: "Worst 10%" }
  if (pct >= 75) return { key: "poor", label: "Worse than most" }
  return { key: "fair", label: "Some open issues" }
}
