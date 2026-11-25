import { useAsyncOptions } from "@ui-sdk/react/async-options"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxStatus,
} from "@ui-sdk/react/combobox"
import { geosearch, loadNames, type NameEntry } from "./data"
import { go } from "./nav"

interface Option {
  value: string
  label: string
  detail: string
  group: "Addresses" | "Owners and companies"
}

const KIND_LABEL: Record<NameEntry[1], string> = {
  owner: "Owner",
  person: "Owner",
  company: "Owner company",
  manager: "Management company",
}

function norm(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
}

async function searchAll(query: string, { signal }: { signal: AbortSignal }): Promise<Option[]> {
  const q = norm(query)
  if (q.length < 3) return []
  const looksLikeAddress = /^\d/.test(q)
  const [geo, names] = await Promise.all([
    geosearch(query, signal).catch(() => []),
    looksLikeAddress ? Promise.resolve([] as NameEntry[]) : loadNames(),
  ])
  const words = q.split(" ")
  const nameHits: Option[] = []
  const seen = new Set<string>()
  for (const [name, kind, id, n] of names) {
    const nn = norm(name)
    if (!words.every((w) => nn.includes(w))) continue
    const key = `${id}:${nn}`
    if (seen.has(key)) continue
    seen.add(key)
    nameHits.push({
      value: `p/${id}#${nameHits.length}`,
      label: name,
      detail: `${KIND_LABEL[kind]} · ${n} building${n === 1 ? "" : "s"}`,
      group: "Owners and companies",
    })
    if (nameHits.length >= 400) break
  }
  nameHits.sort((a, b) => Number(b.detail.match(/(\d+) building/)?.[1]) - Number(a.detail.match(/(\d+) building/)?.[1]))
  geo.sort((a, b) => Number(b.borough === "Brooklyn") - Number(a.borough === "Brooklyn"))
  const addrHits: Option[] = geo.map((g) => ({
    value: `b/${g.bbl}`,
    label: g.label.replace(/, New York, NY, USA$/, ""),
    detail: g.borough === "Brooklyn" ? "Brooklyn" : `${g.borough} (not covered yet)`,
    group: "Addresses",
  }))
  return [...addrHits, ...nameHits.slice(0, 12)]
}

export function Search() {
  const results = useAsyncOptions(searchAll, { debounce: 250 })
  const items = results.items as Option[]
  const groups = (["Addresses", "Owners and companies"] as const).map((g) => ({
    g,
    items: items.filter((i) => i.group === g),
  }))

  return (
    <div className="search">
    <Combobox
      items={items}
      filter={false}
      status={results.status}
      onQueryChange={(q) => results.setQuery(q)}
      onValueChange={(v) => {
        if (typeof v === "string" && v) go(`/${v.split("#")[0]}`)
      }}
    >
      <ComboboxLabel className="sr-only">Search an address, landlord, or management company</ComboboxLabel>
      <ComboboxInput className="search-input" placeholder="Address, landlord, or management company" />
      <ComboboxContent className="search-popup">
        <ComboboxStatus className="search-status">
          {(state) => (state.status === "error" ? "Search is having trouble. Try again." : state.loading ? "Searching…" : "")}
        </ComboboxStatus>
        <ComboboxEmpty className="search-empty">
          {(state) =>
            !state.empty || state.loading ? null : state.query.trim().length >= 3 ? `Nothing matches “${state.query}”.` : "Type at least 3 letters."
          }
        </ComboboxEmpty>
        <ComboboxList>
          {groups
            .filter((x) => x.items.length)
            .map(({ g, items }) => (
              <ComboboxGroup key={g}>
                <ComboboxGroupLabel className="search-group">{g}</ComboboxGroupLabel>
                {items.map((o) => (
                  <ComboboxItem key={o.value} value={o.value} label={o.label} className="search-item">
                    <span className="search-item-label">{o.label}</span>
                    <span className="search-item-detail">{o.detail}</span>
                  </ComboboxItem>
                ))}
              </ComboboxGroup>
            ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
    </div>
  )
}
