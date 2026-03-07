import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

/**
 * Object view page: full-screen layout with object name and description.
 * Reached when clicking any blue square in the main gallery or profile collection.
 * "object name" is a placeholder when no object is loaded; when viewing an uploaded
 * object, the name the user gave it (or description) is shown here.
 */
export default function ObjectDetailPage() {
  const { objectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [object, setObject] = useState(null);
  const [ownerUsername, setOwnerUsername] = useState('');
  const [reposting, setReposting] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [repostError, setRepostError] = useState('');

  useEffect(() => {
    if (!objectId || objectId === 'empty') {
      setObject(null);
      setOwnerUsername('');
      return;
    }
    supabase
      .from('objects')
      .select('id, image_url, description, owner_id')
      .eq('id', objectId)
      .maybeSingle()
      .then(({ data }) => {
        setObject(data ?? null);
        if (data?.owner_id) {
          supabase
            .from('users_ext')
            .select('username')
            .eq('id', data.owner_id)
            .maybeSingle()
            .then(({ data: userData }) => setOwnerUsername(userData?.username || ''));
        } else {
          setOwnerUsername('');
        }
      });
  }, [objectId]);

  useEffect(() => {
    if (!user?.id || !objectId || objectId === 'empty') {
      setReposted(false);
      return;
    }
    supabase
      .from('reposts')
      .select('id')
      .eq('user_id', user.id)
      .eq('object_id', objectId)
      .maybeSingle()
      .then(({ data }) => setReposted(!!data));
  }, [user?.id, objectId]);

  const handleRepost = async () => {
    if (!user?.id || !object?.id || reposting) return;
    if (object.owner_id === user.id) {
      setRepostError('Cannot repost your own object');
      return;
    }
    setReposting(true);
    setRepostError('');

    const { error } = await supabase
      .from('reposts')
      .insert({ user_id: user.id, object_id: object.id });

    if (error) {
      if (error.code === '23505') {
        setReposted(true);
        setRepostError('');
      } else {
        setRepostError('Failed to repost: ' + (error.message || 'unknown'));
      }
    } else {
      setReposted(true);
    }
    setReposting(false);
  };

  // Placeholder until object is loaded or has no name; use description for now. When you add a `name` column to objects, select it and use object?.name here.
  const displayName = object?.description ?? 'object name';

  const isOwnObject = object?.owner_id === user?.id;

  return (
    <div className="object-detail-page">
      <div className="object-view-rect" aria-hidden>
        <div className="object-view-inner-box" aria-hidden>
          {object?.image_url && (
            <img
              src={object.image_url}
              alt={displayName}
              className="object-view-inner-box-img"
            />
          )}
        </div>
      </div>
      {object && user && !isOwnObject && (
        <>
          <button
            type="button"
            className="object-view-repost-btn"
            onClick={handleRepost}
            disabled={reposting || reposted}
            aria-label={reposted ? 'Already reposted' : 'Repost'}
          >
            <img
              src="/assets/repost-icon.png"
              alt=""
              className="object-view-repost-icon"
            />
          </button>
          <button
            type="button"
            className="object-view-chat-btn"
            onClick={() => navigate(`/main/chat/${object.owner_id}`, { 
              state: { 
                objectImage: object.image_url,
                objectId: object.id
              } 
            })}
            aria-label="Chat with owner"
          >
            chat
          </button>
        </>
      )}
      {repostError && <p className="object-view-repost-error">{repostError}</p>}
      <div className="object-view-rect-bottom" aria-hidden>
        <p className="object-view-description-text">
          {object?.description || 'No description'}
        </p>
        {ownerUsername && object?.owner_id && (
          <span className="object-view-from-text">
            from{' '}
            <Link 
              to={user?.id === object.owner_id ? '/main/profile' : `/main/user/${object.owner_id}`}
              className="object-view-from-username-link"
            >
              {ownerUsername}
            </Link>
          </span>
        )}
      </div>
      <div className="object-view-rect-bottom-left" aria-hidden>
        <span className="object-view-rect-bottom-left-text">description</span>
      </div>
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
    </div>
  );
}
