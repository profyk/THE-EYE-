"use client";

import { IntrusionAttempt } from "@/lib/api-client";
import EmptyState from "@/components/EmptyState";

interface Props {
  attempts: IntrusionAttempt[];
}

const WIDTH = 720;
const HEIGHT = 360;

// Plain equirectangular projection from real lat/long -- no landmass
// polygons (that would need real map data we don't have), just an honest
// scatter plot with reference gridlines. Real coordinates, not a fabricated
// "world map" graphic.
function project(lat: number, lon: number): { x: number; y: number } {
  const x = ((lon + 180) / 360) * WIDTH;
  const y = ((90 - lat) / 180) * HEIGHT;
  return { x, y };
}

export default function IntrusionMap({ attempts }: Props) {
  const located = attempts.filter((a) => a.latitude != null && a.longitude != null);

  if (located.length === 0) {
    return <EmptyState>No geolocated attempts yet. Real attempts will appear here once GeoIP data is available for them.</EmptyState>;
  }

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full border border-border rounded-xl">
      <rect width={WIDTH} height={HEIGHT} className="fill-surface" />
      <line x1={0} y1={HEIGHT / 2} x2={WIDTH} y2={HEIGHT / 2} className="stroke-border" strokeWidth={1} />
      <line x1={WIDTH / 2} y1={0} x2={WIDTH / 2} y2={HEIGHT} className="stroke-border" strokeWidth={1} />
      {/* THE EYE's own location is unknown to us generically, so there's no
          fixed "target" marker like the prototype's South-Africa-centric one
          -- this plots wherever attempts actually originated, nothing more. */}
      {located.map((a, i) => {
        const { x, y } = project(a.latitude!, a.longitude!);
        return (
          <circle key={i} cx={x} cy={y} r={4} className="fill-danger" opacity={0.85}>
            <title>
              {a.city ? `${a.city}, ` : ""}
              {a.country} -- {a.ip} ({new Date(a.occurred_at).toLocaleString()})
            </title>
          </circle>
        );
      })}
    </svg>
  );
}
