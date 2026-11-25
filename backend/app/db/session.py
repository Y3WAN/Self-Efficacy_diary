from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.core.config import settings

# URL에서 sslmode/ssl 파라미터 제거 후 connect_args로 SSL 처리
_db_url = settings.DATABASE_URL.split("?")[0]
# Railway 등이 주는 postgres:// · postgresql:// 주소를 asyncpg 드라이버용으로 변환
for _prefix in ("postgresql://", "postgres://"):
    if _db_url.startswith(_prefix):
        _db_url = "postgresql+asyncpg://" + _db_url[len(_prefix):]
        break
_ssl = "neon.tech" in _db_url

# 요청마다 DB에 새로 접속하면 느리므로 연결을 재사용한다.
# 예전 NullPool은 오래 쉰 연결이 끊겨 cron이 실패하던 문제 때문이었는데,
# pool_pre_ping(쓰기 전 연결 확인)과 pool_recycle(5분마다 새 연결)로 같은 문제를 막는다.
engine = create_async_engine(
    _db_url,
    echo=False,
    pool_size=5,
    max_overflow=5,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args={"ssl": True} if _ssl else {},
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
