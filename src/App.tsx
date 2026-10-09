/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { auth, db, onAuthStateChanged, signOut, User } from './firebase/config';
import { collection, getDocs, doc, getDoc, query, limit, orderBy } from 'firebase/firestore';
import { UserProfileSchema, UserGoalsSchema } from './lib/validation';
import { UserProfile, UserGoals, FoodLogItem, WorkoutSession, ProgressEntry } from './types';
import { AuthScreen } from './components/AuthScreen';
import { Navbar } from './components/Navbar';
import { ProfileModal } from './components/ProfileModal';
import { Loader2 } from 'lucide-react';

// Lazy-loaded tab components for code splitting & fast initial bundle load
const TodayView = lazy(() => import('./components/TodayView').then((m) => ({ default: m.TodayView })));
const FoodView = lazy(() => import('./components/FoodView').then((m) => ({ default: m.FoodView })));
const WorkoutView = lazy(() => import('./components/WorkoutView').then((m) => ({ default: m.WorkoutView })));
const ProgressView = lazy(() => import('./components/ProgressView').then((m) => ({ default: m.ProgressView })));
const AiCoachView = lazy(() => import('./components/AiCoachView').then((m) => ({ default: m.AiCoachView })));

function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function ViewFallback() {
  return (
    <div className="flex items-center justify-center py-24 min-h-[300px]">
      <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isGuest, setIsGuest] = useState<boolean>(() => {
    return typeof window !== 'undefined' && localStorage.getItem('apex_guest_mode') === 'true';
  });
  const [activeTab, setActiveTab] = useState<'today' | 'food' | 'workout' | 'progress' | 'ai'>('today');
  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString());

  // Data states (clean-slate initial empty state as chosen by user)
  const [profile, setProfile] = useState<UserProfile>({
    heightCm: 175,
    weightKg: 75,
    age: 28,
    sex: 'unspecified',
    activityLevel: 'moderate',
  });
  const [goals, setGoals] = useState<UserGoals>({
    calorieTarget: 2200,
    proteinTarget: 150,
    carbTarget: 250,
    fatTarget: 70,
  });
  const [foodLogs, setFoodLogs] = useState<FoodLogItem[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [progressList, setProgressList] = useState<ProgressEntry[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [profileSetupRequired, setProfileSetupRequired] = useState(false);

  // Modals
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);

  // Monitor Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) {
        setIsGuest(false);
        try {
          localStorage.removeItem('apex_guest_mode');
        } catch {}
        await loadUserData(currentUser.uid);
      } else {
        setProfileSetupRequired(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Guest data loading from localStorage
  const loadGuestData = () => {
    try {
      const storedProf = localStorage.getItem('apex_guest_profile');
      if (storedProf) {
        setProfile(JSON.parse(storedProf));
      }
      const storedGoals = localStorage.getItem('apex_guest_goals');
      if (storedGoals) {
        setGoals(JSON.parse(storedGoals));
      }
      const storedFoods = localStorage.getItem('apex_guest_food_logs');
      if (storedFoods) {
        setFoodLogs(JSON.parse(storedFoods));
      }
      const storedSessions = localStorage.getItem('apex_guest_sessions');
      if (storedSessions) {
        setSessions(JSON.parse(storedSessions));
      }
      const storedProgress = localStorage.getItem('apex_guest_progress');
      if (storedProgress) {
        setProgressList(JSON.parse(storedProgress));
      }
    } catch (e) {
      console.error('Failed to load guest data:', e);
    }
  };

  useEffect(() => {
    if (isGuest && !user) {
      loadGuestData();
    }
  }, [isGuest, user]);

  // Persist guest data changes
  useEffect(() => {
    if (isGuest && !user) {
      try {
        localStorage.setItem('apex_guest_food_logs', JSON.stringify(foodLogs));
      } catch {}
    }
  }, [foodLogs, isGuest, user]);

  useEffect(() => {
    if (isGuest && !user) {
      try {
        localStorage.setItem('apex_guest_sessions', JSON.stringify(sessions));
      } catch {}
    }
  }, [sessions, isGuest, user]);

  useEffect(() => {
    if (isGuest && !user) {
      try {
        localStorage.setItem('apex_guest_progress', JSON.stringify(progressList));
      } catch {}
    }
  }, [progressList, isGuest, user]);

  const loadUserData = async (uid: string) => {
    setDataLoading(true);
    try {
      // 1. Load Profile
      const profDoc = await getDoc(doc(db, 'users', uid, 'profile', 'main'));
      let needsSetup = false;
      if (profDoc.exists()) {
        const stored = profDoc.data() as Partial<UserProfile>;
        const parsed = UserProfileSchema.safeParse({ ...stored, sex: stored.sex ?? 'unspecified' });
        if (parsed.success) {
          setProfile(parsed.data);
        } else {
          setProfile((prev) => ({ ...prev, ...(stored as Partial<UserProfile>), sex: stored.sex ?? 'unspecified' }));
          needsSetup = true;
        }
      } else {
        needsSetup = true;
      }

      // 2. Load Goals
      const goalDoc = await getDoc(doc(db, 'users', uid, 'goals', 'main'));
      if (goalDoc.exists()) {
        const parsedGoals = UserGoalsSchema.safeParse(goalDoc.data());
        if (parsedGoals.success) setGoals(parsedGoals.data);
        else needsSetup = true;
      } else {
        needsSetup = true;
      }
      setProfileSetupRequired(needsSetup);
      if (needsSetup) setIsProfileOpen(true);

      // 3. Load Food Logs (Bounded to recent entries)
      try {
        const foodQuery = query(collection(db, 'users', uid, 'foodLogs'), orderBy('date', 'desc'), limit(150));
        const foodSnap = await getDocs(foodQuery);
        const foods: FoodLogItem[] = foodSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setFoodLogs(foods);
      } catch (e) {
        console.error('Error loading food logs:', e);
        setFoodLogs([]);
      }

      // 4. Load Workout Sessions (Bounded limit)
      try {
        const workoutQuery = query(collection(db, 'users', uid, 'workoutSessions'), orderBy('date', 'desc'), limit(60));
        const workoutSnap = await getDocs(workoutQuery);
        const workList: WorkoutSession[] = workoutSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setSessions(workList);
      } catch (e) {
        console.error('Error loading workout sessions:', e);
        setSessions([]);
      }

      // 5. Load Progress (Bounded limit)
      try {
        const progQuery = query(collection(db, 'users', uid, 'progress'), orderBy('date', 'desc'), limit(100));
        const progSnap = await getDocs(progQuery);
        const progList: ProgressEntry[] = progSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setProgressList(progList);
      } catch (e) {
        console.error('Error loading progress:', e);
        setProgressList([]);
      }
    } catch (err) {
      console.error('Error loading user data:', err);
    } finally {
      setDataLoading(false);
    }
  };

  const handleRefreshData = async () => {
    if (user) {
      await loadUserData(user.uid);
    } else if (isGuest) {
      loadGuestData();
    }
  };

  const handleSignOut = async () => {
    if (user) {
      await signOut(auth);
    }
    try {
      localStorage.removeItem('apex_guest_mode');
    } catch {}
    setIsGuest(false);
  };

  const handleContinueGuest = () => {
    try {
      localStorage.setItem('apex_guest_mode', 'true');
    } catch {}
    setIsGuest(true);
    loadGuestData();
  };

  const handleSaveProfile = (newProf: UserProfile, newGoals: UserGoals) => {
    setProfile(newProf);
    setGoals(newGoals);
    setProfileSetupRequired(false);
    if (isGuest && !user) {
      try {
        localStorage.setItem('apex_guest_profile', JSON.stringify(newProf));
        localStorage.setItem('apex_guest_goals', JSON.stringify(newGoals));
      } catch {}
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!user && !isGuest) {
    return <AuthScreen onContinueGuest={handleContinueGuest} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-white pb-20">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenProfile={() => setIsProfileOpen(true)}
        userEmail={user ? user.email : 'Guest'}
        isGuest={isGuest && !user}
        onSignOut={handleSignOut}
      />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 pt-6">
        {dataLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          </div>
        ) : (
          <Suspense fallback={<ViewFallback />}>
            {activeTab === 'today' && (
              <TodayView
                foodLogs={foodLogs}
                goals={goals}
                selectedDate={selectedDate}
                onChangeDate={setSelectedDate}
                onNavigateTab={setActiveTab}
                onOpenScan={() => { setActiveTab('food'); setIsScanOpen(true); }}
                onOpenVoice={() => { setActiveTab('food'); setIsVoiceOpen(true); }}
                onOpenManual={() => setActiveTab('food')}
              />
            )}
            {activeTab === 'food' && (
              <FoodView
                foodLogs={foodLogs}
                setFoodLogs={setFoodLogs}
                selectedDate={selectedDate}
                onChangeDate={setSelectedDate}
                onRefresh={handleRefreshData}
                isScanOpen={isScanOpen}
                setIsScanOpen={setIsScanOpen}
                isVoiceOpen={isVoiceOpen}
                setIsVoiceOpen={setIsVoiceOpen}
              />
            )}
            {activeTab === 'workout' && (
              <WorkoutView
                sessions={sessions}
                setSessions={setSessions}
                selectedDate={selectedDate}
                onChangeDate={setSelectedDate}
                onRefresh={handleRefreshData}
              />
            )}
            {activeTab === 'progress' && (
              <ProgressView
                progressList={progressList}
                setProgressList={setProgressList}
                foodLogs={foodLogs}
                goals={goals}
                onRefresh={handleRefreshData}
              />
            )}
            {activeTab === 'ai' && (
              <AiCoachView
                foodLogs={foodLogs}
                sessions={sessions}
                goals={goals}
                profile={profile}
              />
            )}
          </Suspense>
        )}
      </main>

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        profile={profile}
        goals={goals}
        onSave={handleSaveProfile}
        requiredSetup={profileSetupRequired}
      />
    </div>
  );
}
