import { useEffect, useState } from "react"
import {
  liveViolations,
  loadBuilding,
  loadPortfolio,
  tierOf,
  type Building,
  type LiveViolation,
  type Portfolio,
} from "./data"

const BORO: Record<string, string> = { "1": "Manhattan", "2": "Bronx", "3": "Brooklyn", "4": "Queens", "5": "Staten Island" }

export function BuildingReport({ bbl }: { bbl: string }) {
  const [b, setB] = useState<Building | null | undefined>(undefined)
  const [owner, setOwner] = useState<Portfolio | null>(null)
  const [managers, setManagers] = useState<Portfolio[]>([])

  useEffect(() => {
    loadBuilding(bbl).then(async (d) => {
      setB(d)
      if (d?.portfolio) loadPortfolio(d.portfolio).then(setOwner)
      if (d?.managers) Promise.all(d.managers.map(loadPortfolio)).then((m) => setManagers(m.filter(Boolean) as Portfolio[]))
    })
  }, [bbl])

  if (bbl[0] !== "3") {
    return (
      <main className="report">
        <p className="eyebrow">BBL {bbl}</p>
        <h1>{BORO[bbl[0]] ?? "This borough"} isn't covered yet</h1>
        <p>We're starting with Brooklyn. Other boroughs are next.</p>
      </main>
    )
  }
  if (b === undefined) return <main className="report"><p className="loading">Loading report…</p></main>

  if (!b || !b.hasRecord) {
    return (
      <main className="report">
        <p className="eyebrow">Brooklyn · BBL {bbl}</p>
        <h1>{b?.address ?? "This building"}</h1>
        <div className="verdict" data-tier="clean">
          <strong>Clean record</strong>
          <span>
            Nothing on file: no HPD violations in the last 5 years, no open violations, no HPD or 311 complaints in
            the last 3 years, no housing court cases, and no marshal evictions in the last 5 years.
          </span>
        </div>
        {b && <OwnerBlock b={b} owner={owner} managers={managers} />}
      </main>
    )
  }

  const tier = tierOf(b.pct, b.hasRecord)
  const open = b.open ?? {}
  const openTotal = (open.A ?? 0) + (open.B ?? 0) + (open.C ?? 0) + (open.I ?? 0)
  const hpdLink = b.registration?.buildingId
    ? `https://hpdonline.nyc.gov/hpdonline/building/${b.registration.buildingId}`
    : `https://hpdonline.nyc.gov/hpdonline/`

  return (
    <main className="report">
      <p className="eyebrow">
        Brooklyn {b.zip} · BBL {bbl} · {b.units} apartment{b.units === 1 ? "" : "s"}
        {b.yearBuilt && b.yearBuilt !== "0" ? ` · built ${b.yearBuilt}` : ""}
      </p>
      <h1>{b.address}</h1>

      <div className="verdict" data-tier={tier.key}>
        <strong>{tier.label}</strong>
        <span>
          {b.pct
            ? `More open problems per apartment than ${Math.floor(b.pct)}% of Brooklyn buildings with 3+ apartments.`
            : "This building has a history on file but no open HPD violations right now."}
        </span>
      </div>

      {b.aep && (
        <p className="flag">
          ⚠ In HPD's Alternative Enforcement Program since {b.aep.start} ({b.aep.status.toLowerCase()}). The city
          puts the most neglected buildings in this program.
        </p>
      )}

      <section className="facts" aria-label="Summary">
        <Fact n={openTotal} label="Open HPD violations" sub={open.C ? `${open.C} immediately hazardous` : undefined} hot={!!open.C} />
        <Fact n={b.complaints3 ?? 0} label="HPD complaints, last 3 yrs" sub={b.heat3 ? `${b.heat3} about heat or hot water` : undefined} hot={(b.heat3 ?? 0) >= 5} />
        <Fact n={sum(b.sr311)} label="Other 311 complaints, last 3 yrs" sub={top(b.sr311)} />
        <Fact n={b.litigation?.total ?? 0} label="Housing court cases" sub={b.litigation?.harassment ? `${b.litigation.harassment} harassment finding${b.litigation.harassment > 1 ? "s" : ""}` : b.litigation?.open ? `${b.litigation.open} open` : undefined} hot={!!b.litigation?.harassment} />
        <Fact n={b.evictions5 ?? 0} label="Evictions, last 5 yrs" hot={(b.evictions5 ?? 0) >= 3} />
      </section>

      <section className="panel">
        <h2>Open violations by severity</h2>
        <SeverityBar open={open} />
        {b.rentImpairing ? <p className="note">{b.rentImpairing} are "rent impairing", serious enough that tenants may be able to withhold rent.</p> : null}
      </section>

      {b.vByYear && (
        <section className="panel">
          <h2>Violations issued per year</h2>
          <YearBars data={b.vByYear} />
        </section>
      )}

      <LiveList bbl={bbl} />

      <OwnerBlock b={b} owner={owner} managers={managers} />

      <section className="panel sources">
        <h2>Check the source</h2>
        <ul>
          <li><a href={hpdLink} target="_blank" rel="noreferrer">HPD Online building page</a></li>
          <li><a href={`https://whoownswhat.justfix.org/bbl/${bbl}`} target="_blank" rel="noreferrer">JustFix Who Owns What</a></li>
          <li><a href={`https://a810-bisweb.nyc.gov/bisweb/PropertyProfileOverviewServlet?boro=3&block=${Number(bbl.slice(1, 6))}&lot=${Number(bbl.slice(6))}`} target="_blank" rel="noreferrer">DOB Building Information</a></li>
          <li><a href={`https://a836-acris.nyc.gov/bblsearch/bblsearch.asp?borough=3&block=${Number(bbl.slice(1, 6))}&lot=${Number(bbl.slice(6))}`} target="_blank" rel="noreferrer">ACRIS sale and deed records</a></li>
        </ul>
      </section>
    </main>
  )
}

