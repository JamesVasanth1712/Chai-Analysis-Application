from typing import AsyncIterator, List, Optional
from openai import APIConnectionError, APITimeoutError, AsyncOpenAI
import structlog
from app.core.config import settings

logger = structlog.get_logger()


def _make_client() -> AsyncOpenAI:
    return AsyncOpenAI(
        api_key=settings.OPENROUTER_API_KEY,
        base_url=settings.OPENROUTER_BASE_URL,
        timeout=20.0,
        default_headers={
            "HTTP-Referer": settings.OPENROUTER_SITE_URL,
            "X-Title": settings.OPENROUTER_SITE_NAME,
        },
    )


_client: Optional[AsyncOpenAI] = None


def get_llm_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = _make_client()
    return _client


class LLMService:
    def __init__(self):
        self.client = get_llm_client()

    async def complete(
        self,
        model: str,
        messages: List[dict],
        temperature: float = 0.3,
        max_tokens: int = 4096,
        response_format: Optional[dict] = None,
    ) -> dict:
        """Complete with fallback model support."""
        models_to_try = [model] + [m for m in settings.FALLBACK_MODELS if m != model]

        last_error = None
        for attempt_model in models_to_try:
            try:
                kwargs = {
                    "model": attempt_model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                }
                if response_format:
                    kwargs["response_format"] = response_format

                response = await self.client.chat.completions.create(**kwargs)
                if attempt_model != model:
                    logger.warning("llm_fallback", primary=model, used=attempt_model)
                return {
                    "content": response.choices[0].message.content,
                    "model": attempt_model,
                    "tokens": response.usage.total_tokens if response.usage else 0,
                }
            except Exception as e:
                last_error = e
                logger.warning("llm_model_failed", model=attempt_model, error=str(e))
                if isinstance(e, (APIConnectionError, APITimeoutError)):
                    break
                continue

        raise RuntimeError(f"All models failed. Last error: {last_error}")

    async def stream(
        self,
        model: str,
        messages: List[dict],
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> AsyncIterator[str]:
        """Stream completion chunks."""
        models_to_try = [model] + [m for m in settings.FALLBACK_MODELS if m != model]

        for attempt_model in models_to_try:
            try:
                stream = await self.client.chat.completions.create(
                    model=attempt_model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    stream=True,
                )
                async for chunk in stream:
                    delta = chunk.choices[0].delta.content
                    if delta:
                        yield delta
                return
            except Exception as e:
                logger.warning("llm_stream_failed", model=attempt_model, error=str(e))
                continue

        raise RuntimeError("All models failed during streaming")


llm_service = LLMService()
