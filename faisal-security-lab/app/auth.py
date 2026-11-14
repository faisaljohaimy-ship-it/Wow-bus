"""Identity, sessions and role-based access control.

Roles (ascending privilege): reader < analyst < admin < owner.

- Global role gates platform-wide actions: managing users, editing the tool
  registry, flipping the global stop switch.
- Project role gates project data. A platform owner/admin has admin rights on
  every project; otherwise the project_members row (or project ownership)
  decides. Everything is enforced server-side.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

from . import util
from .config import get_config
from .db import get_db
from .errors import AuthError, ForbiddenError, ValidationError

ROLE_RANK = {"reader": 1, "analyst": 2, "admin": 3, "owner": 4}


def rank(role: str) -> int:
    return ROLE_RANK.get(role, 0)


@dataclass
class Principal:
    user_id: str
    email: str
    global_role: str

    def project_role(self, project_id: str) -> str:
        """Effective role inside a project."""
        if self.global_role in ("owner", "admin"):
            return "admin"
        db = get_db()
        proj = db.query_one("SELECT owner_id FROM projects WHERE id=?", (project_id,))
        if proj and proj["owner_id"] == self.user_id:
            return "admin"
        row = db.query_one(
            "SELECT role FROM project_members WHERE project_id=? AND user_id=?",
            (project_id, self.user_id))
        return row["role"] if row else "none"

    def require_global(self, min_role: str) -> None:
        if rank(self.global_role) < rank(min_role):
            raise ForbiddenError(
                f"requires global role '{min_role}'", detail={"have": self.global_role})

    def require_project(self, project_id: str, min_role: str) -> None:
        have = self.project_role(project_id)
        if rank(have) < rank(min_role):
            raise ForbiddenError(
                f"requires project role '{min_role}'",
                detail={"have": have, "project_id": project_id})


# ---------------------------------------------------------------------------
# User management
# ---------------------------------------------------------------------------
def create_user(email: str, password: str, *, display_name: str = "",
                global_role: str = "reader") -> dict:
    email = (email or "").strip().lower()
    if "@" not in email or len(email) > 254:
        raise ValidationError("valid email required")
    if len(password or "") < 10:
        raise ValidationError("password must be at least 10 characters")
    if global_role not in ROLE_RANK:
        raise ValidationError("invalid role")
    db = get_db()
    if db.query_one("SELECT id FROM users WHERE email=?", (email,)):
        raise ValidationError("email already registered")
    uid = util.new_id("usr")
    db.execute(
        "INSERT INTO users(id,email,display_name,password_hash,global_role,active,created_at) "
        "VALUES(?,?,?,?,?,1,?)",
        (uid, email, display_name or email.split("@")[0],
         util.hash_password(password), global_role, util.now_iso()))
    return {"id": uid, "email": email, "global_role": global_role}


def bootstrap_owner() -> dict | None:
    """Ensure an owner exists. Password comes from FSL_OWNER_PASSWORD, else a
    one-time bootstrap password is generated and returned (surfaced once, to the
    console only — never logged into the DB in plaintext)."""
    cfg = get_config()
    db = get_db()
    existing = db.query_one("SELECT id,email FROM users WHERE email=?", (cfg.owner_email,))
    if existing:
        return None
    pw = os.environ.get("FSL_OWNER_PASSWORD", "")
    generated = False
    if not pw:
        pw = util.token()[:20]
        generated = True
    user = create_user(cfg.owner_email, pw, display_name="Owner", global_role="owner")
    return {"email": user["email"],
            "password": pw if generated else None,
            "generated": generated}


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------
def login(email: str, password: str) -> dict:
    email = (email or "").strip().lower()
    db = get_db()
    row = db.query_one("SELECT * FROM users WHERE email=? AND active=1", (email,))
    if not row or not util.verify_password(password or "", row["password_hash"]):
        raise AuthError("invalid credentials")
    tok = util.token()
    cfg = get_config()
    now = util.now()
    import datetime
    expires = now + datetime.timedelta(seconds=cfg.session_ttl_seconds)
    db.execute(
        "INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)",
        (util.sha256_text(tok), row["id"], util.iso(now), util.iso(expires)))
    return {"token": tok, "expires_at": util.iso(expires),
            "user": {"id": row["id"], "email": row["email"],
                     "global_role": row["global_role"],
                     "display_name": row["display_name"]}}


def principal_from_token(token: str | None) -> Principal:
    if not token:
        raise AuthError("missing session token")
    db = get_db()
    row = db.query_one(
        "SELECT s.expires_at, u.id, u.email, u.global_role, u.active "
        "FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?",
        (util.sha256_text(token),))
    if not row:
        raise AuthError("invalid session")
    if row["active"] != 1:
        raise AuthError("account disabled")
    if row["expires_at"] < util.now_iso():
        db.execute("DELETE FROM sessions WHERE token_hash=?", (util.sha256_text(token),))
        raise AuthError("session expired")
    return Principal(user_id=row["id"], email=row["email"], global_role=row["global_role"])


def logout(token: str) -> None:
    get_db().execute("DELETE FROM sessions WHERE token_hash=?", (util.sha256_text(token),))


def list_users() -> list[dict]:
    rows = get_db().query_all(
        "SELECT id,email,display_name,global_role,active,created_at FROM users ORDER BY created_at")
    return rows
