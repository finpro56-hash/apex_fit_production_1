/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Home, Apple, Dumbbell, TrendingUp, Bot, User, LogOut } from 'lucide-react';
import { auth, signOut } from '../firebase/config';

interface NavbarProps {
  activeTab: 'today' | 'food' | 'workout' | 'progress' | 'ai';
  setActiveTab: (tab: 'today' | 'food' | 'workout' | 'progress' | 'ai') => void;
  onOpenProfile: () => void;
  userEmail?: string | null;
  isGuest?: boolean;
  onSignOut?: () => void;
}

export function Navbar({ activeTab, setActiveTab, onOpenProfile, userEmail, isGuest, onSignOut }: NavbarProps) {
  const tabs = [
    { id: 'today', label: 'Today', icon: Home },
    { id: 'food', label: 'Food', icon: Apple },
    { id: 'workout', label: 'Workout', icon: Dumbbell },
    { id: 'progress', label: 'Progress', icon: TrendingUp },
    { id: 'ai', label: 'AI Coach', icon: Bot },
  ] as const;

  const handleSignOut = () => {
    if (onSignOut) {
      onSignOut();
    } else {
      signOut(auth);
    }
  };

  return (
    <>
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold shadow-md shadow-emerald-950">
            <Dumbbell className="w-4 h-4" />
          </div>
          <span className="text-base font-bold tracking-tight text-white">Apex Fit</span>
        </div>

        <div className="flex items-center gap-2">
          {isGuest && (
            <span className="text-[11px] font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-lg">
              Guest
            </span>
          )}
          <button
            onClick={onOpenProfile}
            className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            title="Profile & Goals"
          >
            <User className="w-4 h-4" />
          </button>
          <button
            onClick={handleSignOut}
            className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-red-400 hover:bg-slate-700 transition-colors"
            title={isGuest ? 'Exit Guest Mode' : 'Sign out'}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Fixed Bottom Tab Bar */}
      <nav aria-label="Bottom Navigation" className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 h-16 px-2 flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                isActive ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className={`w-5 h-5 mb-1 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.75]'}`} />
              <span className="text-[10px] tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
