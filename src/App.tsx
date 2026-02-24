import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  CheckSquare, 
  Check,
  Plus, 
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
  ChevronLeft,
  MessageCircle,
  Send,
  X
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

const MEMBER_NAMES = ['지운', '대성', '준호', '하운', '병주', '형진', '태욱', '승재', '현우', '태현', '상혁', '승희', '가람', '효민', '웅', '준이형', '한을'].sort((a, b) => a.localeCompare(b, 'ko-KR'));

const DISPLAY_NAME_KEY = `cleaning-tool-cal-displayName`;

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
  attendeeDisplayNames?: Record<string, string>; // uid -> 닉네임
}

interface ScheduleComment {
  id: string;
  uid: string;
  displayName: string;
  text: string;
  createdAt: number;
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
  voterDisplayNames?: Record<string, string>; // uid -> 닉네임 (누가 투표했는지 표시용)
  allowMultiple?: boolean;
  isAnonymous?: boolean;
  allowAddOptions?: boolean;
  createdAt?: number;
  endDate?: string; // YYYY-MM-DD, 기한 없으면 undefined
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
    allowAddOptions: false,
    endDate: '' as string
  });
  const [addingOptionToPollId, setAddingOptionToPollId] = useState<string | null>(null);
  const [newOptionText, setNewOptionText] = useState('');

  // 사용자 이름 (최초 1회 선택, localStorage에 저장)
  const [userDisplayName, setUserDisplayName] = useState<string | null>(() => {
    try {
      return localStorage.getItem(DISPLAY_NAME_KEY);
    } catch {
      return null;
    }
  });

  // 댓글
  const [scheduleComments, setScheduleComments] = useState<Record<string, ScheduleComment[]>>({});
  const [newCommentText, setNewCommentText] = useState('');
  const [expandedScheduleId, setExpandedScheduleId] = useState<string | null>(null); // 상세/댓글 펼친 일정

  // 일정 목록 페이지네이션 (5개씩)
  const [scheduleListLimit, setScheduleListLimit] = useState(5);
  const [scheduleListLoadingMore, setScheduleListLoadingMore] = useState(false);

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

  // 댓글 실시간 구독 (펼쳐진 일정만)
  useEffect(() => {
    if (!expandedScheduleId) {
      setScheduleComments(prev => prev);
      return;
    }
    const commentsCol = collection(db, 'artifacts', appId, 'public', 'data', 'schedules', expandedScheduleId, 'comments');
    const unsub = onSnapshot(commentsCol, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ScheduleComment));
      setScheduleComments(prev => ({ ...prev, [expandedScheduleId]: data.sort((a, b) => a.createdAt - b.createdAt) }));
    }, (err) => console.error("Comments sync error:", err));
    return () => unsub();
  }, [expandedScheduleId]);

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

  const handleSetDisplayName = (name: string) => {
    setUserDisplayName(name);
    try {
      localStorage.setItem(DISPLAY_NAME_KEY, name);
    } catch (e) {
      console.warn("localStorage setItem failed:", e);
    }
  };

  const handleScheduleVote = async (scheduleId: string, response: ScheduleResponse) => {
    if (!user || !userDisplayName) return;
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return;

    const attendees = schedule.attendees || [];
    const notAttendees = schedule.notAttendees || [];
    const undecided = schedule.undecided || [];
    const displayNames = schedule.attendeeDisplayNames || {};

    const newAttendees = response === 'attend' ? [...attendees.filter(id => id !== user.uid), user.uid] : attendees.filter(id => id !== user.uid);
    const newNotAttendees = response === 'notAttend' ? [...notAttendees.filter(id => id !== user.uid), user.uid] : notAttendees.filter(id => id !== user.uid);
    const newUndecided = response === 'undecided' ? [...undecided.filter(id => id !== user.uid), user.uid] : undecided.filter(id => id !== user.uid);
    const newDisplayNames = { ...displayNames, [user.uid]: userDisplayName };

    try {
      const scheduleRef = doc(db, 'artifacts', appId, 'public', 'data', 'schedules', scheduleId);
      await updateDoc(scheduleRef, {
        attendees: newAttendees,
        notAttendees: newNotAttendees,
        undecided: newUndecided,
        attendeeDisplayNames: newDisplayNames
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
        allowAddOptions: newPoll.allowAddOptions,
        endDate: newPoll.endDate.trim() || undefined
      });
      setNewPoll({ question: '', options: ['', ''], allowMultiple: false, isAnonymous: false, allowAddOptions: false, endDate: '' });
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
      const updatedOptions = poll.options.map(opt => 
        opt.id === optionId ? { ...opt, votes: Math.max(0, opt.votes + voteDelta) } : opt
      );
      const newVotedUserOpts = { ...votedUserOpts, [user.uid]: newSelectedIds };
      const wasInVotedUsers = votedUsers.includes(user.uid);
      const newVotedUsers = (newSelectedIds.length > 0 && !wasInVotedUsers) 
        ? [...votedUsers, user.uid] 
        : (newSelectedIds.length === 0 ? votedUsers.filter(id => id !== user.uid) : votedUsers);
      const newTotal = poll.totalVotes + voteDelta;

      const voterNames = { ...(poll.voterDisplayNames || {}), [user.uid]: userDisplayName || '익명' };
      try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'polls', pollId), {
          options: updatedOptions,
          totalVotes: Math.max(0, newTotal),
          votedUserOptions: newVotedUserOpts,
          votedUsers: newVotedUsers,
          voterDisplayNames: voterNames
        });
      } catch (err) {
        console.error("Vote error:", err);
      }
    } else {
      // 단일 선택: 기존 투표 수정 허용 (다른 항목 클릭 시 변경)
      const prevOptionId = mySelectedIds[0];
      const isChangingVote = votedUsers.includes(user.uid) && prevOptionId;
      const isSameOption = prevOptionId === optionId;
      if (isSameOption) return; // 같은 항목 재클릭 시 무시

      let updatedOptions = poll.options.map(opt => ({ ...opt }));
      let newTotal = poll.totalVotes;

      if (isChangingVote) {
        updatedOptions = updatedOptions.map(opt =>
          opt.id === prevOptionId ? { ...opt, votes: Math.max(0, opt.votes - 1) } :
          opt.id === optionId ? { ...opt, votes: opt.votes + 1 } : opt
        );
        newTotal = poll.totalVotes; // totalVotes 유지 (1표만 이동)
      } else {
        updatedOptions = updatedOptions.map(opt =>
          opt.id === optionId ? { ...opt, votes: opt.votes + 1 } : opt
        );
        newTotal = poll.totalVotes + 1;
      }

      const newVotedUserOpts = { ...votedUserOpts, [user.uid]: [optionId] };
      const newVotedUsers = votedUsers.includes(user.uid) ? votedUsers : [...votedUsers, user.uid];

      const voterNames = { ...(poll.voterDisplayNames || {}), [user.uid]: userDisplayName || '익명' };
      try {
        const pollRef = doc(db, 'artifacts', appId, 'public', 'data', 'polls', pollId);
        await updateDoc(pollRef, {
          options: updatedOptions,
          totalVotes: newTotal,
          votedUserOptions: newVotedUserOpts,
          votedUsers: newVotedUsers,
          voterDisplayNames: voterNames
        });
      } catch (err) {
        console.error("Vote error:", err);
      }
    }
  };

  const getVoterName = (poll: Poll, uid: string) => poll.voterDisplayNames?.[uid] || '익명';

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

  const addScheduleComment = async (scheduleId: string, displayName: string) => {
    if (!user || !newCommentText.trim()) return;
    const name = displayName.trim() || '익명';
    try {
      const commentsCol = collection(db, 'artifacts', appId, 'public', 'data', 'schedules', scheduleId, 'comments');
      await addDoc(commentsCol, { uid: user.uid, displayName: name, text: newCommentText.trim(), createdAt: Date.now() });
      setNewCommentText('');
    } catch (err) {
      console.error("Add comment error:", err);
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

  // 최초 접속 시 이름 선택 (localStorage에 저장되어 재방문 시에는 표시 안 함)
  if (user && !userDisplayName) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-8">
          <h2 className="text-xl font-bold text-slate-800 mb-2">이름을 선택해주세요</h2>
          <p className="text-sm text-slate-500 mb-6">참석/불참 표시와 댓글에 사용됩니다. 한 번만 선택하면 됩니다.</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {MEMBER_NAMES.map(name => (
              <button
                key={name}
                onClick={() => handleSetDisplayName(name)}
                className="py-3 px-4 rounded-xl font-medium text-slate-700 bg-slate-100 hover:bg-blue-100 hover:text-blue-700 hover:border-blue-200 border border-transparent transition-all active:scale-95"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const getAttendeeName = (schedule: Schedule, uid: string) => schedule.attendeeDisplayNames?.[uid] || '익명';

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-50 text-slate-900 font-sans pb-20 md:pb-6">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 safe-area-inset-top">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 md:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="bg-blue-600 p-1.5 sm:p-2 rounded-lg text-white shadow-lg shadow-blue-100 shrink-0">
              <Users size={18} className="sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold tracking-tight truncate">청소도구함의 은밀한 회의</h1>
              <p className="text-[10px] text-slate-500 font-medium">{userDisplayName}으로 접속 중</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs sm:text-sm font-bold text-slate-700">
              {new Date().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
            </div>
            <div className="hidden sm:flex items-center justify-end gap-1.5 text-[11px] text-slate-400 uppercase tracking-widest">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              Live Sync On
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-col md:flex-row gap-4 md:gap-6 max-w-6xl mx-auto px-3 sm:px-4 py-4 md:py-6">
        <div className="flex-1 min-w-0 space-y-4 md:space-y-6 w-full">
        <div className="flex bg-slate-200/50 p-1 rounded-xl touch-manipulation">
          <button 
            onClick={() => setView('dashboard')}
            className={`flex-1 py-2.5 md:py-2 px-2 md:px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 md:gap-2 min-h-[44px] active:scale-[0.98] ${view === 'dashboard' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600 hover:text-slate-800'}`}
          >
            <LayoutDashboard size={18} className="shrink-0" /> 홈
          </button>
          <button 
            onClick={() => setView('schedules')}
            className={`flex-1 py-2.5 md:py-2 px-2 md:px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 md:gap-2 min-h-[44px] active:scale-[0.98] ${view === 'schedules' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600 hover:text-slate-800'}`}
          >
            <Calendar size={18} className="shrink-0" /> 일정
          </button>
          <button 
            onClick={() => setView('polls')}
            className={`flex-1 py-2.5 md:py-2 px-2 md:px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 md:gap-2 min-h-[44px] active:scale-[0.98] ${view === 'polls' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600 hover:text-slate-800'}`}
          >
            <Vote size={18} className="shrink-0" /> 투표
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
                            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 min-h-[36px] rounded-lg transition-colors touch-manipulation ${
                              myResponse === 'attend' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600 hover:bg-green-50 hover:text-green-600'
                            }`}
                          >
                            <ThumbsUp size={12} fill={myResponse === 'attend' ? 'currentColor' : 'none'} /> 참석 ({attendCount})
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleScheduleVote(schedule.id, 'notAttend'); }}
                            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 min-h-[36px] rounded-lg transition-colors touch-manipulation ${
                              myResponse === 'notAttend' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600'
                            }`}
                          >
                            <ThumbsDown size={12} fill={myResponse === 'notAttend' ? 'currentColor' : 'none'} /> 불참 ({notAttendCount})
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleScheduleVote(schedule.id, 'undecided'); }}
                            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 min-h-[36px] rounded-lg transition-colors touch-manipulation ${
                              myResponse === 'undecided' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600 hover:bg-amber-50 hover:text-amber-600'
                            }`}
                          >
                            <HelpCircle size={12} fill={myResponse === 'undecided' ? 'currentColor' : 'none'} /> 미정 ({undecidedCount})
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); setView('schedules'); startEditSchedule(schedule); }}
                          className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="수정"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); if (confirm('일정을 삭제할까요?')) deleteSchedule(schedule.id); }}
                          className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="삭제"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
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
                  <Vote size={18} className="text-purple-500" /> 진행중인 투표 ({polls.length})
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
          <div className="flex flex-col lg:flex-row gap-4 w-full">
            {/* 왼쪽: 캘린더 + 전체 일정 목록 */}
            <div className="flex-1 min-w-0 space-y-4">
            {/* 캘린더 - 한 달 일정 한눈에 */}
            <Card className="p-3 sm:p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-slate-800">{calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월</h2>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}
                    className="p-2 rounded-lg hover:bg-slate-100 active:scale-95 transition-all touch-manipulation min-w-[40px] min-h-[40px]"
                  >
                    <ChevronLeft size={20} className="text-slate-600" />
                  </button>
                  <button 
                    onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}
                    className="p-2 rounded-lg hover:bg-slate-100 active:scale-95 transition-all touch-manipulation min-w-[40px] min-h-[40px]"
                  >
                    <ChevronRight size={20} className="text-slate-600" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-lg overflow-hidden text-center text-xs sm:text-sm">
                {WEEKDAYS_KO.map(w => (
                  <div key={w} className="bg-slate-100 py-1.5 sm:py-2 font-bold text-slate-500">{w}</div>
                ))}
                {getCalendarDays(calendarMonth.getFullYear(), calendarMonth.getMonth()).map((cell, idx) => {
                  const daySchedules = schedules.filter(s => s.date === cell.dateStr);
                  const today = new Date();
                  const isToday = cell.dateStr === `${today.getFullYear()}-${(today.getMonth()+1).toString().padStart(2,'0')}-${today.getDate().toString().padStart(2,'0')}`;
                  return (
                    <div key={idx} className={`min-h-[3.5rem] sm:min-h-[4.5rem] p-1 bg-white ${!cell.isCurrentMonth ? 'opacity-40' : ''}`}>
                      <div className={`text-sm font-medium mb-0.5 ${isToday ? 'text-blue-600 bg-blue-100 w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center mx-auto' : 'text-slate-700'}`}>
                        {cell.day}
                      </div>
                      <div className="space-y-0.5 overflow-hidden">
                        {daySchedules.slice(0, 2).map(s => (
                          <div
                            key={s.id}
                            onClick={() => { setExpandedScheduleId(expandedScheduleId === s.id ? null : s.id); setEditingScheduleId(null); }}
                            className="text-[10px] px-1 py-0.5 bg-blue-100 text-blue-800 rounded cursor-pointer hover:bg-blue-200 active:bg-blue-300 truncate touch-manipulation"
                            title={`${s.title} ${formatTime24(s.time)}`}
                          >
                            {s.time ? formatTime24(s.time).slice(0,5) + ' ' : ''}{s.title}
                          </div>
                        ))}
                        {daySchedules.length > 2 && (
                          <div className="text-[9px] text-slate-500">+{daySchedules.length - 2}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800">전체 일정</h3>
              <Button 
                onClick={() => { if (editingScheduleId) cancelEditSchedule(); setIsAddingSchedule(!isAddingSchedule); setExpandedScheduleId(null); }} 
                variant={isAddingSchedule ? "outline" : "primary"}
                className="text-sm py-1.5"
              >
                {isAddingSchedule ? "취소" : <><Plus size={16} /> 일정 추가</>}
              </Button>
            </div>

            {(isAddingSchedule || editingScheduleId) && (
              <Card className="p-4 sm:p-5 border-2 border-blue-100 bg-blue-50/20 shadow-lg">
                <h3 className="font-bold text-slate-800 mb-3 sm:mb-4">{editingScheduleId ? '일정 수정' : '일정 추가'}</h3>
                <form onSubmit={editingScheduleId ? updateSchedule : addSchedule} className="space-y-3 sm:space-y-4">
                  <Input label="일정 제목" placeholder="예: 5월 정기 모임" value={newSchedule.title} onChange={e => setNewSchedule({...newSchedule, title: e.target.value})} required />
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <Input label="날짜" type="date" value={newSchedule.date} onChange={e => setNewSchedule({...newSchedule, date: e.target.value})} required />
                    <Input label="시간" type="time" value={newSchedule.time} onChange={e => setNewSchedule({...newSchedule, time: e.target.value})} />
                  </div>
                  <Input label="장소" placeholder="장소 또는 Zoom 등" value={newSchedule.location} onChange={e => setNewSchedule({...newSchedule, location: e.target.value})} />
                  <Input label="설명" placeholder="상세 내용" value={newSchedule.desc} onChange={e => setNewSchedule({...newSchedule, desc: e.target.value})} />
                  <div className="flex gap-2">
                    <Button type="submit" className="flex-1 py-2.5 sm:py-3">{editingScheduleId ? '수정 완료' : '일정 저장'}</Button>
                    {editingScheduleId && <Button type="button" onClick={cancelEditSchedule} variant="outline" className="py-2.5 sm:py-3">취소</Button>}
                  </div>
                </form>
              </Card>
            )}

            {/* 전체 일정 목록 (날짜 순, 5개씩 더보기) */}
            {(() => {
              const allSchedules = schedules
                .filter(s => s.id !== editingScheduleId)
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
              const visibleSchedules = allSchedules.slice(0, scheduleListLimit);
              const hasMore = allSchedules.length > scheduleListLimit;

              const handleLoadMore = () => {
                setScheduleListLoadingMore(true);
                setTimeout(() => {
                  setScheduleListLimit(prev => prev + 5);
                  setScheduleListLoadingMore(false);
                }, 300);
              };

              return (
            <div className="space-y-2 sm:space-y-3">
              {visibleSchedules.map(schedule => {
                  const isSelected = expandedScheduleId === schedule.id;
                  return (
                    <Card key={schedule.id} className={`overflow-hidden transition-all cursor-pointer ${isSelected ? 'ring-2 ring-blue-400 bg-blue-50/20' : ''}`}>
                      <div 
                        onClick={() => setExpandedScheduleId(isSelected ? null : schedule.id)}
                        className="p-3 sm:p-4 flex items-center justify-between gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-slate-800 truncate">{schedule.title}</h3>
                          <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                            <span>{formatDateKO(schedule.date)}</span>
                            {schedule.time && <span>· {formatTime24(schedule.time)}</span>}
                            {schedule.location && <span>· {schedule.location}</span>}
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">참 {schedule.attendees?.length ?? 0}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">불 {schedule.notAttendees?.length ?? 0}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">미정 {schedule.undecided?.length ?? 0}</span>
                            {(scheduleComments[schedule.id]?.length ?? 0) > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 flex items-center gap-0.5">
                                <MessageCircle size={10} /> {scheduleComments[schedule.id].length}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight size={20} className={`shrink-0 text-slate-400 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                      </div>
                    </Card>
                  );
                })}
              {scheduleListLoadingMore && (
                <>
                  {[...Array(5)].map((_, i) => (
                    <div key={`skeleton-${i}`} className="bg-white rounded-xl border border-slate-200 overflow-hidden animate-pulse">
                      <div className="p-4 space-y-3">
                        <div className="h-4 bg-slate-200 rounded w-3/4" />
                        <div className="h-3 bg-slate-100 rounded w-1/2" />
                        <div className="flex gap-2">
                          <div className="h-6 bg-slate-100 rounded w-12" />
                          <div className="h-6 bg-slate-100 rounded w-12" />
                          <div className="h-6 bg-slate-100 rounded w-12" />
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {hasMore && !scheduleListLoadingMore && (
                <button
                  onClick={handleLoadMore}
                  className="w-full py-3 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 font-medium hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/30 transition-colors"
                >
                  더 보기 ({Math.min(5, allSchedules.length - scheduleListLimit)}개)
                </button>
              )}
            </div>
              );
            })()}
            </div>

            {/* 우측: 캘린더에서 선택한 일정 상세 (클릭 시 이동) */}
            {expandedScheduleId && (() => {
              const schedule = schedules.find(s => s.id === expandedScheduleId);
              if (!schedule) return null;
              const uid = user?.uid ?? '';
              const myResponse: ScheduleResponse | null = schedule.attendees?.includes(uid) ? 'attend' : schedule.notAttendees?.includes(uid) ? 'notAttend' : schedule.undecided?.includes(uid) ? 'undecided' : null;
              return (
                <aside className="w-full lg:w-80 xl:w-96 shrink-0 lg:sticky lg:top-24 h-fit">
                  <Card className="overflow-hidden ring-2 ring-blue-400">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                      <h3 className="font-bold text-slate-800 truncate">{schedule.title}</h3>
                      <button onClick={() => setExpandedScheduleId(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="닫기"><X size={18} /></button>
                    </div>
                    <div className="p-4 space-y-4">
                      <div className="space-y-1 text-sm text-slate-600">
                        <div className="flex items-center gap-2"><Calendar size={14} /> {formatDateKO(schedule.date)} {formatTime24(schedule.time) && `· ${formatTime24(schedule.time)}`}</div>
                        {schedule.location && <div className="flex items-center gap-2"><MapPin size={14} /> {schedule.location}</div>}
                      </div>
                      {schedule.desc && <p className="text-sm text-slate-600 italic">&quot;{schedule.desc}&quot;</p>}
                      <div className="flex flex-wrap gap-2 touch-manipulation">
                        <button onClick={() => handleScheduleVote(schedule.id, 'attend')} className={`flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg min-h-[40px] ${myResponse === 'attend' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600 hover:bg-green-50'}`}>
                          <ThumbsUp size={16} fill={myResponse === 'attend' ? 'currentColor' : 'none'} /> 참석 ({schedule.attendees?.length ?? 0})
                        </button>
                        <button onClick={() => handleScheduleVote(schedule.id, 'notAttend')} className={`flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg min-h-[40px] ${myResponse === 'notAttend' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600 hover:bg-red-50'}`}>
                          <ThumbsDown size={16} fill={myResponse === 'notAttend' ? 'currentColor' : 'none'} /> 불참 ({schedule.notAttendees?.length ?? 0})
                        </button>
                        <button onClick={() => handleScheduleVote(schedule.id, 'undecided')} className={`flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg min-h-[40px] ${myResponse === 'undecided' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600 hover:bg-amber-50'}`}>
                          <HelpCircle size={16} fill={myResponse === 'undecided' ? 'currentColor' : 'none'} /> 미정 ({schedule.undecided?.length ?? 0})
                        </button>
                      </div>
                      <div className="text-xs text-slate-500 space-y-1">
                        {(schedule.attendees?.length ?? 0) > 0 && <p><span className="font-medium text-green-600">참:</span> {(schedule.attendees ?? []).map(u => getAttendeeName(schedule, u)).join(', ')}</p>}
                        {(schedule.notAttendees?.length ?? 0) > 0 && <p><span className="font-medium text-red-600">불:</span> {(schedule.notAttendees ?? []).map(u => getAttendeeName(schedule, u)).join(', ')}</p>}
                        {(schedule.undecided?.length ?? 0) > 0 && <p><span className="font-medium text-amber-600">미정:</span> {(schedule.undecided ?? []).map(u => getAttendeeName(schedule, u)).join(', ')}</p>}
                      </div>
                      <div className="border-t border-slate-200 pt-3">
                        <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><MessageCircle size={14} /> 댓글</h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto mb-2">
                          {(scheduleComments[schedule.id] ?? []).map(c => (
                            <div key={c.id} className="text-xs bg-white rounded-lg p-2 border border-slate-100">
                              <span className="font-medium text-slate-700">{c.displayName}</span>
                              <span className="text-slate-400 mx-1">·</span>
                              <span className="text-slate-500">{new Date(c.createdAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                              <p className="mt-0.5 text-slate-600">{c.text}</p>
                            </div>
                          ))}
                          {(scheduleComments[schedule.id] ?? []).length === 0 && <p className="text-xs text-slate-400 py-2">아직 댓글이 없습니다.</p>}
                        </div>
                        <div className="flex gap-2">
                          <input
                            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            placeholder="의견, 확답 예정일 등을 적어주세요..."
                            value={expandedScheduleId === schedule.id ? newCommentText : ''}
                            onChange={e => setNewCommentText(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addScheduleComment(schedule.id, userDisplayName || '익명')}
                          />
                          <Button onClick={() => addScheduleComment(schedule.id, userDisplayName || '익명')} className="shrink-0 py-2" disabled={!newCommentText.trim()}><Send size={16} /></Button>
                        </div>
                      </div>
                      <div className="flex gap-1 pt-2">
                        <button onClick={() => startEditSchedule(schedule)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="수정"><Pencil size={16} /></button>
                        <button onClick={() => { if (confirm('일정을 삭제할까요?')) { deleteSchedule(schedule.id); setExpandedScheduleId(null); } }} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg" title="삭제"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  </Card>
                </aside>
              );
            })()}
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
                  <Input 
                    label="투표 마감일 (선택)" 
                    type="date" 
                    value={newPoll.endDate} 
                    onChange={e => setNewPoll({...newPoll, endDate: e.target.value})}
                  />
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
                const today = new Date().toISOString().slice(0, 10);
                const isExpired = poll.endDate ? poll.endDate < today : false;
                const canVote = !isExpired;

                return (
                  <Card key={poll.id} className="p-6 group">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-slate-800">{poll.question}</h3>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isExpired ? 'bg-slate-200 text-slate-600' : hasVoted ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                            {isExpired ? '종료됨' : hasVoted ? '투표 완료' : '진행 중'}
                          </span>
                          {poll.endDate && (
                            <span className="text-[10px] text-slate-500 font-medium">
                              마감 {formatDateKO(poll.endDate)}
                            </span>
                          )}
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
                        const showVoteResult = hasVoted;
                        return (
                          <button
                            key={opt.id}
                            disabled={!canVote}
                            onClick={() => canVote && handleVote(poll.id, opt.id)}
                            className={`w-full text-left relative overflow-hidden rounded-xl border transition-all ${
                              !canVote ? 'border-slate-100 bg-slate-50/50 cursor-default' : 
                              isSelected ? 'border-slate-200 border-l-4 border-l-blue-500 bg-blue-50/30' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 active:scale-[0.98] cursor-pointer'
                            }`}
                          >
                            {/* 투표 결과 프로그레스바 - 투표 후에만 표시 */}
                            {showVoteResult && (
                              <div 
                                className="absolute inset-0 bg-blue-500/10 transition-all duration-500 ease-out" 
                                style={{ width: `${percentage}%` }}
                              />
                            )}
                            <div className="relative p-3.5 z-10">
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-sm font-semibold flex items-center gap-2 text-slate-700">
                                  {(isMulti || hasVoted) && (
                                    <span className={`inline-flex items-center justify-center w-4 h-4 shrink-0 rounded border ${
                                      isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300 bg-white'
                                    }`}>
                                      {isSelected ? <Check size={12} strokeWidth={3} /> : null}
                                    </span>
                                  )}
                                  {opt.text}
                                </span>
                                {showVoteResult && (
                                  <div className="flex items-center gap-2 shrink-0">
                                    <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden hidden sm:block">
                                      <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${percentage}%` }} />
                                    </div>
                                    <span className="text-xs font-bold text-blue-600 tabular-nums">{opt.votes}표 ({Math.round(percentage)}%)</span>
                                  </div>
                                )}
                              </div>
                              {showVoteResult && !poll.isAnonymous && (() => {
                                const voterUids = Object.entries(poll.votedUserOptions || {})
                                  .filter(([, ids]) => ids.includes(opt.id))
                                  .map(([u]) => u);
                                if (voterUids.length === 0) return null;
                                return (
                                  <p className="text-[11px] text-slate-500 mt-1 ml-6">
                                    {voterUids.map(u => getVoterName(poll, u)).join(', ')}
                                  </p>
                                );
                              })()}
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

                    {canVote && (
                      <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 font-medium">
                        <CheckSquare size={12} /> {hasVoted ? (isMulti ? '여러 항목을 선택·변경할 수 있습니다.' : '다른 항목을 클릭하면 변경할 수 있습니다.') : (isMulti ? '여러 항목을 선택할 수 있습니다.' : '클릭하여 투표에 참여하세요.')}
                      </div>
                    )}
                    {!canVote && (
                      <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 font-medium">
                        투표가 종료되었습니다.
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}
        </div>

        <aside className={`w-80 xl:w-96 shrink-0 hidden md:block ${view === 'schedules' ? 'md:hidden' : ''}`}>
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
