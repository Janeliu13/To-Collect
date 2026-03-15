import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

/** Sentinel UUID for an empty feeling slot (PostgreSQL uuid[] cannot store null). */
const EMPTY_FEELING_SLOT = '00000000-0000-0000-0000-000000000000';

/**
 * My Profile Page — standalone full page.
 * Reached only by clicking the pink "my profile" button on the main page.
 * Four feeling squares show user-uploaded objects; user drags from the bottom 20 grid into them.
 */
export default function MyProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const [profileObjects, setProfileObjects] = useState([]);
  const [reposts, setReposts] = useState([]);
  const [feelingSlots, setFeelingSlots] = useState([null, null, null, null]);
  const [loading, setLoading] = useState(true);
  const [savingFeeling, setSavingFeeling] = useState(false);

  const today = useCallback(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }, []);

  const loadProfileObjects = useCallback(async (uid) => {
    if (!uid) return [];
    const { data: rows } = await supabase
      .from('user_profile_objects')
      .select('object_id, position')
      .eq('user_id', uid)
      .order('position', { ascending: true });
    const positionToId = Object.fromEntries(
      (rows || []).map((r) => [r.position, r.object_id]).filter(([, id]) => id)
    );
    const ids = Object.values(positionToId);
    if (ids.length === 0) {
      return Array.from({ length: 20 }, () => null);
    }
    const { data: objs } = await supabase
      .from('objects')
      .select('id, image_url')
      .in('id', ids);
    const byId = Object.fromEntries((objs || []).map((o) => [o.id, o.image_url]));
    const ordered = Array.from({ length: 20 }, (_, i) => {
      const id = positionToId[i + 1];
      return id && byId[id] ? { objectId: id, imageUrl: byId[id] } : null;
    });
    return ordered;
  }, []);

  const loadFeelingSlots = useCallback(async (uid) => {
    if (!uid) return [null, null, null, null];
    const { data: row } = await supabase
      .from('blog_posts')
      .select('object_ids')
      .eq('user_id', uid)
      .eq('date', today())
      .maybeSingle();
    const ids = (row?.object_ids || []).slice(0, 4);
    const slotIds = [
      ids[0] && ids[0] !== EMPTY_FEELING_SLOT ? ids[0] : null,
      ids[1] && ids[1] !== EMPTY_FEELING_SLOT ? ids[1] : null,
      ids[2] && ids[2] !== EMPTY_FEELING_SLOT ? ids[2] : null,
      ids[3] && ids[3] !== EMPTY_FEELING_SLOT ? ids[3] : null,
    ];
    const nonNull = slotIds.filter(Boolean);
    if (nonNull.length === 0) return [null, null, null, null];
    const { data: objs } = await supabase
      .from('objects')
      .select('id, image_url')
      .in('id', nonNull);
    const byId = Object.fromEntries((objs || []).map((o) => [o.id, o.image_url]));
    return slotIds.map((id) =>
      id && byId[id] ? { objectId: id, imageUrl: byId[id] } : null
    );
  }, [today]);

  const loadReposts = useCallback(async (uid) => {
    if (!uid) return [];
    const { data: rows } = await supabase
      .from('reposts')
      .select('object_id, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    const ids = (rows || []).map((r) => r.object_id);
    if (ids.length === 0) return [];
    const { data: objs } = await supabase
      .from('objects')
      .select('id, image_url')
      .in('id', ids);
    const byId = Object.fromEntries((objs || []).map((o) => [o.id, o.image_url]));
    return ids.map((id) => (byId[id] ? { objectId: id, imageUrl: byId[id] } : null)).filter(Boolean);
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setProfileObjects([]);
      setFeelingSlots([null, null, null, null]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      loadProfileObjects(user.id),
      loadFeelingSlots(user.id),
      loadReposts(user.id),
    ]).then(([profileList, feeling, repostList]) => {
      setProfileObjects(profileList);
      setFeelingSlots(feeling);
      setReposts(repostList);
      setLoading(false);
    });
  }, [user?.id, loadProfileObjects, loadFeelingSlots, loadReposts]);

  const saveFeelingSlots = useCallback(
    async (slots) => {
      if (!user?.id) return;
      setSavingFeeling(true);
      const objectIds = slots.map((s) =>
        s?.objectId ?? EMPTY_FEELING_SLOT
      );
      const { error } = await supabase.from('blog_posts').upsert(
        {
          user_id: user.id,
          date: today(),
          object_ids: objectIds,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,date' }
      );
      if (!error) setFeelingSlots(slots);
      setSavingFeeling(false);
    },
    [user?.id, today]
  );

  const handleFeelingDrop = useCallback(
    (slotIndex, objectId, imageUrl) => {
      const next = [...feelingSlots];
      next[slotIndex] = { objectId, imageUrl };
      setFeelingSlots(next);
      saveFeelingSlots(next);
    },
    [feelingSlots, saveFeelingSlots]
  );

  const handleFeelingNew = useCallback(() => {
    const empty = [null, null, null, null];
    setFeelingSlots(empty);
    saveFeelingSlots(empty);
  }, [saveFeelingSlots]);

  const handleDragStart = (e, item) => {
    if (!item?.objectId) return;
    e.dataTransfer.setData('application/json', JSON.stringify(item));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e, slotIndex) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      const item = JSON.parse(raw);
      if (item?.objectId && item?.imageUrl) {
        handleFeelingDrop(slotIndex, item.objectId, item.imageUrl);
      }
    } catch (_) {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="my-profile-page-full">
        <div className="app-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="my-profile-page-full">
      <button
        onClick={() => {
          if (location.state?.fromAvatarEdit) {
            navigate('/main', { replace: true });
          } else {
            navigate(-1);
          }
        }}
        className="my-profile-back-btn"
        aria-label="Back to previous page"
      >
        <img
          src="/assets/back-button-shape.png?v=3"
          alt=""
          className="my-profile-back-btn-shape"
        />
      </button>
      <aside className="my-profile-rect-float" aria-hidden />
      <div className="my-profile-left-box-content">
        <div className="my-profile-left-box-username" aria-label="Username">
          <span className="my-profile-left-box-username-text">{profile?.username || 'username'}</span>
        </div>
        <div className="my-profile-avatar" aria-hidden>
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="my-profile-avatar-img" />
          ) : (
            <span className="my-profile-avatar-placeholder">Avatar</span>
          )}
        </div>
        <button
          type="button"
          className="my-profile-edit-link"
          onClick={() => navigate('/avatar-edit', { replace: true })}
        >
          edit
        </button>
      </div>
      <aside className="my-profile-rect-float-2" aria-hidden />
      {/* Blog label box: protrudes from left of yellow frame; W 1246, H 229, X 1981, Y 1651 */}
      <div className="my-profile-blog-box" aria-label="Blog">
        <span className="my-profile-blog-box-text">blog</span>
      </div>
      <div className="my-profile-center-inner-rect" aria-label="Feeling">
        <span className="my-profile-feeling-label">Feeling:</span>
        <div className="my-profile-feeling-squares">
          {feelingSlots.map((slot, i) => (
            <div
              key={i}
              className="my-profile-feeling-square my-profile-feeling-square-droppable"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, i)}
            >
              {slot?.imageUrl ? (
                <img src={slot.imageUrl} alt="" className="my-profile-feeling-square-img" />
              ) : null}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="my-profile-feeling-new-btn"
          onClick={handleFeelingNew}
          disabled={savingFeeling}
        >
          new
        </button>
      </div>
      <aside className="my-profile-rect-float-4" aria-hidden />
      <div className="my-profile-reposts-grid" aria-label="Reposts">
        {reposts.map((item, i) => (
          <div
            key={item.objectId}
            className="my-profile-reposts-grid-cell"
            draggable={true}
            onDragStart={(e) => handleDragStart(e, item)}
          >
            <Link
              to={`/main/object/${item.objectId}`}
              className="my-profile-reposts-grid-cell-link"
              draggable={false}
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={item.imageUrl}
                alt=""
                className="my-profile-reposts-grid-cell-img"
                draggable={false}
              />
            </Link>
          </div>
        ))}
      </div>
      {/* Reposts label box: bottom right of top right box; W 1259, H 255, X 6258, Y 2890; box #F5A4C6, text #FFFFDC */}
      <div className="my-profile-reposts-label-box" aria-label="Reposts label">
        <span className="my-profile-reposts-label-box-text">reposts</span>
      </div>
      <aside className="my-profile-rect-float-5" aria-hidden />
      {/* Collection label box: top right of bottom purple rectangle; same size as blog (W 750, H 180); box #F5A4C6, text #FFFFDC */}
      <div className="my-profile-collection-label-box" aria-label="Collection">
        <span className="my-profile-collection-label-box-text">collection</span>
      </div>
      <div className="my-profile-bottom-grid my-profile-bottom-grid-draggable" aria-label="User object gallery">
        {Array.from({ length: 20 }, (_, i) => {
          const item = profileObjects[i] ?? null;
          const position = i + 1;
          return (
            <div
              key={i}
              className="my-profile-bottom-grid-cell"
              draggable={!!item}
              onDragStart={(e) => handleDragStart(e, item)}
            >
              {item?.imageUrl ? (
                <>
                  <Link
                    to={`/main/object/${item.objectId}`}
                    className="my-profile-bottom-grid-cell-link"
                    draggable={false}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="my-profile-bottom-grid-cell-img"
                      draggable={false}
                    />
                  </Link>
                  <Link
                    to={`/main/profile/upload?swap=${position}`}
                    className="my-profile-swap-btn"
                    aria-label="Swap object"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <img
                      src="/assets/swap.png"
                      alt="Swap"
                      className="my-profile-swap-icon"
                    />
                  </Link>
                </>
              ) : (
                <Link
                  to="/main/profile/upload"
                  className="my-profile-bottom-grid-cell-add"
                  aria-label="Add object"
                >
                  <span className="my-profile-bottom-grid-cell-add-icon">+</span>
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
