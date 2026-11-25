"""로컬 전용: 이 PC에 로그인된 Claude Code(`claude -p`)로 AI 호출을 대신한다.

배포 서버(Railway)에는 claude CLI가 없으므로 LLM_PROVIDER=claude_code는 로컬 .env에서만 쓴다.
도구·MCP·세션 저장을 모두 끄고, 프로젝트 CLAUDE.md가 섞이지 않게 빈 임시 폴더에서 실행한다.
"""
import asyncio
import json
import logging
import shutil
import subprocess
import tempfile

from app.core.config import settings

logger = logging.getLogger(__name__)

JSON_RULE = "\n\n[출력 규칙] 설명이나 코드블록 없이 JSON 객체 하나만 출력한다."
_workdir = tempfile.mkdtemp(prefix="codemyworld_claude_")


def _split(messages: list[dict]) -> tuple[str, str]:
    system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
    convo = [m for m in messages if m["role"] != "system"]
    if len(convo) == 1:
        prompt = convo[0]["content"]
    else:  # 상담처럼 이전 대화가 있는 경우 대화록으로 넘긴다
        names = {"user": "사용자", "assistant": "AI"}
        prompt = "\n\n".join(f"[{names.get(m['role'], m['role'])}]\n{m['content']}" for m in convo)
        prompt += "\n\n위 대화의 마지막 [사용자] 말에 [AI]로서 답한다."
    return system + JSON_RULE, prompt


def _parse_json(text: str) -> dict:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise
        return json.loads(text[start:end + 1])


def _run(system: str, prompt: str) -> dict:
    exe = shutil.which("claude")
    if not exe:
        raise RuntimeError("claude CLI를 찾을 수 없습니다 (LLM_PROVIDER=claude_code는 로컬 전용)")
    cmd = [
        exe, "-p",
        "--output-format", "json",
        "--model", settings.CLAUDE_CODE_MODEL,
        "--system-prompt", system,
        "--tools", "",
        "--strict-mcp-config",
        "--no-session-persistence",
    ]
    proc = subprocess.run(
        cmd, input=prompt, capture_output=True, text=True, encoding="utf-8",
        cwd=_workdir, timeout=settings.CLAUDE_CODE_TIMEOUT,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"claude CLI 실패({proc.returncode}): {proc.stderr.strip() or proc.stdout.strip()}"[:500])
    envelope = json.loads(proc.stdout)
    if envelope.get("is_error"):
        raise RuntimeError(f"claude CLI 오류: {envelope.get('result')}"[:500])
    return _parse_json(envelope["result"])


async def chat_json_claude_code(messages: list[dict]) -> dict:
    system, prompt = _split(messages)
    # Windows에서는 이벤트 루프 종류에 따라 asyncio 서브프로세스가 안 되므로 스레드에서 실행
    return await asyncio.to_thread(_run, system, prompt)
