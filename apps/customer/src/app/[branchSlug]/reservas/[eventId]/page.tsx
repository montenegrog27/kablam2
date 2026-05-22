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

  const [{ data: event }, { data: branding }, { data: reservations }] = await Promise.all([
    supabase
      .from("reservation_events")
      .select("*")
      .eq("id", eventId)
      .eq("branch_id", branch.id)
      .eq("enabled", true)
      .maybeSingle(),
    supabase
      .from("branch_settings")
      .select("*")
      .eq("branch_id", branch.id)
      .maybeSingle(),
    supabaseService
      .from("reservations")
      .select("party_size,reservation_date,reservation_time,status,reservation_event_id")
      .eq("branch_id", branch.id)
      .eq("reservation_event_id", eventId)
      .not("status", "in", "(cancelled,no_show)"),
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

  return (
    <ReservationPageClient
      branchSlug={branchSlug}
      branchName={branch.name}
      eventId={eventId}
      settings={JSON.parse(JSON.stringify(event))}
      branding={branding ? JSON.parse(JSON.stringify(branding)) : undefined}
      reservations={JSON.parse(JSON.stringify(reservations || []))}
    />
  );
}
