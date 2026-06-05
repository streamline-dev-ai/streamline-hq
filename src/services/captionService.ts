// Caption generation — now server-side via the `generate-captions` edge function
// (Claude, ANTHROPIC_API_KEY held server-side). No API key is exposed to the browser.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const GENERATE_CAPTIONS_URL = `${SUPABASE_URL}/functions/v1/generate-captions`;

export interface GeneratedCaptions {
  master: string;
  instagram: string;
  facebook: string;
  linkedin: string;
  hashtags: string;
  first_comment: string;
}

export async function generateCaptions(
  brief: string,
  contentType: string,
  pillar: string,
  platforms: string[]
): Promise<GeneratedCaptions> {
  const res = await fetch(GENERATE_CAPTIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ brief, contentType, pillar, platforms }),
  });

  const data = await res.json();
  if (!res.ok || data?.error) {
    throw new Error(data?.error || `Caption generation failed (${res.status})`);
  }

  return {
    master: data.master ?? "",
    instagram: data.instagram ?? "",
    facebook: data.facebook ?? "",
    linkedin: data.linkedin ?? "",
    hashtags: data.hashtags ?? "",
    first_comment: data.first_comment ?? "",
  };
}
