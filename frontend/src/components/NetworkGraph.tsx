"use client";

import { NetworkGraph as NetworkGraphData } from "@/lib/api-client";
import EmptyState from "@/components/EmptyState";

interface Props {
  graph: NetworkGraphData;
}

const SIZE = 520;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 60;

function nodePosition(index: number, total: number): { x: number; y: number } {
  const angle = (index / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
  return { x: CENTER + RADIUS * Math.cos(angle), y: CENTER + RADIUS * Math.sin(angle) };
}

// Hand-rolled SVG node-link diagram -- no graph library dependency. Fine for
// the dataset sizes this view ever shows (capped server-side to ~75 edges).
export default function NetworkGraph({ graph }: Props) {
  if (graph.nodes.length === 0) {
    return <EmptyState>No actor-target relationships recorded yet.</EmptyState>;
  }

  const positions = new Map(graph.nodes.map((n, i) => [n.id, nodePosition(i, graph.nodes.length)]));
  const maxWeight = Math.max(...graph.edges.map((e) => e.weight), 1);

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-xl mx-auto">
      {graph.edges.map((edge, i) => {
        const from = positions.get(edge.source);
        const to = positions.get(edge.target);
        if (!from || !to) return null;
        const strokeWidth = 0.5 + (edge.weight / maxWeight) * 3;
        return (
          <line
            key={i}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="currentColor"
            className="text-border"
            strokeWidth={strokeWidth}
          />
        );
      })}
      {graph.nodes.map((node) => {
        const pos = positions.get(node.id)!;
        const isActor = node.kind === "actor";
        return (
          <g key={node.id}>
            <circle cx={pos.x} cy={pos.y} r={isActor ? 8 : 6} className={isActor ? "fill-accent" : "fill-iris"} />
            <text x={pos.x} y={pos.y - 12} textAnchor="middle" className="text-[9px] fill-text">
              {node.label.length > 18 ? `${node.label.slice(0, 18)}...` : node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
