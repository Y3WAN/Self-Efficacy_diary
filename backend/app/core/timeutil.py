from datetime import date, datetime, timedelta, timezone

# 서비스 기준 시간대 (한국, DST 없음)
KST = timezone(timedelta(hours=9), "KST")


def today_kst() -> date:
    return datetime.now(KST).date()
