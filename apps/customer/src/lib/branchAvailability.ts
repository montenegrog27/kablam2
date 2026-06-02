export type BranchHour = {
  day_of_week: number;
  open_time?: string | null;
  close_time?: string | null;
  is_closed?: boolean | null;
};

export type BranchAvailabilitySettings = {
  web_open?: boolean | null;
  web_closed_message?: string | null;
  web_closed_reason?: string | null;
  web_closed_until?: string | null;
};

export type BranchAvailability = {
  isOpen: boolean;
  message: string;
  reason: "manual" | "temporary" | "hours" | null;
};

const DEFAULT_CLOSED_MESSAGE = "Estamos cerrados por el momento. Volve a intentar mas tarde.";
const TIME_ZONE = "America/Buenos_Aires";

function getArgentinaDayAndMinutes(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((part) => part.type === "weekday")?.value || "Sun";
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  const dayByName: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    day: dayByName[weekday] ?? now.getDay(),
    minutes: hour * 60 + minute,
  };
}

function timeToMinutes(value?: string | null) {
  if (!value) return null;
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function isInsideRange(current: number, open: number, close: number) {
  if (open === close) return true;
  if (open < close) return current >= open && current < close;
  return current >= open || current < close;
}

export function getBranchAvailability({
  settings,
  hours,
  now = new Date(),
}: {
  settings?: BranchAvailabilitySettings | null;
  hours?: BranchHour[] | null;
  now?: Date;
}): BranchAvailability {
  const closedMessage = settings?.web_closed_message || DEFAULT_CLOSED_MESSAGE;

  if (settings?.web_open === false) {
    return {
      isOpen: false,
      message: closedMessage,
      reason: "manual",
    };
  }

  if (settings?.web_closed_until && new Date(settings.web_closed_until).getTime() > now.getTime()) {
    return {
      isOpen: false,
      message: settings.web_closed_reason || closedMessage,
      reason: "temporary",
    };
  }

  const { day, minutes } = getArgentinaDayAndMinutes(now);
  const todayHours = hours?.find((hour) => Number(hour.day_of_week) === day);

  if (!todayHours) {
    return { isOpen: true, message: "", reason: null };
  }

  if (todayHours.is_closed) {
    return {
      isOpen: false,
      message: closedMessage,
      reason: "hours",
    };
  }

  const openMinutes = timeToMinutes(todayHours.open_time);
  const closeMinutes = timeToMinutes(todayHours.close_time);

  if (openMinutes === null || closeMinutes === null) {
    return { isOpen: true, message: "", reason: null };
  }

  if (!isInsideRange(minutes, openMinutes, closeMinutes)) {
    return {
      isOpen: false,
      message: closedMessage,
      reason: "hours",
    };
  }

  return { isOpen: true, message: "", reason: null };
}
