/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import { FoodLogItem } from '../types';
import { Plus, Camera, Mic, Trash2, Apple, Sparkles, Check, X, Loader2, AlertCircle } from 'lucide-react';
import { db, auth } from '../firebase/config';
import { collection, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { DateNavigator } from './DateNavigator';
import { FoodLogItemSchema, getZodErrorMessage } from '../lib/validation';
import { authFetch } from '../lib/authFetch';

interface FoodViewProps {
  foodLogs: FoodLogItem[];
  setFoodLogs?: React.Dispatch<React.SetStateAction<FoodLogItem[]>>;
  selectedDate: string;
  onChangeDate: (date: string) => void;
  onRefresh: () => void;
  isScanOpen: boolean;
  setIsScanOpen: (open: boolean) => void;
  isVoiceOpen: boolean;
  setIsVoiceOpen: (open: boolean) => void;
}

export function FoodView({
  foodLogs,
  setFoodLogs,
  selectedDate,
  onChangeDate,
  onRefresh,
  isScanOpen,
  setIsScanOpen,
  isVoiceOpen,
  setIsVoiceOpen,
}: FoodViewProps) {
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('lunch');
  const [foodName, setFoodName] = useState('');
  const [portion, setPortion] = useState('1 serving');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [estimating, setEstimating] = useState(false);

  // AI Scan & Voice states
  const [analyzing, setAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [textInput, setTextInput] = useState('');

  // Memoized filter for food logs on selectedDate
  const dayFoodLogs = useMemo(() => {
    return foodLogs.filter((item) => {
      const itemDate =
        item.date ||
        (item.createdAt && typeof item.createdAt.toDate === 'function'
          ? (() => { const d = item.createdAt.toDate(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })()
          : selectedDate);
      return itemDate === selectedDate;
    });
  }, [foodLogs, selectedDate]);

  // Macro Summary for selectedDate
  const totalNutrients = useMemo(() => {
    return dayFoodLogs.reduce(
      (acc, curr) => ({
        calories: acc.calories + (curr.calories || 0),
        protein: acc.protein + (curr.proteinG || 0),
        carbs: acc.carbs + (curr.carbsG || 0),
        fat: acc.fat + (curr.fatG || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [dayFoodLogs]);

  const handleAutoEstimate = async () => {
    if (!foodName.trim()) return;
    setEstimating(true);
    setManualError(null);
    try {
      const res = await authFetch('/api/estimate-food', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foodName: foodName.trim(), quantity: portion.trim() }),
      });
      const contentType = res.headers.get('content-type') || '';
      let data: any = {};
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(text.slice(0, 120) || `Server returned status ${res.status}`);
      }

      if (res.ok) {
        setCalories(String(data.calories ?? ''));
        setProtein(String(data.protein_g ?? ''));
        setCarbs(String(data.carbs_g ?? ''));
        setFat(String(data.fat_g ?? ''));
      } else {
        setManualError(data.error || 'Failed to estimate macros');
      }
    } catch (err: any) {
      console.error('Estimation error:', err);
      setManualError(err.message || 'Failed to estimate macros');
    } finally {
      setEstimating(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);
    setSyncError(null);

    const rawItem = {
      mealType,
      foodName: foodName.trim(),
      portion: portion.trim() || '1 serving',
      calories: parseInt(calories) || 0,
      proteinG: parseFloat(protein) || 0,
      carbsG: parseFloat(carbs) || 0,
      fatG: parseFloat(fat) || 0,
      source: 'manual' as const,
      userConfirmed: true,
    };

    const validation = FoodLogItemSchema.safeParse(rawItem);
    if (!validation.success) {
      setManualError(getZodErrorMessage(validation.error));
      return;
    }

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const optimisticItem: FoodLogItem = {
      id: tempId,
      date: selectedDate,
      ...validation.data,
      createdAt: new Date(),
    };

    // 0ms Optimistic UI update
    if (setFoodLogs) {
      setFoodLogs((prev) => [optimisticItem, ...prev]);
    }

    // Reset inputs immediately
    setFoodName('');
    setPortion('1 serving');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
    setIsManualOpen(false);

    // Sync to Firestore in background
    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        const docRef = await addDoc(collection(db, 'users', uid, 'foodLogs'), {
          date: selectedDate,
          ...validation.data,
          createdAt: serverTimestamp(),
        });

        // Update with real Firestore ID
        if (setFoodLogs) {
          setFoodLogs((prev) =>
            prev.map((item) => (item.id === tempId ? { ...item, id: docRef.id } : item))
          );
        }
      }
    } catch (err: any) {
      console.error('Error saving food log to Firestore:', err);
      setSyncError('Network sync failed. Reverting item.');
      // Rollback optimistic item
      if (setFoodLogs) {
        setFoodLogs((prev) => prev.filter((item) => item.id !== tempId));
      }
    }
  };

  const handleDelete = useCallback(
    async (id?: string) => {
      if (!id) return;
      setSyncError(null);

      // Cache snapshot for potential rollback
      const deletedItem = foodLogs.find((f) => f.id === id);

      // 0ms Optimistic removal
      if (setFoodLogs) {
        setFoodLogs((prev) => prev.filter((f) => f.id !== id));
      }

      try {
        const uid = auth.currentUser?.uid;
        if (uid && !id.startsWith('temp_')) {
          await deleteDoc(doc(db, 'users', uid, 'foodLogs', id));
        }
      } catch (err) {
        console.error('Error deleting food log:', err);
        setSyncError('Failed to delete item from server. Restoring.');
        if (deletedItem && setFoodLogs) {
          setFoodLogs((prev) => [deletedItem, ...prev]);
        }
      }
    },
    [foodLogs, setFoodLogs]
  );

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif'].includes(file.type)) {
      setSyncError('Please choose a JPEG, PNG, WebP, HEIC, or GIF image.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setSyncError('Please choose an image smaller than 8 MB.');
      return;
    }

    setAnalyzing(true);
    setSyncError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64String = (reader.result as string).split(',')[1];
      try {
        const res = await authFetch('/api/analyze-food-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64String, mimeType: file.type }),
        });
        const contentType = res.headers.get('content-type') || '';
        let data: any = {};
        if (contentType.includes('application/json')) {
          data = await res.json();
        } else {
          const text = await res.text();
          throw new Error(text.slice(0, 120) || `Server returned status ${res.status}`);
        }

        if (res.ok) {
          setAiResult(data);
        } else {
          setSyncError(data.error || 'Failed to analyze photo');
        }
      } catch (err: any) {
        console.error('Photo analysis error:', err);
        setSyncError(err.message || 'Failed to analyze photo');
      } finally {
        setAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleTextExtract = async () => {
    if (!textInput.trim()) return;
    setAnalyzing(true);
    setSyncError(null);
    try {
      const res = await authFetch('/api/extract-food-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textInput.trim() }),
      });
      const contentType = res.headers.get('content-type') || '';
      let data: any = {};
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(text.slice(0, 120) || `Server returned status ${res.status}`);
      }

      if (res.ok && data.entries) {
        setAiResult({
          meal: 'lunch',
          foods: data.entries.map((e: any) => ({
            name: e.food_name,
            estimated_portion: e.portion,
            calories: e.calories,
            protein_g: e.protein_g,
            carbs_g: e.carbs_g,
            fat_g: e.fat_g,
          })),
        });
      } else {
        setSyncError(data.error || 'Failed to extract food items');
      }
    } catch (err: any) {
      console.error('Text extraction error:', err);
      setSyncError(err.message || 'Failed to extract food items');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleConfirmAiEntries = async () => {
    if (!aiResult || !aiResult.foods) return;
    setSubmitting(true);
    setSyncError(null);

    const newItems: FoodLogItem[] = aiResult.foods.map((item: any, idx: number) => ({
      id: `temp_ai_${Date.now()}_${idx}`,
      date: selectedDate,
      mealType: (aiResult.meal || 'lunch').toLowerCase(),
      foodName: item.name,
      portion: item.estimated_portion || '1 serving',
      calories: item.calories || 0,
      proteinG: item.protein_g || 0,
      carbsG: item.carbs_g || 0,
      fatG: item.fat_g || 0,
      source: 'photo' as const,
      estimatedByAI: true,
      confidence: aiResult.confidence || 0.8,
      userConfirmed: true,
      createdAt: new Date(),
    }));

    // Optimistic state addition
    if (setFoodLogs) {
      setFoodLogs((prev) => [...newItems, ...prev]);
    }

    setAiResult(null);
    setIsScanOpen(false);
    setIsVoiceOpen(false);
    setTextInput('');

    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        for (const item of newItems) {
          const { id, ...saveData } = item;
          await addDoc(collection(db, 'users', uid, 'foodLogs'), {
            ...saveData,
            createdAt: serverTimestamp(),
          });
        }
        onRefresh();
      }
    } catch (err) {
      console.error('Error saving AI food entries:', err);
      setSyncError('Failed to sync all AI entries to server');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <DateNavigator selectedDate={selectedDate} onChangeDate={onChangeDate} />

      {syncError && (
        <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-2xl flex items-center gap-2 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{syncError}</span>
        </div>
      )}

      {/* Header & Quick Action Buttons */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-white">Food Tracker</h2>
          <p className="text-xs text-slate-400">
            {totalNutrients.calories} kcal logged · P: {Math.round(totalNutrients.protein)}g · C: {Math.round(totalNutrients.carbs)}g · F: {Math.round(totalNutrients.fat)}g
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsScanOpen(true)}
            className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors flex items-center gap-1.5 text-xs font-semibold"
          >
            <Camera className="w-4 h-4" /> Scan
          </button>
          <button
            onClick={() => setIsVoiceOpen(true)}
            className="p-2.5 rounded-xl bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 transition-colors flex items-center gap-1.5 text-xs font-semibold"
          >
            <Mic className="w-4 h-4" /> Tell AI
          </button>
          <button
            onClick={() => setIsManualOpen(true)}
            className="p-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 transition-colors flex items-center gap-1.5 text-xs font-semibold shadow-lg shadow-emerald-950"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      </div>

      {/* Logged Food List */}
      <div className="space-y-3">
        {dayFoodLogs.length === 0 ? (
          <div className="text-center py-12 bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <Apple className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-300">No food logged for this date</p>
            <p className="text-xs text-slate-500 mt-1">Tap Add, Scan, or Tell AI to log meals for {selectedDate}.</p>
          </div>
        ) : (
          dayFoodLogs.map((item) => (
            <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:border-slate-700 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400 font-bold capitalize">
                  {item.mealType[0]}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-white">{item.foodName}</h4>
                    {item.estimatedByAI && (
                      <span className="text-[10px] bg-emerald-950/80 border border-emerald-800 text-emerald-300 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> AI
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {item.portion || '1 serving'} · P: {Math.round(item.proteinG || 0)}g · C: {Math.round(item.carbsG || 0)}g · F: {Math.round(item.fatG || 0)}g
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="text-sm font-bold text-white tabular-nums">{item.calories}</span>
                  <span className="text-xs text-slate-400 ml-1">kcal</span>
                </div>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="p-2 rounded-xl text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
                  title="Delete food entry"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Manual Add Modal */}
      {isManualOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 text-slate-100 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Add Food for {selectedDate}</h3>
              <button onClick={() => setIsManualOpen(false)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {manualError && (
              <div className="mb-4 p-3 bg-red-950/60 border border-red-800/80 rounded-2xl flex items-center gap-2 text-xs text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{manualError}</span>
              </div>
            )}

            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Meal</label>
                <select
                  value={mealType}
                  onChange={(e: any) => setMealType(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="snack">Snack</option>
                  <option value="dinner">Dinner</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Food Name</label>
                <input
                  type="text"
                  placeholder="e.g. Grilled Chicken Salad"
                  value={foodName}
                  onChange={(e) => setFoodName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Quantity / Portion</label>
                <input
                  type="text"
                  placeholder="e.g. 1 plate, 200g, 2 bowls"
                  value={portion}
                  onChange={(e) => setPortion(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <button
                type="button"
                onClick={handleAutoEstimate}
                disabled={!foodName.trim() || estimating}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs text-emerald-400 font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                {estimating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {estimating ? 'Estimating...' : '✨ Estimate Calories & Macros with AI'}
              </button>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Calories (kcal)</label>
                  <input
                    type="number"
                    value={calories}
                    onChange={(e) => setCalories(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 tabular-nums"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Protein (g)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={protein}
                    onChange={(e) => setProtein(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Carbs (g)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={carbs}
                    onChange={(e) => setCarbs(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Fat (g)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={fat}
                    onChange={(e) => setFat(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 tabular-nums"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm flex items-center justify-center gap-2 mt-4 shadow-lg shadow-emerald-950"
              >
                <Plus className="w-4 h-4" /> Save Food Entry
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Photo Scan Modal */}
      {isScanOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 text-slate-100 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Camera className="w-5 h-5 text-blue-400" />
                Scan Food Photo
              </h3>
              <button
                onClick={() => {
                  setIsScanOpen(false);
                  setAiResult(null);
                }}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!aiResult ? (
              <div className="space-y-4 text-center py-6">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoCapture}
                  disabled={analyzing}
                  id="foodPhotoInput"
                  className="hidden"
                />
                <label
                  htmlFor="foodPhotoInput"
                  className="border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors block"
                >
                  {analyzing ? (
                    <Loader2 className="w-10 h-10 text-blue-400 animate-spin mb-3" />
                  ) : (
                    <Camera className="w-10 h-10 text-blue-400 mb-3" />
                  )}
                  <p className="font-semibold text-sm text-slate-200">
                    {analyzing ? 'Analyzing with Gemini...' : 'Take Photo or Choose Image'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Automatic item, calorie & macro detection</p>
                </label>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-blue-950/60 border border-blue-800/80 rounded-2xl">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-semibold uppercase text-blue-400">{aiResult.meal || 'Detected Meal'}</span>
                    <span className="text-xs font-bold text-white tabular-nums">{aiResult.total_calories} kcal</span>
                  </div>
                  <p className="text-xs text-slate-300">Confidence: {Math.round((aiResult.confidence || 0.8) * 100)}%</p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-400">Identified Foods:</p>
                  {aiResult.foods?.map((f: any, idx: number) => (
                    <div key={idx} className="bg-slate-800 p-3 rounded-xl flex justify-between items-center text-xs">
                      <div>
                        <p className="font-bold text-white">{f.name}</p>
                        <p className="text-slate-400">{f.estimated_portion} · P:{f.protein_g}g C:{f.carbs_g}g F:{f.fat_g}g</p>
                      </div>
                      <span className="font-bold text-emerald-400 tabular-nums">{f.calories} kcal</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleConfirmAiEntries}
                  disabled={submitting}
                  className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950"
                >
                  <Check className="w-5 h-5" />
                  {submitting ? 'Adding...' : 'Confirm & Log All Foods'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Voice / Text Assistant Modal */}
      {isVoiceOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 text-slate-100 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Mic className="w-5 h-5 text-purple-400" />
                Natural Voice & Text Food Logging
              </h3>
              <button
                onClick={() => {
                  setIsVoiceOpen(false);
                  setAiResult(null);
                }}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!aiResult ? (
              <div className="space-y-4">
                <p className="text-xs text-slate-400">
                  Type or dictate what you ate. AI will automatically parse portions, calories, and macros.
                </p>
                <textarea
                  rows={4}
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="e.g. For breakfast I had 2 boiled eggs, 1 slice of whole wheat toast with 1 tbsp peanut butter, and a black coffee."
                  className="w-full bg-slate-800 border border-slate-700 rounded-2xl p-3 text-sm text-white focus:outline-none focus:border-purple-500"
                />

                <button
                  onClick={handleTextExtract}
                  disabled={!textInput.trim() || analyzing}
                  className="w-full h-12 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-purple-950"
                >
                  {analyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  {analyzing ? 'Extracting with Gemini...' : 'Extract & Parse Foods with Gemini'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs font-semibold text-slate-400">Extracted Items:</p>
                <div className="space-y-2">
                  {aiResult.foods?.map((f: any, idx: number) => (
                    <div key={idx} className="bg-slate-800 p-3 rounded-xl flex justify-between items-center text-xs">
                      <div>
                        <p className="font-bold text-white">{f.name}</p>
                        <p className="text-slate-400">{f.estimated_portion} · P:{f.protein_g}g C:{f.carbs_g}g F:{f.fat_g}g</p>
                      </div>
                      <span className="font-bold text-emerald-400 tabular-nums">{f.calories} kcal</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleConfirmAiEntries}
                  disabled={submitting}
                  className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950"
                >
                  <Check className="w-5 h-5" />
                  {submitting ? 'Adding...' : 'Confirm & Log All Foods'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
