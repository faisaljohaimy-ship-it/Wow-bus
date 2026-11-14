"""Identity, sessions and role-based access control.

Roles (ascending privilege): reader < analyst < admin < owner.

- Global role gates platform-wide actions: managing users, editing the tool
  registry, flipping the global stop switch.
- Project role gates project data. A platform owner/admin has admin rights on
  every project; otherwise the project_members row (or project ownership)
  decides. Everything is enforced server-side. One addition while the public
  read-only view is on: every signed-in account is at least a reader of the
  public demo project.
- "guest" is NOT a role a user can hold. It names the unauthenticated visitor
  of the optional public read-only view (FSL_PUBLIC_VIEW=1): it ranks below
  reader, fails every global check, and reads exactly one designated demo
  project. See GuestPrincipal.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass

from . import util
from .config import get_config
from .db import get_db
from .errors import AuthError, ConflictError, ForbiddenError, ValidationError

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
        role = row["role"] if row else "none"
        # While the public view is on, a signed-in account never sees less than
        # an anonymous visitor: it is at least a reader of the public demo
        # project. Anything above reader still comes from membership only.
        if rank(role) < rank("reader") and project_id and project_id == public_project_id():
            return "reader"
        return role

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

    @property
    def guest(self) -> bool:
        return False


# ---------------------------------------------------------------------------
# Public read-only view: the guest principal
# ---------------------------------------------------------------------------
GUEST_ID = "guest"
GUEST_ROLE = "guest"            # deliberately absent from ROLE_RANK (rank 0)
PUBLIC_PROJECT_KEY = "public_project_id"   # settings key written by app/demo.py


def public_project_id() -> str:
    """Id of the one project a guest (and every signed-in account) may read,
    or "" when there is none.

    Empty whenever the public view is switched off, so turning the flag off
    revokes guest access even if a demo project was created earlier. The stored
    id is honoured only while it names a project owned by the reserved,
    inactive system account, so a guest can never be pointed at anybody's real
    project; if that invariant is ever broken the answer is "" (fail closed)."""
    if not get_config().public_view:
        return ""
    db = get_db()
    pid = db.get_setting(PUBLIC_PROJECT_KEY, "")
    if not pid:
        return ""
    row = db.query_one(
        "SELECT p.id FROM projects p JOIN users u ON u.id=p.owner_id "
        "WHERE p.id=? AND u.email=? AND u.active=0", (pid, SYSTEM_DEMO_EMAIL))
    return row["id"] if row else ""


@dataclass
class GuestPrincipal(Principal):
    """The unauthenticated visitor of the public read-only view.

    It is never backed by a user row or a session. Its only right is the
    'reader' role on the public demo project; it holds no global role, so every
    require_global check fails, and it can never satisfy more than 'reader' on
    any project. Which routes may resolve a guest at all is a separate, explicit
    allowlist in app/server.py (guest_ok=True on GET routes)."""
    user_id: str = GUEST_ID
    email: str = GUEST_ID
    global_role: str = GUEST_ROLE

    @property
    def guest(self) -> bool:
        return True

    def project_role(self, project_id: str) -> str:
        public = public_project_id()
        return "reader" if public and project_id == public else "none"

    def require_global(self, min_role: str) -> None:
        raise ForbiddenError("sign-in required", detail={"have": GUEST_ROLE})

    def require_project(self, project_id: str, min_role: str) -> None:
        have = self.project_role(project_id)
        # Strict: only an exact 'reader' requirement on the public project.
        if min_role != "reader" or have != "reader":
            # The requested id is not repeated to a guest. It can be any text
            # (GET /api/metrics?project=...), and the guest view rewrites
            # server directories in what a guest is sent: an echo would tell
            # the visitor whether a guessed directory is the right one.
            raise ForbiddenError(f"requires project role '{min_role}'", detail={"have": have})


def guest_principal() -> GuestPrincipal:
    return GuestPrincipal()


# ---------------------------------------------------------------------------
# User management
# ---------------------------------------------------------------------------
MIN_PASSWORD_LENGTH = 10
DEFAULT_OWNER_EMAIL = "owner@faisal-security-lab.local"
# Reserved, non-loginable account that owns the public demo project. It cannot
# be created through create_user (nor used as the owner sign-in) and is only
# ever inserted inactive, by ensure_system_user.
SYSTEM_DEMO_EMAIL = "public-demo@system.invalid"


# The address syntax a browser <input type="email"> accepts (WHATWG HTML), so
# the server and the sign-in form agree on what counts as an email.
_LABEL = r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
_EMAIL_RE = re.compile(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@" + _LABEL + r"(?:\." + _LABEL + r")*")


def valid_email(email: str) -> bool:
    email = email or ""
    return len(email) <= 254 and _EMAIL_RE.fullmatch(email) is not None


def create_user(email: str, password: str, *, display_name: str = "",
                global_role: str = "reader") -> dict:
    email = (email or "").strip().lower()
    if not valid_email(email):
        raise ValidationError("valid email required")
    if len(password or "") < MIN_PASSWORD_LENGTH:
        raise ValidationError(f"password must be at least {MIN_PASSWORD_LENGTH} characters")
    if global_role not in ROLE_RANK:
        raise ValidationError("invalid role")
    if email == SYSTEM_DEMO_EMAIL:
        raise ValidationError("this email is reserved for a system account")
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


def ensure_system_user(email: str = SYSTEM_DEMO_EMAIL,
                       display_name: str = "Public demo (system)") -> str:
    """Return the id of a NON-LOGINABLE system account, creating it if missing.

    The account is inactive (login and session resolution both require
    active=1) and its password is random and discarded here, never returned or
    logged. It exists only so system-owned rows (the public demo project) have
    a valid owner. Idempotent.

    An existing row under the reserved address that is ACTIVE is not something
    this code created; it is refused rather than reused or modified, so a
    loginable account can never end up owning the public project."""
    db = get_db()
    row = db.query_one("SELECT id, active FROM users WHERE email=?", (email,))
    if row:
        if row["active"] != 0:
            raise ConflictError("the reserved system account is active; refusing to use it")
        return row["id"]
    uid = util.new_id("usr")
    db.execute(
        "INSERT INTO users(id,email,display_name,password_hash,global_role,active,created_at) "
        "VALUES(?,?,?,?,?,0,?)",
        (uid, email, display_name, util.hash_password(util.token()), "reader", util.now_iso()))
    return uid


def bootstrap_owner() -> dict:
    """Ensure an owner exists. Password comes from FSL_OWNER_PASSWORD, else a
    one-time bootstrap password is generated and returned (surfaced once, to the
    console only — never logged into the DB in plaintext).

    Operator input is typed by hand into a hosting dashboard, so a bad value
    must never crash the service. Instead this returns `notices` (stable codes)
    that the server logs and the sign-in page explains:
      owner_email_invalid       FSL_OWNER_EMAIL is not an email; the default is used
      owner_email_ignored       FSL_OWNER_EMAIL is not an email and an owner at another
                                address exists; nothing is created or changed
      owner_password_too_short  FSL_OWNER_PASSWORD is too short; NO owner is created
      owner_password_generated  no password was set; a one-time one is in the logs
    """
    cfg = get_config()
    db = get_db()
    notices: list[str] = []

    email = cfg.owner_email
    # The reserved system address can never be a sign-in, so it is not a usable
    # owner email either.
    if not valid_email(email) or email == SYSTEM_DEMO_EMAIL:
        # The default address is only for a system nobody can sign in to yet.
        # Once an owner exists at another address, a mistyped value must not
        # add a second owner under a well-known address. An owner at the
        # default address is this fallback's own account from an earlier
        # start: it does not count, so every start keeps naming the address
        # that works.
        if db.query_one("SELECT id FROM users WHERE global_role='owner' AND active=1 "
                        "AND email<>?", (DEFAULT_OWNER_EMAIL,)):
            notices.append("owner_email_ignored")
            return {"email": None, "created": False, "generated": False,
                    "password": None, "notices": notices}
        notices.append("owner_email_invalid")
        email = DEFAULT_OWNER_EMAIL

    result = {"email": email, "created": False, "generated": False,
              "password": None, "notices": notices}
    if db.query_one("SELECT id FROM users WHERE email=?", (email,)):
        return result

    # Surrounding whitespace from a pasted/typed dashboard value is never intended.
    pw = os.environ.get("FSL_OWNER_PASSWORD", "").strip()
    generated = False
    if not pw:
        pw = util.token()[:20]
        generated = True
        notices.append("owner_password_generated")
    elif len(pw) < MIN_PASSWORD_LENGTH:
        # Refuse a weak owner password, but keep the service up so the sign-in
        # page can say exactly what to fix. Nobody can sign in until it is fixed.
        notices.append("owner_password_too_short")
        return result

    user = create_user(email, pw, display_name="Owner", global_role="owner")
    result.update({"email": user["email"], "created": True, "generated": generated,
                   "password": pw if generated else None})
    return result


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------
_DUMMY_PASSWORD_HASH: str | None = None


def _dummy_password_hash() -> str:
    """A stand-in hash to verify against when there is no account; it costs
    the same as a real one and is computed on first use."""
    global _DUMMY_PASSWORD_HASH
    if _DUMMY_PASSWORD_HASH is None:
        _DUMMY_PASSWORD_HASH = util.hash_password(util.token())
    return _DUMMY_PASSWORD_HASH


def _password_matches(password: str, encoded: str) -> bool:
    """Check the password as submitted, then without surrounding whitespace.

    bootstrap_owner stores FSL_OWNER_PASSWORD stripped, so an operator who
    types the padded value they put in the dashboard must still get in. The
    submitted form is tried first so a password that really has surrounding
    spaces keeps working.
    """
    if util.verify_password(password, encoded):
        return True
    stripped = password.strip()
    return stripped != password and util.verify_password(stripped, encoded)


def login(email: str, password: str) -> dict:
    email = (email or "").strip().lower()
    password = password or ""
    db = get_db()
    row = db.query_one("SELECT * FROM users WHERE email=? AND active=1", (email,))
    if not row:
        # Spend the same hashing work as for a real account, so the response
        # time does not reveal whether the email is registered.
        _password_matches(password, _dummy_password_hash())
        raise AuthError("invalid credentials")
    if not _password_matches(password, row["password_hash"]):
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
