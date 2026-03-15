// Supabase Edge Function: uses OpenAI GPT Image (gpt-image-1.5) to generate pixel-style avatar from user photo
// 部署后需在 Supabase Dashboard 设置密钥: OPENAI_API_KEY
// 本地: supabase functions serve generate-avatar --env-file ./supabase/.env.local

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEFAULT_PROMPT = `IMPORTANT: The output MUST be a full-body image. Show the entire figure from head to feet. Do not crop to bust, portrait, or half-body.

Create a full-body pixel art character in an early-2000s internet doll / avatar style.
The character must be full body: centered, standing upright, facing forward, from head to toes, with a neutral pose. Include legs and feet clearly visible.

Visual style:
- Low-resolution pixel art (sprite-like), clearly visible pixels
- Simplified anatomy with slightly over-sized head and relatively slender body (following the reference image body shape)
- Flat lighting, no realism, no depth shading
- extract main color palette from the reference image
- Clean pixel outlines

Character details:
- Full-body figure only: head, torso, arms, legs, and feet all visible in frame
- Cute with same facial expression as reference
- Simplified facial features (minimal nose detail, large eyes)
- replicate any visible accessories
- Stylized hair with visible pixel strands
- copy the outfit of the original image
- Fashion-forward, early-2000s "internet doll" aesthetic

Background:
- transparent background

Mood:
- Cute, playful
- Nostalgic and decorative
- Feels like a collectible digital character from an old social media game or avatar website

Avoid:
- Cropping to bust, portrait, half-body, or head-and-shoulders only
- Photorealism
- Smooth gradients
- 3D rendering
- Modern UI aesthetics
- Detailed facial realism`

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
        size: '1024x1536',
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
