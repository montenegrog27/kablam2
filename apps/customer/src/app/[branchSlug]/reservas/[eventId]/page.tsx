import { createSupabaseServer } from "@kablam/supabase/server";
import { createClient } from "@supabase/supabase-js";
import ReservationPageClient from "../ReservationPageClient";

export default async function ReservationEventPage({
  params,
}: {
  params: Promise<{ branchSlug: string; eventId: string }>;
}) {
  const supabase = await createSupabaseServer();
  const supabaseService = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { branchSlug, eventId } = await params;
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId);

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
          <p className="mt-2 text-sm text-gray-400">No pudimos encontrar esta pagina de reservas.</p>
        </div>
      </main>
    );
  }

  const eventQuery = supabase
    .from("reservation_events")
    .select("*")
    .eq("branch_id", branch.id)
    .eq("enabled", true);

  const [{ data: event }, { data: branding }] = await Promise.all([
    (isUuid ? eventQuery.eq("id", eventId) : eventQuery.eq("slug", eventId)).maybeSingle(),
    supabase
      .from("branch_settings")
      .select("*")
      .eq("branch_id", branch.id)
      .maybeSingle(),
  ]);

  if (!event) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950 px-6 text-center text-white">
        <div>
          <h1 className="text-2xl font-bold">Evento no disponible</h1>
          <p className="mt-2 text-sm text-gray-400">Esta reserva no existe o ya no esta habilitada.</p>
        </div>
      </main>
    );
  }

  const { data: reservations } = await supabaseService
    .from("reservations")
    .select("party_size,reservation_date,reservation_time,status,reservation_event_id")
    .eq("branch_id", branch.id)
    .eq("reservation_event_id", event.id)
    .not("status", "in", "(cancelled,no_show)");

  return (
    <ReservationPageClient
      branchSlug={branchSlug}
      branchName={branch.name}
      eventId={event.id}
      settings={JSON.parse(JSON.stringify({ ...event, reservation_type: event.reservation_type || "event" }))}
      branding={branding ? JSON.parse(JSON.stringify(branding)) : undefined}
      reservations={JSON.parse(JSON.stringify(reservations || []))}
    />
  );
}
