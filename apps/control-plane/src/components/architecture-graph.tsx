import { useId } from "react";

export interface ArchitectureGraphNode {
  id: string;
  label?: string;
}

export interface ArchitectureGraphEdge {
  sourceModule: string;
  targetModule: string;
  unauthorized?: boolean;
}

export interface ArchitectureGraphProps {
  title: string;
  nodes: readonly ArchitectureGraphNode[];
  edges: readonly ArchitectureGraphEdge[];
  emphasizedUnauthorized?: boolean;
}

interface PositionedNode extends ArchitectureGraphNode {
  x: number;
  y: number;
  level: number;
}

const graphWidth = 760;
const graphHeight = 310;
const nodeWidth = 166;
const nodeHeight = 58;
const horizontalPadding = 42;
const verticalPadding = 46;

const displayModule = (node: ArchitectureGraphNode): string =>
  node.label?.trim() || node.id;

const edgeKey = (edge: ArchitectureGraphEdge): string =>
  `${edge.sourceModule}->${edge.targetModule}`;

const uniqueEdges = (
  edges: readonly ArchitectureGraphEdge[],
): ArchitectureGraphEdge[] => {
  const byKey = new Map<string, ArchitectureGraphEdge>();
  for (const edge of edges) {
    const key = edgeKey(edge);
    const existing = byKey.get(key);
    const isUnauthorized = Boolean(existing?.unauthorized || edge.unauthorized);
    byKey.set(
      key,
      isUnauthorized
        ? {
            sourceModule: edge.sourceModule,
            targetModule: edge.targetModule,
            unauthorized: true,
          }
        : {
            sourceModule: edge.sourceModule,
            targetModule: edge.targetModule,
          },
    );
  }
  return [...byKey.values()];
};

/**
 * Places dependency nodes in deterministic levels. Extra direct edges do not
 * create fake nodes: they are rendered from the exact normalized graph passed
 * in by the control plane.
 */
