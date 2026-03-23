# Buffer Proxy Edge Function

To deploy this function manually:

1. Go to Supabase Dashboard → Edge Functions
2. Click "New Function"
3. Name it "buffer-proxy"
4. Paste the code from index.ts below

## Code to paste:

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query } = await req.json()
    
    if (!query) {
      return new Response(JSON.stringify({ error: 'Missing query' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const bufferApiKey = Deno.env.get('BUFFER_API_KEY')
    
    if (!bufferApiKey) {
      return new Response(JSON.stringify({ error: 'BUFFER_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    
    const response = await fetch('https://api.buffer.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bufferApiKey}`,
      },
      body: JSON.stringify({ query })
    })

    const data = await response.json()
    
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

## Setting the secret:

After creating the function, go to:
Settings → Edge Functions → Add secret

Name: BUFFER_API_KEY
Value: (your Buffer API key)