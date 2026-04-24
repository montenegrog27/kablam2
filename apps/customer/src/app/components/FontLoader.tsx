"use client";

import { useEffect } from "react";
import type { Branding } from "@/types/menu";

type FontLoaderProps = {
  branding?: Branding;
};

export default function FontLoader({ branding }: FontLoaderProps) {
  useEffect(() => {
    if (!branding?.font_url) return;

    const fontUrl = branding.font_url;
    const fontFamily = branding.font_family || "CustomFont";

    // Detectar tipo de fuente por extensión
    const isFontFile = /\.(woff|woff2|ttf|otf)(\?.*)?$/i.test(fontUrl);

    if (isFontFile) {
      // Crear @font-face para archivos de fuente directos
      const existingStyle = document.querySelector(
        `style[data-font-url="${fontUrl}"]`,
      );
      if (existingStyle) return;

      const style = document.createElement("style");
      style.setAttribute("data-font-url", fontUrl);
      style.textContent = `
        @font-face {
          font-family: "${fontFamily}";
          src: url("${fontUrl}") format("${getFontFormat(fontUrl)}");
          font-display: swap;
        }
      `;
      document.head.appendChild(style);

      return () => {
        if (document.head.contains(style)) {
          document.head.removeChild(style);
        }
      };
    } else {
      // Asumir que es una hoja de estilo CSS (Google Fonts)
      const existingLink = document.querySelector(`link[href="${fontUrl}"]`);
      if (existingLink) return;

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = fontUrl;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);

      return () => {
        if (document.head.contains(link)) {
          document.head.removeChild(link);
        }
      };
    }
  }, [branding?.font_url, branding?.font_family]);

  return null; // No renderiza nada visible
}

// Helper para determinar el formato de fuente
function getFontFormat(url: string): string {
  if (url.includes(".woff2")) return "woff2";
  if (url.includes(".woff")) return "woff";
  if (url.includes(".ttf")) return "truetype";
  if (url.includes(".otf")) return "opentype";
  return "woff2";
}
