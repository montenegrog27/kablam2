import { createSupabaseServer } from "@kablam/supabase/server";
import EventDashboardClient from "./EventDashboardClient";

export default async function ReservationEventDashboardPage({
  params,
}: {
  params: Promise<{ branchSlug: string; eventId: string }>;
}) {
  const supabase = await createSupabaseServer();
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
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-center text-white">
        <div>
          <h1 className="text-2xl font-bold">Sucursal no encontrada</h1>
          <p className="mt-2 text-sm text-neutral-400">No pudimos encontrar este dashboard.</p>
        </div>
      </main>
    );
  }

  const eventQuery = supabase
    .from("reservation_events")
    .select("id,slug,title,event_date,deposit_amount,deposit_alias")
    .eq("branch_id", branch.id)
    .eq("enabled", true);

  const { data: event } = await (isUuid ? eventQuery.eq("id", eventId) : eventQuery.eq("slug", eventId)).maybeSingle();

  if (!event) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-center text-white">
        <div>
          <h1 className="text-2xl font-bold">Evento no encontrado</h1>
          <p className="mt-2 text-sm text-neutral-400">Esta vista no existe o el evento no esta habilitado.</p>
        </div>
      </main>
    );
  }

  return (
    <EventDashboardClient
      branchSlug={branchSlug}
      eventId={event.id}
      event={{
        title: event.title,
        eventDate: event.event_date,
        depositAmount: event.deposit_amount,
        depositAlias: event.deposit_alias,
      }}
    />
  );
}
