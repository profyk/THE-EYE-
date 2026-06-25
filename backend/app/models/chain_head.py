from sqlalchemy import BigInteger, Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

GENESIS_HASH = "0" * 64


class ChainHead(Base):
    """Singleton row tracking the tip of the hash chain. Locked with SELECT ... FOR UPDATE
    during appends to serialize writers (see app/ledger/append.py)."""

    __tablename__ = "chain_head"
    __table_args__ = {"schema": "ledger"}

    id: Mapped[bool] = mapped_column(Boolean, primary_key=True, default=True)
    last_sequence_num: Mapped[int] = mapped_column(BigInteger, default=0)
    last_hash: Mapped[str] = mapped_column(String(64), default=GENESIS_HASH)
