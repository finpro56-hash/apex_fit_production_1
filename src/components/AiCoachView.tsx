/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ChatMessage, FoodLogItem, WorkoutSession, UserGoals, UserProfile } from '../types';
import { Bot, Send, Sparkles, User, Loader2 } from 'lucide-react';
import { authFetch } from '../lib/authFetch';

interface AiCoachViewProps {
  foodLogs: FoodLogItem[];
  sessions: WorkoutSession[];
  goals: UserGoals;
  profile: UserProfile;
}

export function AiCoachView({ foodLogs, sessions, goals, profile }: AiCoachViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg_welcome',
      role: 'assistant',
      content: 'Hello! I am Apex Coach. I provide general fitness and nutrition guidance for adults. I can help with meals, workouts, macros, and progress—while keeping in mind that AI estimates are not medical advice.',
      createdAt: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsgText = input.trim();
    setInput('');
    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: userMsgText,
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const today = new Date();
      const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const context = {
        profile,
        goals,
        todayFoodLogs: foodLogs.filter((item) => item.date === todayDate).slice(0, 50),
        recentWorkouts: sessions.slice(0, 5),
      };

      const res = await authFetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsgText, context }),
      });
      const data = await res.json();

      if (res.ok) {
        const aiMsg: ChatMessage = {
          id: `ai_${Date.now()}`,
          role: 'assistant',
          content: data.reply || 'Keep pushing towards your goals!',
          createdAt: Date.now(),
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        throw new Error(data.error || 'Failed to get AI response');
      }
    } catch (err: any) {
      console.error('AI Chat error:', err);
      const errMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error connecting to the AI coach. Please try again.',
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] pb-16">
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <div className="p-2 rounded-xl bg-emerald-600/20 text-emerald-400">
          <Bot className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-white">Apex AI Coach</h2>
          <p className="text-xs text-slate-400">General fitness & nutrition guidance. Not medical advice.</p>
        </div>
      </div>

      <div className="mb-3 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-[11px] text-slate-400">
        AI guidance is informational. For injuries, symptoms, pregnancy, eating disorders, medication questions, or urgent concerns, consult a qualified healthcare professional.
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div key={msg.id} className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  isUser ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-emerald-400 border border-slate-700'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div
                className={`max-w-[80%] rounded-2xl p-4 text-sm leading-relaxed ${
                  isUser
                    ? 'bg-emerald-600 text-white rounded-tr-none'
                    : 'bg-slate-900 border border-slate-800 text-slate-100 rounded-tl-none shadow-md'
                }`}
              >
                {msg.content}
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-800 text-emerald-400 border border-slate-700 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm text-slate-300 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" /> Thinking...
            </div>
          </div>
        )}
      </div>

      {/* Input Bar */}
      <form onSubmit={handleSend} className="shrink-0 flex gap-2">
        <input
          type="text"
          placeholder="Ask about your diet, workouts, or macros..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 shadow-inner"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="w-12 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-950 disabled:opacity-50 transition-all shrink-0"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}
