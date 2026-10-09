/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DarkDatePicker } from './DarkDatePicker';

interface DateNavigatorProps {
  selectedDate: string; // YYYY-MM-DD
  onChangeDate: (date: string) => void;
}

function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function DateNavigator({ selectedDate, onChangeDate }: DateNavigatorProps) {
  const todayStr = getLocalDateString();

  const handlePrev = () => {
    const parts = (selectedDate || todayStr).split('-').map(Number);
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2] - 1);
    onChangeDate(getLocalDateString(dateObj));
  };

  const handleNext = () => {
    const parts = (selectedDate || todayStr).split('-').map(Number);
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2] + 1);
    onChangeDate(getLocalDateString(dateObj));
  };

  return (
    <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl px-3 py-2.5 shadow-sm mb-6 gap-2">
      <button
        type="button"
        onClick={handlePrev}
        className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors shrink-0"
        title="Previous Day"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <div className="flex-1 flex justify-center max-w-xs">
        <DarkDatePicker
          value={selectedDate}
          onChange={onChangeDate}
          compact
          className="w-full"
        />
      </div>

      <button
        type="button"
        onClick={handleNext}
        className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors shrink-0"
        title="Next Day"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
