import { createSupabaseServer } from "@kablam/supabase/server";
import { Calendar, Clock, MapPin } from "lucide-react";
import FontLoader from "@/app/components/FontLoader";
import { getBrandFontFamily } from "@/lib/fonts";

function formatDate(value?: string | null) {
  if (!value) return "Fecha a confirmar";
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatTime(value?: string | null) {
  return value?.slice(0, 5) || "";
}

export default async function ReservationsHubPage({
  params,
}: {
  params: Promise<{ branchSlug: string }>;
}) {
  const supabase = await createSupabaseServer();
  const { branchSlug } = await params;

  const { data: branch } = await supabase
    .from("branches")
    .select("id,name,slug")
    .eq("slug", branchSlug)
    .or("active.is.null,active.eq.true")
    .single();

  if (!branch) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950 px-6 text-center text-white">
        <div>
          <h1 className="text-2xl font-bold">Sucursal no encontrada</h1>
          <p className="mt-2 text-sm text-gray-400">No pudimos encontrar este hub de reservas.</p>
        </div>
      </main>
    );
  }

  const [{ data: events }, { data: branding }] = await Promise.all([
    supabase
      .from("reservation_events")
      .select("*")
      .eq("branch_id", branch.id)
      .eq("enabled", true)
      .order("event_date", { ascending: true })
      .order("start_time", { ascending: true }),
    supabase
      .from("branch_settings")
      .select("*")
      .eq("branch_id", branch.id)
      .maybeSingle(),
  ]);

  const primaryColor = branding?.primary_color || branding?.brand_color || "#111827";
  const accentColor = branding?.accent_color || branding?.secondary_color || "#E14B25";
  const backgroundColor = branding?.background_color || "#F5F2EB";
  const fontFamily = getBrandFontFamily(branding);
  const activeEvents = events || [];

  return (
    <main className="min-h-screen px-5 py-8" style={{ background: backgroundColor, color: primaryColor, fontFamily }}>
      <FontLoader branding={branding || undefined} />
      <div className="mx-auto max-w-2xl">
        <header className="py-8 text-center">
          {branding?.logo_url && <img src={branding.logo_url} alt={branch.name} className="mx-auto mb-5 h-20 w-auto object-contain" />}
          <p className="text-sm font-bold uppercase tracking-widest opacity-50">{branch.name}</p>
          <h1 className="mt-3 text-5xl font-bold leading-none">Reservas</h1>
          <p className="mx-auto mt-4 max-w-md text-base leading-7 opacity-70">
            Elegí el evento al que querés asistir y guardá tu lugar.
          </p>
        </header>

        {activeEvents.length === 0 ? (
          <section className="rounded-3xl border p-8 text-center" style={{ borderColor: `${primaryColor}20`, background: `${primaryColor}08` }}>
            <h2 className="text-2xl font-bold">No hay eventos disponibles</h2>
            <p className="mt-2 opacity-60">Todavía no hay reservas habilitadas para esta sucursal.</p>
          </section>
        ) : (
          <section className="space-y-4">
            {activeEvents.map((event: any) => (
              <a
                key={event.id}
                href={`/${branchSlug}/reservas/${event.slug || event.id}`}
                className="group block overflow-hidden rounded-3xl border shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl"
                style={{ borderColor: `${primaryColor}18`, background: "rgba(255,255,255,.55)" }}
              >
                <div className="grid md:grid-cols-[220px_1fr]">
                  <div
                    className="h-52 bg-cover bg-center md:h-full"
                    style={{
                      backgroundImage: event.hero_image_url
                        ? `linear-gradient(to top, rgba(0,0,0,.35), transparent), url(${event.hero_image_url})`
                        : `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
                    }}
                  />
                  <div className="p-5">
                    <h2 className="text-3xl font-bold leading-tight">{event.title}</h2>
                    <p className="mt-3 line-clamp-3 text-sm leading-6 opacity-70">{event.description}</p>
                    <div className="mt-5 grid gap-2 text-sm opacity-75">
                      <span className="inline-flex items-center gap-2 capitalize"><Calendar size={16} /> {formatDate(event.event_date)}</span>
                      <span className="inline-flex items-center gap-2"><Clock size={16} /> {formatTime(event.start_time)} a {formatTime(event.end_time)}</span>
                      {(event.location_name || event.location_address) && (
                        <span className="inline-flex items-center gap-2"><MapPin size={16} /> {event.location_name || event.location_address}</span>
                      )}
                    </div>
                    <div className="mt-5 inline-flex rounded-full px-5 py-2 text-sm font-black text-white transition group-hover:scale-[1.02]" style={{ background: primaryColor }}>
                      Reservar
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </section>
        )}

        <footer className="py-8 text-center text-xs opacity-40">Powered by Kablam</footer>
      </div>
    </main>
  );
}
