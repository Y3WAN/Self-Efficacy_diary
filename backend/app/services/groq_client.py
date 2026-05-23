import json
import logging
from groq import AsyncGroq
from app.core.config import settings

logger = logging.getLogger(__name__)
_client: AsyncGroq | None = None


def get_groq() -> AsyncGroq:
    global _client
    if _client is None:
        _client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    return _client


async def chat_json(messages: list[dict]) -> dict:
    resp = await get_groq().chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        response_format={"type": "json_object"},
        temperature=0.3,
    )
    text = resp.choices[0].message.content
    return json.loads(text)
