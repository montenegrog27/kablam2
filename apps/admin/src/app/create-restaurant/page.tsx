"use client"

import { useState } from "react"
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { useRouter } from "next/navigation"

export default function CreateRestaurant() {
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const router = useRouter()

  const handleCreate = async (e:any) => {
    e.preventDefault()

    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user

    if (!user) return alert("No autenticado")

    const trialEnds = new Date()
    trialEnds.setDate(trialEnds.getDate() + 7)

    // 1️⃣ Crear tenant
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .insert({
        name,
        slug,
        trial_ends_at: trialEnds
      })
      .select()
      .single()

    if (tenantError) return alert(tenantError.message)

    // 2️⃣ Crear branch principal
    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .insert({
        tenant_id: tenant.id,
        name: "Sucursal Principal"
      })
      .select()
      .single()

    if (branchError) return alert(branchError.message)

    // 3️⃣ Crear user owner
    const { error: userError } = await supabase
      .from("users")
      .insert({
        id: user.id,
        tenant_id: tenant.id,
        branch_id: branch.id,
        role: "owner",
        name: user.email
      })

    if (userError) return alert(userError.message)

    router.push("/dashboard")
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-4 w-80"
      >
        <h1 className="text-2xl font-bold">
          Crear Restaurante
        </h1>

        <input
          type="text"
          placeholder="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border p-2"
        />

        <input
          type="text"
          placeholder="Slug (ej: mordisco)"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="border p-2"
        />

        <button className="bg-black text-white p-2">
          Crear
        </button>
      </form>
    </div>
  )
}
