"""Manage the shared tester mission, invite links, and submitted evaluations."""

import argparse
import asyncio
import json
from urllib.parse import urlsplit

from sqlalchemy import select

from app.core.config import settings
from app.db.session import AsyncSessionLocal, engine
from app.db.tester_models import TesterEvaluation
from app.services.tester_service import COMMON_MISSION_ID, create_tester_invites, prepare_common_mission


def frontend_origin(value: str) -> str:
    url = urlsplit(value)
    is_loopback = url.hostname in {"localhost", "127.0.0.1", "::1"}
    if (
        not url.hostname or url.username or url.password or url.query or url.fragment
        or url.path not in ("", "/")
        or (url.scheme != "https" and not (url.scheme == "http" and is_loopback))
    ):
        raise argparse.ArgumentTypeError("HTTPS 사이트 주소를 입력하세요. 로컬에서는 HTTP도 사용할 수 있습니다.")
    return value.rstrip("/")


async def run(args):
    try:
        async with AsyncSessionLocal() as db:
            if args.command == "prepare":
                mission = await prepare_common_mission(db)
                print(f"{mission.id}\n{mission.content}")
            elif args.command == "invite":
                for participant_id, token in await create_tester_invites(db, args.count, args.app_user_id):
                    print(f"{participant_id} {args.frontend_url}/tester#invite={token}")
            else:
                rows = await db.execute(
                    select(
                        TesterEvaluation.participant_id,
                        TesterEvaluation.mission_id,
                        TesterEvaluation.relevance,
                        TesterEvaluation.clarity,
                        TesterEvaluation.feasibility,
                        TesterEvaluation.comment,
                        TesterEvaluation.submitted_at,
                    ).where(TesterEvaluation.mission_id == COMMON_MISSION_ID)
                    .order_by(TesterEvaluation.submitted_at)
                )
                print(json.dumps([dict(row) for row in rows.mappings()], ensure_ascii=False, default=str))
    finally:
        await engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("prepare", help="Generate or show the saved common mission")
    invite = commands.add_parser("invite", help="Create a private link for each participant")
    invite.add_argument("--count", type=int, default=1)
    invite.add_argument("--frontend-url", type=frontend_origin, default=settings.FRONTEND_URL)
    invite.add_argument("--app-user-id", type=int, help="Use this consenting app user's current ELO")
    commands.add_parser("results", help="Export the submitted evaluations as JSON")
    args = parser.parse_args()
    if args.command == "invite":
        if args.count < 1:
            parser.error("--count must be positive")
        if args.app_user_id is not None and args.count != 1:
            parser.error("--app-user-id can be used for one invitation at a time")
    try:
        asyncio.run(run(args))
    except ValueError as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
