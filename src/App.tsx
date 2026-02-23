import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  CheckSquare, 
  Plus, 
  Clock, 
  MapPin, 
  ChevronRight, 
  Trash2, 
  Users,
  LayoutDashboard,
  Vote,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  Pencil,
  ChevronLeft
} from 'lucide-react';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot
} from 'firebase/firestore';
import { firebaseConfig, appId, initialAuthToken } from './config';
import type { User } from 'firebase/auth';

// --- Firebase Configuration ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Components ---

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${className}`}>
    {children}
  </div>
);

const Button = ({ children, onClick, variant = "primary", className = "", type = "button", disabled = false }: { children: React.ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "danger" | "outline"; className?: string; type?: "button" | "submit"; disabled?: boolean }) => {
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300",
    secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    danger: "bg-red-50 text-red-600 hover:bg-red-100",
    outline: "border border-slate-200 text-slate-600 hover:bg-slate-50"
  };
  return (
    <button 
      type={type}
      onClick={onClick} 
      disabled={disabled}
      className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center justify-center gap-2 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

const Input = ({ label, ...props }: { label?: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && <label className="text-sm font-semibold text-slate-700">{label}</label>}
    <input 
      {...props} 
      className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
    />
  </div>
);

// --- Format helpers (한국식 날짜, 24시간 형식) ---
const formatDateKO = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
};

const formatTime24 = (timeStr?: string) => {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const min = m || '00';
  return `${hour.toString().padStart(2, '0')}:${min.padStart(2, '0')}`;
};

// --- Calendar helpers ---
const getCalendarDays = (year: number, month: number) => {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const daysInMonth = last.getDate();
  const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;
  const days: { date: Date; day: number; isCurrentMonth: boolean; dateStr: string }[] = [];
  const toStr = (d: Date) => `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;

  for (let i = 0; i < totalCells; i++) {
    if (i < startPad) {
      const d = new Date(year, month - 1, new Date(year, month, 0).getDate() - startPad + i + 1);
      days.push({ date: d, day: d.getDate(), isCurrentMonth: false, dateStr: toStr(d) });
    } else if (i < startPad + daysInMonth) {
      const d = new Date(year, month, i - startPad + 1);
      days.push({ date: d, day: d.getDate(), isCurrentMonth: true, dateStr: toStr(d) });
    } else {
      const d = new Date(year, month + 1, i - startPad - daysInMonth + 1);
      days.push({ date: d, day: d.getDate(), isCurrentMonth: false, dateStr: toStr(d) });
    }
  }
  return days;
};

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

// --- Main Application ---

type ScheduleResponse = 'attend' | 'notAttend' | 'undecided';

interface Schedule {
  id: string;
  title: string;
  date: string;
  time?: string;
  location?: string;
  desc?: string;
  attendees?: string[];
  notAttendees?: string[];
  undecided?: string[];
}

interface PollOption {
  id: string;
  text: string;
  votes: number;
}

interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  totalVotes: number;
  votedUsers?: string[];
  votedUserOptions?: Record<string, string[]>; // userId -> optionIds (중복투표용)
  allowMultiple?: boolean;
  isAnonymous?: boolean;
  allowAddOptions?: boolean;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState('dashboard');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [isAddingSchedule, setIsAddingSchedule] = useState(false);
  const [isAddingPoll, setIsAddingPoll] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  const [newSchedule, setNewSchedule] = useState({ title: '', date: '', time: '', location: '', desc: '' });
  const [newPoll, setNewPoll] = useState({ 
    question: '', 
    options: ['', ''] as string[], 
    allowMultiple: false, 
    isAnonymous: false, 
    allowAddOptions: false 
  });
  const [addingOptionToPollId, setAddingOptionToPollId] = useState<string | null>(null);
  const [newOptionText, setNewOptionText] = useState('');

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth error:", error);
        setAuthError("Firebase 설정이 필요합니다. src/config.ts에서 Firebase Console의 config를 입력해주세요.");
        setLoading(false);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setAuthError(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const scheduleCol = collection(db, 'artifacts', appId, 'public', 'data', 'schedules');
    const unsubSchedules = onSnapshot(scheduleCol, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Schedule));
      setSchedules(data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    }, (err) => console.error("Schedule sync error:", err));

    const pollCol = collection(db, 'artifacts', appId, 'public', 'data', 'polls');
    const unsubPolls = onSnapshot(pollCol, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Poll));
      setPolls(data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    }, (err) => console.error("Poll sync error:", err));

    return () => {
      unsubSchedules();
      unsubPolls();
    };
  }, [user]);

  const addSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newSchedule.title || !newSchedule.date) return;
    
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'schedules'), {
        ...newSchedule,
        createdAt: Date.now(),
        creator: user.uid,
        attendees: [],
        notAttendees: [],
        undecided: []
      });
      setNewSchedule({ title: '', date: '', time: '', location: '', desc: '' });
      setIsAddingSchedule(false);
    } catch (err) {
      console.error("Add schedule error:", err);
    }
  };

  const deleteSchedule = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', id));
      if (editingScheduleId === id) setEditingScheduleId(null);
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const startEditSchedule = (schedule: Schedule) => {
    setEditingScheduleId(schedule.id);
    setNewSchedule({
      title: schedule.title,
      date: schedule.date,
      time: schedule.time || '',
      location: schedule.location || '',
      desc: schedule.desc || ''
    });
    setIsAddingSchedule(false);
  };

  const cancelEditSchedule = () => {
    setEditingScheduleId(null);
    setNewSchedule({ title: '', date: '', time: '', location: '', desc: '' });
  };

  const updateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingScheduleId || !newSchedule.title || !newSchedule.date) return;
    try {
      const scheduleRef = doc(db, 'artifacts', appId, 'public', 'data', 'schedules', editingScheduleId);
      await updateDoc(scheduleRef, {
        title: newSchedule.title,
        date: newSchedule.date,
        time: newSchedule.time,
        location: newSchedule.location,
        desc: newSchedule.desc,
        updatedAt: Date.now()
      });
      setNewSchedule({ title: '', date: '', time: '', location: '', desc: '' });
      setEditingScheduleId(null);
    } catch (err) {
      console.error("Update schedule error:", err);
    }
  };

  const handleScheduleVote = async (scheduleId: string, response: ScheduleResponse) => {
    if (!user) return;
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return;

    const attendees = schedule.attendees || [];
    const notAttendees = schedule.notAttendees || [];
    const undecided = schedule.undecided || [];

    const newAttendees = response === 'attend' ? [...attendees.filter(id => id !== user.uid), user.uid] : attendees.filter(id => id !== user.uid);
    const newNotAttendees = response === 'notAttend' ? [...notAttendees.filter(id => id !== user.uid), user.uid] : notAttendees.filter(id => id !== user.uid);
    const newUndecided = response === 'undecided' ? [...undecided.filter(id => id !== user.uid), user.uid] : undecided.filter(id => id !== user.uid);

    try {
      const scheduleRef = doc(db, 'artifacts', appId, 'public', 'data', 'schedules', scheduleId);
      await updateDoc(scheduleRef, {
        attendees: newAttendees,
        notAttendees: newNotAttendees,
        undecided: newUndecided
      });
    } catch (err) {
      console.error("Schedule vote error:", err);
    }
  };

  const addPoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newPoll.question || newPoll.options.filter(o => o.trim()).length < 1) return;

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'polls'), {
        question: newPoll.question,
        options: newPoll.options.filter(t => t.trim()).map((text, idx) => ({ id: `opt-${Date.now()}-${idx}`, text, votes: 0 })),
        totalVotes: 0,
        createdAt: Date.now(),
        creator: user.uid,
        votedUsers: [],
        votedUserOptions: {},
        allowMultiple: newPoll.allowMultiple,
        isAnonymous: newPoll.isAnonymous,
        allowAddOptions: newPoll.allowAddOptions
      });
      setNewPoll({ question: '', options: ['', ''], allowMultiple: false, isAnonymous: false, allowAddOptions: false });
      setIsAddingPoll(false);
    } catch (err) {
      console.error("Add poll error:", err);
    }
  };

  const handleVote = async (pollId: string, optionId: string) => {
    if (!user) return;
    const poll = polls.find(p => p.id === pollId);
    if (!poll) return;

    const votedUserOpts = poll.votedUserOptions || {};
    const votedUsers = poll.votedUsers || [];
    const mySelectedIds = votedUserOpts[user.uid] || [];
    const isMulti = poll.allowMultiple;

    if (isMulti) {
      const alreadyVoted = mySelectedIds.includes(optionId);
      const newSelectedIds = alreadyVoted 
        ? mySelectedIds.filter(id => id !== optionId)
        : [...mySelectedIds, optionId];
      
      const voteDelta = alreadyVoted ? -1 : 1;
      const optVoteDelta = alreadyVoted ? -1 : 1;
      const updatedOptions = poll.options.map(opt => 
        opt.id === optionId ? { ...opt, votes: Math.max(0, opt.votes + voteDelta) } : opt
      );
      const newVotedUserOpts = { ...votedUserOpts, [user.uid]: newSelectedIds };
      const wasInVotedUsers = votedUsers.includes(user.uid);
      const newVotedUsers = (newSelectedIds.length > 0 && !wasInVotedUsers) 
        ? [...votedUsers, user.uid] 
        : (newSelectedIds.length === 0 ? votedUsers.filter(id => id !== user.uid) : votedUsers);
      const newTotal = poll.totalVotes + voteDelta;

      try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'polls', pollId), {
          options: updatedOptions,
          totalVotes: Math.max(0, newTotal),
          votedUserOptions: newVotedUserOpts,
          votedUsers: newVotedUsers
        });
      } catch (err) {
        console.error("Vote error:", err);
      }
    } else {
      if (votedUsers.includes(user.uid)) return;
      try {
        const pollRef = doc(db, 'artifacts', appId, 'public', 'data', 'polls', pollId);
        const updatedOptions = poll.options.map(opt => 
          opt.id === optionId ? { ...opt, votes: opt.votes + 1 } : opt
        );
        await updateDoc(pollRef, {
          options: updatedOptions,
          totalVotes: poll.totalVotes + 1,
          votedUsers: [...votedUsers, user.uid],
          votedUserOptions: { ...votedUserOpts, [user.uid]: [optionId] }
        });
      } catch (err) {
        console.error("Vote error:", err);
      }
    }
  };

  const addOptionToPoll = async (pollId: string) => {
    if (!user || !newOptionText.trim()) return;
    const poll = polls.find(p => p.id === pollId);
    if (!poll || !poll.allowAddOptions) return;

    try {
      const pollRef = doc(db, 'artifacts', appId, 'public', 'data', 'polls', pollId);
      const newOpt = { id: `opt-${Date.now()}`, text: newOptionText.trim(), votes: 0 };
      await updateDoc(pollRef, {
        options: [...poll.options, newOpt]
      });
      setNewOptionText('');
      setAddingOptionToPollId(null);
    } catch (err) {
      console.error("Add option error:", err);
    }
  };

  const deletePoll = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'polls', id));
    } catch (err) {
      console.error("Delete poll error:", err);
    }
  };

  if (loading && !authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-blue-600" size={40} />
          <p className="text-slate-500 font-medium">모임 데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md bg-white rounded-xl shadow-lg border border-slate-200 p-8 text-center">
          <h2 className="text-lg font-bold text-slate-800 mb-2">Firebase 설정 필요</h2>
          <p className="text-slate-600 text-sm mb-4">{authError}</p>
          <p className="text-xs text-slate-400">Firebase Console에서 프로젝트를 만들고, src/config.ts에 설정 값을 입력해주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg text-white shadow-lg shadow-blue-100">
              <Users size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">청소도구함의 은밀한 회의</h1>
              <p className="text-[10px] text-slate-400 font-mono">ID: {user?.uid.slice(0, 8)}...</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold text-slate-700">
              {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <div className="flex items-center justify-end gap-1.5 text-[11px] text-slate-400 uppercase tracking-widest">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              Live Sync On
            </div>
          </div>
        </div>
      </header>

      <main className="flex gap-6 max-w-6xl mx-auto px-4 py-6">
        <div className="flex-1 min-w-0 space-y-6">
        <div className="flex bg-slate-200/50 p-1 rounded-xl">
          <button 
            onClick={() => setView('dashboard')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${view === 'dashboard' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600 hover:text-slate-800'}`}
          >
            <LayoutDashboard size={16} /> 홈
          </button>
          <button 
            onClick={() => setView('schedules')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${view === 'schedules' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600 hover:text-slate-800'}`}
          >
            <Calendar size={16} /> 일정
          </button>
          <button 
            onClick={() => setView('polls')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${view === 'polls' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600 hover:text-slate-800'}`}
          >
            <Vote size={16} /> 투표
          </button>
        </div>

        {view === 'dashboard' && (
          <div className="space-y-6">
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
                  <Calendar size={18} className="text-blue-500" /> 다가오는 일정
                </h2>
                <button onClick={() => setView('schedules')} className="text-sm text-blue-600 font-medium">전체보기</button>
              </div>
              <div className="space-y-3">
                {schedules.length > 0 ? schedules.slice(0, 2).map(schedule => {
                  const uid = user?.uid ?? '';
                  const myResponse: ScheduleResponse | null = schedule.attendees?.includes(uid) ? 'attend' : schedule.notAttendees?.includes(uid) ? 'notAttend' : schedule.undecided?.includes(uid) ? 'undecided' : null;
                  const attendCount = schedule.attendees?.length ?? 0;
                  const notAttendCount = schedule.notAttendees?.length ?? 0;
                  const undecidedCount = schedule.undecided?.length ?? 0;
                  return (
                  <Card key={schedule.id} className="p-4 border-l-4 border-l-blue-500 hover:translate-x-1 transition-transform">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-bold text-slate-800">{schedule.title}</h3>
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Calendar size={12} /> {formatDateKO(schedule.date)} {formatTime24(schedule.time) && `· ${formatTime24(schedule.time)}`}
                          </div>
                          {schedule.location && (
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <MapPin size={12} /> {schedule.location}
                            </div>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleScheduleVote(schedule.id, 'attend'); }}
                            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ${
                              myResponse === 'attend' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600 hover:bg-green-50 hover:text-green-600'
                            }`}
                          >
                            <ThumbsUp size={12} fill={myResponse === 'attend' ? 'currentColor' : 'none'} /> 참석 ({attendCount})
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleScheduleVote(schedule.id, 'notAttend'); }}
                            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ${
                              myResponse === 'notAttend' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600'
                            }`}
                          >
                            <ThumbsDown size={12} fill={myResponse === 'notAttend' ? 'currentColor' : 'none'} /> 불참 ({notAttendCount})
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleScheduleVote(schedule.id, 'undecided'); }}
                            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ${
                              myResponse === 'undecided' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600 hover:bg-amber-50 hover:text-amber-600'
                            }`}
                          >
                            <HelpCircle size={12} fill={myResponse === 'undecided' ? 'currentColor' : 'none'} /> 미정 ({undecidedCount})
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setView('schedules'); startEditSchedule(schedule); }}
                        className="p-2 -m-2 rounded-lg shrink-0 text-slate-300 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </Card>
                  );
                }) : (
                  <div className="text-center py-10 text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                    <Calendar size={32} className="mx-auto mb-2 opacity-20" />
                    <p>등록된 일정이 없습니다.</p>
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
                  <Vote size={18} className="text-purple-500" /> 최근 투표
                </h2>
                <button onClick={() => setView('polls')} className="text-sm text-blue-600 font-medium">전체보기</button>
              </div>
              {polls.length > 0 ? (
                <Card className="p-5 bg-gradient-to-br from-white to-slate-50">
                  <h3 className="font-bold text-slate-800 mb-4">{polls[0].question}</h3>
                  <div className="space-y-3">
                    {polls[0].options.map(opt => (
                      <div key={opt.id} className="w-full h-10 bg-slate-200/50 rounded-xl relative overflow-hidden">
                        <div 
                          className="absolute inset-0 bg-blue-500/10 transition-all duration-1000 ease-out" 
                          style={{ width: `${polls[0].totalVotes > 0 ? (opt.votes / polls[0].totalVotes) * 100 : 0}%` }}
                        />
                        <div className="absolute inset-0 px-4 flex items-center justify-between text-xs font-bold">
                          <span className="text-slate-700">{opt.text}</span>
                          <span className="text-blue-600 bg-white/80 px-2 py-0.5 rounded-lg shadow-sm">{opt.votes}표</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              ) : (
                <div className="text-center py-10 text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                  <Vote size={32} className="mx-auto mb-2 opacity-20" />
                  <p>진행 중인 투표가 없습니다.</p>
                </div>
              )}
            </section>
          </div>
        )}

        {view === 'schedules' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-slate-800">모임 일정</h2>
              <Button 
                onClick={() => { if (editingScheduleId) cancelEditSchedule(); setIsAddingSchedule(!isAddingSchedule); }} 
                variant={isAddingSchedule ? "outline" : "primary"}
              >
                {isAddingSchedule ? "취소" : <><Plus size={18} /> 일정 추가</>}
              </Button>
            </div>

            {(isAddingSchedule || editingScheduleId) && (
              <Card className="p-5 border-2 border-blue-100 bg-blue-50/20 shadow-lg">
                <h3 className="font-bold text-slate-800 mb-4">{editingScheduleId ? '일정 수정' : '일정 추가'}</h3>
                <form onSubmit={editingScheduleId ? updateSchedule : addSchedule} className="space-y-4">
                  <Input 
                    label="일정 제목" 
                    placeholder="예: 5월 정기 모임" 
                    value={newSchedule.title} 
                    onChange={e => setNewSchedule({...newSchedule, title: e.target.value})}
                    required
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <Input 
                      label="날짜" 
                      type="date" 
                      value={newSchedule.date} 
                      onChange={e => setNewSchedule({...newSchedule, date: e.target.value})}
                      required
                    />
                    <Input 
                      label="시간 (24시간 형식)" 
                      type="time" 
                      value={newSchedule.time} 
                      onChange={e => setNewSchedule({...newSchedule, time: e.target.value})}
                    />
                  </div>
                  <Input 
                    label="장소" 
                    placeholder="장소 또는 플랫폼 (Zoom 등)" 
                    value={newSchedule.location} 
                    onChange={e => setNewSchedule({...newSchedule, location: e.target.value})}
                  />
                  <Input 
                    label="설명" 
                    placeholder="상세 내용을 입력하세요" 
                    value={newSchedule.desc} 
                    onChange={e => setNewSchedule({...newSchedule, desc: e.target.value})}
                  />
                  <Button type="submit" className="w-full py-3">{editingScheduleId ? '수정 완료' : '일정 저장하기'}</Button>
                  {editingScheduleId && (
                    <Button type="button" onClick={cancelEditSchedule} variant="outline" className="w-full">취소</Button>
                  )}
                </form>
              </Card>
            )}

            <div className="space-y-3">
              {schedules.filter(s => s.id !== editingScheduleId).map(schedule => (
                <Card key={schedule.id} className="p-5 group">
                  <div className="flex justify-between items-start">
                    <div className="space-y-3 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider">UPCOMING</span>
                        <h3 className="text-lg font-bold text-slate-800">{schedule.title}</h3>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-white rounded-md border border-slate-200"><Calendar size={14} className="text-blue-500" /></div>
                          <span className="font-medium">{formatDateKO(schedule.date)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-white rounded-md border border-slate-200"><Clock size={14} className="text-blue-500" /></div>
                          <span className="font-medium">{formatTime24(schedule.time) || '시간 미지정'}</span>
                        </div>
                        <div className="flex items-center gap-2 sm:col-span-2">
                          <div className="p-1.5 bg-white rounded-md border border-slate-200"><MapPin size={14} className="text-blue-500" /></div>
                          <span className="font-medium">{schedule.location || '장소 미지정'}</span>
                        </div>
                      </div>
                      {schedule.desc && (
                        <p className="text-sm text-slate-500 italic px-1">
                          &quot;{schedule.desc}&quot;
                        </p>
                      )}
                      {(() => {
                        const uid = user?.uid ?? '';
                        const myResponse: ScheduleResponse | null = schedule.attendees?.includes(uid) ? 'attend' : schedule.notAttendees?.includes(uid) ? 'notAttend' : schedule.undecided?.includes(uid) ? 'undecided' : null;
                        const attendCount = schedule.attendees?.length ?? 0;
                        const notAttendCount = schedule.notAttendees?.length ?? 0;
                        const undecidedCount = schedule.undecided?.length ?? 0;
                        return (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              onClick={() => handleScheduleVote(schedule.id, 'attend')}
                              className={`flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                                myResponse === 'attend' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600 hover:bg-green-50 hover:text-green-600'
                              }`}
                            >
                              <ThumbsUp size={16} fill={myResponse === 'attend' ? 'currentColor' : 'none'} /> 참석 ({attendCount})
                            </button>
                            <button
                              onClick={() => handleScheduleVote(schedule.id, 'notAttend')}
                              className={`flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                                myResponse === 'notAttend' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600'
                              }`}
                            >
                              <ThumbsDown size={16} fill={myResponse === 'notAttend' ? 'currentColor' : 'none'} /> 불참 ({notAttendCount})
                            </button>
                            <button
                              onClick={() => handleScheduleVote(schedule.id, 'undecided')}
                              className={`flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                                myResponse === 'undecided' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600 hover:bg-amber-50 hover:text-amber-600'
                              }`}
                            >
                              <HelpCircle size={16} fill={myResponse === 'undecided' ? 'currentColor' : 'none'} /> 미정 ({undecidedCount})
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button 
                        onClick={() => startEditSchedule(schedule)} 
                        className="p-2 text-slate-300 hover:text-blue-600"
                        title="수정"
                      >
                        <Pencil size={18} />
                      </button>
                      <button 
                        onClick={() => deleteSchedule(schedule.id)} 
                        className="p-2 text-slate-300 hover:text-red-500"
                        title="삭제"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {view === 'polls' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800">투표 게시판</h2>
              <Button onClick={() => setIsAddingPoll(!isAddingPoll)} variant={isAddingPoll ? "outline" : "primary"}>
                {isAddingPoll ? "취소" : <><Plus size={18} /> 투표 생성</>}
              </Button>
            </div>

            {isAddingPoll && (
              <Card className="p-5 border-2 border-purple-100 bg-purple-50/20 shadow-lg">
                <form onSubmit={addPoll} className="space-y-4">
                  <Input 
                    label="투표 주제" 
                    placeholder="무엇에 대해 투표할까요?" 
                    value={newPoll.question} 
                    onChange={e => setNewPoll({...newPoll, question: e.target.value})}
                    required
                  />
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 flex justify-between items-center">
                      <span>선택 항목</span>
                      <button 
                        type="button" 
                        onClick={() => setNewPoll({...newPoll, options: [...newPoll.options, '']})}
                        className="text-sm bg-purple-100 text-purple-700 px-3 py-1.5 rounded-lg font-bold hover:bg-purple-200 transition-colors"
                      >
                        + 항목 추가
                      </button>
                    </label>
                    {newPoll.options.map((opt, idx) => (
                      <div key={`opt-${idx}`} className="flex gap-2">
                        <input 
                          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-400 focus:outline-none"
                          placeholder={`항목 ${idx + 1}`}
                          value={opt}
                          onChange={e => {
                            const newOpts = [...newPoll.options];
                            newOpts[idx] = e.target.value;
                            setNewPoll({...newPoll, options: newOpts});
                          }}
                        />
                        {newPoll.options.length > 2 && (
                          <button 
                            type="button" 
                            onClick={() => setNewPoll({...newPoll, options: newPoll.options.filter((_, i) => i !== idx)})}
                            className="p-2 text-slate-400 hover:text-red-500 shrink-0"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-4 pt-2 border-t border-slate-200">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={newPoll.allowMultiple} 
                        onChange={e => setNewPoll({...newPoll, allowMultiple: e.target.checked})}
                        className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span className="text-sm text-slate-700">중복 투표 허용</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={newPoll.isAnonymous} 
                        onChange={e => setNewPoll({...newPoll, isAnonymous: e.target.checked})}
                        className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span className="text-sm text-slate-700">익명 투표</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={newPoll.allowAddOptions} 
                        onChange={e => setNewPoll({...newPoll, allowAddOptions: e.target.checked})}
                        className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span className="text-sm text-slate-700">항목 추가 허용</span>
                    </label>
                  </div>
                  <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 py-3">투표 등록하기</Button>
                </form>
              </Card>
            )}

            <div className="space-y-4">
              {polls.map(poll => {
                const uid = user?.uid ?? '';
                const isMulti = poll.allowMultiple ?? false;
                const mySelectedIds = (poll.votedUserOptions || {})[uid] || [];
                const hasVoted = isMulti ? mySelectedIds.length > 0 : poll.votedUsers?.includes(uid);
                const canVote = isMulti ? true : !hasVoted;

                return (
                  <Card key={poll.id} className="p-6 group">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-slate-800">{poll.question}</h3>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${hasVoted ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                            {hasVoted ? '투표 완료' : '진행 중'}
                          </span>
                          {isMulti && <span className="text-[10px] text-amber-600 font-medium">복수선택</span>}
                          {poll.isAnonymous && <span className="text-[10px] text-slate-500 font-medium">익명</span>}
                          {!poll.isAnonymous && <span className="text-[10px] text-slate-400 font-medium">총 {poll.votedUsers?.length ?? 0}명 참여</span>}
                        </div>
                      </div>
                      <button 
                        onClick={() => deletePoll(poll.id)} 
                        className="p-1 text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                    
                    <div className="space-y-3">
                      {poll.options.map(opt => {
                        const percentage = poll.totalVotes > 0 ? (opt.votes / poll.totalVotes) * 100 : 0;
                        const isSelected = mySelectedIds.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            disabled={!isMulti && hasVoted}
                            onClick={() => canVote && handleVote(poll.id, opt.id)}
                            className={`w-full text-left relative overflow-hidden rounded-xl border transition-all ${
                              (!canVote && hasVoted) ? 'border-slate-100 bg-slate-50/50 cursor-default' : 
                              isSelected ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:border-blue-500 hover:bg-blue-50/30 active:scale-[0.98] cursor-pointer'
                            }`}
                          >
                            <div 
                              className={`absolute inset-0 transition-all duration-1000 ease-out ${hasVoted || isSelected ? 'bg-blue-500/10' : 'bg-transparent'}`} 
                              style={{ width: (hasVoted || isSelected) ? `${percentage}%` : '0%' }}
                            />
                            <div className="relative p-3.5 flex justify-between items-center z-10">
                              <span className={`text-sm font-semibold flex items-center gap-2 ${hasVoted || isSelected ? 'text-slate-700' : 'text-slate-600'}`}>
                                {isMulti && <CheckSquare size={16} className={isSelected ? 'text-blue-600' : 'text-slate-300'} fill={isSelected ? 'currentColor' : 'none'} />}
                                {opt.text}
                              </span>
                              {(hasVoted || isSelected) && (
                                <div className="flex items-center gap-2">
                                  <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden hidden sm:block">
                                    <div className="h-full bg-blue-500" style={{ width: `${percentage}%` }} />
                                  </div>
                                  <span className="text-xs font-bold text-blue-600 tabular-nums">{opt.votes}표 ({Math.round(percentage)}%)</span>
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {poll.allowAddOptions && (
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        {addingOptionToPollId === poll.id ? (
                          <div className="flex gap-2">
                            <input
                              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-400 focus:outline-none"
                              placeholder="새 항목 입력"
                              value={newOptionText}
                              onChange={e => setNewOptionText(e.target.value)}
                              autoFocus
                              onKeyDown={e => e.key === 'Enter' && addOptionToPoll(poll.id)}
                            />
                            <Button onClick={() => addOptionToPoll(poll.id)} variant="primary" className="shrink-0">추가</Button>
                            <Button onClick={() => { setAddingOptionToPollId(null); setNewOptionText(''); }} variant="outline" className="shrink-0">취소</Button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setAddingOptionToPollId(poll.id)}
                            className="w-full py-2 px-3 rounded-lg border border-dashed border-slate-200 text-slate-500 text-sm font-medium hover:bg-slate-50 hover:border-purple-300 hover:text-purple-600 transition-colors flex items-center justify-center gap-2"
                          >
                            <Plus size={16} /> 항목 추가
                          </button>
                        )}
                      </div>
                    )}

                    {!hasVoted && (
                      <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 font-medium">
                        <CheckSquare size={12} /> {isMulti ? '여러 항목을 선택할 수 있습니다.' : '클릭하여 투표에 참여하세요.'}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}
        </div>

        <aside className="w-80 xl:w-96 shrink-0 hidden md:block">
          <div className="md:sticky md:top-24">
            <Card className="p-4 overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-800">캘린더</h3>
                <div className="flex gap-0.5">
                  <button 
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}
                    className="p-1.5 rounded hover:bg-slate-100"
                  >
                    <ChevronLeft size={18} className="text-slate-600" />
                  </button>
                  <button 
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}
                    className="p-1.5 rounded hover:bg-slate-100"
                  >
                    <ChevronRight size={18} className="text-slate-600" />
                  </button>
                </div>
              </div>
              <div className="text-sm font-medium text-slate-600 mb-2">
                {calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월
              </div>
              <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-lg overflow-hidden text-center">
                {WEEKDAYS_KO.map(w => (
                  <div key={w} className="bg-slate-50 py-1.5 text-xs font-bold text-slate-500">{w}</div>
                ))}
                {getCalendarDays(calendarMonth.getFullYear(), calendarMonth.getMonth()).map((cell, idx) => {
                  const daySchedules = schedules.filter(s => s.date === cell.dateStr);
                  const today = new Date();
                  const isToday = cell.dateStr === `${today.getFullYear()}-${(today.getMonth()+1).toString().padStart(2,'0')}-${today.getDate().toString().padStart(2,'0')}`;
                  return (
                    <div
                      key={idx}
                      className={`min-h-[68px] p-1.5 bg-white ${!cell.isCurrentMonth ? 'opacity-40' : ''}`}
                    >
                      <div className={`text-sm font-medium mb-1 ${isToday ? 'text-blue-600 bg-blue-100 w-7 h-7 rounded-full flex items-center justify-center mx-auto' : 'text-slate-700'}`}>
                        {cell.day}
                      </div>
                      <div className="space-y-0.5 overflow-hidden">
                        {daySchedules.slice(0, 3).map(s => (
                          <div
                            key={s.id}
                            onClick={() => { setView('schedules'); startEditSchedule(s); }}
                            className="text-[10px] px-1.5 py-1 bg-blue-100 text-blue-800 rounded truncate cursor-pointer hover:bg-blue-200"
                            title={`${s.title} ${formatTime24(s.time)}`}
                          >
                            {s.time ? formatTime24(s.time).slice(0,5) + ' ' : ''}{s.title}
                          </div>
                        ))}
                        {daySchedules.length > 3 && (
                          <div className="text-[10px] text-slate-500">+{daySchedules.length - 3}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </aside>
      </main>

      <div className="fixed bottom-6 right-6 flex items-center gap-3 bg-white border border-slate-200 px-4 py-2 rounded-2xl shadow-xl hidden md:flex">
        <div className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </div>
        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Cloud Connected</span>
      </div>
    </div>
  );
}
