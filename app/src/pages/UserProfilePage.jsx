import { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/** Sentinel UUID for an empty feeling slot. */
const EMPTY_FEELING_SLOT = '00000000-0000-0000-0000-000000000000';

/**
 * User Profile Page: view another user's profile (read-only).
 * Shows their avatar, username, collection (20 items), blog (4 feeling squares), and reposts.
 * Same layout as MyProfilePage but without edit/drag capabilities.
 */
export default function UserProfilePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [profileObjects, setProfileObjects] = useState([]);
  const [reposts, setReposts] = useState([]);
  const [feelingSlots, setFeelingSlots] = useState([null, null, null, null]);
  const [loading, setLoading] = useState(true);

  const today = useCallback(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }, []);

  const loadProfile = useCallback(async (uid) => {
    if (!uid) return null;
    const { data } = await supabase
      .from('users_ext')
      .select('id, username, avatar_url')
      .eq('id', uid)
      .maybeSingle();
    return data ?? null;
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
    if (ids.length === 0) return Array.from({ length: 20 }, () => null);
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
    if (!userId) {
      setProfile(null);
      setProfileObjects([]);
      setReposts([]);
      setFeelingSlots([null, null, null, null]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      loadProfile(userId),
      loadProfileObjects(userId),
      loadFeelingSlots(userId),
      loadReposts(userId),
    ]).then(([prof, profileList, feeling, repostList]) => {
      setProfile(prof);
      setProfileObjects(profileList);
      setFeelingSlots(feeling);
      setReposts(repostList);
      setLoading(false);
    });
  }, [userId, loadProfile, loadProfileObjects, loadFeelingSlots, loadReposts]);

  if (loading) {
    return (
      <div className="my-profile-page-full">
        <div className="app-loading">Loading...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="my-profile-page-full">
        <button
          onClick={() => navigate(-1)}
          className="my-profile-back-btn"
          aria-label="Back to previous page"
        >
          <img
            src="/assets/back-button-shape.png?v=3"
            alt=""
            className="my-profile-back-btn-shape"
          />
        </button>
        <p style={{ color: '#fff', textAlign: 'center', marginTop: '4rem' }}>User not found</p>
      </div>
    );
  }

  return (
    <div className="my-profile-page-full">
      <button
        onClick={() => navigate(-1)}
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
          <span className="my-profile-left-box-username-text">{profile.username}</span>
        </div>
        <div className="my-profile-avatar" aria-hidden>
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="my-profile-avatar-img" />
          ) : (
            <span className="my-profile-avatar-placeholder">avatar</span>
          )}
        </div>
      </div>
      <aside className="my-profile-rect-float-2" aria-hidden />
      <div className="my-profile-blog-box" aria-label="Blog">
        <span className="my-profile-blog-box-text">blog</span>
      </div>
      <div className="my-profile-center-inner-rect" aria-hidden>
        <span className="my-profile-feeling-label">Feeling:</span>
        <div className="my-profile-feeling-squares">
          {feelingSlots.map((slot, i) => (
            <div key={i} className="my-profile-feeling-square">
              {slot?.imageUrl ? (
                <Link to={`/main/object/${slot.objectId}`} className="my-profile-feeling-square-link">
                  <img src={slot.imageUrl} alt="" className="my-profile-feeling-square-img" />
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <aside className="my-profile-rect-float-4" aria-hidden />
      <div className="my-profile-reposts-grid" aria-label="Reposts">
        {reposts.map((item) => (
          <div key={item.objectId} className="my-profile-reposts-grid-cell">
            <Link
              to={`/main/object/${item.objectId}`}
              className="my-profile-reposts-grid-cell-link"
            >
              <img
                src={item.imageUrl}
                alt=""
                className="my-profile-reposts-grid-cell-img"
              />
            </Link>
          </div>
        ))}
      </div>
      <div className="my-profile-reposts-label-box" aria-label="Reposts label">
        <span className="my-profile-reposts-label-box-text">reposts</span>
      </div>
      <aside className="my-profile-rect-float-5" aria-hidden />
      <div className="my-profile-collection-label-box" aria-label="Collection">
        <span className="my-profile-collection-label-box-text">collection</span>
      </div>
      <div className="my-profile-bottom-grid" aria-label="User object gallery">
        {Array.from({ length: 20 }, (_, i) => {
          const item = profileObjects[i] ?? null;
          return (
            <div key={i} className="my-profile-bottom-grid-cell">
              {item?.imageUrl ? (
                <Link
                  to={`/main/object/${item.objectId}`}
                  className="my-profile-bottom-grid-cell-link"
                >
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="my-profile-bottom-grid-cell-img"
                  />
                </Link>
              ) : (
                <div className="my-profile-bottom-grid-cell-empty" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
