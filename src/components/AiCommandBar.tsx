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
  isFinal: boolean;
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
    const SpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }

    const recognition = new (SpeechRecognition as typeof SpeechRecognition)() as SpeechRecognition;
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
      let transcript = '';
      for (let i = speechEvent.resultIndex; i < speechEvent.results.length; i++) {
        transcript += speechEvent.results[i][0].transcript;
      }
      if (speechEvent.isFinal) {
        setInput(transcript);
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

      // Handle UI state changes from tool execution
      if (response.includes('NAVIGATE')) {
        // Extract route from response and navigate
        const routeMatch = response.match(/route[:\s]+["']([^"']+)["']/i);
        if (routeMatch) {
          navigate(routeMatch[1]);
          ui.setNavigation(routeMatch[1]);
        }
      }

      if (response.includes('FILTER_LIST') || response.includes('filter')) {
        const courseMatch = response.match(/TFS\s*\d+|course[:\s]+([A-Z]+\s*\d+)/i);
        if (courseMatch) {
          ui.setCourseFilter(courseMatch[0]);
        }
      }

      if (response.includes('OPEN_BLITZ_MODAL') || response.includes('blitz')) {
        ui.triggerBlitzModal(true);
      }

      if (response.includes('success') || response.includes('enrolled') || response.includes('created')) {
        toast.success('Command executed successfully');
      }

      toast.success('Command processed');
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
    <div className="fixed bottom-6 right-6 z-50 w-96 max-h-96 bg-white shadow-2xl rounded-xl border border-slate-200 flex flex-col transition-all duration-300">
      {/* Header */}
      <div 
        className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-50 to-blue-100 rounded-t-xl cursor-pointer hover:from-blue-100 hover:to-blue-150"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
          <span className="font-semibold text-sm text-slate-800">Presensys AI Command</span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            ui.setAiCommandBarVisibility(false);
          }}
          className="text-slate-500 hover:text-slate-700 text-lg"
        >
          ✕
        </button>
      </div>

      {/* Messages Display */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
        {messages.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-8">
            <div className="text-2xl mb-2">🤖</div>
            <p>No commands yet. Try:</p>
            <p className="text-xs mt-2 text-slate-400">
              "Filter view to TFS 214"<br />
              "Show Dr Okadigwe's timeslot"<br />
              "Enroll John Doe to TFS 214"
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : 'bg-slate-200 text-slate-800 rounded-bl-none'
                }`}
              >
                <p>{msg.content}</p>
                {showTimestamp && (
                  <p className={`text-xs mt-1 ${
                    msg.role === 'user' ? 'text-blue-200' : 'text-slate-500'
                  }`}>
                    {formatTime(msg.timestamp)}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-200 text-slate-800 px-3 py-2 rounded-lg text-sm rounded-bl-none">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"></span>
                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="border-t p-3 bg-white rounded-b-xl space-y-2">
        <div className="flex items-center gap-2 bg-slate-50 rounded-lg border border-slate-200 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tell Presensys what to do..."
            className="flex-1 px-3 py-2 bg-transparent focus:outline-none text-sm text-slate-800 placeholder-slate-400"
            disabled={isLoading || isVoiceListening}
          />
          <button
            type="button"
            onClick={triggerVoiceCapture}
            className={`px-2 py-2 transition-colors ${
              isVoiceListening
                ? 'text-red-600 hover:text-red-700'
                : 'text-slate-400 hover:text-blue-600'
            }`}
            title={isVoiceListening ? 'Stop listening' : 'Start voice input'}
            disabled={isLoading}
          >
            {isVoiceListening ? '🔴' : '🎙️'}
          </button>
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-slate-300 text-sm font-medium transition-colors"
          >
            {isLoading ? '⏳' : '→'}
          </button>
        </div>

        {/* Quick actions */}
        <div className="flex gap-1 flex-wrap text-xs">
          <button
            type="button"
            onClick={() => setShowTimestamp(!showTimestamp)}
            className="px-2 py-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition-colors"
            title="Toggle timestamps"
          >
            🕐
          </button>
          <button
            type="button"
            onClick={() => setMessages([])}
            className="px-2 py-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition-colors"
            title="Clear history"
          >
            🗑️
          </button>
          <button
            type="button"
            onClick={() => {
              setInput('Filter view to TFS 214');
            }}
            className="px-2 py-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition-colors flex-1"
            title="Example command"
          >
            📋 TFS 214
          </button>
        </div>
      </form>
    </div>
  );
}
