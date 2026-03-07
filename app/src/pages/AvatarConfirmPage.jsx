import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

/* Same frame stars as avatar create / object upload */
function useFrameStars() {
  return useMemo(() => {
    const seed = 0.912;
    const rnd = (n) => {
      const x = Math.sin(n * 12.9898 + seed * 43758.5453) * 43758.5453;
      return x - Math.floor(x);
    };
    const dist = (a, b) => Math.sqrt((a.left - b.left) ** 2 + (a.top - b.top) ** 2);
    const MIN_DIST_PCT = 14;
    const stars = [];
    const topBand = { leftMin: 6, leftMax: 94, topMin: 0, topMax: 9.5 };
    const rightBand = { leftMin: 90.5, leftMax: 100, topMin: 6, topMax: 94 };
    const bottomBand = { leftMin: 6, leftMax: 94, topMin: 90.5, topMax: 100 };
    const leftBand = { leftMin: 0, leftMax: 9.5, topMin: 6, topMax: 94 };
    const bands = [topBand, rightBand, bottomBand, leftBand];
    const targetCount = 44;
    const maxTries = 100;
    for (let i = 0; i < targetCount; i++) {
      let placed = false;
      for (let t = 0; t < maxTries && !placed; t++) {
        const band = bands[Math.floor(rnd(i * 5 + t * 2) * 4)];
        const left = band.leftMin + rnd(i * 7 + t * 3 + 1) * (band.leftMax - band.leftMin);
        const top = band.topMin + rnd(i * 11 + t * 4 + 2) * (band.topMax - band.topMin);
        const candidate = { left, top };
        const tooClose = stars.some((s) => dist(candidate, s) < MIN_DIST_PCT);
        if (!tooClose) {
          const rotation = (rnd(i * 13 + 3) - 0.5) * 72;
          const size = rnd(i * 17) > 0.35 ? 'l' : 'm';
          stars.push({ ...candidate, rotation, size });
          placed = true;
        }
      }
    }
    return stars;
  }, []);
}

const MAX_SIZE = 1024;
const JPEG_QUALITY = 0.85;

