import type * as GeoJSON from "geojson"
import { useEffect, useRef, useState } from "react"
import * as maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url"
import { loadMap, type MapPoint } from "./data"
import { go } from "./nav"

maplibregl.setWorkerUrl(workerUrl)

const STYLE = "https://tiles.openfreemap.org/styles/positron"
const BLANK: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#eceae4" } }],
}

export const TIER_COLOR = {
  worst: "#b3261e",
  bad: "#e0582a",
  poor: "#f09a36",
  fair: "#e9c84a",
  low: "#9aa6b2",
}

const colorExpr: maplibregl.ExpressionSpecification = [
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

function toGeoJSON(points: MapPoint[], only?: Set<string>): GeoJSON.FeatureCollection {
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

export function MapView({ only, height = 560 }: { only?: string[]; height?: number }) {
  const el = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const onlyKey = only?.join(",")

  useEffect(() => {
    if (!el.current) return
    const map = new maplibregl.Map({
      container: el.current,
      style: BLANK,
      center: [-73.95, 40.65],
      zoom: 11.2,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
    // Swap in the basemap only if it loads, so the building dots still show without it.
    fetch(STYLE)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((style: maplibregl.StyleSpecification) =>
        map.setStyle(style, {
          transformStyle: (prev, next) => ({
            ...next,
            sources: { ...next.sources, ...(prev?.sources.b ? { b: prev.sources.b } : {}) },
            layers: [...next.layers, ...(prev?.layers.filter((l) => l.id === "b") ?? [])],
          }),
        }),
      )
      .catch(() => {})
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 })

    map.on("load", async () => {
      try {
        const points = await loadMap()
        const data = toGeoJSON(points, onlyKey ? new Set(onlyKey.split(",")) : undefined)
        map.addSource("b", { type: "geojson", data })
        map.addLayer({
          id: "b",
          type: "circle",
          source: "b",
          paint: {
            "circle-color": colorExpr,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, ["case", [">=", ["get", "pct"], 95], 1.6, 0.8], 13, ["case", [">=", ["get", "pct"], 95], 3.5, 2.2], 16, ["case", [">=", ["get", "pct"], 95], 8, 6]],
            "circle-opacity": ["case", [">", ["get", "pct"], 0], 0.9, 0.45],
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 12, 0, 15, 0.6],
            "circle-stroke-color": "#fff",
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
    map.on("mouseenter", "b", () => (map.getCanvas().style.cursor = "pointer"))
    map.on("mouseleave", "b", () => {
      map.getCanvas().style.cursor = ""
      popup.remove()
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
    return () => map.remove()
  }, [onlyKey])

  return (
    <div className="map-wrap" style={{ height }}>
      <div ref={el} className="map" role="region" aria-label="Map of Brooklyn buildings with housing records" />
      {error && <p className="map-error">Map data failed to load: {error}</p>}
    </div>
  )
}
