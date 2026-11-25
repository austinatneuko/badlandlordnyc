import { useEffect, useState } from "react"
import { Search } from "./Search"
import { MapView } from "./MapView"
import { BuildingReport } from "./BuildingReport"
import { PortfolioPage } from "./PortfolioPage"
import { loadMeta, type Meta } from "./data"

type Route = { page: "home" } | { page: "building"; bbl: string } | { page: "portfolio"; id: string }

function parse(hash: string): Route {
  const [, kind, id] = hash.replace(/^#/, "").split("/")
  if (kind === "b" && id) return { page: "building", bbl: id }
  if (kind === "p" && id) return { page: "portfolio", id }
  return { page: "home" }
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash))
  const [meta, setMeta] = useState<Meta | null>(null)

  useEffect(() => {
    const onHash = () => {
      setRoute(parse(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener("hashchange", onHash)
    loadMeta().then(setMeta, () => setMeta(null))
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  return (
    <div className="app" data-page={route.page}>
      <header className="topbar">
        <a href="#/" className="brand">
          <span className="brand-mark" aria-hidden="true">!</span>
          <span>Bad Landlord NYC</span>
        </a>
        <Search />
      </header>

      {route.page === "home" && (
        <main className="home">
          <section className="intro">
            <h1>Look up a building before you sign the lease.</h1>
            <p>
              Search an address, landlord, or management company to see open violations, tenant complaints,
              lawsuits and evictions from NYC public records, plus every other building the same owner controls.
            </p>
            {meta && (
              <p className="intro-meta">
                {meta.borough} only for now · {meta.buildingsWithRecords.toLocaleString()} buildings with records ·{" "}
                {meta.portfolios.toLocaleString()} owners · data pulled {new Date(meta.built).toLocaleDateString()}
              </p>
            )}
          </section>
          <MapView />
          <Legend />
          <Method />
        </main>
      )}
      {route.page === "building" && <BuildingReport key={route.bbl} bbl={route.bbl} />}
      {route.page === "portfolio" && <PortfolioPage key={route.id} id={route.id} />}

      <footer className="footer">
        Built from NYC Open Data: HPD violations, complaints, registrations and litigation, 311, marshal
        evictions, and PLUTO. Records can lag the city's own sites by a few days. A building with no records
        here has nothing on file in these sources.
      </footer>
    </div>
  )
}

function Legend() {
  return (
    <ul className="legend" aria-label="Map legend">
      <li><span className="dot" data-tier="worst" /> Worst 5% in Brooklyn</li>
      <li><span className="dot" data-tier="bad" /> Worst 10%</li>
      <li><span className="dot" data-tier="poor" /> Worse than most</li>
      <li><span className="dot" data-tier="fair" /> Some open violations</li>
      <li><span className="dot" data-tier="low" /> Past records, nothing open</li>
    </ul>
  )
}

function Method() {
  return (
    <section className="method">
      <h2>How the ranking works</h2>
      <p>
        Every open HPD violation counts 1 point for class A (non-hazardous), 2 for class B (hazardous) and 3 for
        class C (immediately hazardous, like no heat or lead paint). Points are divided by the number of
        apartments, then compared against every Brooklyn building with 3 or more apartments. "Worst 5%" means
        the building has more open problems per apartment than 95% of them.
      </p>
      <p>
        Owners are grouped into portfolios by matching the names and business addresses listed in HPD
        registrations, since many landlords use a separate LLC for each building.
      </p>
    </section>
  )
}
