"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  Link as LinkIcon,
  MessageCircle,
  Plus,
  Save,
  ShoppingBag,
  Trash2,
} from "lucide-react";

const ICON_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "order", label: "Pedido" },
  { value: "contact", label: "Contacto" },
  { value: "instagram", label: "Instagram" },
  { value: "map", label: "Mapa" },
  { value: "link", label: "Link" },
];

const DEFAULT_SETTINGS = {
  logo_url: "",
  title: "",
  subtitle: "Elegi como queres seguir.",
  font_family: "",
  font_url: "",
  background_color: "#f8fafc",
  text_color: "#111827",
  accent_color: "#111827",
  show_branch_order_links: true,
};

function normalizeUrl(url: string) {
  const value = url.trim();
  if (!value) return value;
  if (value.startsWith("/") || value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  return `https://${value}`;
}

function getGoogleFontFamily(fontUrl?: string) {
  if (!fontUrl || !fontUrl.includes("fonts.googleapis.com")) return "";

  try {
    const url = new URL(fontUrl);
    const family = url.searchParams.getAll("family")[0];
    if (!family) return "";

    return family.split(":")[0]?.replace(/\+/g, " ").trim() || "";
  } catch {
    const match = fontUrl.match(/[?&]family=([^&]+)/);
    return match?.[1]?.split(":")[0]?.replace(/\+/g, " ").trim() || "";
  }
}

function getFontCss(fontUrl?: string, fontFamily?: string) {
  if (!fontUrl || !fontFamily) return "";
  return fontUrl.includes("fonts.googleapis.com")
    ? `@import url('${fontUrl}');`
    : `@font-face { font-family: '${fontFamily}'; src: url('${fontUrl}'); font-display: swap; }`;
}

function getAppliedFontFamily(fontUrl?: string, fontFamily?: string) {
  const googleFamily = getGoogleFontFamily(fontUrl);
  const loadedFamily = googleFamily || fontFamily || "";
  if (!loadedFamily) return undefined;

  return `'${loadedFamily}', ${fontFamily ? `'${fontFamily}', ` : ""}sans-serif`;
}

export default function CustomerHubPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantSlug, setTenantSlug] = useState("");
  const [settings, setSettings] = useState<any>(DEFAULT_SETTINGS);
  const [links, setLinks] = useState<any[]>([]);
  const [domains, setDomains] = useState<any[]>([]);
  const [domainInput, setDomainInput] = useState("");
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    load();
  }, []);

  const previewUrl = useMemo(() => {
    if (typeof window === "undefined") return "/";
    return window.location.origin.replace(":3000", ":3002");
  }, [tenantSlug]);

  const load = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id, tenants(slug, name)")
      .eq("id", user.id)
      .single();

    if (!userRecord?.tenant_id) {
      setLoading(false);
      return;
    }

    const tenant = Array.isArray(userRecord.tenants)
      ? userRecord.tenants[0]
      : userRecord.tenants;

    setTenantId(userRecord.tenant_id);
    setTenantSlug(tenant?.slug || "");

    const [
      { data: hubSettings },
      { data: hubLinks },
      { data: domainRows },
      { data: branchRows },
    ] =
      await Promise.all([
        supabase
          .from("customer_hub_settings")
          .select("*")
          .eq("tenant_id", userRecord.tenant_id)
          .maybeSingle(),
        supabase
          .from("customer_hub_links")
          .select("*")
          .eq("tenant_id", userRecord.tenant_id)
          .order("sort_order"),
        supabase
          .from("tenant_domains")
          .select("*")
          .eq("tenant_id", userRecord.tenant_id)
          .order("is_primary", { ascending: false })
          .order("domain"),
        supabase
          .from("branches")
          .select("id, name, slug")
          .eq("tenant_id", userRecord.tenant_id)
          .eq("active", true)
          .order("name"),
      ]);

    const firstBranch = branchRows?.[0];
    const { data: branchSettings } = firstBranch
      ? await supabase
          .from("branch_settings")
          .select("font_family, font_primary, font_url")
          .eq("branch_id", firstBranch.id)
          .maybeSingle()
      : { data: null };

    setSettings({
      ...DEFAULT_SETTINGS,
      title: tenant?.name || "",
      font_family: branchSettings?.font_family || branchSettings?.font_primary || "",
      font_url: branchSettings?.font_url || "",
      ...(hubSettings || {}),
    });
    setLinks(hubLinks || []);
    setDomains(domainRows || []);
    setBranches(branchRows || []);
    setLoading(false);
  };

  const saveSettings = async () => {
    if (!tenantId) return;
    setSaving(true);
    setMessage("");

    const { error } = await supabase.from("customer_hub_settings").upsert({
      tenant_id: tenantId,
      logo_url: settings.logo_url || null,
      title: settings.title || null,
      subtitle: settings.subtitle || null,
      font_family: settings.font_family || null,
      font_url: settings.font_url || null,
      background_color: settings.background_color || "#f8fafc",
      text_color: settings.text_color || "#111827",
      accent_color: settings.accent_color || "#111827",
      show_branch_order_links: Boolean(settings.show_branch_order_links),
      updated_at: new Date().toISOString(),
    });

    setSaving(false);
    setMessage(error ? error.message : "Hub guardado");
  };

  const addLink = () => {
    setLinks((current) => [
      ...current,
      {
        id: `draft-${crypto.randomUUID()}`,
        label: "",
        url: "",
        icon: "link",
        sort_order: current.length,
        is_active: true,
        _draft: true,
      },
    ]);
  };

  const updateLink = (id: string, field: string, value: any) => {
    setLinks((current) =>
      current.map((link) => (link.id === id ? { ...link, [field]: value } : link)),
    );
  };

  const moveLink = (index: number, direction: -1 | 1) => {
    setLinks((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next.map((link, idx) => ({ ...link, sort_order: idx }));
    });
  };

  const deleteLink = async (link: any) => {
    if (!link._draft) {
      await supabase.from("customer_hub_links").delete().eq("id", link.id);
    }
    setLinks((current) => current.filter((item) => item.id !== link.id));
  };

  const saveLinks = async () => {
    if (!tenantId) return;
    setSaving(true);
    setMessage("");

    const validLinks = links
      .filter((link) => link.label.trim() && link.url.trim())
      .map((link, index) => {
        const payload: any = {
          tenant_id: tenantId,
          label: link.label.trim(),
          url: normalizeUrl(link.url),
          icon: link.icon || "link",
          sort_order: index,
          is_active: Boolean(link.is_active),
        };

        if (!link._draft) payload.id = link.id;

        return payload;
      });

    const { error } = validLinks.length
      ? await supabase.from("customer_hub_links").upsert(validLinks)
      : { error: null };

    setSaving(false);
    setMessage(error ? error.message : "Links guardados");
    await load();
  };

  const normalizeDomain = (domain: string) =>
    domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, "");

  const addDomain = async () => {
    if (!tenantId || !domainInput.trim()) return;
    setSaving(true);
    setMessage("");

    const domain = normalizeDomain(domainInput);
    const { error } = await supabase.from("tenant_domains").insert({
      tenant_id: tenantId,
      domain,
      is_primary: domains.length === 0,
      is_active: true,
    });

    setSaving(false);
    setMessage(error ? error.message : "Dominio agregado");
    setDomainInput("");
    await load();
  };

  const toggleDomain = async (domain: any, field: "is_active" | "is_primary") => {
    const updates: any = { [field]: !domain[field] };
    if (field === "is_primary" && !domain.is_primary) {
      await supabase
        .from("tenant_domains")
        .update({ is_primary: false })
        .eq("tenant_id", domain.tenant_id);
    }
    await supabase.from("tenant_domains").update(updates).eq("id", domain.id);
    await load();
  };

  const deleteDomain = async (domainId: string) => {
    await supabase.from("tenant_domains").delete().eq("id", domainId);
    await load();
  };

  if (loading) return <div className="p-6 text-gray-400">Cargando hub...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Hub de Links</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configura la pantalla principal de customer, estilo Linktree.
          </p>
        </div>
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800"
        >
          <Eye size={16} /> Ver /
        </a>
      </div>

      {message && (
        <div className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-gray-200">
          {message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-gray-100">Contenido</h2>
              <p className="text-xs text-gray-500">Logo, titulo y comentario debajo del logo.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-gray-400">Logo URL</span>
                <input
                  value={settings.logo_url || ""}
                  onChange={(e) => setSettings((s: any) => ({ ...s, logo_url: e.target.value }))}
                  className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
                  placeholder="https://..."
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-gray-400">Titulo</span>
                <input
                  value={settings.title || ""}
                  onChange={(e) => setSettings((s: any) => ({ ...s, title: e.target.value }))}
                  className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
                  placeholder="Nombre de la marca"
                />
              </label>
            </div>

            <label className="space-y-1 block">
              <span className="text-xs text-gray-400">Comentario debajo del logo</span>
              <textarea
                value={settings.subtitle || ""}
                onChange={(e) => setSettings((s: any) => ({ ...s, subtitle: e.target.value }))}
                rows={3}
                className="w-full resize-none rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
                placeholder="Pedi online, escribinos o seguinos en redes."
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-gray-400">Nombre de tipografia</span>
                <input
                  value={settings.font_family || ""}
                  onChange={(e) => setSettings((s: any) => ({ ...s, font_family: e.target.value }))}
                  className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
                  placeholder="Montserrat, Poppins, MiFuente"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-gray-400">URL de tipografia</span>
                <input
                  value={settings.font_url || ""}
                  onChange={(e) => {
                    const fontUrl = e.target.value;
                    const detectedFamily = getGoogleFontFamily(fontUrl);
                    setSettings((s: any) => ({
                      ...s,
                      font_url: fontUrl,
                      font_family: s.font_family || detectedFamily,
                    }));
                  }}
                  className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
                  placeholder="Google Fonts o archivo .woff2/.ttf"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {[
                ["background_color", "Fondo"],
                ["text_color", "Texto"],
                ["accent_color", "Acento"],
              ].map(([key, label]) => (
                <label key={key} className="space-y-1">
                  <span className="text-xs text-gray-400">{label}</span>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={settings[key] || "#111827"}
                      onChange={(e) => setSettings((s: any) => ({ ...s, [key]: e.target.value }))}
                      className="h-10 w-12 rounded border border-gray-700 bg-gray-950"
                    />
                    <input
                      value={settings[key] || ""}
                      onChange={(e) => setSettings((s: any) => ({ ...s, [key]: e.target.value }))}
                      className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
                    />
                  </div>
                </label>
              ))}
            </div>

            <label className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-950 px-4 py-3">
              <span>
                <span className="block text-sm font-medium text-gray-100">Mostrar botones de pedido</span>
                <span className="text-xs text-gray-500">Agrega un link automatico por sucursal activa.</span>
              </span>
              <input
                type="checkbox"
                checked={Boolean(settings.show_branch_order_links)}
                onChange={(e) => setSettings((s: any) => ({ ...s, show_branch_order_links: e.target.checked }))}
                className="h-5 w-5 accent-white"
              />
            </label>

            <button
              onClick={saveSettings}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-950 disabled:opacity-50"
            >
              <Save size={16} /> Guardar contenido
            </button>
          </section>

          <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-gray-100">Dominios</h2>
              <p className="text-xs text-gray-500">
                Dominios propios para resolver este tenant. El subdominio de plataforma funciona por slug.
              </p>
            </div>

            <div className="flex gap-2">
              <input
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
                placeholder="www.polemico.com.ar"
              />
              <button
                onClick={addDomain}
                disabled={saving || !domainInput.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-950 disabled:opacity-50"
              >
                <Plus size={16} /> Agregar
              </button>
            </div>

            <div className="space-y-2">
              {domains.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-700 px-4 py-6 text-center text-sm text-gray-500">
                  Sin dominios propios. Usá el subdominio de plataforma por slug.
                </div>
              )}

              {domains.map((domain) => (
                <div
                  key={domain.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-950 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-100">{domain.domain}</p>
                    <p className="text-xs text-gray-500">
                      {domain.is_primary ? "Principal" : "Alias"} ·{" "}
                      {domain.is_active ? "Activo" : "Inactivo"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleDomain(domain, "is_primary")}
                      className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-gray-800"
                    >
                      Principal
                    </button>
                    <button
                      onClick={() => toggleDomain(domain, "is_active")}
                      className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-gray-800"
                    >
                      {domain.is_active ? "Desactivar" : "Activar"}
                    </button>
                    <button
                      onClick={() => deleteDomain(domain.id)}
                      className="rounded p-2 text-red-400 hover:bg-red-950/40"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold text-gray-100">Links manuales</h2>
                <p className="text-xs text-gray-500">WhatsApp, contacto, promos, Instagram, mapas, etc.</p>
              </div>
              <button
                onClick={addLink}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
              >
                <Plus size={16} /> Link
              </button>
            </div>

            <div className="space-y-3">
              {links.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-700 px-4 py-8 text-center text-sm text-gray-500">
                  Todavia no hay links manuales.
                </div>
              )}

              {links.map((link, index) => (
                <div key={link.id} className="rounded-lg border border-gray-800 bg-gray-950 p-4 space-y-3">
                  <div className="grid gap-3 md:grid-cols-[1fr_1.6fr_130px]">
                    <input
                      value={link.label}
                      onChange={(e) => updateLink(link.id, "label", e.target.value)}
                      className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
                      placeholder="Texto del boton"
                    />
                    <input
                      value={link.url}
                      onChange={(e) => updateLink(link.id, "url", e.target.value)}
                      className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
                      placeholder="https://... o /sucursal/order"
                    />
                    <select
                      value={link.icon}
                      onChange={(e) => updateLink(link.id, "icon", e.target.value)}
                      className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
                    >
                      {ICON_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-xs text-gray-400">
                      <input
                        type="checkbox"
                        checked={Boolean(link.is_active)}
                        onChange={(e) => updateLink(link.id, "is_active", e.target.checked)}
                        className="accent-white"
                      />
                      Activo
                    </label>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveLink(index, -1)} disabled={index === 0} className="rounded p-2 text-gray-400 hover:bg-gray-800 disabled:opacity-30">
                        <ArrowUp size={15} />
                      </button>
                      <button onClick={() => moveLink(index, 1)} disabled={index === links.length - 1} className="rounded p-2 text-gray-400 hover:bg-gray-800 disabled:opacity-30">
                        <ArrowDown size={15} />
                      </button>
                      <button onClick={() => deleteLink(link)} className="rounded p-2 text-red-400 hover:bg-red-950/40">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button onClick={saveLinks} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-950 disabled:opacity-50">
              <Save size={16} /> Guardar links
            </button>
          </section>
        </div>

        <aside className="rounded-[28px] border border-gray-800 bg-gray-950 p-4">
          {settings.font_url && settings.font_family && (
            <style
              dangerouslySetInnerHTML={{
                __html: getFontCss(
                  settings.font_url,
                  getGoogleFontFamily(settings.font_url) || settings.font_family,
                ),
              }}
            />
          )}
          <div
            className="mx-auto min-h-[620px] max-w-[320px] rounded-[24px] px-5 py-8 text-center shadow-2xl"
            style={{
              background: settings.background_color,
              color: settings.text_color,
              fontFamily: getAppliedFontFamily(settings.font_url, settings.font_family),
            }}
          >
            {settings.logo_url ? (
              <img src={settings.logo_url} alt="" className="mx-auto h-24 w-24 rounded-full object-cover shadow-lg" />
            ) : (
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full text-3xl font-black text-white shadow-lg" style={{ background: settings.accent_color }}>
                {(settings.title || "K").slice(0, 1)}
              </div>
            )}
            <h3 className="mt-5 text-2xl font-black">{settings.title || "Tu marca"}</h3>
            <p className="mt-2 text-sm opacity-70">{settings.subtitle || "Elegi como queres seguir."}</p>

            <div className="mt-8 space-y-3">
              {settings.show_branch_order_links &&
                branches.slice(0, 2).map((branch) => (
                  <div key={branch.id} className="flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold text-white shadow" style={{ background: settings.accent_color }}>
                    <ShoppingBag size={16} /> Pedir en {branch.name}
                  </div>
                ))}
              {links.filter((link) => link.is_active).slice(0, 4).map((link) => (
                <div key={link.id} className="flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold" style={{ borderColor: `${settings.text_color}22` }}>
                  {link.icon === "whatsapp" ? <MessageCircle size={16} /> : <LinkIcon size={16} />}
                  {link.label || "Link"}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
