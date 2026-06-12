"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  User,
  Package,
  MapPin,
  LogOut,
  ChevronLeft,
} from "lucide-react";
import { Branding } from "@/types/menu";

interface AccountNavbarProps {
  branchSlug: string;
  customerName?: string;
  branding?: Branding;
}

export default function AccountNavbar({
  branchSlug,
  customerName,
  branding,
}: AccountNavbarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const navigation = [
    {
      name: "Mi perfil",
      href: `/${branchSlug}/account/profile`,
      icon: User,
      current: pathname === `/${branchSlug}/account/profile`,
    },
    {
      name: "Mis pedidos",
      href: `/${branchSlug}/account/orders`,
      icon: Package,
      current: pathname === `/${branchSlug}/account/orders`,
    },
    {
      name: "Mis direcciones",
      href: `/${branchSlug}/account/addresses`,
      icon: MapPin,
      current: pathname === `/${branchSlug}/account/addresses`,
    },
  ];

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      router.push(`/${branchSlug}/order`);
    }
  };

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-[#FF1A1A] bg-black text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push(`/${branchSlug}/order`)}
              className="flex items-center gap-2 border border-[#FF1A1A] px-3 py-2 text-sm font-bold uppercase text-[#A0A0A0] transition duration-200 hover:bg-[#FF1A1A] hover:text-white"
            >
              <ChevronLeft size={18} />
              <span className="hidden sm:inline">Volver al menu</span>
            </button>

            {/* {branding?.logo_url ? (
              <img src={branding.logo_url} className="h-8 w-auto object-contain" alt="Logo" />
            ) : (
              <div className="text-lg font-black">Mi cuenta</div>
            )} */}
          </div>

          <div className="hidden items-center gap-5 md:flex">
            <div className="flex items-center gap-2 border border-[#FF1A1A] bg-black px-3 py-2 text-sm font-bold uppercase text-[#A0A0A0]">
              <User size={16} />
              <span>{customerName || "Cliente"}</span>
            </div>

            <nav className="flex items-center gap-2">
              {navigation.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  className={`border border-[#FF1A1A] px-3 py-2 text-sm font-bold uppercase transition duration-200 ${
                    item.current
                      ? "bg-[#FF1A1A] text-white"
                      : "text-[#A0A0A0] hover:bg-[#FF1A1A] hover:text-white"
                  }`}
                >
                  {item.name}
                </a>
              ))}
            </nav>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 border border-[#FF1A1A] px-3 py-2 text-sm font-bold uppercase text-[#A0A0A0] transition duration-200 hover:bg-[#FF1A1A] hover:text-white"
            >
              <LogOut size={16} />
              <span>Cerrar sesion</span>
            </button>
          </div>

          <div className="md:hidden">
            <div className="rounded-full border border-[#FF1A1A] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white">
              {customerName || "Club"}
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