function resizeImageBlob(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width <= MAX_SIZE && height <= MAX_SIZE) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((b) => resolve(b || blob), 'image/jpeg', JPEG_QUALITY);
        return;
      }
      if (width > height) {
        height = Math.round((height * MAX_SIZE) / width);
        width = MAX_SIZE;
      } else {
        width = Math.round((width * MAX_SIZE) / height);
        height = MAX_SIZE;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((b) => resolve(b || blob), 'image/jpeg', JPEG_QUALITY);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      const base64 = typeof dataUrl === 'string' && dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      resolve(base64 || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function b64ToBlob(b64, mime = 'image/png') {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export default function AvatarConfirmPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, profile, refreshProfile } = useAuth();
  const imageBlob = location.state?.imageBlob;
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedB64, setGeneratedB64] = useState(null);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState('');

  useEffect(() => {
    if (!imageBlob) return;
    const url = URL.createObjectURL(imageBlob);
    setOriginalPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageBlob]);

  const previewUrl = generatedB64 ? `data:image/png;base64,${generatedB64}` : originalPreviewUrl;
  const frameStars = useFrameStars();

  const generateAvatar = useCallback(async () => {
    if (!imageBlob) return;
    setError('');
    setGenerating(true);
    try {
      const resizedBlob = await resizeImageBlob(imageBlob);
      const imageBase64 = await blobToBase64(resizedBlob);
      if (!imageBase64) {
        setError('生成头像失败: 无法读取图片');
        setGenerating(false);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error: fnErr } = await supabase.functions.invoke('generate-avatar', {
        body: { imageBase64 },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });
      if (fnErr) {
        const detail = data?.error || fnErr.message || '请稍后重试';
        setError('生成头像失败: ' + detail);
        setGenerating(false);
        return;
      }
      if (data?.error) {
        setError('生成头像失败: ' + (data.error || '请稍后重试'));
        setGenerating(false);
        return;
      }
      if (data?.b64_json) {
        setGeneratedB64(data.b64_json);
      }
    } catch (e) {
      setError('生成头像失败: ' + (e?.message || '请稍后重试'));
    }
    setGenerating(false);
  }, [imageBlob]);

  const didRequestGenerateRef = useRef(false);
  useEffect(() => {
    if (imageBlob) didRequestGenerateRef.current = false;
  }, [imageBlob]);
  useEffect(() => {
    if (!imageBlob || didRequestGenerateRef.current) return;
    didRequestGenerateRef.current = true;
    generateAvatar();
  }, [imageBlob, generateAvatar]);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/', { replace: true });
      return;
    }
    if (!loading && user && profile) {
      navigate('/main', { replace: true });
      return;
    }
  }, [user, loading, profile, navigate]);

  useEffect(() => {
    if (!imageBlob && !loading && user) {
      navigate('/avatar/create', { replace: true });
    }
  }, [imageBlob, loading, user, navigate]);

  const handleBack = () => {
    navigate('/avatar/create', { state: { imageBlob } });
  };

  const is429 = (err) => {
    const msg = err?.message || '';
    return err?.status === 429 || /429|rate limit|too many|email rate limit/i.test(msg);
  };

  const handleNext = async () => {
    const name = username.trim();
    if (!name) {
      setError('Please enter a username');
      return;
    }
    if (!user || !imageBlob) return;
    setError('');
    setSaving(true);

    const avatarToUpload = generatedB64 ? b64ToBlob(generatedB64, 'image/png') : imageBlob;
    const ext = generatedB64 ? 'png' : (imageBlob.type === 'image/png' ? 'png' : 'jpg');
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, avatarToUpload, { upsert: true });

    if (uploadErr) {
      setError(
        is429(uploadErr)
          ? '请求过于频繁(429)，请稍等 30 秒～1 分钟再试。'
          : '上传失败: ' + (uploadErr.message || 'unknown')
      );
      setSaving(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    const avatarUrl = urlData.publicUrl;

    const { data: insertedRow, error: insertErr } = await supabase
      .from('users_ext')
      .upsert(
        [
          {
            id: user.id,
            username: name,
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: 'id' }
      )
      .select();

    if (insertErr) {
      const msg = insertErr.message || '';
      if (is429(insertErr)) {
        setError('请求过于频繁(429)，请稍等 30 秒～1 分钟再试。');
      } else if (/duplicate key|unique.*username|username.*unique/i.test(msg)) {
        setError('该用户名已被使用，请换一个。');
      } else if (/row-level security|RLS|policy/i.test(msg)) {
        setError('无写入权限，请确认已登录且 RLS 策略允许写入。');
      } else {
        setError('保存失败: ' + (msg || insertErr.code || 'unknown'));
      }
      setSaving(false);
      return;
    }
    if (!insertedRow || insertedRow.length === 0) {
      setError('保存失败: 未返回写入结果');
      setSaving(false);
      return;
    }

    await refreshProfile();
    setSaving(false);
    navigate('/main', { replace: true });
  };

  if (loading) return <div className="app-loading">Loading...</div>;
  if (!user) return null;
  if (!imageBlob) return null;

  return (
    <div className="page object-upload-page avatar-confirm-page">
      <Link
        to="/avatar/create"
        state={{ imageBlob }}
        className="object-upload-back-btn"
        aria-label="Back to camera"
      >
        <img
          src="/assets/back-button-shape.png?v=3"
          alt=""
          className="object-upload-back-btn-shape"
        />
      </Link>

      {error && <p className="object-upload-error">{error}</p>}

      <div className="object-upload-preview">
        <div className="object-upload-webcam-wrap">
          <div className="object-upload-webcam-stars" aria-hidden>
            {frameStars.map((s, i) => (
              <div
                key={i}
                className="object-upload-webcam-star"
                style={{
                  left: `${s.left}%`,
                  top: `${s.top}%`,
                  width: s.size === 'l' ? 40 : 28,
                  height: s.size === 'l' ? 40 : 28,
                  transform: `translate(-50%, -50%) rotate(${s.rotation}deg)`,
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2l2.2 6.8h7.2l-5.8 4.2 2.2 6.8-5.8-4.2-5.8 4.2 2.2-6.8-5.8-4.2h7.2z" />
                </svg>
              </div>
            ))}
          </div>
          <div className="object-upload-webcam-inner avatar-confirm-frame-inner">
            {previewUrl ? (
              <img src={previewUrl} alt="Avatar" className="object-upload-webcam-preview-img" />
            ) : (
              <div className="avatar-placeholder">Loading...</div>
            )}
            {generating && (
              <div className="object-upload-removing-bg">
                <span>Generating avatar…</span>
              </div>
            )}
          </div>
        </div>

        <div className="avatar-confirm-username-wrap">
          <div className="avatar-confirm-username-box">
            <input
              type="text"
              className="avatar-confirm-username-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              maxLength={50}
              aria-label="Username"
            />
          </div>
        </div>

        <div className="object-upload-buttons">
          <button
            type="button"
            className="object-upload-capture-btn"
            onClick={generateAvatar}
            disabled={generating || saving}
          >
            {generating ? 'Generating…' : 'Regenerate'}
          </button>
          <button
            type="button"
            className="object-upload-upload-btn"
            onClick={handleNext}
            disabled={!username.trim() || saving || generating}
          >
            {saving ? 'Saving…' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
