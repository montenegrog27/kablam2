import { NextResponse } from "next/server";

export async function POST(req: Request) {

  const body = await req.json();

  const { phoneNumberId, accessToken } = body;

  try {

    const res = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const data = await res.json();

    if (data.error) {
      return NextResponse.json({
        success: false,
        error: data.error.message,
      });
    }

    return NextResponse.json({
      success: true,
      phone_number: data.display_phone_number,
      waba_id: data.whatsapp_business_account?.id,
    });

  } catch (err) {

    return NextResponse.json({
      success: false,
      error: "Error verificando número",
    });

  }

}