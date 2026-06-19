import React, { useState, useEffect, useRef } from 'react';

// --- HELPERS ---
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAYS_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  // convert Sunday=0..Saturday=6 to Monday=0..Sunday=6
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (val: string) => void;
  className?: string;
  required?: boolean;
}

export function CustomDatePicker({ value, onChange, className = '', required = false }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize selectedDate from value prop
  useEffect(() => {
    if (value) {
      const parts = value.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        if (!isNaN(d.getTime())) {
          setSelectedDate(d);
          setCurrentYear(d.getFullYear());
          setCurrentMonth(d.getMonth());
        }
      }
    }
  }, [value]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDayIndex = getFirstDayOfMonth(currentYear, currentMonth);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((prev) => prev - 1);
    } else {
      setCurrentMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((prev) => prev + 1);
    } else {
      setCurrentMonth((prev) => prev + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const d = new Date(currentYear, currentMonth, day);
    setSelectedDate(d);
  };

  const handleClear = () => {
    onChange('');
    setSelectedDate(null);
    setIsOpen(false);
  };

  const handleSet = () => {
    if (selectedDate) {
      const y = selectedDate.getFullYear();
      const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const d = String(selectedDate.getDate()).padStart(2, '0');
      onChange(`${y}-${m}-${d}`);
    }
    setIsOpen(false);
  };

  // Format header info: "Thu, 18 Jun"
  const getHeaderDateString = () => {
    if (!selectedDate) return 'Select Date';
    return selectedDate.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const getHeaderYear = () => {
    if (!selectedDate) return new Date().getFullYear();
    return selectedDate.getFullYear();
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <input
        type="text"
        readOnly
        value={value ? new Date(value + 'T00:00:00').toLocaleDateString() : ''}
        onClick={() => setIsOpen(true)}
        className={`${className} cursor-pointer`}
        placeholder="Select Date"
        required={required}
      />
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-[#1e293b] border border-slate-700 text-white rounded-2xl w-[320px] shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
          {/* Header */}
          <div className="bg-slate-900 p-5 border-b border-slate-800">
            <div className="text-slate-400 text-xs font-semibold tracking-wider">{getHeaderYear()}</div>
            <div className="text-2xl font-bold mt-1 text-orange-500">{getHeaderDateString()}</div>
          </div>

          {/* Month Selector */}
          <div className="flex justify-between items-center px-4 py-3">
            <button type="button" onClick={handlePrevMonth} className="p-1 hover:bg-slate-800 rounded-full text-slate-300">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="font-semibold text-sm">
              {MONTHS[currentMonth]} {currentYear}
            </div>
            <button type="button" onClick={handleNextMonth} className="p-1 hover:bg-slate-800 rounded-full text-slate-300">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Calendar Grid */}
          <div className="px-4 pb-4">
            {/* Weekdays */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400 mb-2">
              {DAYS_SHORT.map((day, idx) => (
                <div key={idx} className="h-8 flex items-center justify-center">{day}</div>
              ))}
            </div>

            {/* Days */}
            <div className="grid grid-cols-7 gap-1 text-center text-sm">
              {/* Empty offset spaces */}
              {Array.from({ length: firstDayIndex }).map((_, idx) => (
                <div key={`empty-${idx}`} className="h-8" />
              ))}

              {/* Days of month */}
              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const day = idx + 1;
                const isSelected = selectedDate &&
                  selectedDate.getDate() === day &&
                  selectedDate.getMonth() === currentMonth &&
                  selectedDate.getFullYear() === currentYear;

                return (
                  <button
                    key={`day-${day}`}
                    type="button"
                    onClick={() => handleSelectDay(day)}
                    className={`h-8 w-8 mx-auto flex items-center justify-center rounded-full transition-colors ${
                      isSelected
                        ? 'bg-orange-500 text-white font-bold'
                        : 'hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 px-4 py-3 bg-slate-900 border-t border-slate-800">
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white rounded-md transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSet}
              className="px-4 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Set
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

// --- TIME PICKER ---
interface TimePickerProps {
  value: string; // HH:MM
  onChange: (val: string) => void;
  className?: string;
  required?: boolean;
}

export function CustomTimePicker({ value, onChange, className = '', required = false }: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [clockMode, setClockMode] = useState<'hour' | 'minute'>('hour');
  const [selectedHour, setSelectedHour] = useState(9);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize selectedHour/selectedMinute from value
  useEffect(() => {
    if (value) {
      const parts = value.split(':');
      if (parts.length === 2) {
        const h = parseInt(parts[0]);
        const m = parseInt(parts[1]);
        if (!isNaN(h) && !isNaN(m)) {
          setSelectedHour(h);
          setSelectedMinute(m);
        }
      }
    }
  }, [value]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleClear = () => {
    onChange('');
    setIsOpen(false);
  };

  const handleSet = () => {
    const hStr = String(selectedHour).padStart(2, '0');
    const mStr = String(selectedMinute).padStart(2, '0');
    onChange(`${hStr}:${mStr}`);
    setIsOpen(false);
  };

  // Convert 24h hour to 12h display string
  const formatTimeDisplay = () => {
    const ampm = selectedHour >= 12 ? 'PM' : 'AM';
    let h12 = selectedHour % 12;
    if (h12 === 0) h12 = 12;
    const hStr = String(h12).padStart(2, '0');
    const mStr = String(selectedMinute).padStart(2, '0');
    return { hStr, mStr, ampm };
  };

  const display = formatTimeDisplay();

  const handleClockClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI); // -180 to 180
    angle = (angle + 90 + 360) % 360; // 0 to 360, 0 is top (12 o'clock)

    if (clockMode === 'hour') {
      const dist = Math.sqrt(dx * dx + dy * dy);
      const isInner = dist < (rect.width * 0.28); // inner circle threshold
      let hour = Math.round(angle / 30); // 0 to 12
      if (hour === 0) hour = 12;
      if (isInner) {
        // inner circle: 00, 13-23
        if (hour === 12) {
          hour = 0;
        } else {
          hour = hour + 12;
        }
      }
      setSelectedHour(hour);
      setClockMode('minute');
    } else {
      const minute = Math.round(angle / 6) % 60; // 0 to 59
      setSelectedMinute(minute);
    }
  };

  // Render numbers around the clock face
  const renderHours = () => {
    const outerHours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const innerHours = [0, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

    return (
      <>
        {/* Outer Circle (1-12) */}
        {outerHours.map((h, i) => {
          const angleDeg = i * 30;
          const angleRad = (angleDeg - 90) * (Math.PI / 180);
          const x = 50 + 38 * Math.cos(angleRad);
          const y = 50 + 38 * Math.sin(angleRad);
          const isSelected = selectedHour === h;
          return (
            <div
              key={`outer-h-${h}`}
              style={{ left: `${x}%`, top: `${y}%` }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 text-xs font-semibold select-none transition-colors ${
                isSelected ? 'text-white font-bold' : 'text-slate-300'
              }`}
            >
              {h}
            </div>
          );
        })}

        {/* Inner Circle (00, 13-23) */}
        {innerHours.map((h, i) => {
          const angleDeg = i * 30;
          const angleRad = (angleDeg - 90) * (Math.PI / 180);
          const x = 50 + 22 * Math.cos(angleRad);
          const y = 50 + 22 * Math.sin(angleRad);
          const isSelected = selectedHour === h;
          return (
            <div
              key={`inner-h-${h}`}
              style={{ left: `${x}%`, top: `${y}%` }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 text-[10px] font-medium select-none transition-colors ${
                isSelected ? 'text-white font-bold' : 'text-slate-500'
              }`}
            >
              {h === 0 ? '00' : h}
            </div>
          );
        })}
      </>
    );
  };

  const renderMinutes = () => {
    const mins = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
    return mins.map((m, i) => {
      const angleDeg = i * 30;
      const angleRad = (angleDeg - 90) * (Math.PI / 180);
      const x = 50 + 38 * Math.cos(angleRad);
      const y = 50 + 38 * Math.sin(angleRad);
      const isSelected = selectedMinute === m;
      return (
        <div
          key={`min-${m}`}
          style={{ left: `${x}%`, top: `${y}%` }}
          className={`absolute -translate-x-1/2 -translate-y-1/2 text-xs font-semibold select-none transition-colors ${
            isSelected ? 'text-white font-bold' : 'text-slate-300'
          }`}
        >
          {String(m).padStart(2, '0')}
        </div>
      );
    });
  };

  // Get current hand angle and length
  const getHandStyle = () => {
    if (clockMode === 'hour') {
      const isInner = selectedHour === 0 || (selectedHour >= 13 && selectedHour <= 23);
      const radius = isInner ? 22 : 38;
      const angle = (selectedHour % 12) * 30;
      return {
        transform: `rotate(${angle}deg)`,
        height: `${radius}%`,
      };
    } else {
      const angle = selectedMinute * 6;
      return {
        transform: `rotate(${angle}deg)`,
        height: '38%',
      };
    }
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <input
        type="text"
        readOnly
        value={value ? `${display.hStr}:${display.mStr} ${display.ampm}` : ''}
        onClick={() => {
          setIsOpen(true);
          setClockMode('hour');
        }}
        className={`${className} cursor-pointer`}
        placeholder="Select Time"
        required={required}
      />
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-[#1e293b] border border-slate-700 text-white rounded-2xl w-[280px] shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
          {/* Header */}
          <div className="bg-slate-900 p-5 flex justify-center items-center gap-1 border-b border-slate-800">
            <button
              type="button"
              onClick={() => setClockMode('hour')}
              className={`text-4xl font-bold ${clockMode === 'hour' ? 'text-orange-500' : 'text-slate-500'}`}
            >
              {display.hStr}
            </button>
            <span className="text-4xl font-bold text-slate-500">:</span>
            <button
              type="button"
              onClick={() => setClockMode('minute')}
              className={`text-4xl font-bold ${clockMode === 'minute' ? 'text-orange-500' : 'text-slate-500'}`}
            >
              {display.mStr}
            </button>
            <div className="flex flex-col ml-3 text-sm font-bold text-slate-400">
              <button
                type="button"
                onClick={() => setSelectedHour((prev) => (prev < 12 ? prev + 12 : prev))}
                className={selectedHour >= 12 ? 'text-orange-500' : 'text-slate-500'}
              >
                PM
              </button>
              <button
                type="button"
                onClick={() => setSelectedHour((prev) => (prev >= 12 ? prev - 12 : prev))}
                className={selectedHour < 12 ? 'text-orange-500' : 'text-slate-500'}
              >
                AM
              </button>
            </div>
          </div>

          {/* Clock Dial container */}
          <div className="p-6 flex items-center justify-center bg-slate-800">
            <div
              onClick={handleClockClick}
              className="relative w-48 h-48 rounded-full bg-slate-900 border border-slate-700 cursor-pointer flex items-center justify-center"
            >
              {/* Center Pivot dot */}
              <div className="absolute w-2 h-2 rounded-full bg-orange-500 z-20" />

              {/* Clock Hand line */}
              <div
                style={getHandStyle()}
                className="absolute bottom-1/2 w-0.5 bg-orange-500 origin-bottom z-10 flex flex-col items-center justify-start"
              >
                {/* Hand tip dot */}
                <div className="w-5 h-5 rounded-full bg-orange-500 -mt-2.5 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                </div>
              </div>

              {/* Numbers */}
              {clockMode === 'hour' ? renderHours() : renderMinutes()}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 px-4 py-3 bg-slate-900 border-t border-slate-800">
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white rounded-md transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSet}
              className="px-4 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Set
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
