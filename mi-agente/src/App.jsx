// App.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import ReactMarkdown from 'react-markdown';
import './App.css';

// --- Configuración de servicios externos ---
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const SYSTEM_INSTRUCTION = `Eres Orion, un asistente de inteligencia artificial especializado en tecnología, programación, ingeniería y resolución de problemas técnicos.

Tu objetivo es ayudar al usuario a comprender conceptos y desarrollar soluciones prácticas de forma precisa, clara y eficiente.

Reglas de comportamiento:

- Responde siempre en el mismo idioma utilizado por el usuario, salvo que solicite otro idioma.
- Adapta la profundidad de tus respuestas a la complejidad de la pregunta y al nivel aparente del usuario.
- Prioriza soluciones prácticas y correctas sobre explicaciones innecesariamente extensas.
- Mantén un tono profesional, amigable y natural.
- Explica los conceptos de forma clara cuando sea necesario, pero evita extenderte cuando una respuesta sencilla sea suficiente.
- Cuando una solución requiera varios pasos, preséntalos de forma ordenada.
- Si existen varias soluciones válidas, presenta primero la más recomendable y explica brevemente las diferencias cuando sea relevante.
- Si detectas un error en el planteamiento del usuario, corrígelo de manera clara y respetuosa.
- No inventes información. Si no tienes suficiente información o certeza para responder correctamente, indícalo claramente y solicita únicamente los datos necesarios.
- No repitas innecesariamente información que ya haya sido proporcionada durante la conversación.
- Utiliza Markdown para estructurar las respuestas mediante títulos, listas, tablas y otros elementos cuando sean útiles, pero evita utilizar Markdown de forma excesiva.

Cuando proporciones código:

- Utiliza siempre bloques de código Markdown.
- Indica el lenguaje correspondiente en el bloque de código.
- Proporciona código completo y funcional cuando sea razonablemente posible.
- No reemplaces partes importantes del código con comentarios como "resto del código" o \`...\`, salvo que el usuario solicite específicamente un fragmento.
- Verifica que los imports, variables, funciones, dependencias y nombres utilizados sean coherentes entre sí.
- Explica brevemente los aspectos importantes del código cuando sea necesario.

Cuando el usuario solicite resolver un problema técnico:

1. Comprende el problema y determina qué información es relevante.
2. Identifica posibles errores, restricciones o causas del problema.
3. Propón una solución clara y práctica.
4. Explica brevemente por qué funciona.
5. Proporciona ejemplos o código cuando sean necesarios.
6. Si la solución depende de información que no fue proporcionada, solicita únicamente los datos necesarios.

Tu prioridad es proporcionar respuestas útiles, precisas y accionables, manteniendo un equilibrio entre profundidad y concisión.`;

const model = genAI.getGenerativeModel({
  model: 'gemini-3-flash-preview',
  systemInstruction: SYSTEM_INSTRUCTION,
});

const STORAGE_KEY = 'orion_conversations';
const ACTIVE_KEY = 'orion_active_conversation';
const THEME_KEY = 'orion_theme';
const SIDEBAR_COLLAPSED_KEY = 'orion_sidebar_collapsed';
const MAX_TITLE_LENGTH = 60;
const LOGO_SRC = '/favicon.png';

const SUGGESTIONS = [
  { icon: '💻', title: 'Programación', text: 'Ayúdame a resolver un problema de código.' },
  { icon: '🤖', title: 'Conceptos', text: 'Explícame un concepto de forma sencilla.' },
  { icon: '📊', title: 'Análisis', text: 'Analiza esta información y dame tus conclusiones.' },
  { icon: '💡', title: 'Crear', text: 'Ayúdame a desarrollar una idea paso a paso.' },
];

// --- Componente reutilizable: logo de Orion ---
function OrionLogo({ className = 'logo-img' }) {
  return <img src={LOGO_SRC} alt="Orion" className={className} />;
}

