/**
 * 本地测试注册接口（是否 429 / 400）
 * 在 app 目录下执行: node scripts/test-signup.mjs [邮箱] [密码]
 * 示例: node scripts/test-signup.mjs mytest@example.com mypass123
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');

function loadEnv() {
  try {
    const content = readFileSync(envPath, 'utf8');
    const env = {};
    content.split('\n').forEach((line) => {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim();
    });
    return env;
  } catch (e) {
    console.error('请先在 app 目录下配置 .env（参考 .env.example）');
    process.exit(1);
  }
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('.env 中需要 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const email = process.argv[2] || `tocollect-test-${Date.now()}@test.local`;
const password = process.argv[3] || 'test123456';

console.log('Supabase URL:', url);
console.log('注册邮箱:', email);
console.log('请求中...\n');

const supabase = createClient(url, key);
const { data, error } = await supabase.auth.signUp({ email, password });

if (error) {
  console.log('结果: 失败');
  console.log('status:', error.status);
  console.log('message:', error.message);
  if (error.status === 429 || /429|too many|rate/i.test(error.message || '')) {
    console.log('\n→ 触发了限流(429)，请稍等 30 秒～1 分钟再试');
  }
  process.exit(1);
}

console.log('结果: 成功');
console.log('user id:', data.user?.id);
console.log('（若开启了邮箱确认，需在邮箱中确认后登录）');
process.exit(0);
