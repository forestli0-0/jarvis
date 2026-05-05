interface Props {
  name: string;
  done: boolean;
}

export default function ToolCallBox({ name, done }: Props) {
  return (
    <div className="tool-call-box">
      <div className="tool-name">🔧 {name}</div>
      <div className="tool-status">{done ? '✓ 完成' : '⏳ 执行中...'}</div>
    </div>
  );
}
