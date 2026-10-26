import QRCode from "qrcode"

// Renders a QR code as one SVG path. QRCode.create is synchronous, so the
// markup is identical on the server and the client.
export function QrCode({ value, label }: { value: string; label: string }) {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" })
  const size = modules.size
  let d = ""
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`
    }
  }
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className="block size-full"
    >
      <path d={d} fill="currentColor" />
    </svg>
  )
}
