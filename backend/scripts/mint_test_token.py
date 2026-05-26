"""Mint a local HS256 JWT for backend testing WITHOUT a live Supabase session.

The token is signed with SUPABASE_JWT_SECRET from your .env, matching what app/security.py
verifies. Useful for hitting the API/WS with curl/websocat before Supabase is wired up.

Run from the backend/ directory:
    uv run python scripts/mint_test_token.py --role recruiter
    uv run python scripts/mint_test_token.py --role candidate --email c@example.com
"""

from __future__ import annotations

import argparse
import sys
import time
import uuid
from pathlib import Path

import jwt


def main() -> None:
    # Make the backend package importable when run as a loose script.
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from app.config import get_settings

    parser = argparse.ArgumentParser(description="Mint a local Supabase-style HS256 JWT.")
    parser.add_argument("--role", choices=["candidate", "recruiter"], default="recruiter")
    parser.add_argument("--email", default="dev@example.com")
    parser.add_argument("--sub", default=None, help="User UUID (random if omitted)")
    parser.add_argument("--hours", type=int, default=8, help="Token lifetime in hours")
    args = parser.parse_args()

    settings = get_settings()
    sub = args.sub or str(uuid.uuid4())
    now = int(time.time())
    payload = {
        "sub": sub,
        "aud": settings.jwt_audience,
        "email": args.email,
        "role": "authenticated",
        "user_metadata": {"role": args.role},
        "iat": now,
        "exp": now + args.hours * 3600,
    }
    token = jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")
    print(f"# user_id={sub} role={args.role}")
    print(token)


if __name__ == "__main__":
    main()
