import { Conversation } from '../App';

interface Props {
  conversations: Conversation[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export default function Sidebar({ conversations, currentId, onSelect, onNew, onDelete }: Props) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1>JARVIS</h1>
        <p>个人 AI 管家</p>
      </div>
      <button className="new-chat-btn" onClick={onNew}>
        + 新对话
      </button>
      <div className="conversation-list">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`conversation-item ${conv.id === currentId ? 'active' : ''}`}
            onClick={() => onSelect(conv.id)}
          >
            <span className="title">{conv.title}</span>
            <button
              className="delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(conv.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
