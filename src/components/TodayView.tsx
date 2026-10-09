/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { FoodLogItem, UserGoals } from '../types';
import { Flame, Plus, Camera, Mic, ChevronRight, Apple } from 'lucide-react';
import { DateNavigator } from './DateNavigator';

interface TodayViewProps {
  foodLogs: FoodLogItem[];
  goals: UserGoals;
  selectedDate: string;
  onChangeDate: (date: string) => void;
  onNavigateTab: (tab: 'food' | 'ai') => void;
  onOpenScan: () => void;
  onOpenVoice: () => void;
  onOpenManual: () => void;
}

export function TodayView({
  foodLogs,
  goals,
  selectedDate,
  onChangeDate,
  onNavigateTab,
  onOpenScan,
  onOpenVoice,
  onOpenManual,
}: TodayViewProps) {
  // Filter food logs for selectedDate
  const dayFoodLogs = foodLogs.filter((item) => {
    const itemDate = item.date || (item.createdAt && typeof item.createdAt.toDate === 'function' ? item.createdAt.toDate().toISOString().split('T')[0] : selectedDate);
    return itemDate === selectedDate;
  });

  const totalCalories = dayFoodLogs.reduce((acc, item) => acc + (item.calories || 0), 0);
  const totalProtein = dayFoodLogs.reduce((acc, item) => acc + (item.proteinG || 0), 0);
  const totalCarbs = dayFoodLogs.reduce((acc, item) => acc + (item.carbsG || 0), 0);
  const totalFat = dayFoodLogs.reduce((acc, item) => acc + (item.fatG || 0), 0);

  const remainingCalories = Math.max(0, goals.calorieTarget - totalCalories);
  const caloriePercent = Math.min(100, Math.round((totalCalories / (goals.calorieTarget || 2000)) * 100));

  const meals = ['breakfast', 'lunch', 'snack', 'dinner'] as const;

  return (
    <div className="space-y-6 pb-24">
      <DateNavigator selectedDate={selectedDate} onChangeDate={onChangeDate} />

      {/* Hero Calorie Card */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Energy Balance</p>
            <h2 className="text-2xl font-extrabold text-white">Daily Dashboard</h2>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold tabular-nums">
            {caloriePercent}%
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 text-center">
            <p className="text-[10px] text-slate-400 uppercase">Consumed</p>
            <p className="text-lg font-bold text-white tabular-nums">{totalCalories}</p>
            <p className="text-[10px] text-slate-500">kcal</p>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 text-center">
            <p className="text-[10px] text-slate-400 uppercase">Remaining</p>
            <p className="text-lg font-bold text-emerald-400 tabular-nums">{remainingCalories}</p>
            <p className="text-[10px] text-slate-500">kcal</p>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 text-center">
            <p className="text-[10px] text-slate-400 uppercase">Target</p>
            <p className="text-lg font-bold text-slate-200 tabular-nums">{goals.calorieTarget}</p>
            <p className="text-[10px] text-slate-500">kcal</p>
          </div>
        </div>

        {/* Macros Progress */}
        <div className="space-y-3 pt-4 border-t border-slate-800/80">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-300 font-medium">Protein</span>
              <span className="text-slate-400 tabular-nums">{Math.round(totalProtein)} / {goals.proteinTarget}g</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, (totalProtein / goals.proteinTarget) * 100)}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-300 font-medium">Carbohydrates</span>
              <span className="text-slate-400 tabular-nums">{Math.round(totalCarbs)} / {goals.carbTarget}g</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-amber-500 rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, (totalCarbs / goals.carbTarget) * 100)}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-300 font-medium">Fat</span>
              <span className="text-slate-400 tabular-nums">{Math.round(totalFat)} / {goals.fatTarget}g</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-rose-500 rounded-full transition-all duration-500" 
                style={{ width: `${Math.min(100, (totalFat / goals.fatTarget) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Buttons */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={onOpenManual}
          className="flex flex-col items-center justify-center p-4 bg-slate-900 border border-slate-800 rounded-2xl hover:border-emerald-500/50 hover:bg-slate-850 transition-all group shadow-md"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
            <Plus className="w-5 h-5" />
          </div>
          <span className="text-xs font-semibold text-slate-200">Add Food</span>
        </button>

        <button
          onClick={onOpenScan}
          className="flex flex-col items-center justify-center p-4 bg-slate-900 border border-slate-800 rounded-2xl hover:border-blue-500/50 hover:bg-slate-850 transition-all group shadow-md"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
            <Camera className="w-5 h-5" />
          </div>
          <span className="text-xs font-semibold text-slate-200">Scan Food</span>
        </button>

        <button
          onClick={onOpenVoice}
          className="flex flex-col items-center justify-center p-4 bg-slate-900 border border-slate-800 rounded-2xl hover:border-purple-500/50 hover:bg-slate-850 transition-all group shadow-md"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
            <Mic className="w-5 h-5" />
          </div>
          <span className="text-xs font-semibold text-slate-200">Tell AI</span>
        </button>
      </div>

      {/* Meals Breakdown */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">Meals on Selected Date</h3>
          <button
            onClick={() => onNavigateTab('food')}
            className="text-xs font-medium text-emerald-400 flex items-center gap-1 hover:underline"
          >
            View all <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-3">
          {meals.map((mealType) => {
            const items = dayFoodLogs.filter((f) => f.mealType === mealType);
            const mealCals = items.reduce((sum, i) => sum + i.calories, 0);
            return (
              <div key={mealType} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400">
                    <Apple className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold capitalize text-white">{mealType}</h4>
                    <p className="text-xs text-slate-400">{items.length} items logged</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-white tabular-nums">{mealCals}</span>
                  <span className="text-xs text-slate-400 ml-1">kcal</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
