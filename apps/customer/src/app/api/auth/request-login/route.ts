import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const body = await req.json();
    const { branchSlug, phone, name } = body;

    if (!branchSlug || !phone) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: branchSlug, phone" },
        { status: 400 },
      );
    }

    // 1. Obtener branch y tenant
    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("id, tenant_id")
      .eq("slug", branchSlug)
      .single();

    if (branchError || !branch) {
      console.error("Branch error:", branchError);
      return NextResponse.json(
        { error: "Sucursal no encontrada" },
        { status: 404 },
      );
    }

    const { id: branchId, tenant_id: tenantId } = branch;

    // 2. Normalizar teléfono para Argentina
    let phoneNormalized = phone.replace(/\D/g, ""); // Solo números
    console.log(
      "Phone input:",
      phone,
      "Normalized (digits only):",
      phoneNormalized,
    );

    // Asegurar código de país Argentina (54)
    if (!phoneNormalized.startsWith("54")) {
      phoneNormalized = "54" + phoneNormalized;
      console.log("Added country code:", phoneNormalized);
    }

    // Asegurar indicador de móvil (9) después del código de país
    // Formato esperado: 54 + 9 + número (13 dígitos total)
    if (phoneNormalized.length === 12) {
      // Tiene 12 dígitos (54 + 10 dígitos) -> falta el 9 móvil
      phoneNormalized =
        phoneNormalized.slice(0, 2) + "9" + phoneNormalized.slice(2);
      console.log("Added mobile indicator (9):", phoneNormalized);
    } else if (
      phoneNormalized.length === 13 &&
      phoneNormalized.charAt(2) !== "9"
    ) {
      // Tiene 13 dígitos pero el tercer dígito no es 9 -> insertar 9
      phoneNormalized =
        phoneNormalized.slice(0, 2) + "9" + phoneNormalized.slice(2);
      console.log("Inserted mobile indicator (9):", phoneNormalized);
    }

    // Validar longitud final (debería ser 13 dígitos para Argentina móvil)
    if (phoneNormalized.length !== 13) {
      console.warn(
        "Phone length unexpected:",
        phoneNormalized.length,
        "digits:",
        phoneNormalized,
      );
    }

    // Asegurar formato E.164: +54XXXXXXXXXX
    const phoneE164 = `+${phoneNormalized}`;
    console.log("Final phone E.164:", phoneE164);

    // 3. Buscar o crear customer
    let { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("phone", phoneNormalized)
      .maybeSingle();

    if (!customer) {
      console.log("Creating new customer with:", {
        tenant_id: tenantId,
        phone: phoneNormalized,
        name: name || null,
      });
      const { data: newCustomer, error: insertError } = await supabase
        .from("customers")
        .insert({
          tenant_id: tenantId,
          phone: phoneNormalized,
          name: name || null,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error creando customer:", insertError);
        console.error("Insert error details:", insertError);
        return NextResponse.json(
          { error: "Error al crear cliente", details: insertError.message },
          { status: 500 },
        );
      }
      customer = newCustomer;
      console.log("Customer created:", customer.id);
    } else if (name && !customer.name) {
      // Actualizar nombre si no tenía
      console.log("Updating customer name:", customer.id, name);
      await supabase.from("customers").update({ name }).eq("id", customer.id);
    }

    // 4. Generar token de autenticación (válido por 15 minutos)
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

    console.log("Attempting to insert auth token:", {
      token,
      customer_id: customer.id,
      branch_id: branchId,
      expires_at: expiresAt.toISOString(),
    });

    // Verificar si la tabla existe primero
    try {
      const { error: checkError } = await supabase
        .from("customer_auth_tokens")
        .select("count")
        .limit(1);

      if (checkError && checkError.message.includes("relation")) {
        console.error("Table customer_auth_tokens does not exist:", checkError);
        return NextResponse.json(
          {
            error: "Tabla de autenticación no configurada",
            details:
              "La tabla 'customer_auth_tokens' no existe. Ejecuta las migraciones SQL.",
            sql: "CREATE TABLE IF NOT EXISTS customer_auth_tokens (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), token TEXT NOT NULL UNIQUE, customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE, branch_id UUID NOT NULL, expires_at TIMESTAMP WITH TIME ZONE NOT NULL, used BOOLEAN DEFAULT FALSE, created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW());",
          },
          { status: 500 },
        );
      }
    } catch (checkErr) {
      console.error("Error checking table:", checkErr);
    }

    try {
      const { error: tokenError } = await supabase
        .from("customer_auth_tokens")
        .insert({
          token,
          customer_id: customer.id,
          branch_id: branchId,
          expires_at: expiresAt.toISOString(),
        });

      if (tokenError) {
        console.error("Error guardando token:", tokenError);
        console.error(
          "Full token error object:",
          JSON.stringify(tokenError, null, 2),
        );

        // Verificar si es error de foreign key
        if (tokenError.message.includes("foreign key constraint")) {
          return NextResponse.json(
            {
              error: "Error de referencia en base de datos",
              details: tokenError.message,
              hint: "Verifica que el customer_id y branch_id existan en sus respectivas tablas.",
            },
            { status: 500 },
          );
        }

        throw tokenError;
      }
    } catch (error: unknown) {
      console.error("Exception while inserting token:", error);
      return NextResponse.json(
        {
          error: "Error interno al generar token",
          details: error instanceof Error ? error.message : "Unknown error",
          hint: "Check if customer_auth_tokens table exists and has proper permissions",
        },
        { status: 500 },
      );
    }

    // 5. Construir URL de verificación
    let baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002";
    // Asegurar que baseUrl no termine con /
    baseUrl = baseUrl.replace(/\/$/, "");
    const verifyUrl = `${baseUrl}/${branchSlug}/auth/verify?token=${token}`;
    console.log("Generated verify URL:", verifyUrl);

    // 6. Obtener configuración de WhatsApp para el branch
    const { data: whatsappConfig } = await supabase
      .from("whatsapp_numbers")
      .select("phone_number_id, access_token")
      .eq("branch_id", branchId)
      .single();

    let phone_number_id: string | null = null;
    let access_token: string | null = null;

    if (whatsappConfig) {
      phone_number_id = whatsappConfig.phone_number_id;
      access_token = whatsappConfig.access_token;
      console.log("WhatsApp config found for branch:", branchId);
    } else {
      console.warn(
        "WhatsApp no configurado para esta sucursal en la tabla whatsapp_numbers, intentando variables de entorno...",
      );
      // Intentar usar variables de entorno globales
      phone_number_id = process.env.WHATSAPP_PHONE_NUMBER_ID || null;
      access_token = process.env.WHATSAPP_API_TOKEN || null;

      if (!phone_number_id || !access_token) {
        console.warn("Variables de entorno de WhatsApp no configuradas");
        // Podríamos enviar un SMS o simular en desarrollo
        return NextResponse.json(
          {
            success: true,
            message: "Token generado (WhatsApp no configurado)",
            verifyUrl, // En desarrollo devolvemos la URL para probar
            token, // Solo para desarrollo
          },
          { status: 200 },
        );
      }
      console.log(
        "Usando configuración de WhatsApp desde variables de entorno",
      );
    }

    // 7. Enviar mensaje por WhatsApp
    console.log("Phone number ID:", phone_number_id);
    console.log("Sending to phone E.164:", phoneE164);

    const messageText = `Hola ${customer.name || "Cliente"}! Para acceder a tu cuenta en ${branchSlug}, haz clic en el siguiente enlace:\n\n${verifyUrl}\n\nEl enlace expira en 15 minutos.`;

    let whatsappError = null;

    // Intentar usar plantilla si existe, sino mensaje de texto
    const payload = {
      messaging_product: "whatsapp",
      to: phoneE164,
      type: "text",
      text: { body: messageText },
    };

    const url = `https://graph.facebook.com/v18.0/${phone_number_id}/messages`;
    console.log("WhatsApp API URL:", url);
    console.log("WhatsApp API payload:", JSON.stringify(payload, null, 2));

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();
    console.log("WhatsApp API response status:", res.status, res.statusText);
    console.log("WhatsApp API raw response:", responseText);

    let result;
    try {
      result = JSON.parse(responseText);
      console.log("WhatsApp API parsed response:", result);
    } catch (parseError) {
      console.error("Failed to parse WhatsApp API response:", parseError);
      result = {
        error: {
          message: "Invalid JSON response",
          raw: responseText.slice(0, 200),
        },
      };
    }

    if (result.error) {
      whatsappError = result.error;
      console.error("Error enviando WhatsApp:", whatsappError);
      console.error("WhatsApp error details:", {
        code: whatsappError.code,
        message: whatsappError.message,
        type: whatsappError.type,
        error_subcode: whatsappError.error_subcode,
        fbtrace_id: whatsappError.fbtrace_id,
      });
    } else if (result.messages && result.messages[0]) {
      console.log(
        "WhatsApp message sent successfully, message ID:",
        result.messages[0].id,
      );
    } else {
      console.warn("WhatsApp API returned success but no message ID:", result);
      whatsappError = {
        message: "No message ID in response",
        response: result,
      };
    }

    // 8. Registrar el mensaje en la base de datos (opcional)
    // Buscar conversación existente o crear una nueva
    let { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("customer_id", customer.id)
      .eq("branch_id", branchId)
      .maybeSingle();

    if (!conversation) {
      const { data: newConv } = await supabase
        .from("conversations")
        .insert({
          tenant_id: tenantId,
          branch_id: branchId,
          customer_id: customer.id,
          last_message_at: new Date(),
        })
        .select()
        .single();
      conversation = newConv;
    }

    await supabase.from("messages").insert({
      tenant_id: tenantId,
      branch_id: branchId,
      conversation_id: conversation.id,
      sender_type: "system",
      message: `Enlace de verificación enviado: ${verifyUrl}`,
      media_type: "text",
      whatsapp_message_id: result.messages?.[0]?.id,
    });

    // Determinar mensaje basado en resultado de WhatsApp
    let responseMessage = "WhatsApp enviado con el enlace de verificación";
    const responsePayload: Record<string, unknown> = {
      success: true,
      message: responseMessage,
    };

    if (whatsappError) {
      responseMessage =
        "El enlace de verificación fue generado, pero hubo un problema al enviar el WhatsApp";
      responsePayload.message = responseMessage;
      responsePayload.warning = "whatsapp_failed";
      responsePayload.error_details = whatsappError.message;
      // Incluir URL para que el usuario pueda verificar manualmente
      responsePayload.verifyUrl = verifyUrl;
    } else if (process.env.NODE_ENV === "development") {
      // En desarrollo, incluir URL para pruebas
      responsePayload.verifyUrl = verifyUrl;
    }

    return NextResponse.json(responsePayload);
  } catch (error: unknown) {
    console.error("Error en request-login:", error);
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      { error: "Error interno del servidor", details: message },
      { status: 500 },
    );
  }
}
