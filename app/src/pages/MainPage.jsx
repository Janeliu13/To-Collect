import { useState, useEffect } from 'react';
import { Outlet, NavLink, Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function MainPage() {
  const { profile, signOut, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isProfilePage = location.pathname === '/main/profile';
  const isUserGallery = location.pathname === '/main/users';
  const isAboutPage = location.pathname === '/main/about';
  const [categories, setCategories] = useState([]);
  const [galleryObjects, setGalleryObjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [hoveredCategory, setHoveredCategory] = useState(null);
  const [recentMessages, setRecentMessages] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const selectedCategorySlug = searchParams.get('category');
  const ITEMS_PER_PAGE = 40;

  useEffect(() => {
    // Fetch all categories first
    supabase
      .from('categories')
      .select('id, name, slug')
      .order('name')
      .then(async ({ data: allCategories, error }) => {
        if (error || !allCategories) return;
        
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
        
        setCategories(categoriesWithObjects);
      });
  }, []);

  // Initial load of gallery objects
  useEffect(() => {
    if (location.pathname !== '/main/gallery') {
      setGalleryObjects([]);
      setHasMore(true);
      return;
    }
    
    const loadInitialObjects = async () => {
      let query = supabase
        .from('objects')
        .select('id, image_url, created_at')
        .order('created_at', { ascending: false });
      
      if (selectedCategorySlug && categories.length) {
        const cat = categories.find((c) => c.slug === selectedCategorySlug);
        if (cat) query = query.eq('category_id', cat.id);
      }
      
      query = query.range(0, ITEMS_PER_PAGE - 1);
      
      const { data, error } = await query;
      
      if (!error && data) {
        setGalleryObjects(data);
        setHasMore(data.length === ITEMS_PER_PAGE);
      } else {
        setGalleryObjects([]);
        setHasMore(false);
      }
    };
    
    loadInitialObjects();
  }, [location.pathname, selectedCategorySlug, categories]);

  // Load more objects when scrolling
  const loadMoreObjects = async () => {
    if (loadingMore || !hasMore || location.pathname !== '/main/gallery') return;
    
    setLoadingMore(true);
    
    const currentLength = galleryObjects.length;
    
    let query = supabase
      .from('objects')
      .select('id, image_url, created_at')
      .order('created_at', { ascending: false });
    
    if (selectedCategorySlug && categories.length) {
      const cat = categories.find((c) => c.slug === selectedCategorySlug);
      if (cat) query = query.eq('category_id', cat.id);
    }
    
    query = query.range(currentLength, currentLength + ITEMS_PER_PAGE - 1);
    
    const { data, error } = await query;
    
    if (!error && data && data.length > 0) {
      // Filter out duplicates by ID (should not happen, but just in case)
      setGalleryObjects(prev => {
        const existingIds = new Set(prev.map(obj => obj.id));
        const newObjects = data.filter(obj => !existingIds.has(obj.id));
        return [...prev, ...newObjects];
      });
      setHasMore(data.length === ITEMS_PER_PAGE);
    } else {
      setHasMore(false);
    }
    
    setLoadingMore(false);
  };

  useEffect(() => {
    if (location.pathname !== '/main/users') {
      setUsers([]);
      return;
    }
    supabase
      .from('users_ext')
      .select('id, username, avatar_url')
      .order('created_at', { ascending: false })
      .limit(40)
      .then(({ data, error }) => {
        if (!error && data) setUsers(data);
        else setUsers([]);
      });
  }, [location.pathname]);

  // Handle scroll event for infinite loading
  useEffect(() => {
    if (location.pathname !== '/main/gallery') return;

    const handleScroll = (e) => {
      const container = e.target;
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      
      // Load more when user scrolls near the bottom (within 200px)
      if (scrollHeight - scrollTop - clientHeight < 200 && hasMore && !loadingMore) {
        loadMoreObjects();
      }
    };

    const galleryGrid = document.querySelector('.main-page-gallery-grid');
    const outletContainer = document.querySelector('.main-page-outlet');
    
    if (outletContainer) {
      outletContainer.addEventListener('scroll', handleScroll);
      return () => {
        outletContainer.removeEventListener('scroll', handleScroll);
      };
    }
  }, [location.pathname, hasMore, loadingMore, galleryObjects.length, selectedCategorySlug, categories]);

  // Load recent unread messages - show 3 most recent conversations
  useEffect(() => {
    if (!user?.id) return;
    
    const loadRecentMessages = async () => {
      // First get all unread messages
      const { data: messages, error } = await supabase
        .from('messages')
        .select('id, sender_id, message_text, message_type, image_url, created_at')
        .eq('receiver_id', user.id)
        .eq('read', false)
        .order('created_at', { ascending: false });
      
      if (error || !messages || messages.length === 0) {
        setRecentMessages([]);
        return;
      }
      
      // Group messages by sender and count unread messages per sender
      const messageBySender = new Map();
      const unreadCountBySender = new Map();
      
      messages.forEach(msg => {
        // Store the most recent message from each sender
        if (!messageBySender.has(msg.sender_id)) {
          messageBySender.set(msg.sender_id, msg);
        }
        // Count unread messages from each sender
        unreadCountBySender.set(
          msg.sender_id, 
          (unreadCountBySender.get(msg.sender_id) || 0) + 1
        );
      });
      
      // Get only the 3 most recent conversations
      const recentConversations = Array.from(messageBySender.values()).slice(0, 3);
      
      // Get sender info
      const senderIds = recentConversations.map(m => m.sender_id);
      const { data: senders } = await supabase
        .from('users_ext')
        .select('id, username, avatar_url')
        .in('id', senderIds);
      
      const senderMap = Object.fromEntries(
        (senders || []).map(s => [s.id, s])
      );
      
      const formattedMessages = recentConversations.map(msg => ({
        id: msg.id,
        senderId: msg.sender_id,
        senderUsername: senderMap[msg.sender_id]?.username || 'Unknown',
        senderAvatar: senderMap[msg.sender_id]?.avatar_url,
        text: msg.message_text,
        type: msg.message_type,
        imageUrl: msg.image_url,
        createdAt: msg.created_at,
        unreadCount: unreadCountBySender.get(msg.sender_id) || 0
      }));
      
      setRecentMessages(formattedMessages);
    };
    
    loadRecentMessages();
    
    // Subscribe to new messages
    const channel = supabase
      .channel('main-messages-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${user.id}`
        },
        () => {
          loadRecentMessages();
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return (
    <div className="main-page-figma">
      <div className="main-page-corner-btns">
        <button
          type="button"
          className={'main-page-corner-btn' + (isAboutPage ? ' main-page-corner-btn-active' : '')}
          onClick={() => !isAboutPage && navigate('/main/about')}
          aria-label="About"
          disabled={isAboutPage}
        >
          About
        </button>
        <button
          type="button"
          className="main-page-corner-btn"
          onClick={() => {
            signOut();
            navigate('/', { replace: true });
          }}
          aria-label="Log out"
        >
          Log out
        </button>
      </div>
      {isAboutPage ? (
        <div className="main-page-about-outlet">
          <Outlet />
        </div>
      ) : (
      <div className="main-page-body">
        <div className="main-page-rect-top" aria-label="Objects A–Z">
          <span className="main-page-rect-top-text">objects A - Z</span>
        </div>
        <aside className="main-page-left-az" aria-hidden />
        <aside className="main-page-categories-bg-box" aria-hidden />
        {!isUserGallery && (
          <nav className="main-page-object-labels-list" aria-label="Object categories">
            <NavLink
              to="/main/gallery"
              className={'main-page-object-label-link' + (!selectedCategorySlug ? ' active' : '')}
              onMouseEnter={() => setHoveredCategory('all')}
              onMouseLeave={() => setHoveredCategory(null)}
              style={{
                color: hoveredCategory === 'all' || !selectedCategorySlug ? '#F5A4C6' : '#6EDCFF',
                fontWeight: hoveredCategory === 'all' || !selectedCategorySlug ? 700 : 600,
                backgroundColor: hoveredCategory === 'all' ? 'rgba(245, 164, 198, 0.2)' : 'transparent',
              }}
            >
              all
            </NavLink>
            {categories.map((cat) => (
              <NavLink
                key={cat.id}
                to={`/main/gallery?category=${cat.slug}`}
                className={'main-page-object-label-link' + (selectedCategorySlug === cat.slug ? ' active' : '')}
                onMouseEnter={() => setHoveredCategory(cat.slug)}
                onMouseLeave={() => setHoveredCategory(null)}
                style={{
                  color: hoveredCategory === cat.slug || selectedCategorySlug === cat.slug ? '#F5A4C6' : '#6EDCFF',
                  fontWeight: hoveredCategory === cat.slug || selectedCategorySlug === cat.slug ? 700 : 600,
                  backgroundColor: hoveredCategory === cat.slug ? 'rgba(245, 164, 198, 0.2)' : 'transparent',
                }}
              >
                {cat.name.toLowerCase()}
              </NavLink>
            ))}
          </nav>
        )}
        <div className="main-page-rect-right">
          <nav className="main-page-nav-buttons" aria-label="Gallery navigation">
            <NavLink
              to="/main/gallery"
              className={({ isActive }) => 'main-nav-btn' + (isActive ? ' active' : '')}
            >
              object gallery
            </NavLink>
            <NavLink
              to="/main/users"
              className={({ isActive }) => 'main-nav-btn' + (isActive ? ' active' : '')}
            >
              user gallery
            </NavLink>
          </nav>
          <div className="main-page-outlet">
            {/* 8×5 grid: objects by category (or all when no category) OR user avatars */}
            <div className={`main-page-gallery-grid${isUserGallery ? ' user-gallery-mode' : ''}`} aria-label={isUserGallery ? "User gallery grid" : "Object gallery grid"}>
              {isUserGallery ? (
                users.map((user) => (
                  <div key={user.id} className="main-page-gallery-grid-cell">
                    <Link 
                      to={user.id === profile?.id ? '/main/profile' : `/main/user/${user.id}`} 
                      className="main-page-gallery-grid-cell-link"
                    >
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt={user.username} className="main-page-gallery-grid-cell-img" />
                      ) : (
                        <div className="main-page-gallery-grid-cell-placeholder">
                          {user.username?.[0]?.toUpperCase() || '?'}
                        </div>
                      )}
                      <span className="main-page-gallery-grid-cell-username">{user.username}</span>
                    </Link>
                  </div>
                ))
              ) : (
                <>
                  {galleryObjects.map((obj) => (
                    <div key={obj.id} className="main-page-gallery-grid-cell">
                      <Link to={`/main/object/${obj.id}`} className="main-page-gallery-grid-cell-link">
                        <img src={obj.image_url} alt="" className="main-page-gallery-grid-cell-img" />
                      </Link>
                    </div>
                  ))}
                </>
              )}
            </div>
            {!isUserGallery && loadingMore && (
              <div className="main-page-loading-more">
                Loading more...
              </div>
            )}
            {!isUserGallery && !hasMore && galleryObjects.length > 0 && (
              <div className="main-page-no-more">
                {galleryObjects.length} objects
              </div>
            )}
            <Outlet />
          </div>
        </div>
        <aside className="main-page-rect-panel-top" aria-label="Your profile">
          <div className="main-page-rect-panel-top-inner">
            <span className="main-page-rect-panel-top-username-text">{profile?.username || 'username'}</span>
            <div className="main-page-rect-panel-top-avatar-middle">
              <div className="main-page-rect-panel-top-avatar" aria-hidden>
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="main-page-rect-panel-top-avatar-img" />
                ) : (
                  <span className="main-page-rect-panel-top-avatar-placeholder">avatar</span>
                )}
              </div>
            </div>
            <button
              type="button"
              className={'main-page-rect-panel-top-profile-btn' + (isProfilePage ? ' active' : '')}
              onClick={() => navigate('/main/profile')}
            >
              my profile
            </button>
          </div>
        </aside>
        <aside className="main-page-rect-panel-bottom" aria-hidden />
        {/* Yellow box: messages notification */}
        <div
          className="main-page-rect-panel-bottom-yellow-box"
          aria-label="Recent chats"
        >
          <div className="main-page-messages-header">
            <span className="main-page-messages-title">messages</span>
          </div>
          <div className="main-page-messages-list">
            {recentMessages.length > 0 ? (
              recentMessages.map((msg) => (
                <Link
                  key={msg.id}
                  to={`/main/chat/${msg.senderId}`}
                  className="main-page-message-item"
                >
                  <div className="main-page-message-avatar">
                    {msg.senderAvatar ? (
                      <img src={msg.senderAvatar} alt={msg.senderUsername} />
                    ) : (
                      <div className="main-page-message-avatar-placeholder">
                        {msg.senderUsername?.[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="main-page-message-content">
                    <div className="main-page-message-username">{msg.senderUsername}</div>
                    <div className="main-page-message-preview">
                      {msg.type === 'image' ? '📷 Image' : msg.text}
                    </div>
                  </div>
                  {msg.unreadCount > 0 && (
                    <span className="main-page-message-count-badge">{msg.unreadCount}</span>
                  )}
                </Link>
              ))
            ) : (
              <div className="main-page-messages-empty">No new messages</div>
            )}
          </div>
        </div>
        <Link
          to="/main/chatroom"
          className="main-page-rect-panel-bottom-btn"
          aria-label="Chatroom"
        >
          chatroom
        </Link>
      </div>
      )}
    </div>
  );
}
