"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import maplibregl from "maplibre-gl"
import type { GeoJSONSource } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

interface GpsPoint {
  lat: number
  lon: number
  ts: number
}

function createStartElement(): HTMLElement {
  const el = document.createElement("div")
  el.style.width = "14px"
  el.style.height = "14px"
  el.style.background = "#22c55e"
  el.style.border = "2px solid white"
  el.style.borderRadius = "50%"
  return el
}

function createEndElement(): HTMLElement {
  const el = document.createElement("div")
  el.style.width = "18px"
  el.style.height = "18px"
  el.style.background = "#3b82f6"
  el.style.border = "3px solid white"
  el.style.borderRadius = "50%"
  el.style.boxShadow = "0 0 12px rgba(59,130,246,0.6)"
  return el
}

export default function RouteMap({ points }: { points: GpsPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const sourceAddedRef = useRef(false)
  const [styleLoaded, setStyleLoaded] = useState(false)

  const updateData = useCallback(() => {
    const map = mapRef.current
    if (!map || !styleLoaded) return

    const coords: [number, number][] = points.map((p) => [p.lon, p.lat])

    const source = map.getSource("route") as GeoJSONSource | undefined
    if (source) {
      source.setData({
        type: "Feature",
        properties: {},
        geometry:
          coords.length >= 2
            ? { type: "LineString", coordinates: coords }
            : { type: "LineString", coordinates: [] },
      })
    }

    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    if (coords.length > 0) {
      const startMarker = new maplibregl.Marker({
        element: createStartElement(),
        anchor: "center",
      })
        .setLngLat(coords[0])
        .addTo(map)
      markersRef.current.push(startMarker)

      if (coords.length > 1) {
        const endMarker = new maplibregl.Marker({
          element: createEndElement(),
          anchor: "center",
        })
          .setLngLat(coords[coords.length - 1])
          .addTo(map)
        markersRef.current.push(endMarker)
      }
    }

    if (coords.length === 1) {
      map.flyTo({ center: coords[0], zoom: 15 })
    } else if (coords.length > 1) {
      const lngs = coords.map((c) => c[0])
      const lats = coords.map((c) => c[1])
      const bounds = new maplibregl.LngLatBounds(
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)]
      )
      map.fitBounds(bounds, { padding: 30, maxZoom: 17 })
    }
  }, [points, styleLoaded])

  useEffect(() => {
    if (!containerRef.current) return

    const startCenter: [number, number] =
      points.length > 0
        ? [points[0].lon, points[0].lat]
        : [101.6869, 3.139]

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: startCenter,
      zoom: 15,
      attributionControl: false,
      dragPan: false,
      scrollZoom: false,
      boxZoom: false,
      dragRotate: false,
      keyboard: false,
      doubleClickZoom: false,
      touchZoomRotate: false,
    })

    map.on("style.load", () => {
      if (sourceAddedRef.current) return
      sourceAddedRef.current = true

      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [] },
        },
      })

      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#ef4444",
          "line-width": 4,
          "line-opacity": 0.8,
        },
      })

      setStyleLoaded(true)
    })

    mapRef.current = map

    return () => {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      map.remove()
      mapRef.current = null
      sourceAddedRef.current = false
      setStyleLoaded(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    updateData()
  }, [updateData])

  return <div ref={containerRef} className="h-64 w-full rounded-lg" />
}
