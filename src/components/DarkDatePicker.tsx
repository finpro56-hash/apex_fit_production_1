/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';

interface DarkDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  maxDate?: string; // YYYY-MM-DD
  minDate?: string; // YYYY-MM-DD
  className?: string;
  label?: string;
  compact?: boolean;
}

function pad(num: number): string {
  return String(num).padStart(2, '0');
}

function formatDateString(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function getTodayString(): string {
  const d = new Date();
  return formatDateString(d.getFullYear(), d.getMonth(), d.getDate());
}

export function DarkDatePicker({
  value,
  onChange,
  maxDate,
  minDate,
  className = '',
  label,
  compact = false,
}: DarkDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const todayStr = useMemo(() => getTodayString(), []);

  // Parse current value or fallback to today
  const selectedDateParts = useMemo(() => {
    const raw = value || todayStr;
    const parts = raw.split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return { year: parts[0], month: parts[1] - 1, day: parts[2] };
    }
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
  }, [value, todayStr]);

  // Calendar view year and month (0-indexed)
  const [viewYear, setViewYear] = useState(selectedDateParts.year);
  const [viewMonth, setViewMonth] = useState(selectedDateParts.month);

  // Sync view when opened
  useEffect(() => {
    if (isOpen) {
      setViewYear(selectedDateParts.year);
      setViewMonth(selectedDateParts.month);
    }
  }, [isOpen, selectedDateParts]);

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Month navigation
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectToday = () => {
    if (maxDate && todayStr > maxDate) return;
    if (minDate && todayStr < minDate) return;
    onChange(todayStr);
    setIsOpen(false);
  };

  // Compute calendar days for current viewMonth
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sunday
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const days: Array<{
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isDisabled: boolean;
      isSelected: boolean;
      isToday: boolean;
    }> = [];

    // Previous month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dateStr = formatDateString(prevYear, prevMonth, d);
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: false,
        isDisabled: true,
        isSelected: dateStr === value,
        isToday: dateStr === todayStr,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = formatDateString(viewYear, viewMonth, d);
      const isBeforeMin = minDate ? dateStr < minDate : false;
      const isAfterMax = maxDate ? dateStr > maxDate : false;
      const isDisabled = isBeforeMin || isAfterMax;

      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: true,
        isDisabled,
        isSelected: dateStr === value,
        isToday: dateStr === todayStr,
      });
    }

    // Next month padding to fill out 35 or 42 grid cells
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dateStr = formatDateString(nextYear, nextMonth, d);
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: false,
        isDisabled: true,
        isSelected: dateStr === value,
        isToday: dateStr === todayStr,
      });
    }

    return days;
  }, [viewYear, viewMonth, value, todayStr, minDate, maxDate]);

  // Formatted display text
  const formattedDisplay = useMemo(() => {
    if (!value) return 'Select date';
    const parts = value.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    if (isNaN(d.getTime())) return value;
    if (value === todayStr) return 'Today';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, [value, todayStr]);

  const monthName = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', { month: 'long' });

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && <label className="text-xs text-slate-400 mb-1 block">{label}</label>}

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Open calendar"
        className={`w-full flex items-center justify-between gap-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-medium text-sm transition-all hover:bg-slate-750 hover:border-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 ${
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2.5'
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          <CalendarIcon className={`text-emerald-400 shrink-0 ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
          <span className="truncate tabular-nums font-semibold">{formattedDisplay}</span>
          {!compact && value !== todayStr && (
            <span className="text-xs text-slate-400 tabular-nums font-normal">({value})</span>
          )}
        </div>
        <ChevronDown className={`text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''} ${compact ? 'w-3 h-3' : 'w-4 h-4'}`} />
      </button>

      {/* Popover Calendar */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-2 z-50 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-4 w-72 max-w-[calc(100vw-2rem)] backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100">
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">
                {monthName} {viewYear}
              </span>
              <button
                type="button"
                onClick={handleSelectToday}
                className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 font-semibold hover:bg-emerald-900 transition-colors"
              >
                Today
              </button>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <span key={d} className="text-[10px] font-semibold text-slate-500 py-1">
                {d}
              </span>
            ))}
          </div>

          {/* Day Cells Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, idx) => {
              let cellClasses = 'h-8 w-8 text-xs flex items-center justify-center rounded-xl transition-all tabular-nums font-medium ';

              if (day.isSelected) {
                cellClasses += 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-950 scale-105';
              } else if (day.isDisabled) {
                cellClasses += 'text-slate-600 opacity-40 cursor-not-allowed';
              } else if (!day.isCurrentMonth) {
                cellClasses += 'text-slate-600 hover:bg-slate-800/50';
              } else {
                cellClasses += 'text-slate-200 hover:bg-slate-800 hover:text-white cursor-pointer';
                if (day.isToday) {
                  cellClasses += ' ring-1 ring-emerald-500/60 font-semibold text-emerald-400';
                }
              }

              return (
                <button
                  key={`${day.dateStr}-${idx}`}
                  type="button"
                  disabled={day.isDisabled}
                  onClick={() => {
                    if (!day.isDisabled) {
                      onChange(day.dateStr);
                      setIsOpen(false);
                    }
                  }}
                  className={cellClasses}
                >
                  {day.dayNumber}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
