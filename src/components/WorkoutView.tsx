/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { WorkoutSession, WorkoutExercise, WorkoutPlan } from '../types';
import { Dumbbell, Plus, Play, CheckCircle, Trash2, X, Clock, Flame, Edit3, Sparkles, AlertCircle } from 'lucide-react';
import { db, auth } from '../firebase/config';
import { collection, addDoc, deleteDoc, doc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { DateNavigator } from './DateNavigator';
import { WorkoutPlanSchema, WorkoutSessionSchema, getZodErrorMessage } from '../lib/validation';

interface WorkoutViewProps {
  sessions: WorkoutSession[];
  setSessions?: React.Dispatch<React.SetStateAction<WorkoutSession[]>>;
  selectedDate: string;
  onChangeDate: (date: string) => void;
  onRefresh: () => void;
}

export function WorkoutView({ sessions, setSessions, selectedDate, onChangeDate, onRefresh }: WorkoutViewProps) {
  const [workoutPlans, setWorkoutPlans] = useState<WorkoutPlan[]>([]);
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [planTitle, setPlanTitle] = useState('');
  const [planDesc, setPlanDesc] = useState('');
  const [exerciseInput, setExerciseInput] = useState('Bench Press, Incline Dumbbell Press, Tricep Pushdown');
  const [submitting, setSubmitting] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkoutPlans();
  }, []);

  const fetchWorkoutPlans = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      const snap = await getDocs(collection(db, 'users', uid, 'workoutPlans'));
      const plans: WorkoutPlan[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setWorkoutPlans(plans);
    } catch (err) {
      console.error('Error fetching workout plans:', err);
    }
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planTitle.trim()) return;
    setSubmitting(true);
    setSyncError(null);

    const exercises = exerciseInput.split(',').map((s) => s.trim()).filter(Boolean);
    const planValidation = WorkoutPlanSchema.safeParse({
      title: planTitle.trim(),
      description: planDesc.trim(),
      exercises,
    });
    if (!planValidation.success) {
      setSyncError(getZodErrorMessage(planValidation.error));
      setSubmitting(false);
      return;
    }
    const tempPlanId = `temp_plan_${Date.now()}`;
    const newPlan: WorkoutPlan = {
      id: tempPlanId,
      title: planTitle.trim(),
      description: planDesc.trim(),
      exercises: planValidation.data.exercises,
    };

    // Optimistic routine addition
    setWorkoutPlans((prev) => [...prev, newPlan]);
    setPlanTitle('');
    setPlanDesc('');
    setExerciseInput('Bench Press, Incline Dumbbell Press');
    setIsPlanModalOpen(false);

    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        const docRef = await addDoc(collection(db, 'users', uid, 'workoutPlans'), {
          title: newPlan.title,
          description: newPlan.description,
          exercises: newPlan.exercises,
          createdAt: serverTimestamp(),
        });
        setWorkoutPlans((prev) =>
          prev.map((p) => (p.id === tempPlanId ? { ...p, id: docRef.id } : p))
        );
      }
    } catch (err) {
      console.error('Error creating workout plan:', err);
      setSyncError('Failed to save workout routine to server');
      setWorkoutPlans((prev) => prev.filter((p) => p.id !== tempPlanId));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePlan = async (id?: string) => {
    if (!id) return;
    setSyncError(null);
    const deletedPlan = workoutPlans.find((p) => p.id === id);
    setWorkoutPlans((prev) => prev.filter((p) => p.id !== id));

    try {
      const uid = auth.currentUser?.uid;
      if (uid && !id.startsWith('temp_')) {
        await deleteDoc(doc(db, 'users', uid, 'workoutPlans', id));
      }
    } catch (err) {
      console.error('Error deleting workout plan:', err);
      setSyncError('Failed to delete routine. Restoring.');
      if (deletedPlan) {
        setWorkoutPlans((prev) => [...prev, deletedPlan]);
      }
    }
  };

  const startWorkout = (title: string, defaultExercises: string[]) => {
    const exercises: WorkoutExercise[] = defaultExercises.map((name, idx) => ({
      id: `ex_${idx}_${Date.now()}`,
      name,
      sets: [
        { setNumber: 1, weightKg: 0, reps: 0, completed: false },
        { setNumber: 2, weightKg: 0, reps: 0, completed: false },
        { setNumber: 3, weightKg: 0, reps: 0, completed: false },
      ],
    }));

    setActiveSession({
      planTitle: title,
      date: selectedDate,
      exercises,
      completed: false,
      durationMinutes: 0,
      createdAt: new Date(),
    });
  };

  const updateSet = (exerciseId: string, setIndex: number, field: 'weightKg' | 'reps' | 'completed', value: any) => {
    if (!activeSession) return;
    const updatedExercises = activeSession.exercises.map((ex) => {
      if (ex.id !== exerciseId) return ex;
      const newSets = [...ex.sets];
      newSets[setIndex] = { ...newSets[setIndex], [field]: value };
      return { ...ex, sets: newSets };
    });
    setActiveSession({ ...activeSession, exercises: updatedExercises });
  };

  const addSetToExercise = (exerciseId: string) => {
    if (!activeSession) return;
    const updatedExercises = activeSession.exercises.map((ex) => {
      if (ex.id !== exerciseId) return ex;
      const lastSet = ex.sets[ex.sets.length - 1] || { weightKg: 50, reps: 10 };
      const newSets = [...ex.sets, { setNumber: ex.sets.length + 1, weightKg: lastSet.weightKg, reps: lastSet.reps, completed: false }];
      return { ...ex, sets: newSets };
    });
    setActiveSession({ ...activeSession, exercises: updatedExercises });
  };

  const saveWorkoutSession = async () => {
    if (!activeSession) return;
    setSubmitting(true);
    setSyncError(null);

    const isEditing = Boolean(activeSession.id);
    const tempSessionId = activeSession.id || `temp_session_${Date.now()}`;
    const optimisticSession: WorkoutSession = {
      ...activeSession,
      id: tempSessionId,
      date: selectedDate,
      completed: true,
    };

    // 0ms Optimistic Update
    if (setSessions) {
      setSessions((prev) => {
        if (isEditing) {
          return prev.map((s) => (s.id === activeSession.id ? optimisticSession : s));
        } else {
          return [optimisticSession, ...prev];
        }
      });
    }

    const sessionValidation = WorkoutSessionSchema.safeParse({
      planTitle: activeSession.planTitle,
      date: selectedDate,
      exercises: activeSession.exercises,
      completed: true,
      durationMinutes: activeSession.durationMinutes,
    });
    if (!sessionValidation.success) {
      setSyncError(getZodErrorMessage(sessionValidation.error));
      setSubmitting(false);
      if (setSessions) setSessions((prev) => prev.filter((s) => s.id !== tempSessionId));
      return;
    }

    setActiveSession(null);

    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        if (activeSession.id && !activeSession.id.startsWith('temp_')) {
          await setDoc(
            doc(db, 'users', uid, 'workoutSessions', activeSession.id),
            {
              planTitle: activeSession.planTitle,
              date: selectedDate,
              exercises: activeSession.exercises,
              completed: true,
              durationMinutes: activeSession.durationMinutes,
              createdAt: activeSession.createdAt || serverTimestamp(),
            },
            { merge: true }
          );
        } else {
          const docRef = await addDoc(collection(db, 'users', uid, 'workoutSessions'), {
            planTitle: activeSession.planTitle,
            date: selectedDate,
            exercises: activeSession.exercises,
            completed: true,
            durationMinutes: activeSession.durationMinutes,
            createdAt: serverTimestamp(),
          });

          if (setSessions) {
            setSessions((prev) =>
              prev.map((s) => (s.id === tempSessionId ? { ...s, id: docRef.id } : s))
            );
          }
        }
      }
    } catch (err) {
      console.error('Error saving workout session:', err);
      setSyncError('Failed to save session to server');
      if (setSessions) {
        if (!isEditing) {
          setSessions((prev) => prev.filter((s) => s.id !== tempSessionId));
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSession = useCallback(
    async (id?: string) => {
      if (!id) return;
      setSyncError(null);
      const deletedSession = sessions.find((s) => s.id === id);

      // 0ms Optimistic removal
      if (setSessions) {
        setSessions((prev) => prev.filter((s) => s.id !== id));
      }

      try {
        const uid = auth.currentUser?.uid;
        if (uid && !id.startsWith('temp_')) {
          await deleteDoc(doc(db, 'users', uid, 'workoutSessions', id));
        }
      } catch (err) {
        console.error('Error deleting workout session:', err);
        setSyncError('Failed to delete workout session on server. Restoring.');
        if (deletedSession && setSessions) {
          setSessions((prev) => [deletedSession, ...prev]);
        }
      }
    },
    [sessions, setSessions]
  );

  const daySessions = useMemo(() => {
    return sessions.filter((s) => s.date === selectedDate);
  }, [sessions, selectedDate]);

  if (activeSession) {
    const isEditing = Boolean(activeSession.id);
    return (
      <div className="space-y-6 pb-24">
        <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div>
            <span className="text-xs uppercase font-semibold text-emerald-400">
              {isEditing ? 'Edit Workout Session' : 'Active Workout'} ({selectedDate})
            </span>
            <h2 className="text-xl font-extrabold text-white">{activeSession.planTitle}</h2>
          </div>
          <button
            onClick={() => setActiveSession(null)}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {activeSession.exercises.map((ex) => {
            const completedSetsCount = ex.sets.filter((s) => s.completed).length;
            const totalSetsCount = ex.sets.length;
            const isCompleted = completedSetsCount === totalSetsCount;
            const isSkipped = completedSetsCount === 0;

            return (
              <div key={ex.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">{ex.name}</h3>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                        isCompleted
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : isSkipped
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-blue-950 text-blue-300 border border-blue-800'
                      }`}
                    >
                      {isCompleted ? 'Completed' : isSkipped ? 'Skipped' : `${completedSetsCount}/${totalSetsCount} Sets`}
                    </span>
                  </div>
                  <button
                    onClick={() => addSetToExercise(ex.id)}
                    className="text-xs text-emerald-400 font-semibold hover:underline"
                  >
                    + Add Set
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-[10px] text-slate-400 uppercase font-semibold px-2">
                    <span className="col-span-2">Set</span>
                    <span className="col-span-4">Weight (kg)</span>
                    <span className="col-span-4">Reps</span>
                    <span className="col-span-2 text-center">Done ✔️</span>
                  </div>

                  {ex.sets.map((set, sIdx) => (
                    <div key={sIdx} className="grid grid-cols-12 gap-2 items-center bg-slate-950/60 p-2 rounded-xl border border-slate-800/85">
                      <span className="col-span-2 text-xs font-bold text-slate-400 text-center">{set.setNumber}</span>
                      <div className="col-span-4">
                        <input
                          type="number"
                          step="0.5"
                          value={set.weightKg}
                          onChange={(e) => updateSet(ex.id, sIdx, 'weightKg', parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white text-center focus:outline-none focus:border-emerald-500 tabular-nums"
                        />
                      </div>
                      <div className="col-span-4">
                        <input
                          type="number"
                          value={set.reps}
                          onChange={(e) => updateSet(ex.id, sIdx, 'reps', parseInt(e.target.value) || 0)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white text-center focus:outline-none focus:border-emerald-500 tabular-nums"
                        />
                      </div>
                      <div className="col-span-2 flex justify-center">
                        <input
                          type="checkbox"
                          checked={set.completed || false}
                          onChange={(e) => updateSet(ex.id, sIdx, 'completed', e.target.checked)}
                          className="w-5 h-5 rounded accent-emerald-600 cursor-pointer"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={saveWorkoutSession}
          disabled={submitting}
          className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950"
        >
          <CheckCircle className="w-5 h-5" />
          {submitting ? 'Saving...' : isEditing ? 'Update Workout Session' : 'Finish & Complete Workout'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <DateNavigator selectedDate={selectedDate} onChangeDate={onChangeDate} />

      {syncError && (
        <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-2xl flex items-center gap-2 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{syncError}</span>
        </div>
      )}

      {/* Logged / Active Sessions Section for Selected Date */}
      {daySessions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            Workouts Logged for {selectedDate}
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {daySessions.map((session) => {
              const totalSets = session.exercises?.reduce((acc, ex) => acc + (ex.sets?.length || 0), 0) || 0;
              const completedSets = session.exercises?.reduce((acc, ex) => acc + (ex.sets?.filter((s) => s.completed).length || 0), 0) || 0;
              const isAllDone = completedSets === totalSets && totalSets > 0;

              return (
                <div
                  key={session.id}
                  onClick={() => setActiveSession(session)}
                  className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-5 shadow-lg cursor-pointer hover:border-emerald-500 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0">
                        <CheckCircle className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-bold text-white">{session.planTitle}</h4>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                              isAllDone
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-amber-950 text-amber-300 border border-amber-800'
                            }`}
                          >
                            {isAllDone ? '✔️ Completed' : `⚡ ${completedSets}/${totalSets} Sets Done`}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">{session.date} · Tap card to edit sets</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {session.exercises?.map((ex, eIdx) => {
                        const isExDone = ex.sets?.some((s) => s.completed);
                        return (
                          <span
                            key={eIdx}
                            className={`text-[10px] px-2.5 py-1 rounded-lg font-medium border flex items-center gap-1 ${
                              isExDone
                                ? 'bg-emerald-950/90 text-emerald-300 border-emerald-800/80'
                                : 'bg-amber-950/90 text-amber-300 border-amber-800/80'
                            }`}
                          >
                            {isExDone ? '✔️' : '⏳'} {ex.name}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveSession(session);
                      }}
                      className="h-10 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-semibold flex items-center gap-2 border border-emerald-500/30 transition-all"
                    >
                      <Edit3 className="w-4 h-4" /> Edit Workout
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSession(session.id);
                      }}
                      className="p-2.5 rounded-xl bg-slate-800 text-slate-500 hover:text-red-400 transition-colors"
                      title="Delete session"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Normal Custom Workout Routines */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-white">Your Workout Routines</h2>
            <p className="text-xs text-slate-400">Select a routine to start a workout session for {selectedDate}.</p>
          </div>
          <button
            onClick={() => setIsPlanModalOpen(true)}
            className="p-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 transition-colors flex items-center gap-1.5 text-xs font-semibold shadow-lg shadow-emerald-950"
          >
            <Plus className="w-4 h-4" /> Create Routine
          </button>
        </div>

        {workoutPlans.length === 0 ? (
          <div className="text-center py-12 bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <Dumbbell className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-300">No custom workout routines created yet</p>
            <p className="text-xs text-slate-500 mt-1 mb-4">Tap Create Routine to design your custom workout structures (e.g. Chest Day, Leg Day).</p>
            <button
              onClick={() => setIsPlanModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-xs shadow-lg shadow-emerald-950 hover:bg-emerald-500"
            >
              <Plus className="w-4 h-4" /> Create First Routine
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {workoutPlans.map((plan) => (
              <div
                key={plan.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-700 transition-all"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-slate-800 text-emerald-400 flex items-center justify-center font-bold">
                      <Dumbbell className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-white">{plan.title}</h4>
                      <p className="text-xs text-slate-400">{plan.description || 'Custom routine'}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {plan.exercises.map((ex, eIdx) => (
                      <span key={eIdx} className="text-[10px] bg-slate-800/80 text-slate-300 px-2.5 py-1 rounded-lg">
                        {ex}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => startWorkout(plan.title, plan.exercises)}
                    className="h-10 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-emerald-950 transition-all"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" /> Start Workout
                  </button>

                  {plan.id && (
                    <button
                      onClick={() => handleDeletePlan(plan.id)}
                      className="p-2.5 rounded-xl bg-slate-800 text-slate-500 hover:text-red-400 transition-colors"
                      title="Delete routine"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Routine Modal */}
      {isPlanModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold">Create Custom Workout Routine</h3>
              <button onClick={() => setIsPlanModalOpen(false)} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Routine Name (e.g. Leg Day, Chest & Triceps)</label>
                <input
                  type="text"
                  placeholder="e.g. Chest & Biceps"
                  value={planTitle}
                  onChange={(e) => setPlanTitle(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Heavy compound movements & hypertrophy"
                  value={planDesc}
                  onChange={(e) => setPlanDesc(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Exercises (comma separated)</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Barbell Bench Press, Incline Dumbbell Fly, Cable Crossover"
                  value={exerciseInput}
                  onChange={(e) => setExerciseInput(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 p-3 text-sm text-white focus:outline-none focus:border-emerald-500 rounded-xl"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm flex items-center justify-center gap-2 mt-6 shadow-lg shadow-emerald-950"
              >
                <Plus className="w-4 h-4" />
                {submitting ? 'Creating...' : 'Save Workout Routine'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
