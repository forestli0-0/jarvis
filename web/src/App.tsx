import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import Sidebar from './components/Sidebar';
import Chat from './components/Chat';
import './App.css';

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

let socket: Socket;

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);

  useEffect(() => {
    socket = io(window.location.origin);
    return () => { socket.disconnect(); };
  }, []);

  useEffect(() => {
    fetch('/api/conversations')
      .then((r) => r.json())
      .then(setConversations)
      .catch(() => {});
  }, []);

  const handleNewConversation = () => {
    setCurrentId(null);
  };

  const handleSelectConversation = (id: string) => {
    setCurrentId(id);
  };

  const handleConversationCreated = (conv: Conversation) => {
    setConversations((prev) => [conv, ...prev]);
    setCurrentId(conv.id);
  };

  const handleDeleteConversation = async (id: string) => {
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (currentId === id) setCurrentId(null);
  };

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        currentId={currentId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        onDelete={handleDeleteConversation}
      />
      <Chat
        socket={socket}
        conversationId={currentId}
        onConversationCreated={handleConversationCreated}
      />
    </div>
  );
}

export default App;
