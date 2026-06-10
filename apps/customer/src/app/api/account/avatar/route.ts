import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCustomerSession } from "@/lib/customer-session";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = "customer-avatars";

function getExt(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && ["jpg", "jpeg", "png", "webp", "gif"].includes(fromName)) return fromName;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "jpg";
}

export async function POST(req: Request) {
  const session = await getCustomerSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "El archivo debe ser una imagen" }, { status: 400 });
  }

  if (file.size > 1024 * 1024 * 4) {
    return NextResponse.json({ error: "La imagen no puede superar 4MB" }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 1024 * 1024 * 4,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  }).then(() => null, () => null);

  const ext = getExt(file);
  const path = `${session.tenantId}/${session.customerId}/avatar.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: file.type || `image/${ext}`,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;

  const { error: updateError } = await supabase
    .from("customers")
    .update({ avatar_url: avatarUrl })
    .eq("id", session.customerId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ avatarUrl });
}
