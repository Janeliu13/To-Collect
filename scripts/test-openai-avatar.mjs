/**
 * 本地测试 OpenAI Images Edits API（与 Edge Function 相同调用方式）
 * 用法：OPENAI_API_KEY=sk-xxx node scripts/test-openai-avatar.mjs
 * 或：先 export OPENAI_API_KEY=sk-xxx 再 node scripts/test-openai-avatar.mjs
 *
 * 注意：请勿把 API Key 提交到 Git；若曾泄露请立即在 OpenAI 后台撤销并新建 key。
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('请设置环境变量 OPENAI_API_KEY，例如：');
  console.error('  OPENAI_API_KEY=sk-xxx node scripts/test-openai-avatar.mjs');
  process.exit(1);
}

// 使用一个最小的合法 JPEG base64（1x1 红像素），仅用于验证接口是否通
const MINI_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQACEQAD4A==';

const url = 'https://api.openai.com/v1/images/edits';
const dataUrl = `data:image/jpeg;base64,${MINI_JPEG_BASE64}`;
const prompt =
  'Transform this into a simple pixel art avatar, single color, 32x32 style.';

const body = {
  model: 'gpt-image-1-mini',
  images: [{ image_url: dataUrl }],
  prompt,
  input_fidelity: 'high',
  quality: 'medium',
  output_format: 'png',
  background: 'transparent',
  size: '1024x1024',
  n: 1,
};

console.log('请求 OpenAI POST', url);
console.log('model:', body.model);
console.log('prompt 长度:', prompt.length);
console.log('images[0].image_url 长度:', dataUrl.length);
console.log('');

let res;
try {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  res = await fetch(url, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  clearTimeout(timeout);
} catch (e) {
  if (e?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' || e?.name === 'AbortError') {
    console.error('\n连接 api.openai.com 超时或中断。');
    console.error('本机若无法直连 OpenAI（如在国内），需配置代理/VPN 后再运行此脚本。');
    console.error('Supabase Edge Function 在海外运行，一般可直连 OpenAI，浏览器 400 可能是别的原因。');
  }
  throw e;
}

const text = await res.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  data = { raw: text };
}

console.log('HTTP 状态:', res.status, res.statusText);
console.log('响应 body:', JSON.stringify(data, null, 2));

if (!res.ok) {
  console.error('\n若为 400/401/404，请检查：');
  console.error('- 401: API Key 无效或已撤销');
  console.error('- 400: 请求参数不合法（如 model 名、images 格式）');
  console.error('- 404: 模型不存在或该账号无权限');
  process.exit(1);
}

if (data?.data?.[0]?.b64_json) {
  console.log('\n成功，返回图片 base64 长度:', data.data[0].b64_json.length);
}
process.exit(0);
