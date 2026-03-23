import { Platform } from "@/types/content";

// Supabase Edge Function URL for Buffer proxy
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const BUFFER_PROXY_URL = `${SUPABASE_URL}/functions/v1/buffer-proxy`;

// Channel IDs from environment
const CHANNEL_IDS: Record<Platform, string | undefined> = {
  instagram: import.meta.env.VITE_BUFFER_INSTAGRAM_ID,
  facebook: import.meta.env.VITE_BUFFER_FACEBOOK_ID,
  linkedin: import.meta.env.VITE_BUFFER_LINKEDIN_ID,
};

// Check if Buffer is configured
export function isBufferConfigured(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
}

// Get channel ID for a platform
export function getChannelId(platform: Platform): string | undefined {
  return CHANNEL_IDS[platform];
}

async function createPost(channelId: string, caption: string, dueAt: string): Promise<{
  success: boolean;
  postId?: string;
  error?: string;
}> {
  const query = `
    mutation CreatePost {
      createPost(input: {
        text: ${JSON.stringify(caption)}
        channelId: "${channelId}"
        schedulingType: automatic
        mode: customSchedule
        dueAt: "${dueAt}"
      }) {
        ... on PostActionSuccess { post { id text } }
        ... on MutationError { message }
      }
    }
  `;

  try {
    const res = await fetch(BUFFER_PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ query }),
    });

    const data = await res.json();
    
    if (data.error) {
      return { success: false, error: data.error };
    }

    const postData = data?.data?.createPost;
    
    // Debug: log the full response
    console.log('Buffer response:', JSON.stringify(data));
    
    if (postData?.__typename === "PostActionSuccess" && postData?.post?.id) {
      return { success: true, postId: postData.post.id };
    } else if (postData?.__typename === "MutationError") {
      return { success: false, error: postData.message };
    }

    // If we got data but couldn't parse it, return the raw error
    if (data?.errors) {
      return { success: false, error: data.errors[0]?.message || 'GraphQL error' };
    }
    if (data?.error) {
      return { success: false, error: data.error };
    }
    
    return { success: false, error: "Unknown response from Buffer: " + JSON.stringify(data) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to create post" };
  }
}

export async function scheduleToAllPlatforms(
  platforms: Platform[],
  captions: { instagram?: string; facebook?: string; linkedin?: string },
  dueAt: string
): Promise<{
  success: { platform: Platform; bufferId: string }[];
  failed: { platform: Platform; error: string }[];
}> {
  const results = await Promise.allSettled(
    platforms.map((platform) =>
      createPost(
        CHANNEL_IDS[platform]!,
        captions[platform] || "",
        new Date(dueAt).toISOString()
      )
    )
  );

  const success: { platform: Platform; bufferId: string }[] = [];
  const failed: { platform: Platform; error: string }[] = [];

  results.forEach((result, i) => {
    const platform = platforms[i];
    if (
      result.status === "fulfilled" &&
      result.value.success &&
      result.value.postId
    ) {
      success.push({
        platform,
        bufferId: result.value.postId,
      });
    } else {
      const errorMsg =
        result.status === "rejected"
          ? result.reason
          : result.value.error || "Unknown error";
      failed.push({
        platform,
        error: errorMsg,
      });
    }
  });

  return { success, failed };
}

export async function postNow(
  platforms: Platform[],
  captions: { instagram?: string; facebook?: string; linkedin?: string }
): Promise<{
  success: { platform: Platform; bufferId: string }[];
  failed: { platform: Platform; error: string }[];
}> {
  const dueAt = new Date(Date.now() + 120000); // 2 min from now
  return scheduleToAllPlatforms(platforms, captions, dueAt.toISOString());
}

// Validate that all platforms have channel IDs configured
export function validatePlatforms(platforms: Platform[]): { valid: Platform[]; invalid: Platform[] } {
  const valid: Platform[] = [];
  const invalid: Platform[] = [];

  platforms.forEach((platform) => {
    if (CHANNEL_IDS[platform]) {
      valid.push(platform);
    } else {
      invalid.push(platform);
    }
  });

  return { valid, invalid };
}