function sum(r?: Record<string, number>) {
  return r ? Object.values(r).reduce((a, b) => a + b, 0) : 0
}
function top(r?: Record<string, number>) {
  if (!r) return undefined
  const [k, v] = Object.entries(r).sort((a, b) => b[1] - a[1])[0]
  return `most: ${k.toLowerCase()} (${v})`
}

function Fact({ n, label, sub, hot }: { n: number; label: string; sub?: string; hot?: boolean }) {
  return (
    <div className="fact" data-hot={hot || undefined} data-zero={n === 0 || undefined}>
      <span className="fact-n">{n.toLocaleString()}</span>
      <span className="fact-label">{label}</span>
      {sub && <span className="fact-sub">{sub}</span>}
    </div>
  )
}

function SeverityBar({ open }: { open: Building["open"] & object }) {
  const rows = [
    { k: "C", label: "Class C · immediately hazardous", hint: "no heat, lead paint, rodents, broken locks" },
    { k: "B", label: "Class B · hazardous", hint: "leaks, mold, missing smoke detectors" },
    { k: "A", label: "Class A · non-hazardous", hint: "minor repairs, paint, signage" },
  ] as const
  const max = Math.max(1, ...rows.map((r) => open[r.k] ?? 0))
  return (
    <div className="sev">
      {rows.map((r) => (
        <div key={r.k} className="sev-row" data-class={r.k}>
          <div className="sev-label">
            <span>{r.label}</span>
            <small>{r.hint}</small>
          </div>
          <div className="sev-track">
            <div className="sev-fill" style={{ width: `${((open[r.k] ?? 0) / max) * 100}%` }} />
          </div>
          <span className="sev-n">{open[r.k] ?? 0}</span>
        </div>
      ))}
    </div>
  )
}

function YearBars({ data }: { data: Record<string, number> }) {
  const now = new Date().getFullYear()
  const years = Array.from({ length: 6 }, (_, i) => String(now - 5 + i))
  const max = Math.max(1, ...years.map((y) => data[y] ?? 0))
  return (
    <div className="years" role="img" aria-label={years.map((y) => `${y}: ${data[y] ?? 0}`).join(", ")}>
      {years.map((y) => (
        <div key={y} className="year">
          <span className="year-n">{data[y] ?? 0}</span>
          <div className="year-bar" style={{ height: `${((data[y] ?? 0) / max) * 100}%` }} />
          <span className="year-label">{y}</span>
        </div>
      ))}
    </div>
  )
}

