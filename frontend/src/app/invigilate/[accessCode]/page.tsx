'use client';

import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { getApiUrl, getSocketUrl } from '@/config/api';

interface Submission {
  id: string;
  questionId: string;
  score: number;
  totalMarks: number;
  status: string;
}

interface ExamSession {
  id: string;
  studentName: string;
  studentNumber: string;
  startedAt?: string;
  completedAt?: string;
  status: string;
  warningCount: number;
  submissions: Submission[];
}

interface ActivityLog {
  id: string;
  studentName: string;
  studentNumber: string;
  activityType: string;
  details: string;
  timestamp: Date;
}

export default function InvigilatorPage({ params }: { params: { accessCode: string } }) {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [examInfo, setExamInfo] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'candidates' | 'feed'>('candidates');
  
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const socketRef = useRef<Socket | null>(null);

  // 1. Authenticate with invigilator credentials and fetch seed sessions
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Fetch exam details first
      const examRes = await fetch(`${getApiUrl()}/exams/access/${params.accessCode.toUpperCase()}`);
      if (!examRes.ok) {
        throw new Error('Exam not found or has been closed.');
      }
      const examData = await examRes.json();
      setExamInfo(examData);

      // Fetch active sessions using the new endpoint
      const res = await fetch(`${getApiUrl()}/exams/access/${params.accessCode.toUpperCase()}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invigilatorPassword: password }),
      });

      if (!res.ok) {
        throw new Error('Authentication failed. Invalid invigilator password.');
      }

      const sessionsData = await res.json();
      setSessions(sessionsData);
      setIsAuthenticated(true);
    } catch (err: any) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Establish Socket.io connection and handle real-time candidate notifications
  useEffect(() => {
    if (!isAuthenticated || !examInfo) return;

    // Connect to WebSocket server
    const socket = io(getSocketUrl());
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to monitoring gateway');
      // Join exam room
      socket.emit('joinExam', {
        examId: examInfo.id,
        userType: 'INVIGILATOR',
        name: 'Room Invigilator',
      });
    });

    // Handle incoming real-time activity events
    socket.on('activity', (event: { activity: string; data: any; timestamp: string }) => {
      const { activity, data, timestamp } = event;
      const logTime = new Date(timestamp);

      // Update local state list and add to feed logs
      setSessions(prevSessions => {
        const studentIndex = prevSessions.findIndex(
          s => s.studentNumber === data.studentNumber
        );

        const updated = [...prevSessions];

        if (activity === 'STUDENT_JOIN') {
          // If student joined and is not in list, add them
          if (studentIndex === -1) {
            updated.push({
              id: data.sessionId || Math.random().toString(),
              studentName: data.studentName,
              studentNumber: data.studentNumber,
              status: 'ACTIVE',
              warningCount: 0,
              submissions: [],
              startedAt: logTime.toISOString(),
            });
          } else {
            updated[studentIndex].status = 'ACTIVE';
          }

          setActivityLogs(prev => [
            {
              id: Math.random().toString(),
              studentName: data.studentName,
              studentNumber: data.studentNumber,
              activityType: 'JOIN',
              details: 'Entered the examination room.',
              timestamp: logTime,
            },
            ...prev,
          ]);
        } 
        
        else if (activity === 'STUDENT_SUBMISSION') {
          if (studentIndex !== -1) {
            // Update score/submission in list
            const existingSubIndex = updated[studentIndex].submissions.findIndex(
              sub => sub.questionId === data.questionId
            );
            
            const submissionDetails = {
              id: Math.random().toString(),
              questionId: data.questionId || '',
              score: data.score,
              totalMarks: data.totalMarks,
              status: 'GRADED',
            };

            if (existingSubIndex === -1) {
              updated[studentIndex].submissions.push(submissionDetails);
            } else {
              updated[studentIndex].submissions[existingSubIndex] = submissionDetails;
            }
          }

          setActivityLogs(prev => [
            {
              id: Math.random().toString(),
              studentName: data.studentName,
              studentNumber: data.studentNumber,
              activityType: 'SUBMIT',
              details: `Submitted question "${data.questionTitle}" • Scored ${data.score}/${data.totalMarks}`,
              timestamp: logTime,
            },
            ...prev,
          ]);
        } 
        
        else if (activity === 'STUDENT_WARNING') {
          if (studentIndex !== -1) {
            updated[studentIndex].warningCount = data.warningCount;
          }

          setActivityLogs(prev => [
            {
              id: Math.random().toString(),
              studentName: data.studentName,
              studentNumber: data.studentNumber,
              activityType: 'WARNING',
              details: `Security Warning! Tab Switch/Unfocus detected. Total: ${data.warningCount}`,
              timestamp: logTime,
            },
            ...prev,
          ]);
        } 
        
        else if (activity === 'STUDENT_COMPLETED') {
          if (studentIndex !== -1) {
            updated[studentIndex].status = 'COMPLETED';
            updated[studentIndex].completedAt = logTime.toISOString();
          }

          setActivityLogs(prev => [
            {
              id: Math.random().toString(),
              studentName: data.studentName,
              studentNumber: data.studentNumber,
              activityType: 'COMPLETE',
              details: 'Finalized and submitted the examination.',
              timestamp: logTime,
            },
            ...prev,
          ]);
        }

        return updated;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [isAuthenticated, examInfo]);

  /* Screen 1: Access Verification */
  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 bg-slate-50 text-slate-800">
        <div className="w-full max-w-md bg-white border border-slate-200/80 p-8 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
          
          <form className="space-y-6" onSubmit={handleLogin}>
            <div className="text-center mb-6">
              <h1 className="text-3xl font-extrabold tracking-wider bg-gradient-to-r from-slate-900 to-[#1b2554] bg-clip-text text-transparent font-sans">
                CODEXA
              </h1>
              <span className="inline-block mt-2 text-[10px] bg-slate-100 border border-slate-200 text-slate-600 font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Invigilator Monitoring Gateway
              </span>
              <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700">
                Access Code: {params.accessCode.toUpperCase()}
              </div>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">
                Invigilator Key / Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-center tracking-widest"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0a0f24] hover:bg-[#1b2554] text-white font-semibold py-3 px-4 rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : 'Enter Monitoring Station'}
            </button>
          </form>
        </div>
      </main>
    );
  }

  /* Screen 2: Real-time Monitor Desk */
  return (
    <div className="flex flex-col h-screen bg-[#070b19] text-[#e2e8f0] overflow-hidden">
      {/* Header */}
      <header className="bg-[#0c102b] border-b border-[#1e295d] px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-lg flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-wide font-sans text-white">{examInfo?.title}</h1>
          <p className="text-xs text-slate-400 mt-0.5 font-mono">
            Room Code: {params.accessCode.toUpperCase()} • Local Server Gateway
          </p>
        </div>
        <div className="flex gap-4 w-full sm:w-auto justify-between sm:justify-end">
          <div className="bg-[#1b2554] border border-accent/40 rounded-xl px-4 py-2 text-xs font-semibold flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-accent animate-ping"></span>
            <span>Live Sync Connected</span>
          </div>
        </div>
      </header>

      {/* Mobile Tab Switcher */}
      <div className="flex lg:hidden bg-[#0c102b] border-b border-[#1e295d] text-slate-300 font-mono select-none flex-shrink-0">
        <button
          onClick={() => setActiveTab('candidates')}
          className={`flex-1 py-3 text-center text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'candidates' ? 'border-accent text-white bg-slate-800/40' : 'border-transparent text-slate-500'
          }`}
        >
          Candidates ({sessions.length})
        </button>
        <button
          onClick={() => setActiveTab('feed')}
          className={`flex-1 py-3 text-center text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'feed' ? 'border-accent text-white bg-slate-800/40' : 'border-transparent text-slate-500'
          }`}
        >
          Live Feed ({activityLogs.length})
        </button>
      </div>

      {/* Main split dashboard pane */}
      <div className="flex flex-1 flex-col lg:flex-row overflow-hidden">
        {/* Left Side: Candidates Grid Status */}
        <main className={`w-full lg:w-2/3 p-6 overflow-y-auto border-r border-[#1e295d] ${
          activeTab === 'candidates' ? 'block' : 'hidden lg:block'
        }`}>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 font-mono">
            Candidates List ({sessions.length})
          </h2>
          
          {sessions.length === 0 ? (
            <div className="h-[400px] flex items-center justify-center border border-dashed border-[#1e295d] rounded-2xl text-slate-500 text-sm">
              Waiting for students to join the examination room...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sessions.map((student) => {
                const isViolator = student.warningCount >= 3;
                const isCompleted = student.status === 'COMPLETED';

                return (
                  <div
                    key={student.id}
                    className={`p-5 rounded-2xl border transition-all relative overflow-hidden ${
                      isViolator
                        ? 'bg-red-950/20 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
                        : isCompleted
                        ? 'bg-[#1b2554]/10 border-[#1e295d] opacity-80'
                        : 'bg-[#0e132c]/80 border-[#1e295d]'
                    }`}
                  >
                    {/* Glowing highlight indicator */}
                    <div className={`absolute top-0 left-0 right-0 h-[3px] ${
                      isViolator ? 'bg-red-500' : isCompleted ? 'bg-accent' : 'bg-slate-700'
                    }`}></div>

                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-bold text-sm text-[#ffffff]">{student.studentName}</h3>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">{student.studentNumber}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold font-mono ${
                        isCompleted
                          ? 'bg-accent/20 text-accent border border-accent/30'
                          : 'bg-green-500/20 text-green-400 border border-green-500/30'
                      }`}>
                        {student.status}
                      </span>
                    </div>

                    <div className="flex justify-between items-center mt-6 pt-3 border-t border-[#1e295d]/50 text-xs">
                      <div>
                        <span className="text-slate-400">Total Submissions: </span>
                        <span className="font-bold font-mono text-white">{student.submissions.length}</span>
                      </div>
                      
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">Warnings:</span>
                        <span className={`font-bold font-mono px-2 py-0.5 rounded ${
                          student.warningCount > 0 ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-300'
                        }`}>
                          {student.warningCount}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>

        {/* Right Side: Live Activity Feed */}
        <aside className={`w-full lg:w-1/3 p-6 overflow-y-auto bg-[#0a0f25]/50 flex flex-col ${
          activeTab === 'feed' ? 'flex' : 'hidden lg:flex'
        }`}>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 font-mono">
            Live Room Feed
          </h2>

          <div className="flex-1 space-y-4 overflow-y-auto">
            {activityLogs.length === 0 ? (
              <p className="text-xs text-slate-500 italic text-center pt-8">No live activities logged yet.</p>
            ) : (
              activityLogs.map((log) => {
                let badgeColor = 'bg-slate-800 text-slate-400';
                if (log.activityType === 'WARNING') badgeColor = 'bg-red-500/20 text-red-400 border border-red-500/30';
                if (log.activityType === 'COMPLETE') badgeColor = 'bg-accent/20 text-accent border border-accent/30';
                if (log.activityType === 'JOIN') badgeColor = 'bg-green-500/20 text-green-400 border border-green-500/30';

                return (
                  <div key={log.id} className="p-3 bg-[#0d1330] border border-[#1e295d] rounded-xl text-xs space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-300">{log.studentName}</span>
                      <span className="text-[10px] text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold uppercase ${badgeColor}`}>
                        {log.activityType}
                      </span>
                      <p className="text-slate-400 text-[11px] leading-tight flex-1">{log.details}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
