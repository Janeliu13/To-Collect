import { Link } from 'react-router-dom';

export default function MessagesPage() {
  return (
    <div className="messages-page">
      <h2>Messages</h2>
      <p>会话列表 占位，点击会话进入 Chatroom</p>
      <Link to="/main/chat/conv-1">进入某会话 (占位)</Link>
    </div>
  );
}
