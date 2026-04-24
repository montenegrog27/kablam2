"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  User,
  Package,
  MapPin,
  LogOut,
  ChevronLeft,
  Menu,
  X,
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (response.ok) {
        router.push(`/${branchSlug}/order`);
      } else {
        console.error("Logout failed:", await response.text());
        // Fallback: redirect anyway
        router.push(`/${branchSlug}/order`);
      }
    } catch (error) {
      console.error("Logout error:", error);
      // Fallback: redirect anyway
      router.push(`/${branchSlug}/order`);
    }
  };

  const goToMenu = () => {
    router.push(`/${branchSlug}/order`);
  };

  return (
    <>
      {/* Navbar principal */}
      <nav className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Logo y volver */}
          <div className="flex items-center gap-4">
            <button
              onClick={goToMenu}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ChevronLeft size={20} />
              <span className="hidden sm:inline">Volver al menú</span>
            </button>

            {/* Logo/icono */}
            {branding?.logo_url ? (
              <img src={branding.logo_url} className="h-8 w-auto" alt="Logo" />
            ) : (
              <div className="text-lg font-bold">Mi cuenta</div>
            )}
          </div>

          {/* Desktop navigation */}
          <div className="hidden md:flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <User size={16} />
              <span>{customerName || "Cliente"}</span>
            </div>

            <nav className="flex items-center gap-4">
              {navigation.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                    item.current
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {item.name}
                </a>
              ))}
            </nav>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
            >
              <LogOut size={16} />
              <span>Cerrar sesión</span>
            </button>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b">
          <div className="px-4 py-3 space-y-3">
            {/* Customer info */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="font-medium">{customerName || "Cliente"}</div>
                <div className="text-xs text-gray-500">Mi cuenta</div>
              </div>
            </div>

            {/* Navigation */}
            <div className="space-y-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                return (
                  <a
                    key={item.name}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition ${
                      item.current
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Icon size={18} />
                    {item.name}
                  </a>
                );
              })}
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition"
            >
              <LogOut size={18} />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </>
  );
}
