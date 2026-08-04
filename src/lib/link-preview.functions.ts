import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({ url: z.string().url() });

export type LinkPreview = {
  url: string;
  title: string;
  description?: string;
  image?: string;
};

/** Fetches Open Graph metadata for a URL shared in a message. */
export const fetchLinkPreview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }): Promise<LinkPreview | null> => {
    try {
      const target = new URL(data.url);
      if (target.protocol !== "https:" && target.protocol !== "http:") return null;

      const response = await fetch(target.toString(), {
        headers: { "user-agent": "RippleBot/1.0 (+link-preview)" },
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) return null;
      const type = response.headers.get("content-type") ?? "";
      if (!type.includes("text/html")) return null;

      const html = (await response.text()).slice(0, 250_000);
      const meta = (names: string[]) => {
        for (const name of names) {
          const re = new RegExp(
            `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`,
            "i",
          );
          const alt = new RegExp(
            `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`,
            "i",
          );
          const match = html.match(re) ?? html.match(alt);
          if (match?.[1]) return decodeEntities(match[1]);
        }
        return undefined;
      };

      const title =
        meta(["og:title", "twitter:title"]) ??
        decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "");
      if (!title) return null;

      const image = meta(["og:image", "twitter:image"]);
      const preview: LinkPreview = { url: target.toString(), title: title.slice(0, 140) };
      const description = meta(["og:description", "description", "twitter:description"]);
      if (description) preview.description = description.slice(0, 200);
      if (image) preview.image = new URL(image, target).toString();
      return preview;
    } catch {
      return null;
    }
  });

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
