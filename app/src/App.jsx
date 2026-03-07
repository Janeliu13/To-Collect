import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import EntryPage from './pages/EntryPage';
import AvatarCreatePage from './pages/AvatarCreatePage';
import AvatarConfirmPage from './pages/AvatarConfirmPage';
import MainPage from './pages/MainPage';
import ObjectGalleryPage from './pages/ObjectGalleryPage';
import UserGalleryPage from './pages/UserGalleryPage';
import MyProfilePage from './pages/MyProfilePage';
import MessagesPage from './pages/MessagesPage';
import ChatroomPage from './pages/ChatroomPage';
import ObjectDetailPage from './pages/ObjectDetailPage';
import ObjectUploadPage from './pages/ObjectUploadPage';
import UserProfilePage from './pages/UserProfilePage';
import './App.css';
import './MainPageFigma.css';

function ProtectedMain({ children }) {
  const { user, loading, profile, profileLoading } = useAuth();
  if (loading || profileLoading) return <div className="app-loading">Loading...</div>;
  if (!user) return <Navigate to="/" replace />;
  if (!profile) return <Navigate to="/avatar/create" replace />;
  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<EntryPage />} />
      <Route path="/avatar/create" element={<AvatarCreatePage />} />
      <Route path="/avatar/confirm" element={<AvatarConfirmPage />} />
      {/* My Profile Page: standalone full page, reached only via the pink "my profile" button on the main page */}
      <Route
        path="/main/profile"
        element={
          <ProtectedMain>
            <MyProfilePage />
          </ProtectedMain>
        }
      />
      <Route
        path="/main/profile/upload"
        element={
          <ProtectedMain>
            <ObjectUploadPage />
          </ProtectedMain>
        }
      />
      {/* User Profile Page: standalone full page, view another user's profile */}
      <Route
        path="/main/user/:userId"
        element={
          <ProtectedMain>
            <UserProfilePage />
          </ProtectedMain>
        }
      />
      {/* Object view: standalone full page, no main gallery nav/panels */}
      <Route
        path="/main/object/:objectId"
        element={
          <ProtectedMain>
            <ObjectDetailPage />
          </ProtectedMain>
        }
      />
      {/* Chatroom: standalone full page, same background as main, back to main */}
      <Route
        path="/main/chatroom"
        element={
          <ProtectedMain>
            <ChatroomPage />
          </ProtectedMain>
        }
      />
      <Route
        path="/main/chat/:userId"
        element={
          <ProtectedMain>
            <ChatroomPage />
          </ProtectedMain>
        }
      />
      <Route
        path="/main"
        element={
          <ProtectedMain>
            <MainPage />
          </ProtectedMain>
        }
      >
        <Route index element={<Navigate to="/main/gallery" replace />} />
        <Route path="gallery" element={<ObjectGalleryPage />} />
        <Route path="users" element={<UserGalleryPage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="chat/:conversationId" element={<ChatroomPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
