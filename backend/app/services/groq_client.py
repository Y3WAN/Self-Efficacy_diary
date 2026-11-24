import asyncio
import json
import logging
from groq import AsyncGroq, RateLimitError
from app.core.config import settings

logger = logging.getLogger(__name__)
_client: AsyncGroq | None = None


def get_groq() -> AsyncGroq:
    global _client
    if _client is None:
        _client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    return _client


# 분당 토큰 한도(429)에 걸리면 잠깐 기다렸다가 다시 시도한다 (부스처럼 요청이 몰릴 때).
# SDK 자체 재시도는 대기 시간이 짧아 분 단위 한도가 풀리기 전에 끝나 버린다.
RATE_LIMIT_WAITS = (4, 8)


async def chat_json(messages: list[dict]) -> dict:
    for wait in (*RATE_LIMIT_WAITS, None):
        try:
            resp = await get_groq().chat.completions.create(
                model=settings.GROQ_MODEL,
                messages=messages,
                response_format={"type": "json_object"},
                temperature=0.3,
            )
            break
        except RateLimitError:
            if wait is None:
                raise
            logger.warning("Groq rate limit, retrying in %ss", wait)
            await asyncio.sleep(wait)
    text = resp.choices[0].message.content
    return json.loads(text)
