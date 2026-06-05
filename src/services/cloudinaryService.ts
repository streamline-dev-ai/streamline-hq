// Browser-safe Cloudinary upload (unsigned preset).
// The API secret NEVER touches the browser — unsigned presets are the
// supported client-side path. Signed uploads happen only in the local
// ingestion script (scripts/ingestPost.mjs).

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "dbhiu7lv0";
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export function isCloudinaryConfigured(): boolean {
  return !!CLOUD_NAME && !!UPLOAD_PRESET;
}

/** Upload one file to Cloudinary and return its public secure_url. */
export async function uploadToCloudinary(file: File): Promise<string> {
  if (!UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary not configured — add VITE_CLOUDINARY_UPLOAD_PRESET (an unsigned preset) to .env",
    );
  }
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET);

  // `auto` handles both images and video
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!res.ok || !data.secure_url) {
    throw new Error(data?.error?.message || `Cloudinary upload failed (${res.status})`);
  }
  return data.secure_url as string;
}

/** Upload several files, preserving order. */
export async function uploadManyToCloudinary(files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const f of files) urls.push(await uploadToCloudinary(f)); // sequential = stable order
  return urls;
}
