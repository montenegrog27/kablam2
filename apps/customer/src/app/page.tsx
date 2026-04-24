import { headers } from "next/headers";
import { createSupabaseServer } from "@kablam/supabase/server";

type Tenant = {
  id: string;
  name: string;
};

type Branch = {
  name: string;
  slug: string;
};

export default async function Landing() {
  const supabase = await createSupabaseServer();
  const headersList = await headers();
  const host = headersList.get("host") ?? "";

  let tenantSlug = host.split(".")[0];

  // modo desarrollo
  if (host.includes("localhost")) {
    tenantSlug = "mordiscoburgers";
  }
    if (host.includes("kablam2-")) {
    tenantSlug = "mordiscoburgers";
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id,name")
    .eq("slug", tenantSlug)
    .single();

  if (!tenant) {
    return <div>Tenant no encontrado</div>;
  }

  const { data: branches } = await supabase
    .from("branches")
    .select("name,slug")
    .eq("tenant_id", tenant.id)
    .eq("active", true);

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">{tenant.name}</h1>

      <div className="space-y-4">
        {branches?.map((b: Branch) => (
          <a
            key={b.slug}
            href={`/${b.slug}/order`}
            className="block border p-4 rounded-lg"
          >
            {b.name}
          </a>
        ))}
      </div>
    </div>
  );
}
