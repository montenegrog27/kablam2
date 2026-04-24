import { createSupabaseServer } from "@kablam/supabase/server";
import { redirect } from "next/navigation";
import { requireCustomerSession } from "@/lib/customer-session";
import AccountNavbar from "./_components/AccountNavbar";

export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ branchSlug: string }>;
}) {
  const { branchSlug } = await params;

  try {
    // Verificar sesión (redirige si no está autenticado)
    const session = await requireCustomerSession(branchSlug);

    // Obtener branding de la sucursal
    const supabase = await createSupabaseServer();
    const { data: branch } = await supabase
      .from("branches")
      .select("*, branch_settings(*)")
      .eq("slug", branchSlug)
      .single();

    if (!branch) {
      redirect(`/${branchSlug}/order`);
    }

    const branding = branch.branch_settings?.[0];

    return (
      <div className="min-h-screen bg-gray-50">
        <AccountNavbar
          branchSlug={branchSlug}
          customerName={session.name}
          branding={branding}
        />

        <div className="max-w-4xl mx-auto px-4 py-8">{children}</div>
      </div>
    );
  } catch {
    // Redirigir a login si no hay sesión
    redirect(`/${branchSlug}/auth/login`);
  }
}
