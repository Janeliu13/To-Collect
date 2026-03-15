// Supabase Edge Function: uses OpenAI GPT Image (gpt-image-1.5) to generate pixel-style avatar from user photo
// 部署后需在 Supabase Dashboard 设置密钥: OPENAI_API_KEY
// 本地: supabase functions serve generate-avatar --env-file ./supabase/.env.local

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEFAULT_PROMPT = `CRITICAL — FRAMING: The image MUST show the COMPLETE figure from the TOP OF THE HEAD to the BOTTOM OF THE FEET. Never cut off at the knees, waist, chest, or ankles. Feet must be fully visible. The entire body must fit in the vertical frame with a small margin; never crop the figure. If you show only part of the body (e.g. bust or half-body), the image is wrong.

IMPORTANT: (1) VERTICAL portrait, (2) FULL BODY head-to-toe only, (3) SOLID flat colors, (4) TRANSPARENT background.

Create a full-body pixel art character in an early-2000s internet doll / avatar style.
The character MUST be full body: centered, standing upright, facing forward, from the top of the head to the soles of the feet. Legs and feet must be fully visible and inside the frame. Use the full vertical canvas so the whole figure fits—head at top, feet at bottom, nothing cut off.

Visual style:
- Low-resolution pixel art (sprite-like), clearly visible pixels
- SOLID, flat colors only—no gradients, no soft shading, no realism
- Simplified anatomy with slightly over-sized head and relatively slender body (following the reference image body shape)
- Flat lighting, no depth shading
- Extract main color palette from the reference image (use as solid fills)
- Clean pixel outlines

Character details:
- FULL BODY ONLY: head, neck, torso, arms, legs, and feet ALL visible in frame from top to bottom. No cropping.
- Scale the figure so the complete body fits in the image (smaller figure is fine; cut-off figure is wrong).
- Cute with same facial expression as reference
- Simplified facial features
- Replicate any visible accessories
- Stylized hair with visible pixel strands
- Copy the outfit of the original image
- Fashion-forward, early-2000s "internet doll" aesthetic

Background:
- Transparent background only—no solid color or scene behind the character.

Mood:
- Cute, playful
- Nostalgic and decorative
- Feels like a collectible digital character from an old social media game or avatar website

NEVER DO (image is invalid if you do):
- Do NOT crop to bust, portrait, half-body, head-and-shoulders, or three-quarter view. FULL BODY only.
- Do NOT cut off at knees, thighs, waist, chest, or ankles. Top of head to bottom of feet must be visible.
- Do NOT use horizontal or square framing—vertical only.
- No photorealism, smooth gradients, 3D rendering, or opaque background.`

interface ReqBody {
  imageBase64?: string
  prompt?: string
}

Deno.serve(async (req) => {
  console.log('[generate-avatar]', req.method, new URL(req.url).pathname)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: ReqBody & { image_base64?: string }
  try {
    body = (await req.json()) as ReqBody & { image_base64?: string }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Invalid JSON body'
    return new Response(JSON.stringify({ error: 'Invalid JSON body: ' + msg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const imageBase64 = (body?.imageBase64 ?? body?.image_base64 ?? '').trim()
  console.log('[generate-avatar] body keys:', Object.keys(body || {}), 'imageBase64 length:', imageBase64?.length ?? 0)
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return new Response(JSON.stringify({ error: 'imageBase64 required (string)' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (imageBase64.length > 10_000_000) {
    return new Response(JSON.stringify({ error: 'imageBase64 too large, compress image first' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const prompt = body.prompt || DEFAULT_PROMPT
  const dataUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`

  try {
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1.5',
        images: [{ image_url: dataUrl }],
        prompt,
        input_fidelity: 'high',
        quality: 'high',
        output_format: 'png',
        background: 'transparent',
        size: '1024x1536', // API only allows 1024x1024, 1024x1536, 1536x1024, auto — use portrait 2:3
        n: 1,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      const errMsg = data?.error?.message || res.statusText || 'OpenAI request failed'
      console.error('[generate-avatar] OpenAI error:', res.status, errMsg, data?.error)
      return new Response(
        JSON.stringify({ error: errMsg }),
        {
          status: res.status >= 500 ? 502 : res.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const b64 = data?.data?.[0]?.b64_json
    if (!b64) {
      return new Response(JSON.stringify({ error: 'No image in response' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ b64_json: b64 }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
