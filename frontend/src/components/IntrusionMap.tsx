"use client";

import { IntrusionAttempt } from "@/lib/api-client";

interface Props {
  attempts: IntrusionAttempt[];
}

const W = 800;
const H = 400;

function project(lat: number, lon: number) {
  return {
    x: ((lon + 180) / 360) * W,
    y: ((90 - lat) / 180) * H,
  };
}

function toPoints(coords: [number, number][]) {
  return coords.map(([lat, lon]) => {
    const { x, y } = project(lat, lon);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

// Simplified continent outlines — equirectangular [lat, lon] pairs
const CONTINENTS: { name: string; coords: [number, number][] }[] = [
  {
    name: "North America",
    coords: [
      [72,-168],[70,-140],[72,-90],[83,-80],[72,-55],[60,-64],
      [44,-66],[35,-76],[25,-80],[10,-84],[8,-77],[10,-85],
      [15,-92],[22,-106],[32,-117],[38,-123],[48,-125],
      [54,-132],[60,-140],[66,-168],
    ],
  },
  {
    name: "Greenland",
    coords: [
      [76,-68],[84,-45],[83,-25],[72,-22],[60,-44],[68,-50],
    ],
  },
  {
    name: "South America",
    coords: [
      [12,-72],[10,-63],[5,-53],[0,-50],[-5,-35],[-15,-39],
      [-23,-43],[-34,-53],[-56,-68],[-55,-36],[-45,-74],
      [-30,-71],[-18,-70],[0,-78],[8,-77],
    ],
  },
  {
    name: "Europe",
    coords: [
      [36,-9],[44,-9],[48,-2],[48,2],[54,8],[57,5],
      [58,4],[70,20],[70,28],[65,26],[60,25],[60,30],
      [56,24],[52,20],[48,40],[42,28],[37,27],[37,23],
      [38,15],[41,12],[44,8],[44,2],[41,3],[36,5],
    ],
  },
  {
    name: "Africa",
    coords: [
      [37,-5],[32,12],[30,25],[22,37],[12,44],[0,42],
      [-10,40],[-35,26],[-35,19],[-25,15],[0,9],[5,2],
      [5,-5],[14,-17],[20,-17],[35,-5],
    ],
  },
  {
    name: "Asia",
    coords: [
      [37,27],[42,28],[42,35],[37,37],[37,36],[33,43],
      [22,57],[24,62],[22,68],[8,78],[2,104],[10,108],
      [22,114],[22,120],[35,130],[40,140],[45,142],
      [50,142],[60,150],[68,170],[73,140],[73,90],
      [73,50],[70,30],[65,35],[60,30],[56,33],[48,40],
      [40,28],
    ],
  },
  {
    name: "Siberia Far East",
    coords: [
      [68,170],[65,175],[60,162],[55,162],[50,142],
      [60,150],[68,170],
    ],
  },
  {
    name: "Australia",
    coords: [
      [-16,130],[-14,136],[-12,136],[-12,142],
      [-18,148],[-28,154],[-38,150],[-38,140],
      [-33,128],[-28,114],[-22,114],[-16,122],
    ],
  },
  {
    name: "UK",
    coords: [
      [50,-5],[52,-5],[58,-5],[59,-3],[58,-3],[56,-3],[51,1],[51,0],
    ],
  },
  {
    name: "Japan",
    coords: [
      [41,140],[43,141],[45,141],[44,143],[42,141],[38,141],[35,137],[34,131],[36,130],[41,140],
    ],
  },
  {
    name: "New Zealand",
    coords: [[-34,172],[-41,174],[-46,170],[-44,168],[-36,174],[-34,172]],
  },
];

export default function IntrusionMap({ attempts }: Props) {
  const located = attempts.filter(a => a.latitude != null && a.longitude != null);

  // Cluster by rounded coordinates so stacked dots show as one bigger dot
  const clusters: Record<string, { lat: number; lon: number; count: number; attempts: IntrusionAttempt[] }> = {};
  for (const a of located) {
    const key = `${Math.round(a.latitude! * 2) / 2},${Math.round(a.longitude! * 2) / 2}`;
    if (!clusters[key]) clusters[key] = { lat: a.latitude!, lon: a.longitude!, count: 0, attempts: [] };
    clusters[key].count++;
    clusters[key].attempts.push(a);
  }
  const dots = Object.values(clusters);

  return (
    <div className="relative rounded-xl overflow-hidden border border-[var(--border)]">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ background: "linear-gradient(180deg, #060d1a 0%, #0a1628 100%)" }}
        aria-label="World map showing intrusion attempt origins"
      >
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="dotGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Subtle grid */}
        {[-60,-30,0,30,60].map(lat => {
          const { y } = project(lat, 0);
          return <line key={lat} x1={0} y1={y} x2={W} y2={y} stroke="#1e3a5f" strokeWidth={0.5} strokeDasharray="4 6" opacity={0.5} />;
        })}
        {[-120,-60,0,60,120].map(lon => {
          const { x } = project(0, lon);
          return <line key={lon} x1={x} y1={0} x2={x} y2={H} stroke="#1e3a5f" strokeWidth={0.5} strokeDasharray="4 6" opacity={0.5} />;
        })}

        {/* Continent fills */}
        {CONTINENTS.map(c => (
          <polygon
            key={c.name}
            points={toPoints(c.coords)}
            fill="#1a2d4a"
            stroke="#2a4a6e"
            strokeWidth={0.8}
            opacity={0.9}
          />
        ))}

        {/* Attack dots */}
        {dots.map((d, i) => {
          const { x, y } = project(d.lat, d.lon);
          const r = Math.min(3 + Math.sqrt(d.count) * 2, 14);
          const label = d.attempts[0];
          const tip = `${label.city ?? ""}${label.city ? ", " : ""}${label.country} — ${d.count} attempt${d.count > 1 ? "s" : ""}${label.ip ? ` from ${label.ip}` : ""}`;
          return (
            <g key={i} filter="url(#glow)">
              {/* Pulse ring */}
              <circle cx={x} cy={y} r={r + 4} fill="none" stroke="#ef4444" strokeWidth={1} opacity={0.3}>
                <animate attributeName="r" from={r + 2} to={r + 10} dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" from={0.4} to={0} dur="2s" repeatCount="indefinite" />
              </circle>
              {/* Core dot */}
              <circle cx={x} cy={y} r={r} fill="#ef4444" opacity={0.9}>
                <title>{tip}</title>
              </circle>
              {/* Inner highlight */}
              <circle cx={x} cy={y} r={r * 0.45} fill="#fca5a5" opacity={0.8} />
            </g>
          );
        })}

        {/* Equator label */}
        <text x={8} y={H / 2 - 4} fill="#2a4a6e" fontSize={9} fontFamily="monospace">0°</text>
      </svg>

      {located.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-[var(--muted)] bg-[var(--void)]/80 px-4 py-2 rounded-lg">
            No geolocated attempts yet — map will populate as real attacks arrive.
          </p>
        </div>
      )}
    </div>
  );
}
