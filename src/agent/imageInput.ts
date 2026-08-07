/**
 * Turning a picked photo into something Gemini can look at.
 *
 * This is the difference between the assistant reading a *description* of a
 * problem and reading the problem. Every AI claim in the vision doc — spotting
 * cracks and damp, reading a bank slip, reading an agreement — needs the image
 * itself, not a count of how many were attached.
 */

import { MOCK_PHOTO } from "../data/mock/lifecycleSeed";
import { MOCK_SLIP_URI } from "../data/mock/seed";

export interface InlineImage {
  mimeType: string;
  /** Base64, no data: prefix — that is what the API wants. */
  data: string;
}

/** Seeded placeholders are drawn, not real files; there is nothing to send. */
export const isPlaceholder = (uri: string): boolean =>
  uri.startsWith(MOCK_PHOTO) || uri.startsWith(MOCK_SLIP_URI);

/**
 * Reads a local file/blob URI into base64.
 *
 * `fetch` + FileReader works on web and React Native alike, which avoids
 * pulling in expo-file-system for one function. Returns null rather than
 * throwing — a photo that cannot be read should degrade the answer, never
 * kill the run.
 */
export async function toInlineImage(uri: string): Promise<InlineImage | null> {
  if (isPlaceholder(uri)) return null;

  try {
    const response = await fetch(uri);
    const blob = await response.blob();

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read the image"));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });

    const comma = dataUrl.indexOf(",");
    if (comma === -1) return null;

    const header = dataUrl.slice(0, comma);
    const mimeMatch = header.match(/data:([^;]+)/);

    return {
      mimeType: mimeMatch?.[1] ?? blob.type ?? "image/jpeg",
      data: dataUrl.slice(comma + 1),
    };
  } catch {
    return null;
  }
}

/** Reads several, dropping any that fail. Capped — context is not free. */
export async function toInlineImages(uris: string[], max = 3): Promise<InlineImage[]> {
  const results = await Promise.all(uris.slice(0, max).map(toInlineImage));
  return results.filter((image): image is InlineImage => image !== null);
}
