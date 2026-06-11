import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function createSupabaseService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function getCloudinaryConfig() {
  const cloudName = cleanEnv(process.env.CLOUDINARY_CLOUD_NAME);
  const apiKey = cleanEnv(process.env.CLOUDINARY_API_KEY);
  const apiSecret = cleanEnv(process.env.CLOUDINARY_API_SECRET);

  if (!cloudName || !apiKey || !apiSecret) {
    return null;
  }

  return {
    cloudName,
    apiKey,
    apiSecret,
    folder: cleanEnv(process.env.CLOUDINARY_FOLDER) || "kablam",
  };
}

function cleanEnv(value?: string) {
  return value?.trim().replace(/^["']|["']$/g, "");
}

async function getAuthorizedUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "unauthorized" as const };
  }

  const supabase = createSupabaseService();
  const token = authHeader.slice("Bearer ".length);
  const { data: authData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !authData.user) {
    return { error: "unauthorized" as const };
  }

  const { data: userRecord, error: userError } = await supabase
    .from("users")
    .select("id, tenant_id, role")
    .eq("id", authData.user.id)
    .single();

  if (userError || !userRecord?.tenant_id) {
    return { error: "user_without_tenant" as const };
  }

  if (!["owner", "admin"].includes(userRecord.role)) {
    return { error: "forbidden" as const };
  }

  return { user: userRecord };
}

export async function GET(req: NextRequest) {
  const auth = await getAuthorizedUser(req);
  if ("error" in auth) {
    const status = auth.error === "forbidden" ? 403 : 401;
    return NextResponse.json({ error: auth.error }, { status });
  }

  const config = getCloudinaryConfig();
  if (!config) {
    return NextResponse.json({ error: "cloudinary_not_configured" }, { status: 500 });
  }

  const folder = getTenantFolder(config.folder, auth.user.tenant_id);
  const url = new URL(`https://api.cloudinary.com/v1_1/${config.cloudName}/resources/image/upload`);
  url.searchParams.set("max_results", "60");
  url.searchParams.set("prefix", `${folder}/`);

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64")}`,
    },
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json(
      { error: "cloudinary_list_failed", details: data?.error?.message || response.statusText },
      { status: response.status },
    );
  }

  const images = (data?.resources || []).map((resource: any) => ({
    publicId: resource.public_id,
    url: resource.secure_url,
    width: resource.width,
    height: resource.height,
    bytes: resource.bytes,
    format: resource.format,
    createdAt: resource.created_at,
  }));

  return NextResponse.json({ images, folder });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthorizedUser(req);
  if ("error" in auth) {
    const status = auth.error === "forbidden" ? 403 : 401;
    return NextResponse.json({ error: auth.error }, { status });
  }

  const config = getCloudinaryConfig();
  if (!config) {
    return NextResponse.json({ error: "cloudinary_not_configured" }, { status: 500 });
  }

  const body = await req.formData();
  const file = body.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "invalid_file_type" }, { status: 400 });
  }

  const folder = getTenantFolder(config.folder, auth.user.tenant_id);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signCloudinaryParams({ folder, timestamp }, config.apiSecret);

  const uploadData = new FormData();
  uploadData.set("file", file);
  uploadData.set("folder", folder);
  uploadData.set("timestamp", timestamp);
  uploadData.set("api_key", config.apiKey);
  uploadData.set("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, {
    method: "POST",
    body: uploadData,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json(
      { error: "cloudinary_upload_failed", details: data?.error?.message || response.statusText },
      { status: response.status },
    );
  }

  return NextResponse.json({
    image: {
      publicId: data.public_id,
      url: data.secure_url,
      width: data.width,
      height: data.height,
      bytes: data.bytes,
      format: data.format,
      createdAt: data.created_at,
    },
    folder,
  });
}

function getTenantFolder(baseFolder: string, tenantId: string) {
  return `${baseFolder.replace(/^\/+|\/+$/g, "")}/${tenantId}`;
}

function signCloudinaryParams(params: Record<string, string>, apiSecret: string) {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto.createHash("sha1").update(`${payload}${apiSecret}`).digest("hex");
}
