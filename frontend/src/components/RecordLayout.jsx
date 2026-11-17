import { useCallback, useLayoutEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { recordCalendarLocation } from "../utils/recordDate";

export default function RecordLayout() {
  const lastViewed = useRef(null);
  const rememberDate = useCallback((calendarKey, date) => {
    lastViewed.current = { calendarKey, date };
  }, []);
  const location = useLocation();
  const navigate = useNavigate();

  useLayoutEffect(() => {
    const record = lastViewed.current;
    if (location.pathname !== "/" || record?.calendarKey !== location.key) return;

    lastViewed.current = null;
    navigate(recordCalendarLocation(record.date, location.search), {
      replace: true,
      state: { focusCalendar: true },
    });
  }, [location, navigate]);

  return <Outlet context={rememberDate} />;
}
