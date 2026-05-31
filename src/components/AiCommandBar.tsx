import React, { useState, useRef, useEffect } from 'react';
import { useUiStore } from '../store/useUiStore';
import { executeAiCommand } from '../lib/aiService';
import { useAuthStore } from '../store/useAuthStore';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

interface CommandMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// Type declarations for Web Speech API
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  onresult: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export default function AiCommandBar() {
  const navigate = useNavigate();
  const { profile, session } = useAuthStore();
  const ui = useUiStore();

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<CommandMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTimestamp, setShowTimestamp] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Auto-scroll to latest message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize Web Speech API
  useEffect(() => {
    const win = window as unknown as Record<string, unknown>;
    const SpeechRecognitionConstructor = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognitionConstructor || typeof SpeechRecognitionConstructor !== 'function') {
      return;
    }

    try {
      const recognition = new (SpeechRecognitionConstructor as new () => SpeechRecognition)();
      recognitionRef.current = recognition;
      recognition.lang = 'en-NG'; // Nigerian English
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsVoiceListening(true);
      };

      recognition.onend = () => {
        setIsVoiceListening(false);
      };

      recognition.onresult = (event: Event) => {
        const speechEvent = event as SpeechRecognitionEvent;
        // let transcript = '';
        let finalTranscript = '';

        for (let i = speechEvent.resultIndex; i < speechEvent.results.length; i++) {
          const result = speechEvent.results[i];
          const currentTranscript = result[0].transcript;

          if (result.isFinal) {
            finalTranscript += currentTranscript;
          } else {
            // transcript += currentTranscript;
          }
        }

        // Only set input when we have a final result
        if (finalTranscript) {
          setInput(finalTranscript);
        }
      };

      recognition.onerror = (event: Event) => {
        const errorEvent = event as SpeechRecognitionErrorEvent;
        console.error('Speech recognition error:', errorEvent.error);
        toast.error(`Voice error: ${errorEvent.error}`);
        setIsVoiceListening(false);
      };

      return () => {
        if (recognitionRef.current) {
          recognitionRef.current.abort();
        }
      };
    } catch (error) {
      console.error('Failed to initialize speech recognition:', error);
    }
  }, []);

  // Handle voice input
  const triggerVoiceCapture = () => {
    if (!recognitionRef.current) {
      toast.error('Browser does not support speech recognition');
      return;
    }

    if (isVoiceListening) {
      recognitionRef.current.stop();
      setIsVoiceListening(false);
    } else {
      try {
        recognitionRef.current.start();
      } catch (error) {
        console.error('Error starting speech recognition:', error);
      }
    }
  };

  // Handle command submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim()) return;

    if (!session || !profile) {
      toast.error('You must be logged in to use AI commands');
      return;
    }

    // Add user message to display
    const userMessage: CommandMessage = {
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await executeAiCommand(
        input,
        session.user.id,
        ui.currentView
      );

      // Parse response to extract tool execution results
      const assistantMessage: CommandMessage = {
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Only show toast if no more specific action was taken
      let actionTaken = false;

      // Handle UI state changes from tool execution
      if (response.includes('NAVIGATE')) {
        // Extract route from response and navigate
        const routeMatch = response.match(/route[:\s]+["']([^"']+)["']/i);
        if (routeMatch) {
          navigate(routeMatch[1]);
          ui.setNavigation(routeMatch[1]);
          actionTaken = true;
        }
      }

      if (response.includes('FILTER_LIST')) {
        const courseMatch = response.match(/TFS\s*\d+|course[:\s]+([A-Z]+\s*\d+)/i);
        if (courseMatch) {
          ui.setCourseFilter(courseMatch[0]);
          actionTaken = true;
        }
      }

      if (response.includes('OPEN_BLITZ_MODAL')) {
        ui.triggerBlitzModal(true);
        actionTaken = true;
      }

      // Only show success toast if no specific UI action was taken
      if (!actionTaken) {
        toast.success('Command executed successfully');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      const assistantMessage: CommandMessage = {
        role: 'assistant',
        content: `Error: ${errorMessage}. Please check your API key or try again.`,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Format timestamp for display
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-NG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  if (!ui.isAiCommandBarVisible) {
    return null;
  }

  return (
    <div className="position-fixed d-flex flex-column bg-white shadow-lg rounded-4 border" style={{ bottom: '24px', right: '24px', left: 'auto', width: 'calc(100vw - 48px)', maxWidth: '400px', maxHeight: '400px', zIndex: 50, borderColor: 'var(--border-color)' }}>
      {/* Header */}
      <div
        className="d-flex align-items-center justify-content-between p-3 border-bottom rounded-top-4"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ cursor: 'pointer', backgroundColor: 'var(--bg-gray)', borderColor: 'var(--border-color)' }}
      >
        <div className="d-flex align-items-center gap-2">
          <div className="position-relative" style={{ width: '8px', height: '8px', backgroundColor: 'var(--primary-blue)', borderRadius: '50%', animation: 'pulse 2s infinite' }}></div>
          <span className="fw-semibold small" style={{ color: 'var(--text-dark)' }}>Presensys AI Command</span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            ui.setAiCommandBarVisibility(false);
          }}
          className="btn btn-link p-0"
          style={{ color: 'var(--text-muted)', fontSize: '18px' }}
          aria-label="Close AI Command Bar"
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* Messages Display */}
      <div className="flex-grow-1 overflow-y-auto p-3 d-flex flex-column gap-3" style={{ backgroundColor: 'var(--soft-white)' }}>
        {messages.length === 0 ? (
          <div className="text-center" style={{ color: 'var(--text-muted)', fontSize: '14px', paddingTop: '32px' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🤖</div>
            <p>No commands yet. Try:</p>
            <p className="xx-small" style={{ color: 'var(--text-muted)', marginTop: '8px', fontSize: '12px' }}>
              "Filter view to TFS 214"<br />
              "Show Dr Okadigwe's timeslot"<br />
              "Enroll John Doe to TFS 214"
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`d-flex ${msg.role === 'user' ? 'justify-content-end' : 'justify-content-start'}`}
            >
              <div
                className="px-3 py-2 rounded"
                style={{
                  maxWidth: '300px',
                  fontSize: '14px',
                  backgroundColor: msg.role === 'user' ? 'var(--primary-blue)' : '#e2e8f0',
                  color: msg.role === 'user' ? 'white' : 'var(--text-dark)',
                  borderBottomLeftRadius: msg.role === 'user' ? '4px' : '0px',
                  borderBottomRightRadius: msg.role === 'user' ? '0px' : '4px',
                }}
              >
                <p className="mb-1">{msg.content}</p>
                {showTimestamp && (
                  <p className="xx-small mb-0" style={{
                    fontSize: '12px',
                    marginTop: '4px',
                    color: msg.role === 'user' ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)'
                  }}>
                    {formatTime(msg.timestamp)}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="d-flex justify-content-start">
            <div className="px-3 py-2 rounded" style={{ backgroundColor: '#e2e8f0', color: 'var(--text-dark)', fontSize: '14px', borderBottomLeftRadius: '0px', borderBottomRightRadius: '4px' }}>
              <div className="d-flex gap-1">
                <span className="d-inline-block" style={{ width: '8px', height: '8px', backgroundColor: 'var(--text-muted)', borderRadius: '50%', animation: 'bounce 1.4s infinite' }}></span>
                <span className="d-inline-block" style={{ width: '8px', height: '8px', backgroundColor: 'var(--text-muted)', borderRadius: '50%', animation: 'bounce 1.4s infinite 0.1s' }}></span>
                <span className="d-inline-block" style={{ width: '8px', height: '8px', backgroundColor: 'var(--text-muted)', borderRadius: '50%', animation: 'bounce 1.4s infinite 0.2s' }}></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="border-top p-3" style={{ backgroundColor: 'white', borderColor: 'var(--border-color)' }}>
        <div className="mb-2 d-flex align-items-center gap-2 rounded-3" style={{ backgroundColor: 'var(--bg-gray)', border: '1px solid var(--border-color)', padding: '0' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tell Presensys what to do..."
            className="form-control border-0 bg-transparent focus-ring-0"
            style={{ fontSize: '14px' }}
            disabled={isLoading || isVoiceListening}
          />
          <button
            type="button"
            onClick={triggerVoiceCapture}
            className="btn btn-link p-2"
            style={{
              color: isVoiceListening ? 'var(--text-danger)' : 'var(--text-muted)',
            }}
            title={isVoiceListening ? 'Stop listening' : 'Start voice input'}
            disabled={isLoading}
          >
            {isVoiceListening ? '🔴' : '🎙️'}
          </button>
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="btn btn-primary px-3 py-2 m-1"
            style={{ fontSize: '14px' }}
          >
            {isLoading ? '⏳' : '→'}
          </button>
        </div>

        {/* Quick actions */}
        <div className="d-flex gap-1 flex-wrap" style={{ fontSize: '12px' }}>
          <button
            type="button"
            onClick={() => setShowTimestamp(!showTimestamp)}
            className="btn btn-sm"
            style={{ backgroundColor: 'var(--bg-gray)', color: 'var(--text-dark)', border: 'none' }}
            title="Toggle timestamps"
          >
            🕐
          </button>
          <button
            type="button"
            onClick={() => setMessages([])}
            className="btn btn-sm"
            style={{ backgroundColor: 'var(--bg-gray)', color: 'var(--text-dark)', border: 'none' }}
            title="Clear history"
          >
            🗑️
          </button>
          <button
            type="button"
            onClick={() => {
              setInput('Filter view to TFS 214');
            }}
            className="btn btn-sm flex-grow-1"
            style={{ backgroundColor: 'var(--bg-gray)', color: 'var(--text-dark)', border: 'none' }}
            title="Example command"
          >
            📋 TFS 214
          </button>
        </div>
      </form>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}
