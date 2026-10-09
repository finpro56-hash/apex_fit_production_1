/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import { ProgressEntry, FoodLogItem, UserGoals } from '../types';
import { TrendingUp, Plus, Trash2, Scale, X, Activity, Flame, Calendar, Award, AlertCircle } from 'lucide-react';
import { db, auth } from '../firebase/config';
import { collection, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { ProgressEntrySchema, getZodErrorMessage } from '../lib/validation';
import { DarkDatePicker } from './DarkDatePicker';

interface ProgressViewProps {
  progressList: ProgressEntry[];
  setProgressList?: React.Dispatch<React.SetStateAction<ProgressEntry[]>>;
  foodLogs?: FoodLogItem[];
  goals?: UserGoals;
  onRefresh: () => void;
}

export function ProgressView({ progressList, setProgressList, foodLogs = [], goals, onRefresh }: ProgressViewProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [weightKg, setWeightKg] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; entry: ProgressEntry } | null>(null);
function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getEntryTimestamp(entry: ProgressEntry): number {
  if (entry.createdAt) {
    if (typeof entry.createdAt.toMillis === 'function') {
      return entry.createdAt.toMillis();
    }
    if (typeof entry.createdAt.toDate === 'function') {
      return entry.createdAt.toDate().getTime();
    }
    const t = new Date(entry.createdAt).getTime();
    if (!isNaN(t)) return t;
  }
  if (entry.date) {
    const t = new Date(`${entry.date}T12:00:00`).getTime();
    if (!isNaN(t)) return t;
  }
  return 0;
}

  const [hoveredCalBar, setHoveredCalBar] = useState<{ x: number; y: number; date: string; calories: number } | null>(null);
  const [entryDate, setEntryDate] = useState(getTodayString());

  // Memoized Sorts:
  // sortedAsc: Strictly Oldest -> Newest (chronological for left-to-right trend chart)
  const sortedAsc = useMemo(() => {
    return [...progressList].sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return getEntryTimestamp(a) - getEntryTimestamp(b);
    });
  }, [progressList]);

  // sortedDesc: Strictly Newest -> Oldest (for current weight summary and history feed)
  const sortedDesc = useMemo(() => {
    return [...progressList].sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      return getEntryTimestamp(b) - getEntryTimestamp(a);
    });
  }, [progressList]);

  const latestWeight = sortedDesc[0]?.weightKg || 70;
  const initialWeight = sortedAsc[0]?.weightKg || latestWeight;
  const weightDiff = Math.round((latestWeight - initialWeight) * 10) / 10;

  // Memoized Weight Chart Coordinate Calculation
  const chartWidth = 500;
  const chartHeight = 180;
  const padding = 35;

  const chartCalculations = useMemo(() => {
    const weights = sortedAsc.map((p) => p.weightKg);
    const minW = Math.floor(Math.min(...(weights.length ? weights : [60])) - 2);
    const maxW = Math.ceil(Math.max(...(weights.length ? weights : [80])) + 2);

    const points = sortedAsc.map((entry, index) => {
      const x = padding + (index / Math.max(1, sortedAsc.length - 1)) * (chartWidth - padding * 2);
      const y = chartHeight - padding - ((entry.weightKg - minW) / (maxW - minW || 1)) * (chartHeight - padding * 2);
      return { x, y, entry };
    });

    const pathD = points.length > 0
      ? points.reduce((acc, p, i) => (i === 0 ? `M ${p.x},${p.y}` : `${acc} L ${p.x},${p.y}`), '')
      : '';

    const areaD = points.length > 0
      ? `${pathD} L ${points[points.length - 1].x},${chartHeight - padding} L ${points[0].x},${chartHeight - padding} Z`
      : '';

    return { minW, maxW, points, pathD, areaD };
  }, [sortedAsc]);

  // Memoized Calorie Breakdown (Last 7 Days)
  const calorieTarget = goals?.calorieTarget || 2200;
  const calorieChartData = useMemo(() => {
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      days.push(`${year}-${month}-${day}`);
    }

    const data = days.map((dateStr) => {
      const dayLogs = foodLogs.filter((f) => f.date === dateStr);
      const totalCals = dayLogs.reduce((acc, curr) => acc + (curr.calories || 0), 0);
      return {
        date: dateStr,
        shortDate: dateStr.slice(5),
        calories: totalCals,
      };
    });

    const maxVal = Math.max(calorieTarget * 1.25, ...data.map((d) => d.calories), 2500);
    return { data, maxVal };
  }, [foodLogs, calorieTarget]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSyncError(null);

    const dateToSave = entryDate || getTodayString();
    const parsedWeight = parseFloat(weightKg);
    const parsedBf = bodyFat ? parseFloat(bodyFat) : null;

    const validation = ProgressEntrySchema.safeParse({
      date: dateToSave,
      weightKg: parsedWeight,
      bodyFatPercentage: parsedBf,
      notes: notes.trim(),
    });

    if (!validation.success) {
      setFormError(getZodErrorMessage(validation.error));
      return;
    }

    const tempId = `temp_prog_${Date.now()}`;
    const optimisticEntry: ProgressEntry = {
      id: tempId,
      ...validation.data,
      createdAt: new Date(),
    };

    // 0ms Optimistic Update
    if (setProgressList) {
      setProgressList((prev) => [optimisticEntry, ...prev]);
    }

    setWeightKg('');
    setBodyFat('');
    setNotes('');
    setEntryDate(getTodayString());
    setIsAddOpen(false);

    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        const docRef = await addDoc(collection(db, 'users', uid, 'progress'), {
          ...validation.data,
          createdAt: serverTimestamp(),
        });

        if (setProgressList) {
          setProgressList((prev) =>
            prev.map((item) => (item.id === tempId ? { ...item, id: docRef.id } : item))
          );
        }
      }
    } catch (err) {
      console.error('Error adding progress entry:', err);
      setSyncError('Failed to save weight record to server. Reverting.');
      if (setProgressList) {
        setProgressList((prev) => prev.filter((item) => item.id !== tempId));
      }
    }
  };

  const handleDelete = useCallback(
    async (id?: string) => {
      if (!id) return;
      setSyncError(null);

      const deletedEntry = progressList.find((p) => p.id === id);

      // 0ms Optimistic Removal
      if (setProgressList) {
        setProgressList((prev) => prev.filter((p) => p.id !== id));
      }

      try {
        const uid = auth.currentUser?.uid;
        if (uid && !id.startsWith('temp_')) {
          await deleteDoc(doc(db, 'users', uid, 'progress', id));
        }
      } catch (err) {
        console.error('Error deleting progress entry:', err);
        setSyncError('Failed to delete entry on server. Restoring.');
        if (deletedEntry && setProgressList) {
          setProgressList((prev) => [deletedEntry, ...prev]);
        }
      }
    },
    [progressList, setProgressList]
  );

  return (
    <div className="space-y-6 pb-24">
      {syncError && (
        <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-2xl flex items-center gap-2 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{syncError}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-white">Progress Analytics</h2>
          <p className="text-xs text-slate-400">Track body weight progression and daily calorie target compliance.</p>
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
          className="p-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 transition-colors flex items-center gap-1.5 text-xs font-semibold shadow-lg shadow-emerald-950"
        >
          <Plus className="w-4 h-4" /> Log Weight
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-400">Current Weight</span>
            <Scale className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-extrabold text-white tabular-nums">
            {latestWeight} <span className="text-sm font-normal text-slate-400">kg</span>
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-400">Total Change</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <p className={`text-2xl font-extrabold tabular-nums ${weightDiff <= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {weightDiff > 0 ? `+${weightDiff}` : weightDiff} <span className="text-sm font-normal text-slate-400">kg</span>
          </p>
        </div>
      </div>

      {/* 1. Body Weight Progression Line Chart (Memoized) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl relative">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">Body Weight Progression</h3>
          </div>
          <span className="text-xs text-slate-400">{sortedAsc.length} logged entries</span>
        </div>

        {sortedAsc.length < 2 ? (
          <div className="text-center py-10 bg-slate-950/50 rounded-2xl border border-slate-800/80 p-4">
            <Scale className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-400">Log at least 2 weight entries to view your body weight progression line chart!</p>
          </div>
        ) : (
          <div className="relative">
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto overflow-visible">
              <defs>
                <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Y Axis Guide Lines */}
              <line x1={padding} y1={padding} x2={chartWidth - padding} y2={padding} stroke="#334155" strokeDasharray="3 3" strokeWidth="0.8" />
              <line x1={padding} y1={chartHeight / 2} x2={chartWidth - padding} y2={chartHeight / 2} stroke="#334155" strokeDasharray="3 3" strokeWidth="0.8" />
              <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="#334155" strokeWidth="1" />

              {/* Y Axis Labels */}
              <text x={padding - 6} y={padding + 4} fill="#94a3b8" fontSize="9" textAnchor="end">{chartCalculations.maxW} kg</text>
              <text x={padding - 6} y={chartHeight - padding + 4} fill="#94a3b8" fontSize="9" textAnchor="end">{chartCalculations.minW} kg</text>

              {/* Gradient Area & Line */}
              <path d={chartCalculations.areaD} fill="url(#weightGradient)" />
              <path d={chartCalculations.pathD} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

              {/* Interactive Point Nodes */}
              {chartCalculations.points.map((p, idx) => (
                <g key={idx} className="cursor-pointer">
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="5"
                    fill="#10b981"
                    stroke="#0f172a"
                    strokeWidth="2"
                    className="hover:r-7 transition-all"
                    onMouseEnter={() => setHoveredPoint(p)}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                  {(idx === 0 || idx === chartCalculations.points.length - 1) && (
                    <text x={p.x} y={chartHeight - 10} fill="#64748b" fontSize="8" textAnchor="middle">
                      {p.entry.date.slice(5)}
                    </text>
                  )}
                </g>
              ))}
            </svg>

            {/* Tooltip Overlay */}
            {hoveredPoint && (
              <div
                className="absolute bg-slate-800 border border-slate-700 text-white text-xs px-3 py-1.5 rounded-xl shadow-2xl pointer-events-none transform -translate-x-1/2 -translate-y-full -mt-2 z-10"
                style={{ left: `${(hoveredPoint.x / chartWidth) * 100}%`, top: `${(hoveredPoint.y / chartHeight) * 100}%` }}
              >
                <p className="font-bold text-emerald-400">{hoveredPoint.entry.weightKg} kg</p>
                <p className="text-[10px] text-slate-300">{hoveredPoint.entry.date}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Daily Calorie Intake vs Target Compliance Chart (Memoized) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl relative">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-base font-bold text-white">Daily Calorie Intake vs Target</h3>
              <p className="text-xs text-slate-400">Target: {calorieTarget} kcal/day</p>
            </div>
          </div>
          <span className="text-[10px] bg-slate-800 border border-slate-700 text-slate-300 px-2.5 py-1 rounded-lg font-medium">
            Last 7 Days
          </span>
        </div>

        <div className="relative pt-2">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto overflow-visible">
            {/* Target Line */}
            {(() => {
              const targetY = chartHeight - padding - ((calorieTarget / calorieChartData.maxVal) * (chartHeight - padding * 2));
              return (
                <>
                  <line
                    x1={padding}
                    y1={targetY}
                    x2={chartWidth - padding}
                    y2={targetY}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    strokeWidth="1.5"
                  />
                  <text x={chartWidth - padding + 4} y={targetY + 3} fill="#f59e0b" fontSize="8" fontWeight="bold">
                    Target
                  </text>
                </>
              );
            })()}

            {/* Grid Bottom Line */}
            <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="#334155" strokeWidth="1" />

            {/* Bar Charts */}
            {calorieChartData.data.map((d, idx) => {
              const barWidth = 24;
              const step = (chartWidth - padding * 2) / calorieChartData.data.length;
              const x = padding + idx * step + (step - barWidth) / 2;
              const barHeight = Math.max(4, (d.calories / calorieChartData.maxVal) * (chartHeight - padding * 2));
              const y = chartHeight - padding - barHeight;
              const isOverTarget = d.calories > calorieTarget;

              return (
                <g
                  key={d.date}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredCalBar({ x: x + barWidth / 2, y, date: d.date, calories: d.calories })}
                  onMouseLeave={() => setHoveredCalBar(null)}
                >
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx="4"
                    fill={d.calories === 0 ? '#334155' : isOverTarget ? '#ef4444' : '#10b981'}
                    className="hover:opacity-80 transition-opacity"
                  />
                  <text x={x + barWidth / 2} y={chartHeight - 12} fill="#94a3b8" fontSize="8" textAnchor="middle">
                    {d.shortDate}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Calorie Tooltip Overlay */}
          {hoveredCalBar && (
            <div
              className="absolute bg-slate-800 border border-slate-700 text-white text-xs px-3 py-1.5 rounded-xl shadow-2xl pointer-events-none transform -translate-x-1/2 -translate-y-full -mt-2 z-10"
              style={{ left: `${(hoveredCalBar.x / chartWidth) * 100}%`, top: `${(hoveredCalBar.y / chartHeight) * 100}%` }}
            >
              <p className="font-bold text-amber-400">{hoveredCalBar.calories} kcal</p>
              <p className="text-[10px] text-slate-300">{hoveredCalBar.date}</p>
            </div>
          )}
        </div>
      </div>

      {/* 3. Weight Log History */}
      <div className="space-y-3">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Calendar className="w-4 h-4 text-emerald-400" />
          Weight Log History
        </h3>

        {sortedDesc.length === 0 ? (
          <div className="text-center py-12 bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <Scale className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-300">No weight entries logged yet</p>
            <p className="text-xs text-slate-500 mt-1">Tap Log Weight above to record your body weight.</p>
          </div>
        ) : (
          sortedDesc.map((entry) => (
            <div key={entry.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:border-slate-700 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white tabular-nums">{entry.weightKg} kg</h4>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                    <span>{entry.date}</span>
                    {entry.bodyFatPercentage && (
                      <>
                        <span aria-hidden="true" className="text-slate-600">·</span>
                        <span>BF: {entry.bodyFatPercentage}%</span>
                      </>
                    )}
                    {entry.notes && (
                      <>
                        <span aria-hidden="true" className="text-slate-600">·</span>
                        <span className="truncate max-w-[180px]">{entry.notes}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDelete(entry.id)}
                className="p-2 rounded-xl text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
                title="Delete weight entry"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add Weight Progress Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold">Log Body Weight</h3>
              <button onClick={() => setIsAddOpen(false)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-red-950/60 border border-red-800/80 rounded-2xl flex items-center gap-2 text-xs text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <DarkDatePicker
                label="Date"
                value={entryDate}
                maxDate={getTodayString()}
                onChange={setEntryDate}
              />

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Weight (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 75.5"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 tabular-nums"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Body Fat % (Optional)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 18.5"
                  value={bodyFat}
                  onChange={(e) => setBodyFat(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 tabular-nums"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Morning weigh-in fasting"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm flex items-center justify-center gap-2 mt-6 shadow-lg shadow-emerald-950"
              >
                <Plus className="w-4 h-4" />
                {submitting ? 'Saving...' : 'Save Weight Log'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
