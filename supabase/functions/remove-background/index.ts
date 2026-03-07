// Remove background from image (transparent PNG).
// Primary: Poof (POOF_API_KEY) — https://poof.bg
// Fallback: OpenAI image edit (OPENAI_API_KEY) when Poof is unavailable.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const arr = new Uint8Array(buf)
  const chunkSize = 0x8000
  let out = ''
  for (let i = 0; i < arr.length; i += chunkSize) {
    const chunk = arr.subarray(i, Math.min(i + chunkSize, arr.length))
    out += String.fromCharCode(...chunk)
  }
  return btoa(out)
}

/** Call Poof background removal. Returns base64 PNG string or null on failure. */
async function tryPoofRemoveBackground(rawBase64: string, apiKey: string): Promise<string | null> {
  const binaryStr = atob(rawBase64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }
  const imageBlob = new Blob([bytes], { type: 'image/png' })

  const form = new FormData()
  form.append('image_file', imageBlob, 'image.png')

  const res = await fetch('https://api.poof.bg/v1/remove', {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
    body: form,
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('[remove-background] Poof error', res.status, errText)
    return null
  }

  // Poof returns the processed image binary directly (not JSON)
  const buf = await res.arrayBuffer()
  return arrayBufferToBase64(buf)
}

const OPENAI_REMOVE_BG_PROMPT =
  'Change only the background to transparent. Do not modify, redraw, alter, or reinterpret the subject in any way. Preserve the subject pixel-for-pixel: same texture, color, size, and every detail. Output the exact same foreground on a transparent background.'

/** Call OpenAI image edit to remove background. Returns base64 string or null on failure. */
async function tryOpenAIRemoveBackground(rawBase64: string, apiKey: string): Promise<string | null> {
  const dataUrl = `data:image/png;base64,${rawBase64}`
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-image-1.5',
      images: [{ image_url: dataUrl }],
      prompt: OPENAI_REMOVE_BG_PROMPT,
      input_fidelity: 'high',
      quality: 'high',
      output_format: 'png',
      background: 'transparent',
      size: 'auto',
      n: 1,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error(
      '[remove-background] OpenAI fallback error',
      res.status,
      // @ts-ignore
      data?.error?.message ?? res.statusText,
    )
    return null
  }
  // @ts-ignore
  const b64 = data?.data?.[0]?.b64_json
  return typeof b64 === 'string' ? b64 : null
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let body: { imageBase64?: string }
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const imageBase64 = (body?.imageBase64 ?? '').trim()
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'imageBase64 required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const raw = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    // Try Poof
    const poofKey = Deno.env.get('POOF_API_KEY')
    if (poofKey) {
      try {
        const b64 = await tryPoofRemoveBackground(raw, poofKey)
        if (b64) {
          console.log('[remove-background] API used: Poof')
          return new Response(JSON.stringify({ b64_json: b64 }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      } catch (e) {
        console.error('[remove-background] Poof exception', e)
      }
    }

    // OpenAI fallback
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (openaiKey) {
      try {
        const b64 = await tryOpenAIRemoveBackground(raw, openaiKey)
        if (b64) {
          console.log('[remove-background] API used: OpenAI fallback')
          return new Response(JSON.stringify({ b64_json: b64 }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      } catch (e) {
        console.error('[remove-background] OpenAI exception', e)
      }
    }

    // No API available or all failed: pass through original image
    console.log('[remove-background] API used: none (original image passthrough)')
    return new Response(
      JSON.stringify({
        b64_json: raw,
        fallback: true,
        message: 'Background removal unavailable; using original image.',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const stack = e instanceof Error ? e.stack : ''
    console.error('[remove-background] unhandled', e)
    return new Response(
      JSON.stringify({
        error: msg || 'Server error',
        detail: stack ? stack.slice(0, 400) : undefined,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
