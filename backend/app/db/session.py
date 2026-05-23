from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.core.config import settings

# URL에서 sslmode/ssl 파라미터 제거 후 connect_args로 SSL 처리
_db_url = settings.DATABASE_URL.split("?")[0]
_ssl = "neon.tech" in _db_url

engine = create_async_engine(
    _db_url,
    echo=False,
    connect_args={"ssl": True} if _ssl else {},
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
