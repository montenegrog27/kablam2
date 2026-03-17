"use client";

import { useEffect, useState } from "react";
import { supabase } from "@kablam/supabase";

export default function ModifiersPage() {

  const [tenantId,setTenantId] = useState<string | null>(null)

  const [groups,setGroups] = useState<any[]>([])
  const [modifiers,setModifiers] = useState<any[]>([])

  const [newGroupName,setNewGroupName] = useState("")
  const [newModifierName,setNewModifierName] = useState("")
  const [newModifierPrice,setNewModifierPrice] = useState("")
  const [selectedGroup,setSelectedGroup] = useState<string | null>(null)

  useEffect(()=>{
    loadData()
  },[])

  async function loadData(){

    const { data:userData } = await supabase.auth.getUser()
    const user = userData?.user
    if(!user) return

    const { data:userRecord } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id",user.id)
    .single()

    if(!userRecord) return

    setTenantId(userRecord.tenant_id)

    const { data:groupsData } = await supabase
    .from("modifier_groups")
    .select("*")
    .eq("tenant_id",userRecord.tenant_id)
    .order("position")

    setGroups(groupsData || [])

    const { data:mods } = await supabase
    .from("modifiers")
    .select("*")
    .eq("tenant_id",userRecord.tenant_id)
    .order("position")

    setModifiers(mods || [])

  }

  async function createGroup(){

    if(!tenantId || !newGroupName) return

    await supabase
    .from("modifier_groups")
    .insert({
      tenant_id:tenantId,
      name:newGroupName
    })

    setNewGroupName("")
    loadData()

  }

  async function createModifier(){

    if(!tenantId || !selectedGroup) return

    await supabase
    .from("modifiers")
    .insert({
      tenant_id:tenantId,
      modifier_group_id:selectedGroup,
      name:newModifierName,
      price:Number(newModifierPrice)
    })

    setNewModifierName("")
    setNewModifierPrice("")
    loadData()

  }

  async function toggleModifier(modifier:any){

    await supabase
    .from("modifiers")
    .update({
      is_active:!modifier.is_active
    })
    .eq("id",modifier.id)

    loadData()

  }

  return (

    <div className="flex gap-8">

      {/* GRUPOS */}

      <aside className="w-72 bg-black p-4 rounded">

        <h2 className="font-bold mb-4">Grupos de extras</h2>

        <div className="space-y-2">

          {groups.map(group=>(
            <button
              key={group.id}
              onClick={()=>setSelectedGroup(group.id)}
              className={`block w-full text-left p-2 rounded ${
                selectedGroup===group.id ? "bg-white text-black" : ""
              }`}
            >
              {group.name}
            </button>
          ))}

        </div>

        <div className="mt-6 space-y-2">

          <input
            className="border p-2 w-full"
            placeholder="Nuevo grupo"
            value={newGroupName}
            onChange={e=>setNewGroupName(e.target.value)}
          />

          <button
            onClick={createGroup}
            className="bg-white text-black px-3 py-2 rounded w-full"
          >
            Crear grupo
          </button>

        </div>

      </aside>


      {/* MODIFIERS */}

      <main className="flex-1">

        <h1 className="text-2xl font-bold mb-6">Extras</h1>

        {selectedGroup && (

          <div className="bg-black p-6 rounded space-y-4">

            <h2 className="font-semibold">Crear extra</h2>

            <input
              className="border p-2 w-full"
              placeholder="Nombre extra"
              value={newModifierName}
              onChange={e=>setNewModifierName(e.target.value)}
            />

            <input
              type="number"
              className="border p-2 w-full"
              placeholder="Precio"
              value={newModifierPrice}
              onChange={e=>setNewModifierPrice(e.target.value)}
            />

            <button
              onClick={createModifier}
              className="bg-white text-black px-4 py-2 rounded"
            >
              Crear extra
            </button>

          </div>

        )}

        <div className="mt-8 space-y-3">

          {modifiers
          .filter(m=>m.modifier_group_id===selectedGroup)
          .map(modifier=>(

            <div
              key={modifier.id}
              className="bg-black p-4 rounded flex justify-between items-center"
            >

              <div>

                <div className="font-semibold">
                  {modifier.name}
                </div>

                <div className="text-sm text-gray-400">
                  ${modifier.price}
                </div>

              </div>

              <button
                onClick={()=>toggleModifier(modifier)}
                className={`px-3 py-1 rounded text-sm ${
                  modifier.is_active ? "bg-green-500" : "bg-red-500"
                }`}
              >
                {modifier.is_active ? "Activo" : "Inactivo"}
              </button>

            </div>

          ))}

        </div>

      </main>

    </div>

  )

}