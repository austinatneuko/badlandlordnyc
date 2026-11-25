import { useEffect, useMemo, useState } from "react"
import { loadBuildings, loadPortfolio, tierOf, type Building, type Portfolio } from "./data"
import { MapView } from "./MapView"

export function PortfolioPage({ id }: { id: string }) {
  const [p, setP] = useState<Portfolio | null | undefined>(undefined)
  const [bs, setBs] = useState<Record<string, Building>>({})

  useEffect(() => {
    loadPortfolio(id).then((d) => {
      setP(d)
      if (d) loadBuildings(d.bbls).then(setBs)
    })
  }, [id])

  const rows = useMemo(
    () =>
      (p?.bbls ?? [])
        .map((bbl) => ({ bbl, b: bs[bbl] }))
        .sort((x, y) => (y.b?.score ?? 0) - (x.b?.score ?? 0) || (y.b?.units ?? 0) - (x.b?.units ?? 0)),
    [p, bs],
  )

  if (p === undefined) return <main className="report"><p className="loading">Loading…</p></main>
  if (!p) return <main className="report"><h1>Not found</h1></main>

  const tier = tierOf(p.pct, p.withRecords > 0)
  const openTotal = rows.reduce((a, r) => a + Object.values(r.b?.open ?? {}).reduce((x, y) => x + (y ?? 0), 0), 0)

  return (
    <main className="report">
      <p className="eyebrow">{p.kind === "manager" ? "Management company" : "Owner network"} · Brooklyn</p>
      <h1>{p.name}</h1>
      {p.kind === "owner" && (
        <div className="verdict" data-tier={tier.key}>
          <strong>{p.buildings > 1 ? tier.label : "Single building"}</strong>
          <span>
            {p.pct && p.buildings > 1
              ? `More open problems per apartment than ${Math.floor(p.pct)}% of Brooklyn landlords with 2+ buildings.`
              : p.buildings > 1
                ? "No open HPD violations across this portfolio."
                : "This owner has one registered Brooklyn building."}
          </span>
        </div>
      )}

      {p.kind === "owner" && p.buildings > 1 && (
        <p className="note">
          Grouping is approximate: it's built from names and business addresses on HPD registrations, which owners
          fill in themselves. Compare with{" "}
          <a href={`https://whoownswhat.justfix.org/bbl/${p.bbls[0]}`} target="_blank" rel="noreferrer">JustFix Who Owns What</a>.
        </p>
      )}

      <section className="facts" aria-label="Summary">
        <Fact n={p.buildings} label="Buildings" />
        <Fact n={p.units} label="Apartments" />
        <Fact n={openTotal} label="Open HPD violations" sub={p.openC ? `${p.openC} immediately hazardous` : undefined} hot={p.openC > 0} />
        <Fact n={p.evictions5} label="Evictions, last 5 yrs" />
        <Fact n={p.harassment} label="Harassment findings" hot={p.harassment > 0} />
      </section>

      {(p.people.length > 0 || p.companies.length > 0) && (
        <section className="panel">
          <h2>Names on the registrations</h2>
          <p className="note">These people and companies appear on HPD registrations for the buildings below. Buildings are grouped when they share an owner name or company name at the same business address, so one LLC per building can't hide a bigger operator.</p>
          <ul className="chips">
            {p.people.map((n) => <li key={`p-${n}`} data-kind="person">{n}</li>)}
            {p.companies.map((n) => <li key={`c-${n}`}>{n}</li>)}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2>Where they are</h2>
        <MapView only={p.bbls} height={360} />
      </section>

      <section className="panel">
        <h2>Every building, worst first</h2>
        <div className="table-wrap">
          <table className="btable">
            <thead>
              <tr>
                <th scope="col">Address</th>
                <th scope="col">Apts</th>
                <th scope="col">Open A / B / C</th>
                <th scope="col">Rank</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ bbl, b }) => {
                const t = tierOf(b?.pct, !!b?.hasRecord)
                return (
                  <tr key={bbl}>
                    <td><a href={`#/b/${bbl}`}>{b?.address ?? bbl}</a></td>
                    <td>{b?.units ?? "–"}</td>
                    <td className="num">
                      {b?.open?.A ?? 0} / {b?.open?.B ?? 0} / <span data-hot={(b?.open?.C ?? 0) > 0 || undefined}>{b?.open?.C ?? 0}</span>
                    </td>
                    <td><span className="pill" data-tier={t.key}>{t.label}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
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
