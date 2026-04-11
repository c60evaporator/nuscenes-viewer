from sqlalchemy import Column, String, Integer, BigInteger, Boolean, ForeignKey, Text
from sqlalchemy.orm import relationship, Mapped, mapped_column
from app.db.base import Base

class Log(Base):
    """走行ログ（場所・車両・日付等のメタ情報）"""
    __tablename__ = "logs"
    # Columns
    token:        Mapped[str] = mapped_column(String, primary_key=True)
    logfile:      Mapped[str] = mapped_column(String, nullable=False)
    vehicle:      Mapped[str] = mapped_column(String, nullable=False)
    date_captured: Mapped[str] = mapped_column(String, nullable=False)
    location:     Mapped[str] = mapped_column(String, nullable=False)  # 'boston-seaport' etc.
    # Relationships
    scenes: Mapped[list["Scene"]] = relationship(
        back_populates="log",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
 
 
class Scene(Base):
    """シーン（約20秒の走行シーケンス）"""
    __tablename__ = "scenes"
    # Columns
    token:       Mapped[str] = mapped_column(String, primary_key=True)
    log_token:   Mapped[str] = mapped_column(
        ForeignKey("logs.token", ondelete="RESTRICT"), nullable=False
    )
    name:        Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    nbr_samples: Mapped[int] = mapped_column(Integer, nullable=False)
    first_sample_token: Mapped[str] = mapped_column(String, nullable=False)
    last_sample_token:  Mapped[str] = mapped_column(String, nullable=False)
    # Relationships
    log:     Mapped["Log"]          = relationship(back_populates="scenes")
    samples: Mapped[list["Sample"]] = relationship(
        back_populates="scene",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
 
 
class Sample(Base):
    """サンプル（キーフレーム、約0.5秒間隔）"""
    __tablename__ = "samples"
    # Columns
    token:       Mapped[str] = mapped_column(String, primary_key=True)
    scene_token: Mapped[str] = mapped_column(
        ForeignKey("scenes.token", ondelete="CASCADE"), nullable=False
    )
    timestamp:   Mapped[int] = mapped_column(BigInteger, nullable=False)  # UNIX usec
    # 隣接フレーム参照：参照先が消えても行は残す
    prev: Mapped[str | None] = mapped_column(
        ForeignKey("samples.token", ondelete="SET NULL"), nullable=True
    )
    next: Mapped[str | None] = mapped_column(
        ForeignKey("samples.token", ondelete="SET NULL"), nullable=True
    )
    # Relationships
    scene:       Mapped["Scene"]                  = relationship(back_populates="samples")
    sample_data: Mapped[list["SampleData"]]       = relationship(
        back_populates="sample",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    annotations: Mapped[list["SampleAnnotation"]] = relationship(
        back_populates="sample",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
 