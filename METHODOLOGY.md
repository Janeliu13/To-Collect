# Collect Platform - Detailed Build Methodology

## Project Overview
**Collect** is a social platform for collecting, sharing, and discussing objects with other users. Built with React, Supabase, and deployed on Vercel, this platform features real-time messaging, object galleries, user profiles, and a sophisticated repost system.

---

## Table of Contents
1. [Initial Setup & Architecture](#1-initial-setup--architecture)
2. [Authentication System](#2-authentication-system)
3. [Database Schema Design](#3-database-schema-design)
4. [Core Features Implementation](#4-core-features-implementation)
5. [UI/UX Refinement Process](#5-uiux-refinement-process)
6. [Real-time Messaging System](#6-real-time-messaging-system)
7. [Deployment Pipeline](#7-deployment-pipeline)
8. [Iterative Problem-Solving Patterns](#8-iterative-problem-solving-patterns)

---

## 1. Initial Setup & Architecture

### 1.1 Technology Stack Selection
**Frontend Framework**: React with Vite
- **Rationale**: Fast development server, hot module replacement, modern build tooling
- **Setup**: `npm create vite@latest app -- --template react`

**Backend & Database**: Supabase
- **Rationale**: Provides PostgreSQL database, authentication, storage, and real-time subscriptions in one platform
- **Components Used**:
  - PostgreSQL for relational data
  - Supabase Auth for user management
  - Supabase Storage for image hosting
  - Supabase Realtime for live chat functionality

**Styling Approach**: Custom CSS
- **Rationale**: Precise control over design specifications from Figma mockups
- **Structure**: Component-specific classes with viewport-based calculations

### 1.2 Project Structure
```
Collect/
├── app/                          # Frontend application
│   ├── src/
│   │   ├── pages/               # Page components
│   │   ├── contexts/            # React contexts (Auth)
│   │   ├── lib/                 # Supabase client
│   │   ├── App.jsx              # Route definitions
│   │   ├── App.css              # Global styles
│   │   └── main.jsx             # Entry point
│   ├── public/
│   │   └── assets/              # Images and icons
│   └── package.json
├── supabase/
│   └── migrations/              # Database migrations
├── vercel.json                  # Deployment config
└── README.md
```

### 1.3 Environment Configuration
**Environment Variables** (`.env`):
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

**Supabase Client Setup** (`src/lib/supabase.js`):
```javascript
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
```

---

## 2. Authentication System

### 2.1 Auth Context Architecture
**Implementation**: React Context API with `AuthContext.jsx`

**Key Features**:
- Centralized authentication state management
- Automatic session persistence
- User profile data synchronization
- Auth state listeners for real-time updates

**Core Functions**:
```javascript
// Sign up with email/password
signUp(email, password, username)

// Sign in
signIn(email, password)

// Sign out
signOut()

// Session monitoring
useEffect(() => {
  supabase.auth.onAuthStateChange((event, session) => {
    // Update user state
  })
}, [])
```

### 2.2 User Profile System
**Database Table**: `users_ext`
- Extends Supabase Auth users with custom profile data
- Fields: `id`, `username`, `avatar_url`, `created_at`
- Linked via foreign key to `auth.users(id)`

**Profile Creation Flow**:
1. User signs up → Auth user created
2. Redirect to avatar creation page
3. User captures/uploads avatar → Background removal
4. Save to Supabase Storage
5. Create `users_ext` record with avatar URL
6. Redirect to main gallery

### 2.3 Avatar Creation Process
**Pages Involved**:
- `AvatarCreatePage.jsx`: Webcam capture or file upload
- `AvatarConfirmPage.jsx`: Preview and confirm

**Technical Implementation**:
- Webcam access via `navigator.mediaDevices.getUserMedia()`
- Canvas API for image capture
- File upload via `<input type="file" accept="image/*">`
- Background removal integration (external API)
- Upload to Supabase Storage bucket `avatars/`

---

## 3. Database Schema Design

### 3.1 Core Tables

#### `users_ext` Table
```sql
CREATE TABLE users_ext (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```
**Purpose**: Extended user profile information

#### `categories` Table
```sql
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```
**Purpose**: Object categorization system

#### `objects` Table
```sql
CREATE TABLE objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES categories(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```
**Purpose**: Store uploaded objects with metadata

#### `collection` Table
```sql
CREATE TABLE collection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 20),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, position)
);
```
**Purpose**: User's 20-slot personal collection grid

#### `reposts` Table
```sql
CREATE TABLE reposts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, object_id)
);
```
**Purpose**: Track which objects users have reposted

#### `messages` Table
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_text TEXT,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image')),
  image_url TEXT,
  object_id UUID REFERENCES objects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  read BOOLEAN NOT NULL DEFAULT false
);
```
**Purpose**: Store chat messages between users

### 3.2 Indexes for Performance
```sql
-- Messages table indexes
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_receiver ON messages(receiver_id);
CREATE INDEX idx_messages_conversation ON messages(sender_id, receiver_id, created_at);
CREATE INDEX idx_messages_unread ON messages(receiver_id, read);
```

### 3.3 Row Level Security (RLS) Policies

**Philosophy**: Users can only access data they own or data explicitly shared with them.

**Example - Objects Table**:
```sql
-- Users can view all objects
CREATE POLICY "objects_select" ON objects FOR SELECT USING (true);

-- Users can only insert their own objects
CREATE POLICY "objects_insert" ON objects FOR INSERT 
  WITH CHECK (auth.uid() = owner_id);

-- Users can only update their own objects
CREATE POLICY "objects_update" ON objects FOR UPDATE 
  USING (auth.uid() = owner_id);

-- Users can only delete their own objects
CREATE POLICY "objects_delete" ON objects FOR DELETE 
  USING (auth.uid() = owner_id);
```

**Example - Messages Table**:
```sql
-- Users can view messages they sent or received
CREATE POLICY "messages_select" ON messages FOR SELECT 
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Users can send messages as themselves
CREATE POLICY "messages_insert" ON messages FOR INSERT 
  WITH CHECK (auth.uid() = sender_id);

-- Users can mark their received messages as read
CREATE POLICY "messages_update" ON messages FOR UPDATE 
  USING (auth.uid() = receiver_id);
```

### 3.4 Storage Buckets
**Buckets Created**:
- `avatars`: User profile pictures
- `objects`: Uploaded object images

**Storage Policies**:
```sql
-- Anyone can view
CREATE POLICY "public_read" ON storage.objects FOR SELECT USING (true);

-- Users can upload to their own folder
CREATE POLICY "user_upload" ON storage.objects FOR INSERT 
  WITH CHECK (auth.uid()::text = (storage.foldername(name))[1]);
```

---

## 4. Core Features Implementation

### 4.1 Object Upload & Background Removal

#### Flow Diagram
```
User clicks "upload" → Webcam/File Selection → Capture Image → 
Background Removal API → Preview → Add Description → Select Category → 
Save to Database & Storage → Add to Collection Grid
```

#### Technical Implementation

**Step 1: Image Capture** (`ObjectUploadPage.jsx`)
```javascript
// Webcam access
const stream = await navigator.mediaDevices.getUserMedia({ 
  video: { facingMode: 'user' } 
});

// Canvas capture
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');
context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
const imageDataUrl = canvas.toDataURL('image/png');
```

**Step 2: Background Removal**
- Integration with external API (e.g., remove.bg or similar)
- Convert image to blob → Send to API → Receive processed image
- Display preview with transparent background

**Step 3: Upload to Supabase Storage**
```javascript
const fileName = `${user.id}/${Date.now()}.png`;
const { data, error } = await supabase.storage
  .from('objects')
  .upload(fileName, imageBlob, {
    contentType: 'image/png',
    upsert: false
  });

const imageUrl = supabase.storage
  .from('objects')
  .getPublicUrl(fileName).data.publicUrl;
```

**Step 4: Save Metadata to Database**
```javascript
// Insert object record
const { data: object } = await supabase
  .from('objects')
  .insert({
    owner_id: user.id,
    image_url: imageUrl,
    description: description,
    category_id: selectedCategory
  })
  .select()
  .single();

// Add to collection grid
await supabase
  .from('collection')
  .insert({
    user_id: user.id,
    object_id: object.id,
    position: nextAvailablePosition
  });
```

### 4.2 Gallery System

#### User Gallery (`MainPage.jsx` - User View)
**Purpose**: Display all registered users as clickable avatars

**Data Fetching**:
```javascript
const { data: users } = await supabase
  .from('users_ext')
  .select('id, username, avatar_url')
  .order('created_at', { ascending: false });
```

**Rendering Logic**:
```javascript
{users.map((u) => (
  <Link 
    to={u.id === user.id ? '/main/profile' : `/main/user/${u.id}`}
    key={u.id}
  >
    <div className="main-page-gallery-square">
      <img src={u.avatar_url} alt={u.username} />
    </div>
  </Link>
))}
```

**Key Design Decision**: Dynamic rendering - squares only appear when users exist (no empty placeholders)

#### Object Gallery (`MainPage.jsx` - Object View)
**Purpose**: Display all uploaded objects, filterable by category

**Data Fetching with Category Filter**:
```javascript
// Fetch objects based on selected category
const query = supabase
  .from('objects')
  .select('*, categories(name)')
  .order('created_at', { ascending: false });

if (categoryId && categoryId !== 'all') {
  query.eq('category_id', categoryId);
}

const { data: objects } = await query;
```

**Category Sidebar Implementation**:
- Dynamic category list fetched from database
- Only show categories that have objects
- "All" option to show everything
- Active state tracking with React Router's `NavLink`

**Hover & Active States**:
```css
.main-page-category-label {
  color: #6EDCFF;
  transition: color 0.2s, font-weight 0.2s;
}

.main-page-category-label:hover,
.main-page-category-label.active {
  color: #F5A4C6;
  font-weight: 600;
}
```

### 4.3 Profile System

#### My Profile Page (`MyProfilePage.jsx`)
**Features**:
1. **20-Slot Collection Grid**: User's personal curated collection
2. **Reposts Section**: Objects reposted from others
3. **Feeling Squares**: 4 special slots for mood/aesthetic objects

**Collection Grid Logic**:
```javascript
// Fetch user's collection (positions 1-20)
const { data: collectionData } = await supabase
  .from('collection')
  .select(`
    position,
    object_id,
    objects (
      id,
      image_url,
      description
    )
  `)
  .eq('user_id', user.id)
  .order('position', { ascending: true });

// Create array of 20 slots
const slots = Array.from({ length: 20 }, (_, i) => {
  const position = i + 1;
  const item = collectionData?.find(c => c.position === position);
  return item ? { position, ...item.objects } : { position, empty: true };
});
```

**Swap Functionality**:
- Each occupied slot has a "swap" button overlay
- Clicking swap → Navigate to upload page with `?swap={position}` query param
- After uploading new object → Replace object at that position
- Original object remains in main gallery

```javascript
// Swap button JSX
<Link 
  to={`/main/profile/upload?swap=${position}`} 
  className="my-profile-swap-btn"
  onClick={(e) => e.stopPropagation()}
>
  <img src="/assets/swap.png" alt="Swap" />
</Link>

// Upload page swap logic
const [searchParams] = useSearchParams();
const swapPosition = searchParams.get('swap');

// On save
if (swapPosition) {
  // Update existing collection slot
  await supabase
    .from('collection')
    .update({ object_id: newObjectId })
    .eq('user_id', user.id)
    .eq('position', parseInt(swapPosition));
} else {
  // Insert into next available position
  await supabase
    .from('collection')
    .insert({ user_id: user.id, object_id: newObjectId, position });
}
```

#### User Profile Page (`UserProfilePage.jsx`)
**Purpose**: View-only profile of other users

**Key Differences from My Profile**:
- No edit capabilities
- No swap buttons
- Feeling squares are clickable → Navigate to object detail page

```javascript
<Link to={`/main/object/${slot.objectId}`}>
  <img src={slot.imageUrl} alt="" />
</Link>
```

### 4.4 Object Detail Page

#### Information Display
**Data Fetched**:
```javascript
const { data: object } = await supabase
  .from('objects')
  .select(`
    *,
    categories (name),
    users_ext!objects_owner_id_fkey (username)
  `)
  .eq('id', objectId)
  .single();
```

**Layout Components**:
1. **Object Image**: Large display of the object
2. **Description Box**: Object description + "from {username}" link
3. **Category Tag**: Shows object's category
4. **Action Buttons**:
   - **Repost Button**: Only visible if not the owner
   - **Chat Button**: Opens chatroom with object owner

#### "From Username" Implementation
**Design Requirement**: Top-right corner of description box, clickable link

**CSS Positioning**:
```css
.object-view-from-text {
  position: absolute;
  right: 1rem;
  top: 0.75rem;
  color: #3EC9E0;
  font-family: Arial, sans-serif;
  max-width: calc(100% - 2rem);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.object-view-from-username-link {
  color: #3EC9E0;
  text-decoration: underline;
  cursor: pointer;
  font-weight: 400;
}
```

**JSX**:
```javascript
<div className="object-view-from-text">
  from{' '}
  <Link 
    to={object.owner_id === user.id 
      ? '/main/profile' 
      : `/main/user/${object.owner_id}`
    }
    className="object-view-from-username-link"
  >
    {ownerUsername}
  </Link>
</div>
```

#### Repost System
**Logic**:
```javascript
// Check if already reposted
const { data: existingRepost } = await supabase
  .from('reposts')
  .select('id')
  .eq('user_id', user.id)
  .eq('object_id', objectId)
  .maybeSingle();

// Toggle repost
if (existingRepost) {
  await supabase.from('reposts').delete().eq('id', existingRepost.id);
} else {
  await supabase.from('reposts').insert({
    user_id: user.id,
    object_id: objectId
  });
}
```

---

## 5. UI/UX Refinement Process

### 5.1 Design-to-Code Translation Method

**Approach**: Iterative precision-based CSS adjustments using viewport calculations

**Example - Chat Button Positioning**:
```
Initial Requirement: "Button to the right of repost button"
↓
Iteration 1: Basic positioning with fixed pixels
↓
Iteration 2: "Same x-axis as repost button"
↓
Iteration 3: "Same height as repost button (40px)"
↓
Iteration 4: "Make it square (40x40px)"
↓
Final: Viewport-based calculation for responsive positioning
```

**Final CSS**:
```css
.object-view-chat-btn {
  width: 40px;
  height: 40px;
  background: #F5A4C6;
  position: absolute;
  left: calc(100vw * 4882 / 7866 + 50px);
  top: calc(100vh * 3324 / 5263);
}
```

### 5.2 Color Palette System

**Primary Colors**:
- `#6EDCFF`: Default text, category labels
- `#F5A4C6`: Hover states, buttons, accents
- `#3EC9E0`: Links, usernames, timestamps
- `#B9EB35`: Message bubbles
- `#D4EDF4`: Dropdown backgrounds
- `#FEFDAC`: Placeholder text

**Application Strategy**:
- Consistent color usage across components
- Hover states for interactive elements
- High contrast for readability

### 5.3 Spacing & Layout Principles

**Grid Systems**:
```css
/* Collection grid - 5 columns */
.my-profile-bottom-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 1rem;
}

/* Reposts grid - dynamic columns */
.my-profile-reposts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 0.75rem;
  overflow-y: auto;
}
```

**Spacing Consistency**:
- Gallery squares: Equal spacing, no extra row gaps
- Dynamic rendering: Only show elements when data exists
- Scrollable containers: Custom scrollbar styling for visual consistency

### 5.4 Responsive Design Strategy

**Viewport-Based Calculations**:
```css
/* Example: Position element based on design mockup dimensions */
left: calc(100vw * 4882 / 7866);  /* 4882px out of 7866px viewport width */
top: calc(100vh * 3324 / 5263);   /* 3324px out of 5263px viewport height */
```

**Font Scaling**:
```css
font-size: clamp(0.7rem, 1.2vw, 0.85rem);
```

### 5.5 Interactive States

**Hover Effects**:
```css
.element {
  transition: color 0.2s, font-weight 0.2s, background 0.2s;
}

.element:hover {
  color: #F5A4C6;
  font-weight: 600;
}
```

**Active States**:
- React Router's `NavLink` for automatic active class
- Manual state management for complex interactions

---

## 6. Real-time Messaging System

### 6.1 Architecture Overview

**Components**:
1. **ChatroomPage**: Main chat interface
2. **Message Notification System**: Unread message alerts on main page
3. **Supabase Realtime**: WebSocket-based live updates

### 6.2 Chatroom Page Implementation

#### Layout Structure
```
┌─────────────────────────────────────┐
│  Pink Bar (Back Button)             │
├──────────┬──────────────────────────┤
│ User     │  Messages Area (Blue)    │
│ List     │  - Scrollable            │
│ (Blue)   │  - Timestamps            │
│          │  - Message Bubbles       │
│          │                          │
├──────────┴──────────────────────────┤
│  Input Area (Purple)                │
│  [Message Box] [Send Button]        │
└─────────────────────────────────────┘
```

#### State Management
```javascript
const [message, setMessage] = useState('');           // Current input
const [messages, setMessages] = useState([]);         // Chat history
const [otherUser, setOtherUser] = useState(null);     // Chat partner
const [recentChats, setRecentChats] = useState([]);   // Sidebar list
const messagesEndRef = useRef(null);                  // Auto-scroll ref
const hasInsertedInitialImage = useRef(false);        // Prevent duplicates
```

#### Message Loading
```javascript
const loadMessages = useCallback(async () => {
  // Fetch messages between two users
  const { data } = await supabase
    .from('messages')
    .select('*')
    .or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),
         and(sender_id.eq.${userId},receiver_id.eq.${user.id})`)
    .order('created_at', { ascending: true });
  
  // Fetch sender details for avatars/usernames
  const senderIds = [...new Set(data.map(msg => msg.sender_id))];
  const { data: senders } = await supabase
    .from('users_ext')
    .select('id, username, avatar_url')
    .in('id', senderIds);
  
  // Map sender details to messages
  const userMap = new Map(senders.map(s => [s.id, s]));
  const formattedMessages = data.map(msg => ({
    id: msg.id,
    type: msg.message_type,
    text: msg.message_text,
    imageUrl: msg.image_url,
    username: userMap.get(msg.sender_id)?.username,
    avatarUrl: userMap.get(msg.sender_id)?.avatar_url,
    timestamp: new Date(msg.created_at),
    isOwn: msg.sender_id === user.id
  }));
  
  setMessages(formattedMessages);
}, [user, userId]);
```

**Key Pattern**: Fetch user details separately to ensure avatars persist after refresh

#### Real-time Subscription
```javascript
useEffect(() => {
  if (!user?.id || !userId) return;

  const channel = supabase
    .channel(`chatroom:${user.id}:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      },
      async (payload) => {
        const newMsg = payload.new;
        
        // Filter for relevant messages
        const isRelevant = 
          (newMsg.sender_id === user.id && newMsg.receiver_id === userId) ||
          (newMsg.sender_id === userId && newMsg.receiver_id === user.id);
        
        if (!isRelevant) return;
        
        // Avoid duplicates
        setMessages((prev) => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          
          // Fetch sender details
          const { data: sender } = await supabase
            .from('users_ext')
            .select('username, avatar_url')
            .eq('id', newMsg.sender_id)
            .single();
          
          const formattedMsg = {
            id: newMsg.id,
            type: newMsg.message_type,
            text: newMsg.message_text,
            imageUrl: newMsg.image_url,
            username: sender?.username,
            avatarUrl: sender?.avatar_url,
            timestamp: new Date(newMsg.created_at),
            isOwn: newMsg.sender_id === user.id
          };
          
          return [...prev, formattedMsg];
        });
        
        // Mark as read if from other user
        if (newMsg.sender_id === userId) {
          await supabase
            .from('messages')
            .update({ read: true })
            .eq('id', newMsg.id);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [user?.id, userId]);
```

**Critical Setup**: Enable Realtime on messages table
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
```

#### Message Sending
```javascript
const handleSend = async (e) => {
  e.preventDefault();
  const text = message.trim();
  if (!text) return;
  
  // Save to database
  const { data } = await supabase
    .from('messages')
    .insert({
      sender_id: user.id,
      receiver_id: userId,
      message_text: text,
      message_type: 'text'
    })
    .select()
    .single();
  
  // Immediately add to local state for instant display
  const newMessage = {
    id: data.id,
    type: 'text',
    text,
    username: profile?.username,
    avatarUrl: profile?.avatar_url,
    timestamp: new Date(data.created_at),
    isOwn: true
  };
  setMessages((prev) => [...prev, newMessage]);
  setMessage('');
};
```

**Design Pattern**: Optimistic UI update + Realtime subscription for incoming messages

#### Auto-Scroll Implementation
```javascript
const scrollToBottom = () => {
  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
};

useEffect(() => {
  scrollToBottom();
}, [messages]);

// JSX
<div className="chatroom-messages-list">
  {messages.map((m) => (/* render message */))}
  <div ref={messagesEndRef} />
</div>
```

#### Timestamp Display Logic
```javascript
const shouldShowTimestamp = (currentIndex) => {
  if (currentIndex === 0) return true;
  const currentMsg = messages[currentIndex];
  const prevMsg = messages[currentIndex - 1];
  const timeDiff = currentMsg.timestamp - prevMsg.timestamp;
  return timeDiff > 2 * 60 * 1000; // Show if >2 minutes apart
};
```

#### Message Layout - Left vs Right
```javascript
{messages.map((m, index) => (
  <div key={m.id}>
    {shouldShowTimestamp(index) && (
      <div className="chatroom-timestamp-divider">
        {formatTimestamp(m.timestamp)}
      </div>
    )}
    <div className={`chatroom-message-row ${m.isOwn ? 'chatroom-message-own' : 'chatroom-message-other'}`}>
      {!m.isOwn && (
        <div className="chatroom-message-avatar-wrapper">
          <div className="chatroom-message-username">{m.username}</div>
          <div className="chatroom-message-avatar">
            <img src={m.avatarUrl} alt={m.username} />
          </div>
        </div>
      )}
      <div className="chatroom-message-content">
        <div className="chatroom-message-bubble">
          {m.type === 'image' ? (
            <img src={m.imageUrl} alt="Shared object" />
          ) : (
            m.text
          )}
        </div>
      </div>
      {m.isOwn && (
        <div className="chatroom-message-avatar-wrapper">
          <div className="chatroom-message-username">{m.username}</div>
          <div className="chatroom-message-avatar">
            <img src={m.avatarUrl} alt={m.username} />
          </div>
        </div>
      )}
    </div>
  </div>
))}
```

**CSS Flexbox Logic**:
```css
.chatroom-message-row {
  display: flex;
  gap: 0.5rem;
  align-items: flex-end;
  width: 100%;
}

.chatroom-message-own {
  flex-direction: row;
  justify-content: flex-end;
}

.chatroom-message-other {
  flex-direction: row;
  justify-content: flex-start;
}
```

#### Object Sharing in Chat
**Flow**: Object Detail Page → Click Chat Button → Auto-send object image

```javascript
// In ObjectDetailPage
<button onClick={() => navigate(`/main/chat/${object.owner_id}`, {
  state: {
    objectImage: object.image_url,
    objectId: object.id
  }
})}>
  chat
</button>

// In ChatroomPage
useEffect(() => {
  if (location.state?.objectImage && !hasInsertedInitialImage.current) {
    hasInsertedInitialImage.current = true;
    
    // Check if already shared
    const { data: existingMsg } = await supabase
      .from('messages')
      .select('id')
      .eq('object_id', location.state.objectId)
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),
           and(sender_id.eq.${userId},receiver_id.eq.${user.id})`)
      .maybeSingle();
    
    if (!existingMsg) {
      // Insert image message
      await supabase
        .from('messages')
        .insert({
          sender_id: user.id,
          receiver_id: userId,
          message_type: 'image',
          image_url: location.state.objectImage,
          object_id: location.state.objectId
        });
      
      loadMessages();
    }
  }
}, [location.state, user, userId, loadMessages]);
```

**Anti-Duplicate Pattern**: Use `useRef` flag + database check

### 6.3 Message Notification System

#### Display Location
**Main Gallery Page** - Yellow notification box showing 3 most recent unread conversations

#### Data Structure
```javascript
const [recentMessages, setRecentMessages] = useState([]);

// Structure:
[
  {
    id: 'sender_user_id',
    senderId: 'sender_user_id',
    username: 'sender_username',
    avatarUrl: 'sender_avatar_url',
    lastMessage: 'message preview text',
    lastMessageAt: Date,
    unreadCount: 5  // Number of unread messages from this user
  },
  // ... up to 3 conversations
]
```

#### Loading Logic
```javascript
const loadRecentMessages = async () => {
  // Fetch unread messages for current user
  const { data: unreadMessages } = await supabase
    .from('messages')
    .select('sender_id, receiver_id, message_text, created_at')
    .eq('receiver_id', user.id)
    .eq('read', false)
    .order('created_at', { ascending: false });
  
  if (!unreadMessages || unreadMessages.length === 0) {
    setRecentMessages([]);
    return;
  }
  
  // Group by sender and count
  const senderMap = new Map();
  unreadMessages.forEach(msg => {
    if (!senderMap.has(msg.sender_id)) {
      senderMap.set(msg.sender_id, {
        senderId: msg.sender_id,
        lastMessage: msg.message_text || '[Image]',
        lastMessageAt: msg.created_at,
        unreadCount: 1
      });
    } else {
      senderMap.get(msg.sender_id).unreadCount++;
    }
  });
  
  // Get sender details
  const senderIds = Array.from(senderMap.keys());
  const { data: senders } = await supabase
    .from('users_ext')
    .select('id, username, avatar_url')
    .in('id', senderIds);
  
  // Merge and sort
  const formatted = senders.map(sender => ({
    id: sender.id,
    senderId: sender.id,
    username: sender.username,
    avatarUrl: sender.avatar_url,
    ...senderMap.get(sender.id)
  }))
  .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))
  .slice(0, 3);  // Only show 3 most recent
  
  setRecentMessages(formatted);
};
```

#### Real-time Updates
```javascript
useEffect(() => {
  if (!user?.id) return;
  
  const channel = supabase
    .channel('main-page-messages')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${user.id}`
      },
      () => {
        loadRecentMessages();  // Refresh notification list
      }
    )
    .subscribe();
  
  return () => {
    supabase.removeChannel(channel);
  };
}, [user?.id]);
```

#### Mark as Read
```javascript
// In ChatroomPage - when user opens a chat
useEffect(() => {
  if (!user?.id || !userId) return;
  
  supabase
    .from('messages')
    .update({ read: true })
    .eq('receiver_id', user.id)
    .eq('sender_id', userId)
    .eq('read', false)
    .then();
}, [user?.id, userId]);
```

#### Notification Display
```javascript
<div className="main-page-rect-panel-bottom-yellow-box">
  <div className="main-page-messages-header">
    <span className="main-page-messages-title">messages</span>
  </div>
  <div className="main-page-messages-list">
    {recentMessages.map((msg) => (
      <Link key={msg.id} to={`/main/chat/${msg.senderId}`}>
        <div className="main-page-message-item">
          <div className="main-page-message-avatar">
            <img src={msg.avatarUrl} alt={msg.username} />
          </div>
          <div className="main-page-message-content">
            <div className="main-page-message-username">{msg.username}</div>
            <div className="main-page-message-preview">{msg.lastMessage}</div>
          </div>
          {msg.unreadCount > 0 && (
            <span className="main-page-message-count-badge">
              {msg.unreadCount}
            </span>
          )}
        </div>
      </Link>
    ))}
  </div>
</div>
```

### 6.4 Sidebar Recent Chats
**Purpose**: Show list of all users you've chatted with

```javascript
const loadRecentChats = async () => {
  // Get all messages involving current user
  const { data: allMessages } = await supabase
    .from('messages')
    .select('sender_id, receiver_id, created_at')
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .order('created_at', { ascending: false });
  
  // Extract unique users and their last message time
  const userLastMessage = new Map();
  allMessages.forEach(msg => {
    const otherUserId = msg.sender_id === user.id 
      ? msg.receiver_id 
      : msg.sender_id;
    if (!userLastMessage.has(otherUserId)) {
      userLastMessage.set(otherUserId, msg.created_at);
    }
  });
  
  // Fetch user details and sort
  const userIds = Array.from(userLastMessage.keys());
  const { data: users } = await supabase
    .from('users_ext')
    .select('id, username, avatar_url')
    .in('id', userIds);
  
  const sorted = users
    .map(u => ({
      ...u,
      lastMessageAt: userLastMessage.get(u.id)
    }))
    .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
  
  setRecentChats(sorted);
};
```

---

## 7. Deployment Pipeline

### 7.1 Git Setup
```bash
# Initialize repository
git init

# Add remote
git remote add origin https://github.com/Janeliu13/To-Collect.git

# Initial commit
git add .
git commit -m "Initial commit"
git branch -M main
git push -u origin main
```

### 7.2 GitHub Authentication
**Method Used**: GitHub CLI
```bash
# Install
brew install gh

# Login
gh auth login --web
# Follow browser prompts with one-time code
```

### 7.3 Vercel Configuration

**File**: `vercel.json`
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

**Rewrite Rule Purpose**: Enable client-side routing for SPA

### 7.4 Environment Variables on Vercel
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### 7.5 Continuous Deployment
**Workflow**:
1. Make code changes locally
2. Commit: `git add . && git commit -m "message"`
3. Push: `git push`
4. Vercel automatically detects push
5. Builds and deploys new version
6. Live site updates within 1-2 minutes

### 7.6 `.gitignore` Configuration
```
node_modules/
dist/
.env
.env.local
.vercel/
.supabase/
*.log
.DS_Store
```

---

## 8. Iterative Problem-Solving Patterns

### 8.1 CSS Positioning Challenges

#### Pattern: Viewport-Based Calculation
**Problem**: Elements need precise positioning matching Figma design across different screen sizes

**Solution Process**:
1. Extract coordinates from design mockup (e.g., x: 4882px, y: 3324px in 7866x5263 viewport)
2. Convert to viewport percentages: `calc(100vw * 4882 / 7866)`
3. Test across different screen sizes
4. Fine-tune with pixel offsets if needed

**Example Iterations**:
```
Request: "Move button to right of repost button"
→ left: calc(100vw * 4500 / 7866)

Request: "Move it a bit more right"
→ left: calc(100vw * 4600 / 7866)

Request: "Align with repost button exactly"
→ left: calc(100vw * 4882 / 7866 + 50px)  // 50px = repost width + gap
```

### 8.2 State Management Challenges

#### Pattern: Separate Concerns
**Problem**: Complex state dependencies causing re-render loops or stale data

**Solution**: Break down state into independent pieces
```javascript
// Bad: Single large state object
const [chatData, setChatData] = useState({
  messages: [],
  otherUser: null,
  recentChats: []
});

// Good: Separate state variables
const [messages, setMessages] = useState([]);
const [otherUser, setOtherUser] = useState(null);
const [recentChats, setRecentChats] = useState([]);
```

#### Pattern: useCallback for Stable Functions
**Problem**: Functions recreated on every render causing infinite loops

**Solution**:
```javascript
const loadMessages = useCallback(async () => {
  // ... fetch logic
}, [user, userId]);  // Only recreate when these change
```

### 8.3 Navigation & Routing Challenges

#### Pattern: Browser History Management
**Problem**: Back button should remember browsing history, but internal state changes shouldn't pollute history

**Solution**:
```javascript
// For back button - use browser history
<button onClick={() => navigate(-1)}>Back</button>

// For internal state changes - replace history entry
navigate(`/main/chat/${newUserId}`, { replace: true });
```

**Specific Case - Chatroom User Switching**:
- Switching between different user chats: `{ replace: true }`
- Back button: `navigate(-1)` to return to previous page (not previous chat)

### 8.4 Real-time Data Synchronization

#### Pattern: Optimistic Updates + Realtime Subscription
**Problem**: Users expect instant feedback when sending messages

**Solution**:
1. **Optimistic Update**: Immediately add message to local state
2. **Database Insert**: Save to Supabase
3. **Realtime Subscription**: Listen for incoming messages from others
4. **Duplicate Prevention**: Check message ID before adding

```javascript
// Send message
const handleSend = async () => {
  const { data } = await supabase.from('messages').insert({...}).select().single();
  
  // Immediate local update
  setMessages(prev => [...prev, formatMessage(data)]);
};

// Realtime listener for incoming
useEffect(() => {
  const channel = supabase.channel('messages')
    .on('postgres_changes', { event: 'INSERT', table: 'messages' }, (payload) => {
      // Check if already in state
      setMessages(prev => {
        if (prev.some(m => m.id === payload.new.id)) return prev;
        return [...prev, formatMessage(payload.new)];
      });
    })
    .subscribe();
  
  return () => supabase.removeChannel(channel);
}, []);
```

### 8.5 Data Fetching Patterns

#### Pattern: Separate Fetches for Relational Data
**Problem**: Supabase join syntax limitations or complex filtering needs

**Solution**: Fetch in multiple steps
```javascript
// Step 1: Fetch primary data
const { data: messages } = await supabase
  .from('messages')
  .select('*')
  .eq('receiver_id', user.id);

// Step 2: Extract related IDs
const senderIds = [...new Set(messages.map(m => m.sender_id))];

// Step 3: Fetch related data
const { data: senders } = await supabase
  .from('users_ext')
  .select('id, username, avatar_url')
  .in('id', senderIds);

// Step 4: Merge
const userMap = new Map(senders.map(s => [s.id, s]));
const enrichedMessages = messages.map(m => ({
  ...m,
  senderName: userMap.get(m.sender_id)?.username
}));
```

**Benefits**:
- More control over data shape
- Easier debugging
- Better performance with proper indexes

### 8.6 Category Filtering System

#### Pattern: Dynamic Category List
**Requirement**: Only show categories that have objects

**Implementation**:
```javascript
// Fetch all categories
const { data: allCategories } = await supabase
  .from('categories')
  .select('*');

// Fetch all objects with their categories
const { data: allObjects } = await supabase
  .from('objects')
  .select('category_id');

// Filter categories that have objects
const categoriesWithObjects = allCategories.filter(cat =>
  allObjects.some(obj => obj.category_id === cat.id)
);

setCategories(categoriesWithObjects);
```

**Applied In**:
- Main gallery category sidebar
- Object upload page category dropdown

### 8.7 Scrollbar Customization

#### Pattern: Webkit Scrollbar Styling
**Requirement**: Thin, white/transparent scrollbar on right side

**CSS Implementation**:
```css
.scrollable-container {
  overflow-y: auto;
  overflow-x: hidden;
}

/* Webkit browsers (Chrome, Safari) */
.scrollable-container::-webkit-scrollbar {
  width: 6px;
}

.scrollable-container::-webkit-scrollbar-track {
  background: transparent;
}

.scrollable-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
}

.scrollable-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}

/* Firefox */
.scrollable-container {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
}
```

### 8.8 Image Handling & Optimization

#### Pattern: Supabase Storage Integration
**Upload Flow**:
```javascript
// 1. Convert image to blob
const blob = await fetch(imageDataUrl).then(r => r.blob());

// 2. Generate unique filename
const fileName = `${user.id}/${Date.now()}.png`;

// 3. Upload to Supabase Storage
const { data, error } = await supabase.storage
  .from('objects')
  .upload(fileName, blob, {
    contentType: 'image/png',
    upsert: false
  });

// 4. Get public URL
const { data: { publicUrl } } = supabase.storage
  .from('objects')
  .getPublicUrl(fileName);

// 5. Save URL to database
await supabase.from('objects').insert({
  owner_id: user.id,
  image_url: publicUrl,
  description,
  category_id
});
```

**Background Removal Integration**:
- External API call with image blob
- Return processed image with transparent background
- Display preview before saving

### 8.9 Responsive Grid Layouts

#### Pattern: CSS Grid with Dynamic Columns
**Fixed Grid (Collection)**:
```css
.my-profile-bottom-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 1rem;
}
```

**Dynamic Grid (Reposts)**:
```css
.my-profile-reposts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 0.75rem;
  overflow-y: auto;
  grid-auto-rows: minmax(80px, auto);
}

.my-profile-reposts-grid-cell {
  aspect-ratio: 1 / 1;  /* Maintain square shape */
  min-height: 0;
  position: relative;
}
```

**Key Technique**: `aspect-ratio: 1 / 1` ensures squares remain square regardless of container width

---

## 9. Advanced Features & Edge Cases

### 9.1 Swap Functionality

**User Story**: User wants to replace an object in their collection without losing the original in the main gallery

**Implementation Strategy**:
1. **UI**: Add swap button overlay on collection squares
2. **Navigation**: Pass position via query param
3. **Upload Logic**: Check for swap mode
4. **Database Operation**: UPDATE instead of INSERT

**Code Flow**:
```javascript
// MyProfilePage - Swap button
<Link to={`/main/profile/upload?swap=${position}`}>
  <img src="/assets/swap.png" alt="Swap" />
</Link>

// ObjectUploadPage - Detect swap mode
const [searchParams] = useSearchParams();
const swapPosition = searchParams.get('swap');

// Save logic
const addToCollection = async (objectId) => {
  if (swapPosition) {
    // Update existing slot
    await supabase
      .from('collection')
      .update({ object_id: objectId })
      .eq('user_id', user.id)
      .eq('position', parseInt(swapPosition));
  } else {
    // Find next available position
    const { data: existing } = await supabase
      .from('collection')
      .select('position')
      .eq('user_id', user.id);
    
    const occupied = existing.map(c => c.position);
    const nextPosition = Array.from({length: 20}, (_, i) => i + 1)
      .find(pos => !occupied.includes(pos));
    
    await supabase
      .from('collection')
      .insert({
        user_id: user.id,
        object_id: objectId,
        position: nextPosition
      });
  }
};
```

### 9.2 Preventing Duplicate Object Shares

**Problem**: Clicking chat button multiple times on same object sends duplicate images

**Solution**: Database check + ref flag
```javascript
const hasInsertedInitialImage = useRef(false);

useEffect(() => {
  if (location.state?.objectImage && !hasInsertedInitialImage.current) {
    hasInsertedInitialImage.current = true;
    
    // Check if this object was already shared in this conversation
    supabase
      .from('messages')
      .select('id')
      .eq('object_id', location.state.objectId)
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),
           and(sender_id.eq.${userId},receiver_id.eq.${user.id})`)
      .maybeSingle()
      .then(({ data: existingMsg }) => {
        if (!existingMsg) {
          // Only insert if not already shared
          supabase.from('messages').insert({...});
        }
      });
  }
}, [location.state, user, userId]);
```

### 9.3 Text Overflow Handling

**Requirement**: Username in "from {username}" should truncate with ellipsis if too long

**CSS Solution**:
```css
.object-view-from-text {
  max-width: calc(100% - 2rem);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

**Pattern**: Combine `overflow: hidden`, `text-overflow: ellipsis`, and `white-space: nowrap`

### 9.4 Conditional Rendering Based on Ownership

**Pattern**: Show different UI elements based on whether user owns the object

```javascript
// Repost button - only for objects you don't own
{object.owner_id !== user.id && (
  <button onClick={handleRepost}>Repost</button>
)}

// Edit button - only for your own objects
{object.owner_id === user.id && (
  <button onClick={handleEdit}>Edit</button>
)}

// Profile navigation - different routes for self vs others
<Link to={userId === user.id ? '/main/profile' : `/main/user/${userId}`}>
  View Profile
</Link>
```

---

## 10. Performance Optimization Techniques

### 10.1 Query Optimization

**Use Indexes**:
```sql
CREATE INDEX idx_messages_conversation 
ON messages(sender_id, receiver_id, created_at);
```

**Limit Results**:
```javascript
// Only fetch recent messages
.order('created_at', { ascending: false })
.limit(50)
```

**Select Only Needed Columns**:
```javascript
// Bad
.select('*')

// Good
.select('id, username, avatar_url')
```

### 10.2 Prevent Unnecessary Re-renders

**useCallback for Functions**:
```javascript
const loadMessages = useCallback(async () => {
  // ... fetch logic
}, [user, userId]);  // Only recreate when dependencies change
```

**useMemo for Expensive Calculations**:
```javascript
const sortedMessages = useMemo(() => {
  return messages.sort((a, b) => a.timestamp - b.timestamp);
}, [messages]);
```

### 10.3 Realtime Subscription Cleanup

**Pattern**: Always cleanup subscriptions in useEffect return
```javascript
useEffect(() => {
  const channel = supabase.channel('my-channel')
    .on('postgres_changes', {...}, handler)
    .subscribe();
  
  return () => {
    supabase.removeChannel(channel);  // Prevent memory leaks
  };
}, [dependencies]);
```

---

## 11. Debugging Methodology

### 11.1 Console Logging Strategy

**During Development**: Add strategic console logs
```javascript
console.log('Setting up realtime subscription:', user.id, userId);
console.log('Received realtime message:', payload);
console.log('Adding message to state:', formattedMsg);
console.log('Subscription status:', status);
```

**Purpose**: Track data flow and identify where issues occur

**Removal**: Keep logs during testing, remove or comment out for production

### 11.2 Database Migration Issues

**Problem Pattern**: Migration conflicts between local and remote

**Diagnostic Commands**:
```bash
supabase migration list        # Check migration status
supabase db pull              # Pull remote schema
supabase db push              # Push local migrations
```

**Resolution Pattern**:
```bash
# Mark existing migrations as applied
supabase migration repair --status applied 20250306000000_migration_name

# Or create fix migration that drops and recreates
DROP TABLE IF EXISTS table_name CASCADE;
CREATE TABLE table_name (...);
```

### 11.3 Realtime Not Working Checklist

1. **Check if Realtime is enabled on table**:
   ```sql
   ALTER PUBLICATION supabase_realtime ADD TABLE messages;
   ```

2. **Verify RLS policies allow SELECT**:
   ```sql
   -- User must be able to read the data
   CREATE POLICY "messages_select" ON messages FOR SELECT 
     USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
   ```

3. **Check subscription filter syntax**:
   ```javascript
   // Correct
   filter: `receiver_id=eq.${user.id}`
   
   // Incorrect
   filter: `receiver_id.eq.${user.id}`
   ```

4. **Verify channel cleanup**:
   ```javascript
   return () => {
     supabase.removeChannel(channel);
   };
   ```

### 11.4 CSS Not Applying

**Common Issues**:
1. **Specificity**: Add more specific selectors or `!important`
2. **Typos**: Check class names match between JSX and CSS
3. **Caching**: Hard refresh (Cmd+Shift+R) to clear browser cache
4. **Z-index**: Ensure element is on correct layer
5. **Pointer Events**: Check `pointer-events: none` isn't blocking clicks

**Debugging Process**:
```
1. Inspect element in browser DevTools
2. Check if styles are applied
3. Check if styles are being overridden
4. Verify class name is correct
5. Check parent container constraints (overflow, position)
```

---

## 12. Key Design Decisions & Rationale

### 12.1 20-Slot Collection Grid
**Decision**: Fixed 20 slots (5 columns × 4 rows) for user collections

**Rationale**:
- Encourages curation (limited space = thoughtful selection)
- Consistent visual layout across all profiles
- Easy to implement swap functionality with fixed positions

### 12.2 Separate Collection vs Gallery
**Decision**: Objects in collection can be swapped, but originals remain in main gallery

**Rationale**:
- Users can reorganize their profile without losing objects
- Main gallery serves as complete archive
- Enables different views of same data

### 12.3 Real-time for Messages Only
**Decision**: Real-time subscriptions only for messages table, not for objects/users

**Rationale**:
- Messages require instant delivery for good UX
- Objects/users change less frequently (can refresh on page load)
- Reduces Realtime subscription overhead

### 12.4 Category Filtering
**Decision**: Only show categories with objects in dropdown and sidebar

**Rationale**:
- Cleaner UI (no empty categories)
- Reduces confusion for users
- Dynamic system adapts as content grows

### 12.5 Message Notifications
**Decision**: Show 3 most recent unread conversations, not all unread messages

**Rationale**:
- Prevents UI clutter
- Highlights most urgent conversations
- Encourages users to check chatroom for full history

---

## 13. Testing & Quality Assurance

### 13.1 Manual Testing Checklist

**Authentication Flow**:
- [ ] Sign up with new account
- [ ] Upload avatar
- [ ] Sign in with existing account
- [ ] Sign out and verify session cleared

**Object Upload**:
- [ ] Capture via webcam
- [ ] Upload via file
- [ ] Background removal works
- [ ] Description saves correctly
- [ ] Category assignment works
- [ ] Object appears in gallery

**Profile System**:
- [ ] View own profile
- [ ] View other user's profile
- [ ] Swap object in collection
- [ ] Reposts display correctly
- [ ] Feeling squares clickable

**Messaging**:
- [ ] Send text message
- [ ] Send object image via chat button
- [ ] Messages appear instantly
- [ ] Notifications update correctly
- [ ] Read status updates
- [ ] Switch between conversations
- [ ] Back button works correctly

**Navigation**:
- [ ] All back buttons return to previous page
- [ ] Profile links work (self vs others)
- [ ] Category filtering works
- [ ] Object detail page loads correctly

### 13.2 Browser Compatibility
**Tested On**:
- Chrome (primary)
- Safari
- Firefox

**Known Issues**:
- Scrollbar styling differs between browsers (webkit vs standard)

### 13.3 Responsive Design Testing
**Breakpoints Tested**:
- Desktop: 1920×1080, 1440×900
- Laptop: 1366×768
- Tablet: 768×1024

**Method**: Viewport calculations ensure proportional scaling

---

## 14. Deployment Checklist

### 14.1 Pre-Deployment

- [ ] All environment variables documented
- [ ] `.gitignore` includes sensitive files
- [ ] `vercel.json` configured correctly
- [ ] Build command works locally: `npm run build`
- [ ] No console errors in production build

### 14.2 Supabase Setup

- [ ] All migrations applied
- [ ] RLS policies enabled on all tables
- [ ] Storage buckets created with correct policies
- [ ] Realtime enabled on messages table
- [ ] API keys secured (anon key for frontend, service key kept secret)

### 14.3 Vercel Configuration

**Steps**:
1. Connect GitHub repository
2. Set root directory: `app`
3. Framework: Vite
4. Build command: `npm run build`
5. Output directory: `dist`
6. Add environment variables
7. Deploy

### 14.4 Post-Deployment

- [ ] Test all features on live site
- [ ] Verify environment variables loaded
- [ ] Check Supabase connection works
- [ ] Test authentication flow
- [ ] Verify real-time messaging works
- [ ] Check image uploads work
- [ ] Test on mobile devices

---

## 15. Maintenance & Future Enhancements

### 15.1 Monitoring

**What to Monitor**:
- Supabase database size
- Storage bucket usage
- API request counts
- Error logs in browser console
- Vercel deployment logs

### 15.2 Potential Enhancements

**Short-term**:
- [ ] Image compression before upload
- [ ] Message search functionality
- [ ] User blocking/reporting
- [ ] Notification sound for new messages
- [ ] Typing indicators

**Medium-term**:
- [ ] Group chats
- [ ] Object comments
- [ ] Like/reaction system
- [ ] User following system
- [ ] Activity feed

**Long-term**:
- [ ] Mobile app (React Native)
- [ ] Advanced search and filters
- [ ] AI-powered object tagging
- [ ] Export collection as PDF/image
- [ ] Marketplace features

### 15.3 Scaling Considerations

**Database**:
- Add pagination for large galleries
- Implement lazy loading for images
- Archive old messages

**Storage**:
- Implement CDN for faster image delivery
- Add image compression pipeline
- Set up automatic cleanup for deleted objects

**Real-time**:
- Optimize channel subscriptions
- Implement connection pooling
- Add offline support with message queuing

---

## 16. Lessons Learned & Best Practices

### 16.1 Start with Data Model
**Lesson**: Design database schema before building UI

**Why**: 
- Prevents costly refactoring later
- Ensures data relationships are logical
- Makes feature implementation smoother

### 16.2 Iterative UI Refinement
**Lesson**: Build basic functionality first, then refine styling

**Process**:
1. Implement core feature with basic styling
2. Test functionality
3. Iterate on positioning, colors, spacing
4. Add hover states and transitions
5. Test across different screen sizes

### 16.3 Real-time Requires Planning
**Lesson**: Real-time features need careful state management

**Considerations**:
- Prevent duplicate messages
- Handle connection drops gracefully
- Mark messages as read appropriately
- Clean up subscriptions to prevent memory leaks

### 16.4 Navigation State Management
**Lesson**: Distinguish between browser history navigation and internal state changes

**Pattern**:
- Use `navigate(-1)` for back buttons
- Use `navigate(path, { replace: true })` for internal state changes
- Avoid passing state via `location.state` for persistent data (use URL params or database instead)

### 16.5 Supabase Query Patterns
**Lesson**: Complex joins are sometimes better done in multiple steps

**When to Use Multiple Queries**:
- Need to filter results based on related data
- Join syntax becomes too complex
- Need to transform data between fetches
- Better control over error handling

### 16.6 CSS Organization
**Lesson**: Component-specific class names prevent conflicts

**Naming Convention**:
```
.{page}-{section}-{element}-{modifier}

Examples:
.chatroom-message-bubble
.main-page-gallery-square
.my-profile-swap-btn
```

### 16.7 Environment Variable Management
**Lesson**: Use `import.meta.env` for Vite, prefix with `VITE_`

**Pattern**:
```javascript
// ✓ Correct
const url = import.meta.env.VITE_SUPABASE_URL;

// ✗ Wrong (won't work in Vite)
const url = process.env.VITE_SUPABASE_URL;
```

---

## 17. Complete Feature Implementation Timeline

### Phase 1: Foundation (Week 1)
1. Project setup (Vite + React)
2. Supabase project creation
3. Authentication system
4. User registration flow
5. Avatar creation pages

### Phase 2: Core Features (Week 2)
1. Object upload with background removal
2. Main gallery page (user + object views)
3. Category system
4. Database schema with RLS policies
5. Basic profile pages

### Phase 3: Social Features (Week 3)
1. User profile viewing
2. Object detail pages
3. Repost system
4. Collection grid (20 slots)
5. Swap functionality

### Phase 4: Messaging (Week 4)
1. Chatroom page structure
2. Message sending/receiving
3. Real-time subscriptions
4. Message notifications
5. Unread message tracking

### Phase 5: Polish & Deploy (Week 5)
1. UI/UX refinements (colors, spacing, hover states)
2. Navigation improvements
3. Bug fixes
4. Git setup
5. Vercel deployment

---

## 18. Technical Challenges & Solutions

### 18.1 Challenge: Avatar Disappearing After Refresh
**Root Cause**: `loadMessages` function relied on `otherUser` state, which wasn't always loaded when messages were fetched

**Solution**: Fetch sender details directly from database for each message load
```javascript
// Before (buggy)
username: msg.sender_id === user.id ? profile?.username : otherUser?.username

// After (fixed)
const { data: senders } = await supabase
  .from('users_ext')
  .select('id, username, avatar_url')
  .in('id', senderIds);

const userMap = new Map(senders.map(s => [s.id, s]));
username: userMap.get(msg.sender_id)?.username
```

### 18.2 Challenge: Category Hover Not Working
**Root Cause**: CSS specificity issues with React Router's `NavLink` active class

**Solution Attempts**:
1. Increased CSS specificity with parent selectors
2. Added `!important` flags
3. Used inline styles with React state
4. Final: Combination of CSS + proper z-index + pointer-events

**Final Working Solution**:
```javascript
const [hoveredCategory, setHoveredCategory] = useState(null);

<NavLink
  to={`/main?view=objects&category=${cat.id}`}
  onMouseEnter={() => setHoveredCategory(cat.id)}
  onMouseLeave={() => setHoveredCategory(null)}
  style={{
    color: hoveredCategory === cat.id ? '#F5A4C6' : '#6EDCFF',
    fontWeight: hoveredCategory === cat.id ? 600 : 400
  }}
>
  {cat.name.toLowerCase()}
</NavLink>
```

### 18.3 Challenge: Back Button Stuck in Loop
**Root Cause**: Custom navigation state (`location.state.from`) conflicted with browser history

**Solution**: Remove custom state tracking, use native `navigate(-1)`
```javascript
// Before (buggy)
const entryPath = location.state?.from || '/main';
<button onClick={() => navigate(entryPath)}>Back</button>

// After (fixed)
<button onClick={() => navigate(-1)}>Back</button>

// Exception: Internal state changes use replace
navigate(`/main/chat/${newUserId}`, { replace: true });
```

### 18.4 Challenge: Duplicate Messages in Chat
**Root Cause**: Multiple issues:
1. Initial object image inserted twice
2. `loadMessages` not memoized, causing double-loading
3. Manual state update + realtime subscription both adding same message

**Solution**:
1. Use `useRef` flag to prevent re-insertion
2. Wrap `loadMessages` in `useCallback`
3. Check for existing messages before adding
4. Let realtime subscription handle all incoming messages

### 18.5 Challenge: Notification Count Incorrect
**Root Cause**: Showing total unread messages instead of number of users with unread messages

**Solution**: Group messages by sender before counting
```javascript
// Before (buggy)
const totalUnread = unreadMessages.length;

// After (fixed)
const senderMap = new Map();
unreadMessages.forEach(msg => {
  if (!senderMap.has(msg.sender_id)) {
    senderMap.set(msg.sender_id, { unreadCount: 1, ... });
  } else {
    senderMap.get(msg.sender_id).unreadCount++;
  }
});

// Display per-user count
{msg.unreadCount > 0 && (
  <span className="badge">{msg.unreadCount}</span>
)}
```

---

## 19. Code Quality Standards

### 19.1 Component Structure
```javascript
// 1. Imports
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// 2. Component definition
export default function ComponentName() {
  // 3. Hooks
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // 4. State
  const [data, setData] = useState([]);
  
  // 5. Refs
  const myRef = useRef(null);
  
  // 6. Effects
  useEffect(() => {
    // ... side effects
  }, [dependencies]);
  
  // 7. Event handlers
  const handleClick = () => {
    // ... logic
  };
  
  // 8. Render
  return (
    <div>
      {/* JSX */}
    </div>
  );
}
```

### 19.2 Naming Conventions

**Files**: PascalCase for components
- `MainPage.jsx`
- `ChatroomPage.jsx`
- `AuthContext.jsx`

**CSS Classes**: kebab-case with BEM-inspired structure
- `chatroom-message-bubble`
- `main-page-gallery-square`
- `my-profile-swap-btn`

**Functions**: camelCase
- `loadMessages`
- `handleSend`
- `scrollToBottom`

**Database**: snake_case
- `users_ext`
- `sender_id`
- `created_at`

### 19.3 Error Handling Pattern
```javascript
const { data, error } = await supabase
  .from('table')
  .select('*');

if (error) {
  console.error('Error fetching data:', error);
  return;  // Early return on error
}

// Continue with data
```

### 19.4 Async/Await Best Practices
```javascript
// ✓ Good: Handle errors
try {
  const { data } = await supabase.from('table').select();
  setData(data);
} catch (error) {
  console.error(error);
}

// ✓ Good: Use in useEffect with cleanup
useEffect(() => {
  let cancelled = false;
  
  const fetchData = async () => {
    const { data } = await supabase.from('table').select();
    if (!cancelled) setData(data);
  };
  
  fetchData();
  
  return () => {
    cancelled = true;
  };
}, []);
```

---

## 20. Project-Specific Patterns

### 20.1 Viewport Calculation Formula
**Pattern**: Convert design mockup coordinates to responsive CSS

```javascript
// Given: Design mockup is 7866px wide × 5263px tall
// Element at x: 4882px, y: 3324px

// CSS:
left: calc(100vw * 4882 / 7866);
top: calc(100vh * 3324 / 5263);
```

**When to Use**: Precise positioning matching Figma designs

### 20.2 Dynamic Gallery Rendering
**Pattern**: Only render squares when data exists

```javascript
// ✓ Good: Map actual data
{users.map((user) => (
  <div key={user.id} className="gallery-square">
    <img src={user.avatar_url} />
  </div>
))}

// ✗ Bad: Render empty placeholders
{Array.from({length: 20}).map((_, i) => (
  <div key={i} className="gallery-square">
    {data[i] ? <img src={data[i].url} /> : <div>Empty</div>}
  </div>
))}
```

### 20.3 Conditional Route Navigation
**Pattern**: Same component, different routes based on ownership

```javascript
<Link to={
  isOwnProfile 
    ? '/main/profile'           // Editable profile
    : `/main/user/${userId}`    // Read-only profile
}>
  View Profile
</Link>
```

### 20.4 Query Parameter State
**Pattern**: Use URL params for temporary UI state

```javascript
// Swap mode
const [searchParams] = useSearchParams();
const swapPosition = searchParams.get('swap');

// Category filter
const categoryId = searchParams.get('category');

// View mode
const view = searchParams.get('view') || 'users';
```

**Benefits**:
- Shareable URLs
- Browser back/forward works correctly
- State persists on refresh

---

## 21. Summary of Build Process

### 21.1 Development Methodology

**Approach**: Iterative, user-feedback-driven development

**Cycle**:
```
1. Implement basic feature
2. Test functionality
3. User provides feedback (positioning, colors, behavior)
4. Make adjustments
5. Repeat until user satisfied
6. Move to next feature
```

**Average Iterations per Feature**: 3-7 adjustments

### 21.2 Communication Pattern

**User Feedback Style**: 
- Visual references (screenshots)
- Specific measurements when needed
- Bilingual (English + Chinese)
- Immediate testing and feedback

**Development Response**:
- Quick iterations
- Visual confirmation
- Clarifying questions when ambiguous
- Proactive suggestions for related improvements

### 21.3 Tools & Workflow

**Development**:
```bash
# Start dev server
cd app && npm run dev

# Make changes in code editor
# Test in browser
# Iterate
```

**Version Control**:
```bash
# After each feature/fix
git add .
git commit -m "Descriptive message"
git push
```

**Deployment**:
- Automatic via Vercel on push to main branch
- Typically deploys in 1-2 minutes

### 21.4 Key Success Factors

1. **Clear Communication**: Visual references and specific requirements
2. **Rapid Iteration**: Quick feedback loops
3. **Modular Architecture**: Components can be updated independently
4. **Robust Data Model**: Well-designed schema supports all features
5. **Modern Tooling**: Vite, Supabase, Vercel enable fast development

---

## 22. Complete Tech Stack Details

### Frontend Dependencies
```json
{
  "dependencies": {
    "react": "^18.x",
    "react-dom": "^18.x",
    "react-router-dom": "^6.x",
    "@supabase/supabase-js": "^2.x"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.x",
    "vite": "^5.x"
  }
}
```

### Backend Services
- **Supabase PostgreSQL**: Database
- **Supabase Auth**: User authentication
- **Supabase Storage**: Image hosting
- **Supabase Realtime**: WebSocket subscriptions

### External APIs
- Background removal API (integrated in upload flow)

### Deployment
- **Hosting**: Vercel
- **Version Control**: GitHub
- **CI/CD**: Automatic deployment on push

---

## 23. Final Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        User Browser                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              React Application (Vite)                 │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  │  │
│  │  │   Pages     │  │   Contexts   │  │   Router    │  │  │
│  │  │  - Main     │  │  - Auth      │  │  - Routes   │  │  │
│  │  │  - Profile  │  │              │  │  - Links    │  │  │
│  │  │  - Chat     │  │              │  │             │  │  │
│  │  │  - Upload   │  │              │  │             │  │  │
│  │  └─────────────┘  └──────────────┘  └─────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           │ Supabase Client                  │
│                           ▼                                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS / WebSocket
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Supabase Backend                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  PostgreSQL  │  │     Auth     │  │   Storage    │      │
│  │              │  │              │  │              │      │
│  │  - users_ext │  │  - Sign up   │  │  - avatars/  │      │
│  │  - objects   │  │  - Sign in   │  │  - objects/  │      │
│  │  - messages  │  │  - Sessions  │  │              │      │
│  │  - categories│  │              │  │              │      │
│  │  - collection│  │              │  │              │      │
│  │  - reposts   │  │              │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │   Realtime   │  │     RLS      │                        │
│  │              │  │              │                        │
│  │  - Messages  │  │  - Policies  │                        │
│  │  - WebSocket │  │  - Security  │                        │
│  └──────────────┘  └──────────────┘                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Deploy Trigger
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Vercel (Hosting)                       │
│  - Automatic builds on git push                             │
│  - CDN distribution                                         │
│  - Environment variables                                    │
│  - SPA routing support                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Conclusion

This platform was built through an **iterative, feedback-driven process** that prioritized:
1. **Functionality first**: Core features working before polish
2. **User experience**: Multiple rounds of UI refinement based on visual feedback
3. **Real-time interactions**: Modern chat experience with instant updates
4. **Scalable architecture**: Clean separation of concerns, modular components
5. **Deployment automation**: Push to GitHub → Auto-deploy to Vercel

The methodology demonstrates how modern web development tools (React, Supabase, Vercel) enable rapid prototyping and deployment while maintaining code quality and user experience standards.

**Total Development Time**: ~5 weeks from initial setup to deployment
**Lines of Code**: ~3,000+ (frontend) + ~500 (SQL migrations)
**Key Technologies Mastered**: React hooks, Supabase queries, RLS policies, Realtime subscriptions, CSS Grid/Flexbox, Git workflow, Vercel deployment
