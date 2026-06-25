import { NextRequest, NextResponse } from "next/server";
import { Buffer } from "node:buffer";
import { getOpenAttendance } from "@/lib/staffData";
import { getStaffSession } from "@/lib/staffSession";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SNAPSHOT_BUCKET = "attendance-snapshots";

type SnapshotCamera = {
  id: string;
  name: string;
  snapshot_url: string;
};

function extensionFromContentType(contentType: string) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

async function ensureSnapshotBucket(supabase: any) {
  const { error } = await supabase.storage.createBucket(SNAPSHOT_BUCKET, {
    public: true,
    fileSizeLimit: 5242880,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });

  if (error && !String(error.message || "").toLowerCase().includes("already exists")) {
    console.warn("Attendance snapshot bucket could not be created", error.message);
  }
}

async function recordSnapshotFailure(supabase: any, session: any, attendance: any, camera: SnapshotCamera, error: string) {
  await supabase
    .from("employee_attendance_snapshots")
    .insert({
      tenant_id: session.tenantId,
      branch_id: session.branchId,
      employee_id: session.employeeId,
      attendance_id: attendance.id,
      camera_id: camera.id,
      camera_name: camera.name,
      status: "failed",
      error,
    })
    .throwOnError()
    .catch(() => null);

  await supabase
    .from("branch_cameras")
    .update({ last_error: error, updated_at: new Date().toISOString() })
    .eq("id", camera.id)
    .throwOnError()
    .catch(() => null);
}

async function fetchWithTimeout(url: string, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function captureAttendanceSnapshots(supabase: any, session: any, attendance: any) {
  const { data: cameras, error } = await supabase
    .from("branch_cameras")
    .select("id, name, snapshot_url")
    .eq("tenant_id", session.tenantId)
    .eq("branch_id", session.branchId)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !cameras?.length) return [];

  await ensureSnapshotBucket(supabase);

  const results = [];

  for (const camera of cameras as SnapshotCamera[]) {
    try {
      const response = await fetchWithTimeout(camera.snapshot_url);
      if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}`);

      const contentType = response.headers.get("content-type") || "image/jpeg";
      if (!contentType.startsWith("image/")) {
        throw new Error(`La URL no devolvio una imagen (${contentType})`);
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      const extension = extensionFromContentType(contentType);
      const path = `${session.tenantId}/${session.branchId}/${attendance.id}/${camera.id}-${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(SNAPSHOT_BUCKET)
        .upload(path, bytes, {
          contentType,
          cacheControl: "31536000",
          upsert: false,
        });

      if (uploadError) throw new Error(uploadError.message);

      const { data: publicUrl } = supabase.storage.from(SNAPSHOT_BUCKET).getPublicUrl(path);
      const imageUrl = publicUrl.publicUrl;

      await supabase
        .from("employee_attendance_snapshots")
        .insert({
          tenant_id: session.tenantId,
          branch_id: session.branchId,
          employee_id: session.employeeId,
          attendance_id: attendance.id,
          camera_id: camera.id,
          camera_name: camera.name,
          image_url: imageUrl,
          status: "captured",
        })
        .throwOnError()
        .catch(() => null);

      await supabase
        .from("branch_cameras")
        .update({
          last_snapshot_at: new Date().toISOString(),
          last_snapshot_url: imageUrl,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", camera.id)
        .throwOnError()
        .catch(() => null);

      results.push({ cameraId: camera.id, cameraName: camera.name, status: "captured", imageUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo capturar snapshot";
      await recordSnapshotFailure(supabase, session, attendance, camera, message);
      results.push({ cameraId: camera.id, cameraName: camera.name, status: "failed", error: message });
    }
  }

  return results;
}

export async function POST(req: NextRequest) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const action = String(body.action || "status");
  const supabase = supabaseAdmin();
  const openAttendance = await getOpenAttendance(session.employeeId, session.tenantId);

  if (action === "clock_in") {
    if (openAttendance) {
      return NextResponse.json({
        session,
        openAttendance,
        status: "already_open",
        message: "Ya tenes un turno abierto.",
      });
    }

    const { data, error } = await supabase
      .from("employee_attendances")
      .insert({
        tenant_id: session.tenantId,
        branch_id: session.branchId,
        employee_id: session.employeeId,
        source: "staff_pwa",
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const snapshots = await captureAttendanceSnapshots(supabase, session, data);
    return NextResponse.json({ session, openAttendance: data, snapshots, status: "clocked_in" });
  }

  if (action === "clock_out") {
    if (!openAttendance) {
      return NextResponse.json({
        session,
        openAttendance: null,
        status: "no_open_shift",
        message: "No tenes un turno abierto.",
      });
    }

    const { data, error } = await supabase
      .from("employee_attendances")
      .update({ clock_out_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", openAttendance.id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ session, closedAttendance: data, status: "clocked_out" });
  }

  return NextResponse.json({
    session,
    openAttendance,
    status: openAttendance ? "open" : "closed",
  });
}
