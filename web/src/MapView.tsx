import type * as GeoJSON from "geojson"
import { useEffect, useRef, useState } from "react"
import * as maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url"
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control"
import { loadMap, loadZones, type MapPoint, type Zones } from "./data"
import { go } from "./nav"

maplibregl.setWorkerUrl(workerUrl)

const STYLE = "https://tiles.openfreemap.org/styles/positron"

// Game-map palette: dark land, deep teal water, muted parks, roads as light lines.
const BASE = {
  land: "#1b1f24",
  landAlt: "#20252b",
  park: "#1f2b24",
  water: "#0f2a36",
  building: "#252a31",
  road: "#363c44",
  roadMajor: "#4a515b",
  label: "#a7b0ba",
  halo: "#0d1013",
}

const BLANK: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": BASE.land } }],
}

// Zone shading, from calm to hot. Shared with the legend.
export const ZONE_STEPS = [
  { min: 0, color: "#2f9e5b", label: "Calm" },
  { min: 25, color: "#8db03a", label: "" },
  { min: 50, color: "#e3c341", label: "" },
  { min: 75, color: "#f08a3c", label: "" },
  { min: 90, color: "#e2483a", label: "" },
  { min: 95, color: "#c0123f", label: "Worst" },
]

export const TIER_COLOR = {
  worst: "#ff3b5c",
  bad: "#ff6a3d",
  poor: "#ffa53d",
  fair: "#f2d24b",
  low: "#8b96a3",
}

const zoneColor: maplibregl.ExpressionSpecification = [
  "step",
  ["get", "pct"],
  ZONE_STEPS[0].color,
  ...ZONE_STEPS.slice(1).flatMap((s) => [s.min, s.color]),
] as maplibregl.ExpressionSpecification

const dotColor: maplibregl.ExpressionSpecification = [
  "step",
  ["get", "pct"],
  TIER_COLOR.low,
  0.01,
  TIER_COLOR.fair,
  75,
  TIER_COLOR.poor,
  90,
  TIER_COLOR.bad,
  95,
  TIER_COLOR.worst,
]

function restyle(layers: maplibregl.LayerSpecification[]): maplibregl.LayerSpecification[] {
  return layers.map((l) => {
    const id = l.id
    if (l.type === "background") return { ...l, paint: { "background-color": BASE.land } }
    if (l.type === "fill") {
      const c = /water|ocean|river/.test(id)
        ? BASE.water
        : /park|wood|grass|forest|cemetery|golf|pitch/.test(id)
          ? BASE.park
          : /building/.test(id)
            ? BASE.building
            : BASE.landAlt
      return { ...l, paint: { "fill-color": c, "fill-opacity": 1 } }
    }
    if (l.type === "line") {
      if (/water|river|stream|canal/.test(id)) return { ...l, paint: { ...l.paint, "line-color": BASE.water } }
      if (/boundary|admin/.test(id)) return { ...l, layout: { ...l.layout, visibility: "none" } }
      const major = /motorway|trunk|primary|major/.test(id)
      return { ...l, paint: { ...l.paint, "line-color": major ? BASE.roadMajor : BASE.road } }
    }
    if (l.type === "symbol") {
      return {
        ...l,
        paint: { ...l.paint, "text-color": BASE.label, "text-halo-color": BASE.halo, "text-halo-width": 1.2 },
      }
    }
    return l
  })
}

function pointsGeoJSON(points: MapPoint[], only?: Set<string>): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points
      .filter((p) => !only || only.has(p[2]))
      .map(([lon, lat, bbl, pct, units]) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: { bbl, pct, units },
      })),
  }
}

function zonesGeoJSON(z: Zones): GeoJSON.FeatureCollection {
  const gap = 0.04 // a hairline gap between cells reads like map tiles
  return {
    type: "FeatureCollection",
    features: z.cells.map(([x, y, pct, units, buildings, worst]) => {
      const w = z.lon0 + (x + gap) * z.dlon
      const e = z.lon0 + (x + 1 - gap) * z.dlon
      const s = z.lat0 + (y + gap) * z.dlat
      const n = z.lat0 + (y + 1 - gap) * z.dlat
      return {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
        properties: { pct, units, buildings, worst, cx: (w + e) / 2, cy: (s + n) / 2 },
      }
    }),
  }
}

type Mode = "zones" | "buildings"

