/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { UserGoals, UserProfile } from '../types';
import { X, Save, User, Flame, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { db, auth } from '../firebase/config';
import { doc, setDoc } from 'firebase/firestore';
import { UserProfileSchema, UserGoalsSchema, getZodErrorMessage } from '../lib/validation';
import { authFetch } from '../lib/authFetch';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  goals: UserGoals;
  onSave: (profile: UserProfile, goals: UserGoals) => void;
  requiredSetup?: boolean;
}

export function ProfileModal({ isOpen, onClose, profile, goals, onSave, requiredSetup = false }: ProfileModalProps) {
  const [formData, setFormData] = useState({ ...profile });
  const [goalData, setGoalData] = useState({ ...goals });
  const [maintenanceCals, setMaintenanceCals] = useState<number | null>(null);
  const [calculatingCals, setCalculatingCals] = useState(false);
  const [calculatingMacros, setCalculatingMacros] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCalculateMaintenance = async () => {
    setErrorMessage(null);
    const validation = UserProfileSchema.safeParse(formData);
    if (!validation.success) {
      setErrorMessage(getZodErrorMessage(validation.error));
      return;
    }

    setCalculatingCals(true);
    try {
      const res = await authFetch('/api/calculate-nutrition-goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to calculate maintenance calories');
      }
      if (data.maintenanceCalories) {
        setMaintenanceCals(Math.round(data.maintenanceCalories));
        if (!goalData.calorieTarget) {
          setGoalData((prev) => ({ ...prev, calorieTarget: Math.round(data.maintenanceCalories) }));
        }
      }
    } catch (err: any) {
      console.error('Error calculating maintenance calories:', err);
      setErrorMessage(err.message || 'Error communicating with AI service');
    } finally {
      setCalculatingCals(false);
    }
  };

  const handleCalculateMacros = async () => {
    setErrorMessage(null);
    if (!goalData.calorieTarget || goalData.calorieTarget < 500) {
      setErrorMessage('Please enter a target calorie of at least 500 kcal.');
      return;
    }

    setCalculatingMacros(true);
    try {
      const res = await authFetch('/api/calculate-nutrition-goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, calorieTarget: goalData.calorieTarget }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to calculate macros');
      }
      if (data) {
        setGoalData((prev) => ({
          ...prev,
          proteinTarget: Math.round(data.proteinTarget || prev.proteinTarget),
          carbTarget: Math.round(data.carbTarget || prev.carbTarget),
          fatTarget: Math.round(data.fatTarget || prev.fatTarget),
        }));
      }
    } catch (err: any) {
      console.error('Error calculating macros:', err);
      setErrorMessage(err.message || 'Error communicating with AI service');
    } finally {
      setCalculatingMacros(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validate both Profile and Goals with Zod
    const profValidation = UserProfileSchema.safeParse(formData);
    if (!profValidation.success) {
      setErrorMessage(getZodErrorMessage(profValidation.error));
      return;
    }

    const goalsValidation = UserGoalsSchema.safeParse(goalData);
    if (!goalsValidation.success) {
      setErrorMessage(getZodErrorMessage(goalsValidation.error));
      return;
    }

    setSaving(true);
    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        await setDoc(doc(db, 'users', uid, 'profile', 'main'), {
          ...formData,
          updatedAt: new Date().toISOString(),
        });
        await setDoc(doc(db, 'users', uid, 'goals', 'main'), {
          ...goalData,
          updatedAt: new Date().toISOString(),
        });
      }
      onSave(formData, goalData);
      onClose();
    } catch (err: any) {
      console.error('Error saving profile:', err);
      setErrorMessage(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 text-slate-100 shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-600/20 text-emerald-400">
              <User className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold">{requiredSetup ? 'Set up your profile' : 'Profile & Daily Goals'}</h2>
          </div>
          <button onClick={requiredSetup ? undefined : onClose} disabled={requiredSetup} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 bg-red-950/60 border border-red-800/80 rounded-2xl flex items-center gap-2 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {requiredSetup && (
          <div className="mb-4 p-3 bg-amber-950/50 border border-amber-800/70 rounded-2xl text-xs text-amber-200">
            Enter your real measurements. Apex Fit does not save placeholder body metrics for new accounts. Calorie and macro values are estimates, not medical advice.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Body Metrics Section */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Body Metrics</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Weight (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  min="20"
                  max="500"
                  value={formData.weightKg}
                  onChange={(e) => setFormData({ ...formData, weightKg: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 tabular-nums"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Height (cm)</label>
                <input
                  type="number"
                  min="50"
                  max="300"
                  value={formData.heightCm}
                  onChange={(e) => setFormData({ ...formData, heightCm: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 tabular-nums"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Age (18+)</label>
                <input
                  type="number"
                  min="18"
                  max="120"
                  value={formData.age}
                  onChange={(e) => setFormData({ ...formData, age: parseInt(e.target.value) || 0 })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 tabular-nums"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Sex for calorie estimate</label>
                <select
                  value={formData.sex}
                  onChange={(e) => setFormData({ ...formData, sex: e.target.value as UserProfile['sex'] })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="unspecified">Prefer not to say</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Activity Level</label>
                <select
                  value={formData.activityLevel}
                  onChange={(e) => setFormData({ ...formData, activityLevel: e.target.value as any })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="sedentary">Sedentary</option>
                  <option value="light">Lightly Active</option>
                  <option value="moderate">Moderately Active</option>
                  <option value="very">Very Active</option>
                  <option value="extra">Extra Active</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCalculateMaintenance}
              disabled={calculatingCals}
              className="w-full h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 font-semibold text-xs flex items-center justify-center gap-2 hover:bg-emerald-600/30 transition-all disabled:opacity-50 mt-2"
            >
              {calculatingCals ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {calculatingCals ? 'Calculating...' : '✨ Calculate Maintenance Calories with Gemini'}
            </button>

            {maintenanceCals && (
              <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-2xl flex items-center justify-between text-xs text-emerald-300">
                <span className="font-medium">Estimated Maintenance Calories:</span>
                <span className="font-extrabold text-sm text-white tabular-nums">{maintenanceCals} kcal/day</span>
              </div>
            )}
          </div>

          {/* Nutrition & Calorie Targets Section */}
          <div className="space-y-3 pt-4 border-t border-slate-800">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Flame className="w-4 h-4" /> Nutrition & Calorie Targets
            </p>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Target Daily Calories (kcal)</label>
              <input
                type="number"
                min="500"
                max="10000"
                value={goalData.calorieTarget}
                onChange={(e) => setGoalData({ ...goalData, calorieTarget: parseInt(e.target.value) || 0 })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 tabular-nums"
                required
              />
            </div>

            <button
              type="button"
              onClick={handleCalculateMacros}
              disabled={!goalData.calorieTarget || calculatingMacros}
              className="w-full h-10 rounded-xl bg-purple-600/20 border border-purple-500/40 text-purple-400 font-semibold text-xs flex items-center justify-center gap-2 hover:bg-purple-600/30 transition-all disabled:opacity-50"
            >
              {calculatingMacros ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {calculatingMacros ? 'Calculating Macros...' : '✨ Calculate Macros from Target Calorie with Gemini'}
            </button>

            <div className="grid grid-cols-3 gap-3 pt-1">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Protein (g)</label>
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={goalData.proteinTarget}
                  onChange={(e) => setGoalData({ ...goalData, proteinTarget: parseInt(e.target.value) || 0 })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 tabular-nums"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Carbs (g)</label>
                <input
                  type="number"
                  min="0"
                  max="2000"
                  value={goalData.carbTarget}
                  onChange={(e) => setGoalData({ ...goalData, carbTarget: parseInt(e.target.value) || 0 })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 tabular-nums"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Fat (g)</label>
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={goalData.fatTarget}
                  onChange={(e) => setGoalData({ ...goalData, fatTarget: parseInt(e.target.value) || 0 })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 tabular-nums"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm flex items-center justify-center gap-2 mt-6 transition-all shadow-lg shadow-emerald-950"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : requiredSetup ? 'Complete Profile Setup' : 'Save Profile & Targets'}
          </button>
        </form>
      </div>
    </div>
  );
}
