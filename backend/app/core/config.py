from pydantic_settings import BaseSettings, SettingsConfigDict, PydanticBaseSettingsSource
from typing import Tuple, Type


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    DATABASE_URL: str
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_HOURS: int = 24
    GROQ_API_KEY: str = ""
    # Groq에서 쓸 모델 (서비스 종료 시 환경변수로 교체)
    GROQ_MODEL: str = "openai/gpt-oss-120b"
    # AI 호출 방식: "groq"(배포 기본값) | "claude_code"(로컬 전용, 이 PC에 로그인된 claude CLI 사용)
    LLM_PROVIDER: str = "groq"
    CLAUDE_CODE_MODEL: str = "claude-opus-5-5"
    CLAUDE_CODE_TIMEOUT: int = 120
    FRONTEND_URL: str = "http://localhost:5173"
    # 운영 환경에서는 반드시 False (포인트 어뷰징 가능)
    ENABLE_DEBUG_API: bool = False

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: Type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> Tuple[PydanticBaseSettingsSource, ...]:
        # 시스템 환경변수 우선 (Render 배포 시 필요)
        return (init_settings, env_settings, dotenv_settings, file_secret_settings)


settings = Settings()