const layoutNodes = (
  nodes: readonly ArchitectureGraphNode[],
  edges: readonly ArchitectureGraphEdge[],
): PositionedNode[] => {
  const ids = new Set(nodes.map((node) => node.id));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const levels = new Map<string, number>();

  for (const node of nodes) {
    incoming.set(node.id, 0);
    outgoing.set(node.id, []);
  }

  for (const edge of edges) {
    if (!ids.has(edge.sourceModule) || !ids.has(edge.targetModule)) {
      continue;
    }
    incoming.set(edge.targetModule, (incoming.get(edge.targetModule) ?? 0) + 1);
    outgoing.get(edge.sourceModule)?.push(edge.targetModule);
  }

  const queue = nodes
    .filter((node) => (incoming.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  for (const id of queue) {
    levels.set(id, 0);
  }

  let cursor = 0;
  while (cursor < queue.length) {
    const source = queue[cursor];
    cursor += 1;
    if (!source) {
      continue;
    }
    const sourceLevel = levels.get(source) ?? 0;
    for (const target of outgoing.get(source) ?? []) {
      levels.set(target, Math.max(levels.get(target) ?? 0, sourceLevel + 1));
      incoming.set(target, (incoming.get(target) ?? 1) - 1);
      if ((incoming.get(target) ?? 0) === 0) {
        queue.push(target);
      }
    }
  }

  // Cycles or isolated vertices still need a predictable, inspectable place.
  for (const [index, node] of nodes.entries()) {
    if (!levels.has(node.id)) {
      levels.set(node.id, index);
    }
  }

  const maxLevel = Math.max(0, ...levels.values());
  const byLevel = new Map<number, ArchitectureGraphNode[]>();
  for (const node of nodes) {
    const level = levels.get(node.id) ?? 0;
    const current = byLevel.get(level) ?? [];
    current.push(node);
    byLevel.set(level, current);
  }

  return nodes.map((node) => {
    const level = levels.get(node.id) ?? 0;
    const nodesAtLevel = byLevel.get(level) ?? [node];
    const indexWithinLevel = nodesAtLevel.findIndex(
      (candidate) => candidate.id === node.id,
    );
    const verticalSpace = Math.max(
      0,
      graphHeight - verticalPadding * 2 - nodeHeight,
    );
    const x =
      horizontalPadding +
      (maxLevel === 0
        ? (graphWidth - horizontalPadding * 2 - nodeWidth) / 2
        : (level / maxLevel) * (graphWidth - horizontalPadding * 2 - nodeWidth));
    const y =
      verticalPadding +
      (nodesAtLevel.length === 1
        ? verticalSpace / 2
        : (indexWithinLevel / (nodesAtLevel.length - 1)) * verticalSpace);

    return { ...node, level, x, y };
  });
};

const edgePath = (
  source: PositionedNode,
  target: PositionedNode,
  isLongEdge: boolean,
): string => {
  const startX = source.x + nodeWidth;
  const startY = source.y + nodeHeight / 2;
  const endX = target.x;
  const endY = target.y + nodeHeight / 2;

  if (isLongEdge || Math.abs(startY - endY) > 12) {
    const curve = Math.max(54, Math.abs(endX - startX) * 0.38);
    return `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
  }

  return `M ${startX} ${startY} L ${endX} ${endY}`;
};

/**
 * Renders intended or persisted actual dependency graphs. Unauthorized status
 * is supplied with the normalized edge, never inferred or fabricated here.
 */
export function ArchitectureGraph({
  title,
  nodes,
  edges,
  emphasizedUnauthorized = false,
}: ArchitectureGraphProps) {
  const titleId = useId();
  const descriptionId = useId();
  const markerId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const graphEdges = uniqueEdges(edges);
  const positionedNodes = layoutNodes(nodes, graphEdges);
  const nodesById = new Map(positionedNodes.map((node) => [node.id, node]));
  const unauthorizedEdges = graphEdges.filter((edge) => edge.unauthorized);

  if (nodes.length === 0) {
    return (
      <section
        className="architecture-graph architecture-graph--empty"
        aria-labelledby={titleId}
      >
        <div className="architecture-graph__header">
          <p className="eyebrow">Dependency graph</p>
          <h3 id={titleId}>{title}</h3>
        </div>
        <p>No normalized architecture nodes were persisted for this validation run.</p>
      </section>
    );
  }

  return (
    <section
      className={`architecture-graph${
        emphasizedUnauthorized && unauthorizedEdges.length > 0
          ? " architecture-graph--attention"
          : ""
      }`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div className="architecture-graph__header">
        <div>
          <p className="eyebrow">Dependency graph</p>
          <h3 id={titleId}>{title}</h3>
        </div>
        <span className="architecture-graph__edge-count">
          {graphEdges.length} {graphEdges.length === 1 ? "edge" : "edges"}
        </span>
      </div>
      <p id={descriptionId} className="sr-only">
        {unauthorizedEdges.length > 0
          ? `${unauthorizedEdges.length} unauthorized dependency ${
              unauthorizedEdges.length === 1 ? "is" : "are"
            } highlighted in this graph.`
          : "All displayed dependencies are unflagged in this graph."}
      </p>

      <div className="architecture-graph__canvas">
        <svg
          className="architecture-graph__svg"
          viewBox={`0 0 ${graphWidth} ${graphHeight}`}
          role="img"
          aria-labelledby={`${titleId} ${descriptionId}`}
        >
          <defs>
            <marker
              id={`${markerId}-default`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path className="architecture-graph__arrow" d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
            <marker
              id={`${markerId}-unauthorized`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path className="architecture-graph__arrow architecture-graph__arrow--unauthorized" d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>

          {graphEdges.map((edge) => {
            const source = nodesById.get(edge.sourceModule);
            const target = nodesById.get(edge.targetModule);
            if (!source || !target) {
              return null;
            }
            const isUnauthorized = Boolean(edge.unauthorized);
            const label = `${displayModule(source)} depends on ${displayModule(target)}${
              isUnauthorized ? "; unauthorized dependency" : ""
            }`;
            return (
              <path
                key={edgeKey(edge)}
                className={`architecture-graph__edge${
                  isUnauthorized ? " architecture-graph__edge--unauthorized" : ""
                }`}
                d={edgePath(source, target, target.level - source.level > 1)}
                markerEnd={`url(#${markerId}-${
                  isUnauthorized ? "unauthorized" : "default"
                })`}
                aria-label={label}
                tabIndex={0}
              >
                <title>{label}</title>
              </path>
            );
          })}

          {positionedNodes.map((node) => (
            <g
              key={node.id}
              className="architecture-graph__node"
              tabIndex={0}
              aria-label={`${displayModule(node)} module`}
            >
              <title>{`${displayModule(node)} module`}</title>
              <rect x={node.x} y={node.y} width={nodeWidth} height={nodeHeight} rx="9" />
              <text x={node.x + nodeWidth / 2} y={node.y + nodeHeight / 2 - 4} textAnchor="middle">
                {displayModule(node)}
              </text>
              <text
                className="architecture-graph__node-id"
                x={node.x + nodeWidth / 2}
                y={node.y + nodeHeight / 2 + 15}
                textAnchor="middle"
              >
                {node.id}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {unauthorizedEdges.length > 0 && (
        <div className="architecture-graph__legend" role="note">
          <span className="architecture-graph__legend-swatch" aria-hidden="true" />
          <span>
            Unauthorized dependency: {unauthorizedEdges.length} edge
            {unauthorizedEdges.length === 1 ? "" : "s"}
          </span>
        </div>
      )}

      <ul className="architecture-graph__edge-summary" aria-label="Displayed dependencies">
        {graphEdges.map((edge) => {
          const source = nodesById.get(edge.sourceModule);
          const target = nodesById.get(edge.targetModule);
          if (!source || !target) {
            return null;
          }
          return (
            <li key={`summary-${edgeKey(edge)}`}>
              <span>{displayModule(source)}</span>
              <span aria-hidden="true">→</span>
              <span>{displayModule(target)}</span>
              {edge.unauthorized && <strong>Unauthorized</strong>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
