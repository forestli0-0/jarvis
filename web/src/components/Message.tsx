interface Props {
  message: {
    role: 'user' | 'assistant' | 'tool';
    content: string;
  };
}

export default function MessageBubble({ message }: Props) {
  const roleLabel = message.role === 'user' ? '你' : message.role === 'assistant' ? 'JARVIS' : '工具';

  return (
    <div className={`message ${message.role}`}>
      <div className="role">{roleLabel}</div>
      <div className="content">{message.content}</div>
    </div>
  );
}