function LiveList({ bbl }: { bbl: string }) {
  const [rows, setRows] = useState<LiveViolation[] | null>(null)
  const [err, setErr] = useState(false)
  const [all, setAll] = useState(false)
  useEffect(() => {
    const ac = new AbortController()
    liveViolations(bbl, ac.signal).then(setRows, (e) => !ac.signal.aborted && setErr(!!e))
    return () => ac.abort()
  }, [bbl])
  return (
    <section className="panel">
      <h2>Latest violations, live from HPD</h2>
      {err && <p className="note">Couldn't reach NYC Open Data right now.</p>}
      {!rows && !err && <p className="loading">Loading…</p>}
      {rows && rows.length === 0 && <p className="note">No violations on file.</p>}
      {rows && rows.length > 0 && (
        <ol className="timeline">
          {(all ? rows : rows.slice(0, 10)).map((v) => (
            <li key={v.violationid} data-class={v.class} data-open={v.violationstatus === "Open" || undefined}>
              <div className="tl-head">
                <span className="tl-class">{v.class}</span>
                <time>{v.inspectiondate?.slice(0, 10)}</time>
                {v.apartment && <span>Apt {v.apartment}</span>}
                <span className="tl-status">{v.violationstatus === "Open" ? "Open" : "Closed"}</span>
              </div>
              <p>{shorten(v.novdescription)}</p>
            </li>
          ))}
        </ol>
      )}
      {rows && rows.length > 10 && !all && (
        <button type="button" className="more" onClick={() => setAll(true)}>
          Show {rows.length - 10} more
        </button>
      )}
    </section>
  )
}

function shorten(s = "") {
  return s.replace(/^§\s*[\d-]+.*?(ADM CODE|HMC|D\/L|M\/D LAW)[^A-Z]*/i, "").replace(/\s+/g, " ").slice(0, 260)
}

function OwnerBlock({ b, owner, managers }: { b: Building; owner: Portfolio | null; managers: Portfolio[] }) {
  const contacts = b.contacts ?? []
  const shown = contacts.filter((c) => c.type !== "SiteManager" && c.type !== "Shareholder")
  return (
    <section className="panel owner">
      <h2>Who owns and runs it</h2>
      {shown.length === 0 && <p className="note">Not registered with HPD. Deed owner: {b.pluto_owner || "unknown"}.</p>}
      {shown.length > 0 && (
        <dl className="contacts">
          {shown.map((c, i) => (
            <div key={`${c.type}-${c.name}-${i}`}>
              <dt>{TYPE_LABEL[c.type] ?? c.type}</dt>
              <dd>
                {c.name}
                {c.address && <small>{c.address}</small>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {owner && owner.buildings > 1 && (
        <a className="portfolio-card" href={`#/p/${owner.id}`}>
          <span className="eyebrow">This owner's network</span>
          <strong>{owner.name}</strong>
          <span>
            {owner.buildings} buildings · {owner.units.toLocaleString()} apartments · {owner.withRecords} with records
            {owner.pct ? ` · worse than ${Math.floor(owner.pct)}% of Brooklyn landlords` : ""}
          </span>
        </a>
      )}
      {managers.map((m) => (
        <a key={m.id} className="portfolio-card" href={`#/p/${m.id}`}>
          <span className="eyebrow">Management company</span>
          <strong>{m.name}</strong>
          <span>Manages {m.buildings} Brooklyn buildings</span>
        </a>
      ))}
      {b.registration && !b.registration.active && <p className="note">HPD registration expired {b.registration.expires}. Owners are required to keep it current.</p>}
    </section>
  )
}

const TYPE_LABEL: Record<string, string> = {
  HeadOfficer: "Head officer",
  IndividualOwner: "Owner",
  CorporateOwner: "Owner (company)",
  JointOwner: "Joint owner",
  Officer: "Officer",
  Agent: "Managing agent",
  Lessee: "Lessee",
}

