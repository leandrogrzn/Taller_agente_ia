import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import ReactMarkdown from 'react-markdown';
import './App.css';

// --- Configuración de clientes ---
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const SYSTEM_INSTRUCTION =
  'Eres Nexus AI, un asistente técnico experto. Responde usando Markdown';

const STORAGE_KEY = 'nexus_ai_chats';

// --- Utilidades de persistencia ---
function loadChatsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Error leyendo localStorage:', err);
    return [];
  }
}

function saveChatsToStorage(chats) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch (err) {
    console.error('Error guardando en localStorage:', err);
  }
}

function createEmptyChat() {
  return {
    id: crypto.randomUUID(),
    title: 'Nuevo Chat',
    createdAt: Date.now(),
    messages: [],
  };
}

export default function App() {
  const [chats, setChats] = useState(() => {
    const stored = loadChatsFromStorage();
    return stored.length > 0 ? stored : [createEmptyChat()];
  });
  const [activeChatId, setActiveChatId] = useState(() => chats[0]?.id);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  const activeChat = chats.find((c) => c.id === activeChatId) || chats[0];

  // Persistir cada vez que cambian los chats
  useEffect(() => {
    saveChatsToStorage(chats);
  }, [chats]);

  // Auto-scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages?.length, isLoading]);

  // --- Configuración de Web Speech API ---
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };

    recognition.onerror = (event) => {
      console.error('Error de reconocimiento de voz:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Tu navegador no soporta reconocimiento de voz.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  // --- Guardar en Supabase ---
  const saveToSupabase = async (question, answer) => {
    const { error } = await supabase.from('conversaciones').insert([
      {
        chat_id: activeChat.id,
        pregunta: question,
        respuesta: answer,
      },
    ]);
    if (error) console.error('Error guardando en Supabase:', error);
  };

  // --- Actualizar mensajes del chat activo ---
  const updateActiveChatMessages = useCallback(
    (updater) => {
      setChats((prevChats) =>
        prevChats.map((chat) =>
          chat.id === activeChatId
            ? { ...chat, messages: updater(chat.messages) }
            : chat
        )
      );
    },
    [activeChatId]
  );

  const handleSend = async () => {
    const question = input.trim();
    if (!question || isLoading) return;

    const userMessage = { role: 'user', content: question };
    updateActiveChatMessages((msgs) => [...msgs, userMessage]);

    // Renombrar chat si es el primer mensaje
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === activeChatId && chat.messages.length === 0
          ? { ...chat, title: question.slice(0, 30) }
          : chat
      )
    );

    setInput('');
    setIsLoading(true);

    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-3-flash-preview',
        systemInstruction: SYSTEM_INSTRUCTION,
      });

      const history = (activeChat?.messages || []).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const chatSession = model.startChat({ history });
      const result = await chatSession.sendMessage(question);
      const answer = result.response.text();

      const assistantMessage = { role: 'assistant', content: answer };
      updateActiveChatMessages((msgs) => [...msgs, assistantMessage]);

      await saveToSupabase(question, answer);
    } catch (err) {
      console.error('Error consultando a Gemini:', err);
      updateActiveChatMessages((msgs) => [
        ...msgs,
        {
          role: 'assistant',
          content:
            '⚠️ Ocurrió un error al generar la respuesta. Revisa la consola.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    const newChat = createEmptyChat();
    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newChat.id);
  };

  const handleClearSession = () => {
    if (!confirm('¿Seguro que deseas borrar toda la sesión? Esta acción no se puede deshacer.')) return;
    const newChat = createEmptyChat();
    setChats([newChat]);
    setActiveChatId(newChat.id);
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleCopy = async (text, index) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1500);
    } catch (err) {
      console.error('Error copiando al portapapeles:', err);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="sidebar-title">Nexus AI</h1>
          <button className="btn-new-chat" onClick={handleNewChat}>
            + Nuevo Chat
          </button>
        </div>

        <div className="chat-history">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`history-item ${
                chat.id === activeChatId ? 'active' : ''
              }`}
              onClick={() => setActiveChatId(chat.id)}
            >
              {chat.title}
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <button className="btn-clear-session" onClick={handleClearSession}>
            🗑 Borrar sesión
          </button>
        </div>
      </aside>

      {/* Área de chat principal */}
      <main className="chat-area">
        <div className="messages-container">
          {(activeChat?.messages || []).length === 0 && (
            <div className="empty-state">
              <h2>¿En qué puedo ayudarte hoy?</h2>
              <p>Escribe una pregunta o usa el micrófono para hablar.</p>
            </div>
          )}

          {(activeChat?.messages || []).map((msg, idx) => (
            <div key={idx} className={`message-row ${msg.role}`}>
              <div className={`message-bubble ${msg.role}`}>
                {msg.role === 'assistant' ? (
                  <>
                    <div className="markdown-content">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                    <button
                      className="btn-copy"
                      onClick={() => handleCopy(msg.content, idx)}
                    >
                      {copiedIndex === idx ? '✓ Copiado' : '📋 Copiar'}
                    </button>
                  </>
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="message-row assistant">
              <div className="message-bubble assistant loading">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="input-bar">
          <button
            className={`btn-mic ${isListening ? 'listening' : ''}`}
            onClick={toggleListening}
            title="Hablar"
          >
            🎤
          </button>
          <textarea
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe tu mensaje..."
            rows={1}
          />
          <button
            className="btn-send"
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
          >
            Enviar
          </button>
        </div>
      </main>
    </div>
  );
}