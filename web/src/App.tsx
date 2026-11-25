import { useEffect, useState } from "react"
import { Search } from "./Search"
import { MapView } from "./MapView"
import { BuildingReport } from "./BuildingReport"
import { PortfolioPage } from "./PortfolioPage"
import { loadMeta, type Meta } from "./data"
import { Accordion, AccordionHeader, AccordionItem, AccordionPanel, AccordionTrigger } from "@ui-sdk/react/accordion"

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

const METHOD = [
  {
    value: "zones",
    label: "How the map is shaded",
    body: [
      "Brooklyn is cut into squares about three or four blocks wide. Each square adds up the open HPD violations in every building with 3 or more apartments inside it, clean buildings included, and divides by the number of apartments.",
      "Squares are then ranked against each other. Red means more open problems per apartment than almost anywhere else in Brooklyn. Green means few or none. Zoom in to see the buildings themselves.",
    ],
  },
  {
    value: "ranking",
    label: "How buildings are ranked",
    body: [
      "Every open HPD violation counts 1 point for class A (non-hazardous), 2 for class B (hazardous) and 3 for class C (immediately hazardous, like no heat or lead paint). Points are divided by the number of apartments, then compared against every Brooklyn building with 3 or more apartments.",
      "\"Worst 5%\" means the building has more open problems per apartment than 95% of them.",
    ],
  },
  {
    value: "owners",
    label: "How owners are grouped",
    body: [
      "Many landlords use a separate LLC for each building. We group buildings when HPD registrations share an owner's name or a company name at the same business address. It's approximate, so check JustFix Who Owns What for a second opinion.",
    ],
  },
]

function Method() {
  return (
    <section className="method">
      <h2>How this works</h2>
      <Accordion className="acc" defaultValue={["zones"]}>
        {METHOD.map((m) => (
          <AccordionItem key={m.value} value={m.value} className="acc-item">
            <AccordionHeader className="acc-h">
              <AccordionTrigger className="acc-trigger">
                {m.label}
              </AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel className="acc-panel">
              {m.body.map((b) => <p key={b}>{b}</p>)}
            </AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}