// --- Helpers de almacenamiento ---
const generateId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const createTitle = (text) => {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}...` : trimmed || 'Nueva conversación';
};

const loadConversations = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveConversations = (conversations) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch {
    // localStorage no disponible o lleno: se ignora silenciosamente
  }
};

const loadTheme = () => {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'dark' || stored === 'light' ? stored : 'light';
  } catch {
    return 'light';
  }
};

const saveTheme = (theme) => {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // se ignora silenciosamente
  }
};

const loadSidebarCollapsed = () => {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
};

const saveSidebarCollapsed = (value) => {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(value));
  } catch {
    // se ignora silenciosamente
  }
};

// --- Helpers de agrupación por fecha ---
const getDateGroup = (timestamp) => {
  const now = new Date();
  const date = new Date(timestamp);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const sevenDaysAgo = new Date(startOfToday);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  if (date >= startOfToday) return 'HOY';
  if (date >= startOfYesterday) return 'AYER';
  if (date >= sevenDaysAgo) return 'ÚLTIMOS 7 DÍAS';
  return 'ANTERIORES';
};

const filterBySearch = (list, query) => {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((c) => c.title.toLowerCase().includes(q));
};

const groupConversations = (list) => {
  const pinned = list.filter((c) => c.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
  const unpinned = list.filter((c) => !c.pinned);

  const buckets = { HOY: [], AYER: [], 'ÚLTIMOS 7 DÍAS': [], ANTERIORES: [] };
  unpinned.forEach((c) => {
    buckets[getDateGroup(c.updatedAt)].push(c);
  });
  Object.keys(buckets).forEach((key) => {
    buckets[key].sort((a, b) => b.updatedAt - a.updatedAt);
  });

  const ordered = [];
  if (pinned.length) ordered.push(['FIJADOS', pinned]);
  ['HOY', 'AYER', 'ÚLTIMOS 7 DÍAS', 'ANTERIORES'].forEach((key) => {
    if (buckets[key].length) ordered.push([key, buckets[key]]);
  });
  return ordered;
};

// --- Componente: botón de copiar ---
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [text]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <button className="copy-btn" onClick={handleCopy} type="button">
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  );
}

// --- Componente: burbuja de mensaje ---
function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="message-row user">
        <div className="message-bubble user-bubble">
          <p className="user-text">{message.content}</p>
        </div>
      </div>
    );
  }

  const showTypingDots = message.streaming && !message.content;

  return (
    <div className="message-row agent">
      <div className="agent-message">
        <div className="agent-label">
          <OrionLogo className="logo-img message-logo" />
          <span>Orion</span>
        </div>
        {showTypingDots ? (
          <div className="typing-dots">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        ) : (
          <div className="markdown-content">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
        {message.failed && (
          <p className="message-error-note">No se pudo completar la respuesta. Se conservó el contenido recibido.</p>
        )}
        {!message.streaming && message.content && <CopyButton text={message.content} />}
      </div>
    </div>
  );
}

// --- Componente: fila de conversación con menú ---
function ConversationRow({ conv, isActive, onSelect, onRename, onTogglePin, onDelete, openMenuId, setOpenMenuId }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conv.title);
  const inputRef = useRef(null);
  const menuOpen = openMenuId === conv.id;

  useEffect(() => {
    if (editing) {
      setDraft(conv.title);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editing, conv.title]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed) {
      onRename(conv.id, trimmed.slice(0, MAX_TITLE_LENGTH));
    }
    setEditing(false);
  };

  const cancel = () => {
    setDraft(conv.title);
    setEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  if (editing) {
    return (
      <div className="conv-row editing">
        <input
          ref={inputRef}
          className="rename-input"
          type="text"
          value={draft}
          maxLength={MAX_TITLE_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commit}
        />
      </div>
    );
  }

  return (
    <div className={`conv-row ${isActive ? 'active' : ''}`}>
      <button type="button" className="conv-select-btn" onClick={() => onSelect(conv.id)} title={conv.title}>
        <span className="conv-title">{conv.title}</span>
      </button>
      <div className="conv-menu-wrapper">
        <button
          type="button"
          className="conv-menu-btn"
          aria-label="Opciones de conversación"
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenuId(menuOpen ? null : conv.id);
          }}
        >
          ⋯
        </button>
        {menuOpen && (
          <div className="conv-menu" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => { setEditing(true); setOpenMenuId(null); }}>
              ✏ Renombrar
            </button>
            <button type="button" onClick={() => onTogglePin(conv.id)}>
              {conv.pinned ? '📌 Desfijar' : '📌 Fijar'}
            </button>
            <button type="button" className="danger" onClick={() => onDelete(conv.id)}>
              🗑 Eliminar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Componente: Sidebar ---
function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onClearSession,
  onRename,
  onTogglePin,
  onDelete,
  isMobileOpen,
  onCloseMobile,
  isCollapsed,
  onToggleCollapse,
  searchQuery,
  onSearchChange,
  openMenuId,
  setOpenMenuId,
}) {
  const grouped = groupConversations(filterBySearch(conversations, searchQuery));

  return (
    <>
      {isMobileOpen && <div className="sidebar-overlay" onClick={onCloseMobile} />}
      <aside className={`sidebar ${isMobileOpen ? 'mobile-open' : ''} ${isCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-top">
          <span className="brand">
            <OrionLogo className="logo-img sidebar-logo" />
            {!isCollapsed && <span className="brand-name">Orion</span>}
          </span>
          <button
            type="button"
            className="collapse-btn desktop-only"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? 'Expandir menú' : 'Colapsar menú'}
            title={isCollapsed ? 'Expandir' : 'Colapsar'}
          >
            {isCollapsed ? '»' : '«'}
          </button>
          <button
            type="button"
            className="sidebar-close-btn mobile-only"
            onClick={onCloseMobile}
            aria-label="Cerrar menú"
          >
            ✕
          </button>
        </div>

        {!isCollapsed ? (
          <div className="search-box">
            <span className="search-icon" aria-hidden="true">🔍</span>
            <input
              type="text"
              placeholder="Buscar chats..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        ) : (
          <button type="button" className="icon-btn" onClick={onToggleCollapse} aria-label="Buscar chats" title="Buscar">
            🔍
          </button>
        )}

        <button
          type="button"
          className={isCollapsed ? 'icon-btn' : 'new-chat-btn'}
          onClick={onNewChat}
          aria-label="Nuevo chat"
          title="Nuevo chat"
        >
          {isCollapsed ? '＋' : '＋ Nuevo chat'}
        </button>

        {!isCollapsed && (
          <div className="conversation-list">
            {grouped.length === 0 && <p className="empty-history">Sin conversaciones aún</p>}
            {grouped.map(([label, items]) => (
              <div key={label} className="conv-group">
                <p className="conv-group-label">{label}</p>
                {items.map((conv) => (
                  <ConversationRow
                    key={conv.id}
                    conv={conv}
                    isActive={conv.id === activeId}
                    onSelect={onSelect}
                    onRename={onRename}
                    onTogglePin={onTogglePin}
                    onDelete={onDelete}
                    openMenuId={openMenuId}
                    setOpenMenuId={setOpenMenuId}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="sidebar-footer">
          <button
            type="button"
            className={isCollapsed ? 'icon-btn' : 'clear-session-btn'}
            onClick={onClearSession}
            aria-label="Borrar sesión"
            title="Borrar sesión"
          >
            {isCollapsed ? '⚙' : 'Borrar sesión'}
          </button>
        </div>
      </aside>
    </>
  );
}

// --- Componente principal ---
function App() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [syncWarning, setSyncWarning] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [theme, setTheme] = useState(loadTheme);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed);
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState(null);

  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const syncWarningTimeoutRef = useRef(null);

  const activeConversation = conversations.find((c) => c.id === activeId) || null;
  const hasMessages = !!activeConversation && activeConversation.messages.length > 0;

  // --- Cargar conversaciones al iniciar ---
  useEffect(() => {
    const stored = loadConversations();
    setConversations(stored);
    const lastActive = localStorage.getItem(ACTIVE_KEY);
    if (lastActive && stored.some((c) => c.id === lastActive)) {
      setActiveId(lastActive);
    } else if (stored.length > 0) {
      setActiveId(stored[0].id);
    }
  }, []);

  // --- Persistir conversaciones ---
  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  // --- Persistir conversación activa ---
  useEffect(() => {
    if (activeId) {
      localStorage.setItem(ACTIVE_KEY, activeId);
    }
  }, [activeId]);

  // --- Aplicar y persistir tema ---
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    saveTheme(theme);
  }, [theme]);

  // --- Persistir estado del sidebar colapsado ---
  useEffect(() => {
    saveSidebarCollapsed(sidebarCollapsed);
  }, [sidebarCollapsed]);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  // --- Autoscroll inteligente ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages, generating]);

  // --- Cerrar menú de conversación al hacer clic fuera ---
  useEffect(() => {
    if (!openMenuId) return undefined;
    const handleClickOutside = () => setOpenMenuId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openMenuId]);

  // --- Configurar Web Speech API ---
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return undefined;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInputValue((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {
        // ya detenido
      }
    };
  }, []);

  const toggleListening = () => {
    if (!speechSupported || !recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setListening(true);
      } catch {
        setListening(false);
      }
    }
  };

  const showSyncWarning = () => {
    setSyncWarning(true);
    if (syncWarningTimeoutRef.current) clearTimeout(syncWarningTimeoutRef.current);
    syncWarningTimeoutRef.current = setTimeout(() => setSyncWarning(false), 4000);
  };

  useEffect(() => {
    return () => {
      if (syncWarningTimeoutRef.current) clearTimeout(syncWarningTimeoutRef.current);
    };
  }, []);

  const handleNewChat = () => {
    const newConv = {
      id: generateId(),
      title: 'Nueva conversación',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinned: false,
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveId(newConv.id);
    setError(null);
    setSidebarOpen(false);
  };

  const handleSelectConversation = (id) => {
    setActiveId(id);
    setError(null);
    setSidebarOpen(false);
  };

  const handleClearSession = () => {
    const confirmed = window.confirm(
      '¿Seguro que deseas borrar todas las conversaciones almacenadas? Esta acción no se puede deshacer.'
    );
    if (!confirmed) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ACTIVE_KEY);
    setConversations([]);
    setActiveId(null);
    setError(null);
  };

  const handleRenameConversation = (id, newTitle) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: newTitle, updatedAt: Date.now() } : c))
    );
  };

  const handleTogglePin = (id) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)));
    setOpenMenuId(null);
  };

  const handleDeleteConversation = (id) => {
    const conv = conversations.find((c) => c.id === id);
    const confirmed = window.confirm(
      `¿Eliminar la conversación "${conv ? conv.title : ''}"? Esta acción no se puede deshacer.`
    );
    setOpenMenuId(null);
    if (!confirmed) return;
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const saveToSupabase = async (pregunta, respuesta) => {
    try {
      const { error: supaError } = await supabase
        .from('conversaciones')
        .insert([{ pregunta, respuesta }]);
      if (supaError) throw supaError;
    } catch {
      showSyncWarning();
    }
  };

  const buildGeminiHistory = (messages) =>
    messages
      .filter((m) => m.content && !m.failed)
      .map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));

  const handleSuggestionClick = (text) => {
    setInputValue(text);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || generating) return;

    let convId = activeId;
    let baseMessages = activeConversation ? activeConversation.messages : [];
    let isNewConversation = false;

    if (!convId) {
      convId = generateId();
      isNewConversation = true;
      baseMessages = [];
    }

    const userMessage = { id: generateId(), role: 'user', content: text, timestamp: Date.now() };
    const placeholderId = generateId();
    const placeholderMessage = {
      id: placeholderId,
      role: 'model',
      content: '',
      timestamp: Date.now(),
      streaming: true,
    };

    const updatedMessages = [...baseMessages, userMessage, placeholderMessage];

    setConversations((prev) => {
      if (isNewConversation) {
        const newConv = {
          id: convId,
          title: createTitle(text),
          messages: updatedMessages,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          pinned: false,
        };
        return [newConv, ...prev];
      }
      return prev.map((c) =>
        c.id === convId
          ? {
              ...c,
              messages: updatedMessages,
              title: c.messages.length === 0 ? createTitle(text) : c.title,
              updatedAt: Date.now(),
            }
          : c
      );
    });

    setActiveId(convId);
    setInputValue('');
    setError(null);
    setGenerating(true);
    setSidebarOpen(false);

    const updateAgentMessage = (content, extra = {}) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === placeholderId ? { ...m, content, ...extra } : m
                ),
              }
            : c
        )
      );
    };

    let accumulated = '';

    try {
      const history = buildGeminiHistory(baseMessages);
      const chat = model.startChat({ history });
      const result = await chat.sendMessageStream(text);

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          accumulated += chunkText;
          updateAgentMessage(accumulated);
        }
      }

      updateAgentMessage(accumulated, { streaming: false });
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, updatedAt: Date.now() } : c))
      );

      if (accumulated) {
        await saveToSupabase(text, accumulated);
      }
    } catch {
      updateAgentMessage(accumulated, { streaming: false, failed: true });
      setError('No se pudo completar la respuesta. Se conservó el contenido recibido hasta el momento.');
    } finally {
      setGenerating(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="app-container">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={handleSelectConversation}
        onNewChat={handleNewChat}
        onClearSession={handleClearSession}
        onRename={handleRenameConversation}
        onTogglePin={handleTogglePin}
        onDelete={handleDeleteConversation}
        isMobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        openMenuId={openMenuId}
        setOpenMenuId={setOpenMenuId}
      />

      <main className="main-area">
        <header className="top-bar">
          <button
            type="button"
            className="menu-toggle-btn mobile-only"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menú"
          >
            ☰
          </button>
          <span className="agent-name">
            <OrionLogo className="logo-img topbar-logo" /> Orion
          </span>
          <button
            type="button"
            className="theme-toggle-btn"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            title={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </header>

        <section className="messages-area">
          {!hasMessages ? (
            <div className="welcome-screen">
              <OrionLogo className="logo-img welcome-logo" />
              <h1>Orion</h1>
              <p className="welcome-subtitle">¿En qué puedo ayudarte?</p>
              <p className="welcome-description">
                Pregunta, crea, aprende o resuelve cualquier problema.
              </p>
              <div className="suggestion-grid">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.title}
                    type="button"
                    className="suggestion-card"
                    onClick={() => handleSuggestionClick(s.text)}
                  >
                    <span className="suggestion-icon">{s.icon}</span>
                    <span className="suggestion-title">{s.title}</span>
                    <span className="suggestion-text">{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {activeConversation.messages.map((msg, idx) => (
                <MessageBubble key={msg.id || `${activeConversation.id}-${idx}`} message={msg} />
              ))}
            </>
          )}
          <div ref={messagesEndRef} />
        </section>

        {error && <div className="error-banner">{error}</div>}
        {syncWarning && (
          <div className="sync-warning">
            No se pudo sincronizar con Supabase. La conversación continúa localmente.
          </div>
        )}

        <footer className="input-bar">
          <button
            type="button"
            className={`mic-btn ${listening ? 'listening' : ''}`}
            onClick={toggleListening}
            disabled={!speechSupported}
            aria-label={
              speechSupported
                ? listening
                  ? 'Detener grabación de voz'
                  : 'Iniciar grabación de voz'
                : 'Reconocimiento de voz no soportado'
            }
            title={
              speechSupported
                ? listening
                  ? 'Detener grabación'
                  : 'Iniciar grabación de voz'
                : 'Reconocimiento de voz no soportado'
            }
          >
            🎙️
          </button>

          <textarea
            ref={textareaRef}
            className="message-input"
            placeholder="Escribe un mensaje a Orion..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />

          <button
            type="button"
            className="send-btn"
            onClick={handleSend}
            disabled={!inputValue.trim() || generating}
            aria-label="Enviar mensaje"
          >
            ↑
          </button>
        </footer>
      </main>
    </div>
  );
}

export default App;