export function MapView({ only, height = 600 }: { only?: string[]; height?: number }) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>("zones")
  const onlyKey = only?.join(",")
  const showZones = !onlyKey

  useEffect(() => {
    if (!el.current) return
    const map = new maplibregl.Map({
      container: el.current,
      style: BLANK,
      center: [-73.95, 40.65],
      zoom: 11.2,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
    const ours = ["z", "z-line", "b"]
    fetch(STYLE)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((style: maplibregl.StyleSpecification) =>
        map.setStyle(style, {
          transformStyle: (prev, next) => ({
            ...next,
            sources: {
              ...next.sources,
              ...Object.fromEntries(Object.entries(prev?.sources ?? {}).filter(([k]) => k === "z" || k === "b")),
            },
            layers: [...restyle(next.layers), ...(prev?.layers.filter((l) => ours.includes(l.id)) ?? [])],
          }),
        }),
      )
      .catch(() => {})

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8, className: "map-tip" })

    map.on("load", async () => {
      try {
        if (!onlyKey) {
          const zones = await loadZones()
          map.addSource("z", { type: "geojson", data: zonesGeoJSON(zones) })
          map.addLayer({
            id: "z",
            type: "fill",
            source: "z",
            paint: {
              "fill-color": zoneColor,
              "fill-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.62, 13.5, 0.5, 15.5, 0.18],
            },
          })
          map.addLayer({
            id: "z-line",
            type: "line",
            source: "z",
            paint: {
              "line-color": zoneColor,
              "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0, 13, 1],
              "line-opacity": 0.9,
            },
          })
        }
        const points = await loadMap()
        const data = pointsGeoJSON(points, onlyKey ? new Set(onlyKey.split(",")) : undefined)
        map.addSource("b", { type: "geojson", data })
        map.addLayer({
          id: "b",
          type: "circle",
          source: "b",
          minzoom: onlyKey ? 0 : 13.5,
          paint: {
            "circle-color": dotColor,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, ["case", [">=", ["get", "pct"], 95], 2, 1], 13, ["case", [">=", ["get", "pct"], 95], 4, 2.5], 16, ["case", [">=", ["get", "pct"], 95], 8, 6]],
            "circle-opacity": ["case", [">", ["get", "pct"], 0], 0.95, 0.5],
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 12, 0, 15, 1],
            "circle-stroke-color": BASE.halo,
          },
          layout: { "circle-sort-key": ["get", "pct"] },
        })
        if (onlyKey && data.features.length) {
          const bounds = new maplibregl.LngLatBounds()
          for (const f of data.features) bounds.extend((f.geometry as GeoJSON.Point).coordinates as [number, number])
          map.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 0 })
        }
      } catch (e) {
        setError(String(e))
      }
    })

    for (const id of ["z", "b"]) {
      map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"))
      map.on("mouseleave", id, () => {
        map.getCanvas().style.cursor = ""
        popup.remove()
      })
    }
    map.on("mousemove", "z", (e: maplibregl.MapLayerMouseEvent) => {
      // Dots sit on top of zones; let the dot tooltip win.
      if (map.getLayer("b") && map.queryRenderedFeatures(e.point, { layers: ["b"] }).length) return
      const f = e.features?.[0]
      if (!f) return
      const p = f.properties
      const pct = Number(p.pct)
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<strong>${pct > 0 ? `Worse than ${Math.floor(pct)}% of Brooklyn` : "No open violations"}</strong>` +
            `<br>${p.buildings} buildings · ${Number(p.units).toLocaleString()} apts` +
            (Number(p.worst) ? `<br>${p.worst} in Brooklyn's worst 5%` : ""),
        )
        .addTo(map)
    })
    map.on("click", "z", (e: maplibregl.MapLayerMouseEvent) => {
      if (map.getLayer("b") && map.queryRenderedFeatures(e.point, { layers: ["b"] }).length) return
      const p = e.features?.[0]?.properties
      if (p && map.getZoom() < 14.5) map.easeTo({ center: [Number(p.cx), Number(p.cy)], zoom: 15.5 })
    })
    map.on("mousemove", "b", (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0]
      if (!f) return
      const pct = Number(f.properties.pct)
      popup
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(`<strong>${f.properties.units} apts</strong><br>${pct > 0 ? `Worse than ${Math.floor(pct)}% of Brooklyn buildings` : "Past records, nothing open"}`)
        .addTo(map)
    })
    map.on("click", "b", (e: maplibregl.MapLayerMouseEvent) => {
      const bbl = e.features?.[0]?.properties.bbl
      if (bbl) go(`/b/${bbl}`)
    })
    return () => {
      mapRef.current = null
      map.remove()
    }
  }, [onlyKey])

  // Zones mode: shaded cells, buildings appear once you zoom in. Buildings mode: every dot, no shading.
  useEffect(() => {
    const map = mapRef.current
    if (!map || onlyKey) return
    const apply = () => {
      if (!map.getLayer("z") || !map.getLayer("b")) return
      const z = mode === "zones" ? "visible" : "none"
      map.setLayoutProperty("z", "visibility", z)
      map.setLayoutProperty("z-line", "visibility", z)
      map.setLayerZoomRange("b", mode === "zones" ? 13.5 : 0, 24)
    }
    apply()
    map.on("styledata", apply)
    return () => {
      map.off("styledata", apply)
    }
  }, [mode, onlyKey])

  return (
    <div className="map-wrap" style={{ height }}>
      <div ref={el} className="map" role="region" aria-label="Map of Brooklyn housing records" />
      {showZones && (
        <div className="map-hud">
          <SegmentedControl
            aria-label="Map view"
            value={mode}
            onValueChange={(v) => v && setMode(v as Mode)}
            className="map-mode"
          >
            <SegmentedControlIndicator />
            <SegmentedControlItem value="zones">Zones</SegmentedControlItem>
            <SegmentedControlItem value="buildings">Buildings</SegmentedControlItem>
          </SegmentedControl>
          <div className="map-key" aria-hidden={mode !== "zones"}>
            {mode === "zones" ? (
              <>
                <span>Calm</span>
                <span className="map-key-ramp">
                  {ZONE_STEPS.map((s) => (
                    <i key={s.min} style={{ background: s.color }} />
                  ))}
                </span>
                <span>Worst</span>
              </>
            ) : (
              <>
                <i className="key-dot" style={{ background: TIER_COLOR.worst }} /> Worst 5%
                <i className="key-dot" style={{ background: TIER_COLOR.bad }} /> 10%
                <i className="key-dot" style={{ background: TIER_COLOR.poor }} /> 25%
                <i className="key-dot" style={{ background: TIER_COLOR.fair }} /> Some open
              </>
            )}
          </div>
        </div>
      )}
      {error && <p className="map-error">Map data failed to load: {error}</p>}
    </div>
  )
}
