type NotifyInput = {
  messageId?: string | null;
  conversationId?: string | null;
  title: string;
  body?: string | null;
  tagPrefix?: string;
};

const READ_STORAGE_KEY = "wa_read";
const NOTIFIED_STORAGE_KEY = "wa_notified_messages";

export function getWhatsAppReadMap(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(READ_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function markWhatsAppConversationRead(conversationId: string) {
  if (typeof window === "undefined") return;
  try {
    const read = getWhatsAppReadMap();
    read[conversationId] = Date.now();
    window.localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(read));
  } catch {}
}

export function getWhatsAppNotificationPermission() {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission;
}

export async function requestWhatsAppNotificationPermission() {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.requestPermission();
}

export function getWhatsAppMessagePreview(mediaType?: string | null, message?: string | null) {
  if (message?.trim()) return message.trim();
  const type = mediaType || "text";
  if (type.startsWith("image")) return "Foto";
  if (type.startsWith("video")) return "Video";
  if (type.startsWith("audio")) return "Audio";
  if (type === "document") return "Documento";
  if (type === "sticker") return "Sticker";
  if (type === "location") return "Ubicacion";
  if (type === "contacts") return "Contacto";
  return "Nuevo mensaje";
}

export function playWhatsAppNotificationSound() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const gain = ctx.createGain();
    gain.gain.value = 0.035;
    gain.connect(ctx.destination);

    [740, 980].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      const start = ctx.currentTime + index * 0.09;
      oscillator.start(start);
      oscillator.stop(start + 0.08);
    });

    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch {}
}

function hasNotified(messageId?: string | null) {
  if (!messageId || typeof window === "undefined") return false;
  try {
    const raw = window.sessionStorage.getItem(NOTIFIED_STORAGE_KEY) || "[]";
    const ids = JSON.parse(raw) as string[];
    return ids.includes(messageId);
  } catch {
    return false;
  }
}

function rememberNotified(messageId?: string | null) {
  if (!messageId || typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(NOTIFIED_STORAGE_KEY) || "[]";
    const ids = JSON.parse(raw) as string[];
    const next = [messageId, ...ids.filter((id) => id !== messageId)].slice(0, 80);
    window.sessionStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

export function notifyIncomingWhatsApp(input: NotifyInput) {
  if (hasNotified(input.messageId)) return;
  rememberNotified(input.messageId);

  playWhatsAppNotificationSound();

  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  const notification = new Notification(input.title, {
    body: input.body || "Nuevo mensaje",
    tag: `${input.tagPrefix || "whatsapp"}-${input.conversationId || input.messageId || "message"}`,
    silent: true,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}
