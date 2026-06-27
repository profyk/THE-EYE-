from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ledger_event import LedgerEvent

MAX_EDGES = 75


async def get_actor_target_network(db: AsyncSession, *, tenant_id: UUID) -> dict:
    """Actor -> target edge counts, capped to the top N by frequency. Rendered
    client-side as a hand-rolled SVG node-link diagram -- no graph library
    needed for a dataset this small."""
    stmt = (
        select(
            LedgerEvent.actor_id,
            LedgerEvent.target_type,
            LedgerEvent.target_id,
            func.count().label("weight"),
        )
        .where(LedgerEvent.target_id.is_not(None), LedgerEvent.tenant_id == tenant_id)
        .group_by(LedgerEvent.actor_id, LedgerEvent.target_type, LedgerEvent.target_id)
        .order_by(func.count().desc())
        .limit(MAX_EDGES)
    )
    rows = (await db.execute(stmt)).all()

    nodes: dict[str, str] = {}  # node id -> kind ("actor" or "target")
    edges = []
    for row in rows:
        actor_node = f"actor:{row.actor_id}"
        target_node = f"target:{row.target_type}:{row.target_id}"
        nodes[actor_node] = "actor"
        nodes[target_node] = "target"
        edges.append({"source": actor_node, "target": target_node, "weight": row.weight})

    return {
        "nodes": [{"id": node_id, "kind": kind, "label": node_id.split(":", 1)[1]} for node_id, kind in nodes.items()],
        "edges": edges,
    }
