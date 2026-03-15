import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Profile Avatar Creation: same look as object upload page — webcam with frame/stars,
 * same Capture and Upload pink buttons. After capture/upload, Back (retake) and Next.
 * Can also be used in edit mode to update existing avatar/username.
 */
export default function AvatarCreatePage({ isEditMode = false }) {
  const navigate = useNavigate();
  const { user, loading, profile } = useAuth();
  const [imageBlob, setImageBlob] = useState(null);
  const [stream, setStream] = useState(null);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  /* Same freeform stars in frame border as object upload page */
  const frameStars = useMemo(() => {
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

  useEffect(() => {
    if (!imageBlob) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(imageBlob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageBlob]);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/', { replace: true });
      return;
    }
    // In edit mode, allow access even if profile exists
    if (!loading && user && profile && !isEditMode) {
      navigate('/main', { replace: true });
      return;
    }
  }, [user, loading, profile, navigate, isEditMode]);

  /* Auto-start webcam when no image (same as object upload page) */
  useEffect(() => {
    if (loading || !user || imageBlob) return;
    let cancelled = false;
    const run = async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (!cancelled) setStream(s);
      } catch (e) {
        if (!cancelled) setError('Could not access camera: ' + (e.message || 'Permission denied'));
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [loading, user, imageBlob]);

  useEffect(() => {
    if (!stream || !videoRef.current) return;
    videoRef.current.srcObject = stream;
    return () => {
      stream.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  const startWebcam = async () => {
    setError('');
    setImageBlob(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      setStream(s);
    } catch (e) {
      setError('Could not access camera: ' + (e.message || 'Permission denied'));
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) setImageBlob(blob);
      },
      'image/jpeg',
      0.9
    );
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setImageBlob(file);
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    setError('');
    e.target.value = '';
  };

  const handleRetake = () => {
    setImageBlob(null);
    startWebcam();
  };

  const handleNext = () => {
    if (!imageBlob) {
      setError('Please capture or upload a photo first');
      return;
    }
    navigate('/avatar/confirm', { state: { imageBlob, isEditMode } });
  };

  if (loading) return <div className="app-loading">Loading...</div>;
  if (!user) return null;

  return (
    <div className="page object-upload-page avatar-create-page">
      {imageBlob ? (
        <button
          type="button"
          className="object-upload-back-btn"
          aria-label="Back to camera"
          onClick={handleRetake}
        >
          <img
            src="/assets/back-button-shape.png?v=3"
            alt=""
            className="object-upload-back-btn-shape"
          />
        </button>
      ) : (
        <button
          type="button"
          className="object-upload-back-btn"
          aria-label="Back"
          onClick={() =>
            navigate(isEditMode ? '/main/profile' : '/', {
              replace: true,
            })
          }
        >
          <img
            src="/assets/back-button-shape.png?v=3"
            alt=""
            className="object-upload-back-btn-shape"
          />
        </button>
      )}
      {error && <p className="object-upload-error">{error}</p>}

      {!stream && !imageBlob && error ? (
        <div className="object-upload-preview">
          <p className="object-upload-error" style={{ marginBottom: '1rem' }}>{error}</p>
          <button type="button" className="object-upload-capture-btn" onClick={startWebcam}>
            Try camera again
          </button>
          <label className="object-upload-upload-btn" style={{ marginLeft: '1rem' }}>
            Upload photo
            <input type="file" accept="image/*" onChange={handleFileUpload} hidden />
          </label>
        </div>
      ) : (stream || imageBlob) ? (
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
            <div className="object-upload-webcam-inner">
              {!imageBlob ? (
                <video ref={videoRef} autoPlay playsInline muted className="object-upload-webcam-video" />
              ) : (
                <img src={previewUrl} alt="Preview" className="object-upload-webcam-preview-img" />
              )}
            </div>
          </div>
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {!imageBlob ? (
            <div className="object-upload-buttons">
              <button type="button" className="object-upload-capture-btn" onClick={capturePhoto}>
                Capture
              </button>
              <label className="object-upload-upload-btn">
                Upload
                <input type="file" accept="image/*" onChange={handleFileUpload} hidden />
              </label>
            </div>
          ) : (
            <div className="object-upload-buttons avatar-create-confirm">
              <button type="button" className="object-upload-capture-btn" onClick={handleRetake}>
                Back
              </button>
              <button type="button" className="object-upload-upload-btn" onClick={handleNext}>
                Next
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
