import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

/**
 * Object upload page: webcam capture or file upload for adding an object to the user's collection.
 * Reached from the add (+) on empty collection cells or swap button on filled cells.
 * If ?swap=N is in URL, the upload will replace the object at position N.
 */
export default function ObjectUploadPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const swapPosition = searchParams.get('swap') ? parseInt(searchParams.get('swap'), 10) : null;
  const { user, loading } = useAuth();
  const [stream, setStream] = useState(null);
  const [imageBlob, setImageBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [removingBg, setRemovingBg] = useState(false);
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const newCategoryInputRef = useRef(null);

  /* Freeform stars in frame border: no overlap, well spaced, larger (stable per mount). */
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
    if (!loading && !user) {
      navigate('/', { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (loading || !user || imageBlob) return;
    let cancelled = false;
    const run = async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
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
    if (!imageBlob) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(imageBlob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageBlob]);

  useEffect(() => {
    if (!stream || !videoRef.current) return;
    videoRef.current.srcObject = stream;
    return () => {
      stream.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  useEffect(() => {
    // Fetch all categories first
    supabase
      .from('categories')
      .select('id, name, slug')
      .order('name')
      .then(async ({ data: allCategories }) => {
        if (!allCategories?.length) return;
        
        // Get count of objects for each category
        const categoriesWithObjects = [];
        for (const cat of allCategories) {
          const { count } = await supabase
            .from('objects')
            .select('*', { count: 'exact', head: true })
            .eq('category_id', cat.id);
          
          if (count && count > 0) {
            categoriesWithObjects.push(cat);
          }
        }
        
        if (categoriesWithObjects.length) {
          setCategories(categoriesWithObjects);
          const other = categoriesWithObjects.find((c) => c.slug === 'other');
          setSelectedCategoryId((prev) => prev || (other ? other.id : categoriesWithObjects[0].id));
        }
      });
  }, []);

  // Focus the new-category input after the native select picker has fully dismissed.
  // autoFocus alone is unreliable on mobile after a <select> interaction.
  useEffect(() => {
    if (selectedCategoryId === '__new__') {
      const t = setTimeout(() => newCategoryInputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [selectedCategoryId]);

  const startWebcam = async () => {
    setError('');
    setImageBlob(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setStream(s);
    } catch (e) {
      setError('Could not access camera: ' + (e.message || 'Permission denied'));
    }
  };

  const stopWebcam = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
  };

  /** Decode base64 string to Blob (e.g. PNG from remove-background). */
  const b64ToBlob = (b64, mime = 'image/png') => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  };

  /**
   * Auto-crop transparent edges from a PNG blob.
   * Detects the bounding box of non-transparent pixels and returns a tightly cropped blob.
   */
  const autoCropTransparentEdges = (blob) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const blobUrl = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(blobUrl);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const { data, width, height } = imageData;

        let minX = width, minY = height, maxX = 0, maxY = 0;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const alpha = data[(y * width + x) * 4 + 3];
            if (alpha > 10) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        if (minX > maxX || minY > maxY) {
          resolve(blob);
          return;
        }

        const cropWidth = maxX - minX + 1;
        const cropHeight = maxY - minY + 1;
        const croppedCanvas = document.createElement('canvas');
        croppedCanvas.width = cropWidth;
        croppedCanvas.height = cropHeight;
        const croppedCtx = croppedCanvas.getContext('2d');
        croppedCtx.drawImage(canvas, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

        croppedCanvas.toBlob((croppedBlob) => {
          resolve(croppedBlob || blob);
        }, 'image/png');
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        reject(new Error('Failed to load image for cropping'));
      };
      img.src = blobUrl;
    });
  };

  /** Resize image to max 1200px on longest side and return as PNG base64 (reduces payload / API limits). */
  const resizeToBase64 = (source) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      let blobUrl = null;
      img.onload = () => {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        const max = 1200;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w <= max && h <= max) {
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          c.getContext('2d').drawImage(img, 0, 0);
          resolve(c.toDataURL('image/png').replace(/^data:image\/\w+;base64,/, ''));
          return;
        }
        if (w > h) {
          h = Math.round((h * max) / w);
          w = max;
        } else {
          w = Math.round((w * max) / h);
          h = max;
        }
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/png').replace(/^data:image\/\w+;base64,/, ''));
      };
      img.onerror = () => {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        reject(new Error('Failed to load image'));
      };
      if (typeof source === 'string') {
        img.src = source;
      } else {
        blobUrl = URL.createObjectURL(source);
        img.src = blobUrl;
      }
    });
  };

  /** Call remove-background Edge Function; returns { blob } or { error }. */
  const removeBackground = async (imageBase64) => {
    const { data, error: fnErr } = await supabase.functions.invoke('remove-background', {
      body: { imageBase64 },
    });
    if (fnErr) {
      let msg = fnErr.message || 'unknown';
      if (fnErr instanceof FunctionsHttpError && fnErr.context) {
        try {
          const body = await fnErr.context.json();
          if (body?.error) msg = body.error;
          else if (body?.message) msg = body.message;
        } catch {
          /* use generic msg */
        }
      }
      return { error: msg };
    }
    const b64 = data?.b64_json;
    if (typeof b64 !== 'string') return { error: 'No image returned' };
    return { blob: b64ToBlob(b64) };
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    stopWebcam();

    setError('');
    setRemovingBg(true);
    const fallbackBlob = () => new Promise((res) => canvas.toBlob(res, 'image/png'));
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const imageBase64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      const resized = await resizeToBase64(dataUrl);
      const result = await removeBackground(resized);
      if (result.error) {
        setError('Background removal failed: ' + result.error);
        setImageBlob(await fallbackBlob());
      } else {
        const cropped = await autoCropTransparentEdges(result.blob);
        setImageBlob(cropped);
      }
    } catch (e) {
      setError('Background removal failed: ' + (e?.message || 'unknown'));
      setImageBlob(await fallbackBlob());
    } finally {
      setRemovingBg(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file?.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    stopWebcam();
    setError('');
    setRemovingBg(true);
    const fallbackBlob = () => Promise.resolve(file);
    try {
      const imageBase64 = await resizeToBase64(file);
      const result = await removeBackground(imageBase64);
      if (result.error) {
        setError('Background removal failed: ' + result.error);
        setImageBlob(await fallbackBlob());
      } else {
        const cropped = await autoCropTransparentEdges(result.blob);
        setImageBlob(cropped);
      }
    } catch (err) {
      setError('Background removal failed: ' + (err?.message || 'unknown'));
      setImageBlob(await fallbackBlob());
    } finally {
      setRemovingBg(false);
    }
  };

  const clearPreview = () => {
    setImageBlob(null);
    setDescription('');
    setNewCategoryName('');
    setSelectedCategoryId(null);
  };

  /**
   * Resolve the category ID to use when saving.
   * If the user typed a new name, look for a case-insensitive match first;
   * reuse it if found, otherwise insert a new row and refresh the list.
   */
  const resolveCategory = async () => {
    if (selectedCategoryId !== '__new__') return selectedCategoryId || null;

    const name = newCategoryName.trim();
    if (!name) return null;

    // Check for existing case-insensitive match
    const { data: existing } = await supabase
      .from('categories')
      .select('id')
      .ilike('name', name)
      .maybeSingle();

    if (existing) {
      // Reuse the existing category and add it to local list if missing
      setCategories((prev) =>
        prev.some((c) => c.id === existing.id) ? prev : [...prev, { id: existing.id, name }],
      );
      return existing.id;
    }

    // Create new category
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const { data: created, error: createErr } = await supabase
      .from('categories')
      .insert({ name, slug })
      .select('id, name, slug')
      .single();

    if (createErr) throw new Error('Failed to create category: ' + createErr.message);

    setCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created.id;
  };

  const is429 = (err) => err?.status === 429 || (err?.message && String(err.message).includes('429'));

  const addToCollection = async () => {
    if (!user || !imageBlob) return;
    setError('');
    setSaving(true);

    // Resolve (or create) the category before uploading
    let categoryId = null;
    try {
      categoryId = await resolveCategory();
    } catch (e) {
      setError(e?.message || 'Failed to create category');
      setSaving(false);
      return;
    }

    const ext = imageBlob.type === 'image/png' ? 'png' : 'jpg';
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('objects')
      .upload(path, imageBlob, { upsert: false });

    if (uploadErr) {
      setError(
        is429(uploadErr)
          ? 'Too many requests (429). Please wait a moment and try again.'
          : 'Upload failed: ' + (uploadErr.message || 'unknown')
      );
      setSaving(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('objects').getPublicUrl(path);
    const imageUrl = urlData.publicUrl;

    const { data: insertedObj, error: insertObjErr } = await supabase
      .from('objects')
      .insert({
        owner_id: user.id,
        image_url: imageUrl,
        description: description?.trim() || null,
        category_id: categoryId,
      })
      .select('id')
      .single();

    if (insertObjErr) {
      setError(
        is429(insertObjErr)
          ? 'Too many requests (429). Please wait and try again.'
          : 'Failed to save object: ' + (insertObjErr.message || 'unknown')
      );
      setSaving(false);
      return;
    }

    let position;
    if (swapPosition && swapPosition >= 1 && swapPosition <= 20) {
      position = swapPosition;
      const { error: updateErr } = await supabase
        .from('user_profile_objects')
        .update({ object_id: insertedObj.id })
        .eq('user_id', user.id)
        .eq('position', position);
      
      if (updateErr) {
        const { error: insertErr } = await supabase.from('user_profile_objects').insert({
          user_id: user.id,
          object_id: insertedObj.id,
          position,
        });
        if (insertErr) {
          setError('Failed to swap object: ' + (insertErr.message || 'unknown'));
          setSaving(false);
          return;
        }
      }
    } else {
      const { data: existing } = await supabase
        .from('user_profile_objects')
        .select('position')
        .eq('user_id', user.id);

      const used = new Set((existing || []).map((r) => r.position));
      position = 1;
      for (; position <= 20; position++) {
        if (!used.has(position)) break;
      }
      if (position > 20) {
        setError('Collection is full (20 items). Remove an item from your profile first.');
        setSaving(false);
        return;
      }

      const { error: linkErr } = await supabase.from('user_profile_objects').insert({
        user_id: user.id,
        object_id: insertedObj.id,
        position,
      });

      if (linkErr) {
        setError('Failed to add to collection: ' + (linkErr.message || 'unknown'));
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    navigate('/main/profile', { replace: true });
  };

  if (loading || !user) return <div className="app-loading">Loading...</div>;

  const handleBackFromPreview = () => {
    clearPreview();
    startWebcam();
  };

  return (
    <div className="page object-upload-page">
      {imageBlob ? (
        <button
          type="button"
          className="object-upload-back-btn"
          aria-label="Back to webcam"
          onClick={handleBackFromPreview}
        >
          <img
            src="/assets/back-button-shape.png?v=3"
            alt=""
            className="object-upload-back-btn-shape"
          />
        </button>
      ) : (
        <button
          onClick={() => navigate(-1)}
          className="object-upload-back-btn"
          aria-label="Back to previous page"
        >
          <img
            src="/assets/back-button-shape.png?v=3"
            alt=""
            className="object-upload-back-btn-shape"
          />
        </button>
      )}
      {error && <p className="object-upload-error">{error}</p>}

      {(stream || imageBlob || removingBg) ? (
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
              {removingBg ? (
                <div className="object-upload-removing-bg">
                  <span>Removing background…</span>
                </div>
              ) : !imageBlob ? (
                <video ref={videoRef} autoPlay playsInline muted className="object-upload-webcam-video" />
              ) : (
                <img src={previewUrl} alt="Preview" className="object-upload-webcam-preview-img" />
              )}
            </div>
          </div>
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {imageBlob && !removingBg && (
            <div className="object-upload-description-wrap">
              {selectedCategoryId === '__new__' ? (
                <div className="object-upload-category-new-row">
                  <input
                    ref={newCategoryInputRef}
                    className="object-upload-category-new-input"
                    type="text"
                    placeholder="Category name…"
                    value={newCategoryName}
                    onChange={(e) => {
                      console.log('Category input onChange:', e.target.value);
                      setNewCategoryName(e.target.value);
                    }}
                    onInput={(e) => console.log('Category input onInput:', e.target.value)}
                    onKeyDown={(e) => console.log('Category input keyDown:', e.key)}
                    maxLength={50}
                    aria-label="New category name"
                  />
                  <button
                    type="button"
                    className="object-upload-category-cancel-btn"
                    onClick={() => {
                      setSelectedCategoryId(categories[0]?.id || null);
                      setNewCategoryName('');
                    }}
                    aria-label="Cancel new category"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <select
                  className="object-upload-category-select"
                  value={selectedCategoryId || ''}
                  onChange={(e) => {
                    setSelectedCategoryId(e.target.value || null);
                  }}
                  aria-label="Category"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name.toLowerCase()}
                    </option>
                  ))}
                  <option value="__new__">+ Create new category…</option>
                </select>
              )}
              <div className="object-upload-description-box-bg">
                <textarea
                  className="object-upload-description-box"
                  placeholder="Add a description…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  aria-label="Description"
                />
                <button
                  type="button"
                  className="object-upload-save-btn"
                  onClick={addToCollection}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}
          {!imageBlob && !removingBg ? (
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
            <div className="object-upload-confirm-actions">
              <button type="button" onClick={clearPreview} disabled={saving} aria-label="Choose another" />
              <button type="button" className="object-upload-add-btn" onClick={addToCollection} disabled={saving} aria-label={saving ? 'Adding…' : 'Add to collection'} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
