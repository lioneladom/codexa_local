'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getApiUrl } from '@/config/api';

interface Exam {
  id: string;
  title: string;
  courseCode: string;
  status: string;
  duration: number;
  createdAt: string;
  studentPassword?: string;
  invigilatorPassword?: string;
  studentAccessUrl?: string;
  invigilatorAccessUrl?: string;
  accessCode?: string;
}

export default function ExamsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishLoading, setPublishLoading] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  const fetchExams = async (token: string) => {
    try {
      const res = await fetch(`${getApiUrl()}/exams`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setExams(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem('codexa_token');
    if (!token) {
      router.replace('/');
    } else {
      fetchExams(token);
    }
  }, [router]);

  if (!mounted) {
    return null;
  }

  const handlePublish = async (examId: string) => {
    const token = localStorage.getItem('codexa_token');
    if (!token) return;
    setPublishLoading(examId);
    try {
      const res = await fetch(`${getApiUrl()}/exams/${examId}/publish`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setExams((prev) =>
          prev.map((exam) =>
            exam.id === examId ? { ...exam, ...data.exam, ...data } : exam
          )
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPublishLoading(null);
    }
  };

  const getUrls = (exam: Exam) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const code = exam.accessCode || '';
    return {
      studentAccessUrl: `${origin}/exam/${code}`,
      invigilatorAccessUrl: `${origin}/invigilate/${code}`,
    };
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteExam = async (examId: string) => {
    const token = localStorage.getItem('codexa_token');
    if (!token) return;
    setDeleteLoading(examId);
    try {
      const res = await fetch(`${getApiUrl()}/exams/${examId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        setExams((prev) => prev.filter((exam) => exam.id !== examId));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeleteLoading(null);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Exams</h1>
        <Link
          href="/dashboard/exams/create"
          className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90"
        >
          Create Exam
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading exams...</div>
      ) : (
        <div className="space-y-4">
          {exams.length === 0 ? (
            <div className="border border-border rounded-lg p-6 text-center">
              <p className="text-muted-foreground">No exams yet. Create your first exam!</p>
            </div>
          ) : (
            exams.map((exam) => (
              <div key={exam.id} className="border border-border rounded-lg p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-semibold">{exam.title}</h3>
                    <p className="text-muted-foreground">{exam.courseCode}</p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      exam.status === 'PUBLISHED'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                        : exam.status === 'DRAFT'
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100'
                    }`}
                  >
                    {exam.status === 'ARCHIVED' ? 'CLOSED' : exam.status}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Duration:</span> {exam.duration} min
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created:</span>{' '}
                    {new Date(exam.createdAt).toLocaleDateString()}
                  </div>
                </div>

                 {exam.status === 'PUBLISHED' && exam.accessCode && (
                  <div className="mt-4 border-t border-border pt-4">
                    <h4 className="font-semibold mb-3">Access Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium mb-1">Student Access</p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={getUrls(exam).studentAccessUrl}
                            readOnly
                            className="flex-1 px-3 py-2 border border-border rounded-md bg-input text-foreground text-sm"
                          />
                          <button
                            onClick={() => copyToClipboard(getUrls(exam).studentAccessUrl, `student-${exam.id}`)}
                            className="px-3 py-2 border border-border rounded-md hover:bg-muted text-xs font-medium min-w-[80px] transition-colors"
                          >
                            {copiedId === `student-${exam.id}` ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Password: {exam.studentPassword}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-1">Invigilator Access</p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={getUrls(exam).invigilatorAccessUrl}
                            readOnly
                            className="flex-1 px-3 py-2 border border-border rounded-md bg-input text-foreground text-sm"
                          />
                          <button
                            onClick={() => copyToClipboard(getUrls(exam).invigilatorAccessUrl, `invigilate-${exam.id}`)}
                            className="px-3 py-2 border border-border rounded-md hover:bg-muted text-xs font-medium min-w-[80px] transition-colors"
                          >
                            {copiedId === `invigilate-${exam.id}` ? '✓ Copied' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Password: {exam.invigilatorPassword}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  {exam.status === 'DRAFT' && (
                    <>
                      <Link
                        href={`/dashboard/exams/create?edit=${exam.id}`}
                        className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 text-xs font-semibold transition-all shadow-sm"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handlePublish(exam.id)}
                        disabled={publishLoading === exam.id}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 text-xs font-semibold transition-all shadow-sm"
                      >
                        {publishLoading === exam.id ? 'Publishing...' : 'Publish'}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(exam.id)}
                        disabled={deleteLoading === exam.id}
                        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 text-xs font-semibold transition-all shadow-sm"
                      >
                        Delete
                      </button>
                    </>
                  )}
                  {exam.status === 'PUBLISHED' && (
                    <Link
                      href={`/dashboard/exams/${exam.id}/monitor`}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs font-semibold transition-all shadow-sm"
                    >
                      Monitor Exam
                    </Link>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-[#000000]/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-[#e2e8f0]/80 rounded-2xl max-w-sm w-full p-6 shadow-2xl text-center">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-900">Delete Exam Draft</h3>
            <p className="text-sm text-slate-500 mt-2">
              Are you sure you want to permanently delete this exam draft? This action cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 text-xs font-semibold rounded-xl hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const examId = showDeleteConfirm;
                  setShowDeleteConfirm(null);
                  handleDeleteExam(examId);
                }}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition-all shadow-md"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
