"use client";

import { useEffect } from "react";
import Script from "next/script";
import type { Branding } from "@/types/menu";

type MetaTagsProps = {
  branding?: Branding;
};

function normalizeAssetUrl(url?: string | null) {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/")
  ) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function extractMetaPixelId(branding?: Branding) {
  const explicit = branding?.meta_pixel_id?.trim();
  if (explicit) return explicit.replace(/\D/g, "");

  const legacy = branding?.meta_pixel_script || "";
  const fromInit = legacy.match(/fbq\(['"]init['"],\s*['"](\d+)['"]\)/i)?.[1];
  if (fromInit) return fromInit;
  return legacy.match(/facebook\.com\/tr\?id=(\d+)/i)?.[1] || null;
}

function extractGa4Id(branding?: Branding) {
  const explicit = branding?.ga4_measurement_id?.trim().toUpperCase();
  if (explicit) return explicit;

  const legacy = branding?.ga4_script || "";
  return (
    legacy.match(/gtag\/js\?id=(G-[A-Z0-9]+)/i)?.[1]?.toUpperCase() ||
    legacy.match(/gtag\(['"]config['"],\s*['"](G-[A-Z0-9]+)['"]\)/i)?.[1]?.toUpperCase() ||
    null
  );
}

export default function MetaTags({ branding }: MetaTagsProps) {
  const metaPixelId = extractMetaPixelId(branding);
  const ga4Id = extractGa4Id(branding);

  useEffect(() => {
    if (!branding) return;

    const metaTitle = branding.meta_title;
    const faviconUrl = normalizeAssetUrl(branding.favicon_url);

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
      } else {
        existingShortcutIcon.href = faviconUrl;
      }
    }
  }, [branding]);

  return (
    <>
      {ga4Id && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`}
            strategy="afterInteractive"
          />
          <Script
            id={`ga4-${ga4Id}`}
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${ga4Id}');
              `,
            }}
          />
        </>
      )}

      {metaPixelId && (
        <>
          <Script
            id={`meta-pixel-${metaPixelId}`}
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                !function(f,b,e,v,n,t,s)
                {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
                n.callMethod.apply(n,arguments):n.queue.push(arguments)};
                if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
                n.queue=[];t=b.createElement(e);t.async=!0;
                t.src=v;s=b.getElementsByTagName(e)[0];
                s.parentNode.insertBefore(t,s)}(window, document,'script',
                'https://connect.facebook.net/en_US/fbevents.js');
                fbq('init', '${metaPixelId}');
                fbq('track', 'PageView');
              `,
            }}
          />
          <noscript>
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        </>
      )}
    </>
  );
}
