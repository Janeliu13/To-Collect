import { Link } from 'react-router-dom';

export default function MessagesPage() {
  return (
    <div className="messages-page">
      <h2>Messages</h2>
      <p>Conversation list (placeholder). Click a conversation to open Chatroom.</p>
      <Link to="/main/chat/conv-1">Open conversation (placeholder)</Link>
    </div>
  );
}
