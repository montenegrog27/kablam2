"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Check, Copy, ExternalLink, Image as ImageIcon, Loader2, RefreshCw, Upload, X } from "lucide-react";

type CloudinaryImage = {
  publicId: string;
  url: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
  createdAt?: string;
};

export default function MediaLibraryPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [images, setImages] = useState<CloudinaryImage[]>([]);
  const [folder, setFolder] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [copiedUrl, setCopiedUrl] = useState("");

  const sortedImages = useMemo(
    () => [...images].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
    [images],
  );

  useEffect(() => {
    loadImages();
  }, []);

  async function getAuthHeaders(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function loadImages() {
    setLoading(true);
    setMessage("");

    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/cloudinary/images", { headers });
      const data = await response.json();

      if (!response.ok) {
        setMessage(errorLabel(data.error, data.details));
        setImages([]);
        return;
      }

      setImages(data.images || []);
      setFolder(data.folder || "");
    } catch {
      setMessage("No se pudo cargar Cloudinary.");
    } finally {
      setLoading(false);
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const fileList = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (fileList.length === 0) return;

    setUploading(true);
    setMessage("");

    try {
      const headers = await getAuthHeaders();

      for (const file of fileList) {
        const formData = new FormData();
        formData.set("file", file);

        const response = await fetch("/api/cloudinary/images", {
          method: "POST",
          headers,
          body: formData,
        });
        const data = await response.json();

        if (!response.ok) {
          setMessage(errorLabel(data.error, data.details));
          continue;
        }

        setImages((current) => [data.image, ...current.filter((image) => image.publicId !== data.image.publicId)]);
        setFolder(data.folder || folder);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    window.setTimeout(() => setCopiedUrl(""), 1600);
  }

  return (
    <div className="space-y-6">
      <style jsx global>{`
        .media-input {
          width: 100%;
          border: 1px solid rgb(55 65 81);
          border-radius: 0.75rem;
          background: rgb(3 7 18);
          color: rgb(243 244 246);
          padding: 0.65rem 0.8rem;
          font-size: 0.875rem;
          outline: none;
        }
      `}</style>

      <header className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-red-400">Cloudinary</p>
            <h1 className="mt-2 text-3xl font-black text-gray-100">Mis imagenes</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
              Subi imagenes, copia la URL y pegala en productos, combos, popups, reservas o promociones sin entrar a Cloudinary.
            </p>
            {folder && <p className="mt-3 text-xs font-bold text-gray-500">Carpeta: {folder}</p>}
          </div>
          <button
            onClick={loadImages}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-700 bg-gray-950 px-4 py-2 text-sm font-black text-gray-200 hover:border-gray-500 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>

        {message && (
          <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-red-900/70 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            <span>{message}</span>
            <button onClick={() => setMessage("")} className="text-red-200/70 hover:text-red-100"><X size={16} /></button>
          </div>
        )}
      </header>

      <section
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          uploadFiles(event.dataTransfer.files);
        }}
        className={`rounded-2xl border border-dashed p-8 text-center transition ${dragging ? "border-red-500 bg-red-950/20" : "border-gray-700 bg-gray-900"}`}
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600 text-white">
          {uploading ? <Loader2 className="animate-spin" size={24} /> : <Upload size={24} />}
        </div>
        <h2 className="mt-4 text-xl font-black text-gray-100">Subir imagenes</h2>
        <p className="mt-2 text-sm text-gray-500">Arrastra archivos aca o selecciona desde tu computadora.</p>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(event) => event.target.files && uploadFiles(event.target.files)} />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-black text-white hover:bg-red-500 disabled:opacity-50"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
          Seleccionar imagen
        </button>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-gray-100">Biblioteca</h2>
            <p className="text-sm text-gray-500">{sortedImages.length} imagenes disponibles.</p>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-10 text-center text-gray-500">Cargando imagenes...</div>
        ) : sortedImages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-900 p-10 text-center text-gray-500">
            Todavia no hay imagenes en esta carpeta.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sortedImages.map((image) => (
              <article key={image.publicId} className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
                <div className="aspect-square bg-gray-950">
                  <img src={image.url} alt={image.publicId} className="h-full w-full object-cover" loading="lazy" />
                </div>
                <div className="space-y-3 p-3">
                  <div>
                    <p className="truncate text-sm font-bold text-gray-100" title={image.publicId}>{image.publicId.split("/").pop()}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {image.width}x{image.height} · {formatBytes(image.bytes || 0)} · {String(image.format || "").toUpperCase()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyUrl(image.url)}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white hover:bg-red-500"
                    >
                      {copiedUrl === image.url ? <Check size={15} /> : <Copy size={15} />}
                      {copiedUrl === image.url ? "Copiado" : "Copiar URL"}
                    </button>
                    <a
                      href={image.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-xl border border-gray-700 px-3 py-2 text-gray-300 hover:border-gray-500 hover:text-white"
                      title="Abrir"
                    >
                      <ExternalLink size={15} />
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function errorLabel(error?: string, details?: string) {
  if (details?.toLowerCase().includes("api_secret mismatch")) {
    return "Cloudinary dice que el API Secret no coincide. Revisá que CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET sean del mismo cloud y no tengan espacios/comillas.";
  }
  if (error === "cloudinary_not_configured") {
    return "Falta configurar CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET.";
  }
  if (error === "unauthorized") return "Sesion expirada. Volve a iniciar sesion.";
  if (error === "forbidden") return "No tenes permisos para administrar imagenes.";
  if (error === "invalid_file_type") return "Solo se permiten imagenes.";
  if (error === "cloudinary_upload_failed") return `Cloudinary no pudo subir la imagen${details ? `: ${details}` : "."}`;
  if (error === "cloudinary_list_failed") return `Cloudinary no pudo listar tus imagenes${details ? `: ${details}` : "."}`;
  return details || "Ocurrio un error con Cloudinary.";
}
