"use client"

import { MapContainer, TileLayer, Polyline, Marker, useMap } from "react-leaflet"
import L, { LatLngExpression, DivIcon } from "leaflet"
import "leaflet/dist/leaflet.css"
import { useEffect, useMemo } from "react"

interface GpsPoint {
  lat: number
  lon: number
  ts: number
}

const startIcon = new DivIcon({
  className: "",
  html: `<div style="
    width:14px;height:14px;
    background:#22c55e;
    border:2px solid white;
    border-radius:50%;
  "></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

const endIcon = new DivIcon({
  className: "",
  html: `<div style="
    width:18px;height:18px;
    background:#3b82f6;
    border:3px solid white;
    border-radius:50%;
    box-shadow:0 0 12px rgba(59,130,246,0.6);
  "></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

function FitBounds({ positions }: { positions: LatLngExpression[] }) {
  const map = useMap()

  useEffect(() => {
    if (positions.length === 0) return
    if (positions.length === 1) {
      map.setView(positions[0], 15)
      return
    }
    const bounds = L.latLngBounds(positions.map((p) => p as [number, number]))
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 })
  }, [positions, map])

  return null
}

export default function RouteMap({ points }: { points: GpsPoint[] }) {
  const positions: LatLngExpression[] = useMemo(
    () => points.map((p) => [p.lat, p.lon]),
    [points]
  )

  const startPos = positions[0]
  const endPos = positions[positions.length - 1]

  return (
    <MapContainer
      center={startPos || [3.139, 101.6869]}
      zoom={15}
      className="h-64 w-full rounded-lg"
      zoomControl={false}
      attributionControl={false}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      {positions.length >= 2 && (
        <Polyline
          positions={positions}
          pathOptions={{ color: "#ef4444", weight: 4, opacity: 0.8 }}
        />
      )}
      {startPos && <Marker position={startPos} icon={startIcon} />}
      {endPos && <Marker position={endPos} icon={endIcon} />}
      <FitBounds positions={positions} />
    </MapContainer>
  )
}
