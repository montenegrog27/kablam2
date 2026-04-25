"use client";

import { useEffect } from "react";
import type { Branding } from "@/types/menu";

type MetaTagsProps = {
  branding?: Branding;
};

export default function MetaTags({ branding }: MetaTagsProps) {
  useEffect(() => {
    if (!branding) return;

    const metaTitle = branding.meta_title;
    const faviconUrl = branding.favicon_url;
    const metaPixelScript = branding.meta_pixel_script;
    const ga4Script = branding.ga4_script;

    // Update title
    if (metaTitle) {
      document.title = metaTitle;
    }

    // Update favicon
    if (faviconUrl) {
      const existingFavicon = document.querySelector(
        'link[rel="icon"]',
      ) as HTMLLinkElement | null;
      const existingShortcutIcon = document.querySelector(
        'link[rel="shortcut icon"]',
      ) as HTMLLinkElement | null;

      const faviconLink = existingFavicon || document.createElement("link");
      faviconLink.rel = "icon";
      faviconLink.href = faviconUrl;

      if (!existingFavicon && !existingShortcutIcon) {
        document.head.appendChild(faviconLink);
      }

      // Also add shortcut icon for older browsers
      if (!existingShortcutIcon) {
        const shortcutLink = document.createElement("link");
        shortcutLink.rel = "shortcut icon";
        shortcutLink.href = faviconUrl;
        document.head.appendChild(shortcutLink);
      }
    }

    // Inject Meta Pixel script
    if (metaPixelScript) {
      const existingPixel = document.querySelector(
        'script[data-meta-pixel="true"]',
      );
      if (!existingPixel) {
        const script = document.createElement("script");
        script.setAttribute("data-meta-pixel", "true");
        script.textContent = metaPixelScript;
        // Scripts in body for performance
        document.body.appendChild(script);
      }
    }

    // Inject GA4 script
    if (ga4Script) {
      const existingGA = document.querySelector('script[data-ga4="true"]');
      if (!existingGA) {
        const script = document.createElement("script");
        script.setAttribute("data-ga4", "true");
        script.textContent = ga4Script;
        document.body.appendChild(script);
      }
    }
  }, [branding]);

  return null;
}
