"""AnnotationEdit モデル.

ユーザーによるアノテーション編集差分を保持するシャドウテーブル.
元の sample_annotations テーブルは破壊せず, 編集をこのテーブルに記録する.
"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AnnotationEdit(Base):
    """ユーザーによるアノテーション編集差分.

    edit_type による分類:
      - 'modify': base_token の SampleAnnotation を編集.
                  prev/next は隣接アノテーションを書き換える際にも使用される
                  (例: 'add' edit の前後のアノテーションを書き換える).
      - 'add':    新規アノテーション. base_token は NULL,
                  token は新規生成された UUID-like 値.
                  prev/next は同 instance 内の隣接アノテーションを指す.
      - 'delete': base_token の SampleAnnotation を論理削除.

    マージ規則 (読み出し時):
      - 'modify': base SampleAnnotation のフィールドを edits の非 NULL 値で上書き
                  (NULL は変更しないことを意味する).
      - 'add':    新規 SampleAnnotation として結果に追加.
      - 'delete': 該当 SampleAnnotation を結果から除外.
    """
    __tablename__ = "annotation_edits"
    # ── 識別 ──
    token:          Mapped[str] = mapped_column(String, primary_key=True)
    # 元 SampleAnnotation への参照 (modify/delete の場合は必須, add の場合は NULL)
    base_token:     Mapped[str | None] = mapped_column(
        ForeignKey("sample_annotations.token", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    edit_type:      Mapped[str] = mapped_column(String, nullable=False)  # 'modify' | 'add' | 'delete'
    # ── アノテーション本体 (add / modify で使用) ──
    sample_token:   Mapped[str | None] = mapped_column(
        ForeignKey("samples.token", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    instance_token: Mapped[str | None] = mapped_column(
        String,  # FK は付けない: instances または instance_edits を指す可能性がある
        nullable=True,
        index=True,
    )
    translation:    Mapped[list | None] = mapped_column(JSON, nullable=True)
    rotation:       Mapped[list | None] = mapped_column(JSON, nullable=True)
    size:           Mapped[list | None] = mapped_column(JSON, nullable=True)
    # 前後アノテーション. FK は付けない:
    #   - 隣接が SampleAnnotation か AnnotationEdit('add') のどちらか不定
    #   - 整合性はアプリケーションロジック (Repository) で保証
    prev:           Mapped[str | None] = mapped_column(String, nullable=True)
    next:           Mapped[str | None] = mapped_column(String, nullable=True)
    # chain 書き換え時の補助フラグ (両方とも False が初期値, 書き換え完了後に True にする)
    prev_cleared: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default='false'
    )
    next_cleared: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default='false'
    )
    # ── 関連 ──
    visibility_token: Mapped[str | None] = mapped_column(
        ForeignKey("visibilities.token", ondelete="SET NULL"),
        nullable=True,
    )
    attribute_tokens: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # ── メタ情報 ──
    # 楽観的ロック用バージョン
    version:        Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # マルチユーザー対応用 (現状は常に NULL)
    user_id:        Mapped[str | None] = mapped_column(String, nullable=True)
    # タイムスタンプ
    created_at:     Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at:     Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

class InstanceEdit(Base):
    """ユーザーが新規追加した Instance."""
    __tablename__ = "instance_edits"

    token:          Mapped[str] = mapped_column(String, primary_key=True)
    category_token: Mapped[str] = mapped_column(
        ForeignKey("categories.token", ondelete="RESTRICT"),
        nullable=False,
    )
    version:        Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    user_id:        Mapped[str | None] = mapped_column(String, nullable=True)
    created_at:     Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at:     Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
