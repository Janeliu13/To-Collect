import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

/**
 * Chatroom page: same background as main gallery, back button, and chat UI.
 * Purple area at bottom: message input + send. Messages display in the blue column area.
 */
export default function ChatroomPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [otherUser, setOtherUser] = useState(null);
  const [recentChats, setRecentChats] = useState([]);
  const messagesEndRef = useRef(null);
  const hasInsertedInitialImage = useRef(false);

  useEffect(() => {
    if (!userId) return;
    
    supabase
      .from('users_ext')
      .select('id, username, avatar_url')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        setOtherUser(data);
      });
  }, [userId]);

  // Load recent chat users
  useEffect(() => {
    if (!user?.id) return;
    
    const loadRecentChats = async () => {
      // Get all messages involving current user
      const { data: allMessages } = await supabase
        .from('messages')
        .select('sender_id, receiver_id, created_at')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false });
      
      if (!allMessages) return;
      
      // Get unique user IDs and their last message time
      const userLastMessage = new Map();
      allMessages.forEach(msg => {
        const otherUserId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
        if (!userLastMessage.has(otherUserId)) {
          userLastMessage.set(otherUserId, msg.created_at);
        }
      });
      
      // Get user details
      const userIds = Array.from(userLastMessage.keys());
      if (userIds.length === 0) return;
      
      const { data: users } = await supabase
        .from('users_ext')
        .select('id, username, avatar_url')
        .in('id', userIds);
      
      if (!users) return;
      
      // Sort by last message time
      const sortedUsers = users
        .map(u => ({
          ...u,
          lastMessageAt: userLastMessage.get(u.id)
        }))
        .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
      
      setRecentChats(sortedUsers);
    };
    
    loadRecentChats();
  }, [user?.id, messages]);

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Function to load messages
  const loadMessages = useCallback(async () => {
    if (!user?.id || !userId) return;
    
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`)
      .order('created_at', { ascending: true });
    
    if (data) {
      const loadedMessages = data.map(msg => ({
        id: msg.id,
        type: msg.message_type,
        text: msg.message_text,
        imageUrl: msg.image_url,
        username: msg.sender_id === user.id ? profile?.username : otherUser?.username,
        avatarUrl: msg.sender_id === user.id ? profile?.avatar_url : otherUser?.avatar_url,
        timestamp: new Date(msg.created_at),
        isOwn: msg.sender_id === user.id
      }));
      setMessages(loadedMessages);
    }
  }, [user, userId, profile, otherUser]);

  // Load existing messages between current user and other user
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Real-time subscription for new messages
  useEffect(() => {
    if (!user?.id || !userId) return;

    console.log('Setting up realtime subscription for chat:', user.id, userId);

    const channel = supabase
      .channel(`chatroom:${user.id}:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          console.log('Received realtime message:', payload);
          const newMsg = payload.new;
          
          // Only process messages relevant to this conversation
          const isRelevant = 
            (newMsg.sender_id === user.id && newMsg.receiver_id === userId) ||
            (newMsg.sender_id === userId && newMsg.receiver_id === user.id);
          
          if (!isRelevant) {
            console.log('Message not relevant to this chat');
            return;
          }
          
          // Check if message already exists in state (to avoid duplicates)
          setMessages((prev) => {
            if (prev.some(m => m.id === newMsg.id)) {
              console.log('Message already exists, skipping');
              return prev;
            }
            
            const isOwn = newMsg.sender_id === user.id;
            const formattedMsg = {
              id: newMsg.id,
              type: newMsg.message_type,
              text: newMsg.message_text,
              imageUrl: newMsg.image_url,
              username: isOwn ? profile?.username : otherUser?.username,
              avatarUrl: isOwn ? profile?.avatar_url : otherUser?.avatar_url,
              timestamp: new Date(newMsg.created_at),
              isOwn
            };
            
            console.log('Adding new message to state:', formattedMsg);
            
            // Mark as read if it's from the other user
            if (!isOwn) {
              supabase
                .from('messages')
                .update({ read: true })
                .eq('id', newMsg.id)
                .then();
            }
            
            return [...prev, formattedMsg];
          });
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
      });

    return () => {
      console.log('Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [user?.id, userId, otherUser, profile]);

  // Mark messages as read when viewing this chat
  useEffect(() => {
    if (!user?.id || !userId) return;
    
    // Mark all unread messages from this user as read
    supabase
      .from('messages')
      .update({ read: true })
      .eq('receiver_id', user.id)
      .eq('sender_id', userId)
      .eq('read', false)
      .then(({ error }) => {
        if (error) {
          console.error('Error marking messages as read:', error);
        }
      });
  }, [user?.id, userId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Add initial object image message if passed from ObjectDetailPage
  useEffect(() => {
    if (location.state?.objectImage && location.state?.objectId && user?.id && userId && !hasInsertedInitialImage.current) {
      hasInsertedInitialImage.current = true;
      
      // Check if ANY message with this object_id already exists (from any user)
      supabase
        .from('messages')
        .select('id')
        .eq('object_id', location.state.objectId)
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`)
        .maybeSingle()
        .then(({ data: existingMsg }) => {
          if (!existingMsg) {
            // Only insert if this object hasn't been shared in this conversation before
            supabase
              .from('messages')
              .insert({
                sender_id: user.id,
                receiver_id: userId,
                message_type: 'image',
                image_url: location.state.objectImage,
                object_id: location.state.objectId
              })
              .then(() => {
                // Reload all messages to include the new one
                loadMessages();
              });
          }
        });
    }
  }, [location.state, user, userId, loadMessages]);

  // Helper function to check if we should show timestamp (more than 2 minutes since last message)
  const shouldShowTimestamp = (currentIndex) => {
    if (currentIndex === 0) return true;
    const currentMsg = messages[currentIndex];
    const prevMsg = messages[currentIndex - 1];
    const timeDiff = currentMsg.timestamp - prevMsg.timestamp;
    return timeDiff > 2 * 60 * 1000; // 2 minutes in milliseconds
  };

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const text = message.trim();
    if (!text || !user?.id || !userId) return;
    
    console.log('Sending message:', text);
    
    // Save message to database
    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: user.id,
        receiver_id: userId,
        message_text: text,
        message_type: 'text'
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error sending message:', error);
      return;
    }
    
    console.log('Message saved to database:', data);
    
    // Immediately add message to local state for instant display
    const newMessage = {
      id: data.id,
      type: 'text',
      text,
      username: profile?.username || 'You',
      avatarUrl: profile?.avatar_url,
      timestamp: new Date(data.created_at),
      isOwn: true
    };
    setMessages((prev) => [...prev, newMessage]);
    setMessage('');
  };

  return (
    <div className="chatroom-page">
      <div className="chatroom-page-rect" aria-hidden>
        <div className="chatroom-page-inner-rect" aria-hidden />
        <div className="chatroom-page-inner-rect-right" aria-hidden />
        <div className="chatroom-page-column">
          <div className="chatroom-page-column-blue">
            <div className="chatroom-users-list">
              {recentChats.map((chat) => (
                <div
                  key={chat.id}
                  className={`chatroom-user-item ${chat.id === userId ? 'active' : ''}`}
                  onClick={() => navigate(`/main/chat/${chat.id}`, { replace: true })}
                >
                  <div className="chatroom-user-avatar">
                    {chat.avatar_url ? (
                      <img src={chat.avatar_url} alt={chat.username} />
                    ) : (
                      <div className="chatroom-user-avatar-placeholder">
                        {chat.username?.[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="chatroom-user-name">{chat.username}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="chatroom-page-column-pink" aria-hidden />
        </div>
        <div className="chatroom-page-column-2">
          <div className="chatroom-page-column-2-blue">
            <div className="chatroom-messages-list" aria-label="Chat messages">
              {messages.map((m, index) => (
                <div key={m.id}>
                  {shouldShowTimestamp(index) && (
                    <div className="chatroom-timestamp-divider">
                      {formatTimestamp(m.timestamp)}
                    </div>
                  )}
                  <div className={'chatroom-message-row ' + (m.isOwn ? 'chatroom-message-own' : 'chatroom-message-other')}>
                    {!m.isOwn && (
                      <div className="chatroom-message-avatar-wrapper">
                        <div className="chatroom-message-username">{m.username}</div>
                        <div className="chatroom-message-avatar">
                          {m.avatarUrl ? (
                            <img src={m.avatarUrl} alt={m.username} className="chatroom-avatar-img" />
                          ) : (
                            <div className="chatroom-avatar-placeholder">{m.username?.[0]?.toUpperCase()}</div>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="chatroom-message-content">
                      <div className="chatroom-message-bubble">
                        {m.type === 'image' ? (
                          <img src={m.imageUrl} alt="Shared object" className="chatroom-message-image" />
                        ) : (
                          m.text
                        )}
                      </div>
                    </div>
                    {m.isOwn && (
                      <div className="chatroom-message-avatar-wrapper">
                        <div className="chatroom-message-username">{m.username}</div>
                        <div className="chatroom-message-avatar">
                          {m.avatarUrl ? (
                            <img src={m.avatarUrl} alt={m.username} className="chatroom-avatar-img" />
                          ) : (
                            <div className="chatroom-avatar-placeholder">{m.username?.[0]?.toUpperCase()}</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
          <div className="chatroom-page-column-2-pink" aria-hidden />
        </div>
        <div className="chatroom-page-rect-bottom">
          <form className="chatroom-input-form" onSubmit={handleSend} aria-label="Send a message">
            <textarea
              className="chatroom-input-field"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message…"
              rows={2}
              aria-label="Message text"
            />
            <button type="submit" className="chatroom-send-btn" aria-label="Send message">
              Send
            </button>
          </form>
        </div>
      </div>
      <button
        type="button"
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
