'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getApiUrl } from '@/config/api';

export default function LecturerEntrancePage() {
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const endpoint = isRegisterMode ? '/auth/register' : '/auth/login';
      const body = isRegisterMode 
        ? { username, password, name: fullName } 
        : { username, password };

      const res = await fetch(`${getApiUrl()}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Something went wrong');
      }

      const data = await res.json();
      console.log('Success!', data);
      localStorage.setItem('codexa_token', data.access_token);
      localStorage.setItem('codexa_user', JSON.stringify(data.user));
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6 bg-slate-50 text-slate-800">
      <div className="w-full max-w-md bg-white border border-slate-200/80 p-8 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
        
        {/* LOGO Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold tracking-wider bg-gradient-to-r from-slate-900 to-[#1b2554] bg-clip-text text-transparent font-sans">
            CODEXA
          </h1>
          <span className="inline-block mt-2 text-[10px] bg-slate-100 border border-slate-200 text-slate-600 font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
            Lecturer Portal
          </span>
        </div>
        
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegisterMode && (
            <div>
              <label htmlFor="fullName" className="block text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">Full Name</label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                required
              />
            </div>
          )}

          <div>
            <label htmlFor="username" className="block text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#0a0f24] hover:bg-[#1b2554] text-white font-semibold py-3 px-4 rounded-xl transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? 'Please wait...' : (isRegisterMode ? 'Create Account' : 'Login')}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setIsRegisterMode(!isRegisterMode);
            setError('');
            setUsername('');
            setPassword('');
            setFullName('');
          }}
          className="w-full mt-4 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
        >
          {isRegisterMode ? 'Already have an account? Login instead' : "Don't have an account? Create one"}
        </button>
      </div>
    </main>
  );
}
