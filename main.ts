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
  Loader2
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
  onSnapshot,
  query
} from 'firebase/firestore';

// --- Firebase Configuration ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'group-meeting-manager';

// --- Components ---

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${className}`}>
    {children}
  </div>
);

const Button = ({ children, onClick, variant = "primary", className = "", type = "button", disabled = false }) => {
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

const Input = ({ label, ...props }) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && <label className="text-sm font-semibold text-slate-700">{label}</label>}
    <input 
      {...props} 
      className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
    />
  </div>
);

// --- Main Application ---

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('dashboard');
  const [schedules, setSchedules] = useState([]);
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isAddingSchedule, setIsAddingSchedule] = useState(false);
  const [isAddingPoll, setIsAddingPoll] = useState(false);

  // Form States
  const [newSchedule, setNewSchedule] = useState({ title: '', date: '', time: '', location: '', desc: '' });
  const [newPoll, setNewPoll] = useState({ question: '', options: ['', ''] });

  // 1. Authentication Setup
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Real-time Data Listeners
  useEffect(() => {
    if (!user) return;

    // Listen to Schedules
    const scheduleCol = collection(db, 'artifacts', appId, 'public', 'data', 'schedules');
    const unsubSchedules = onSnapshot(scheduleCol, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort by date in memory (Rule 2)
      setSchedules(data.sort((a, b) => new Date(a.date) - new Date(b.date)));
    }, (err) => console.error("Schedule sync error:", err));

    // Listen to Polls
    const pollCol = collection(db, 'artifacts', appId, 'public', 'data', 'polls');
    const unsubPolls = onSnapshot(pollCol, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPolls(data.sort((a, b) => b.createdAt - a.createdAt));
    }, (err) => console.error("Poll sync error:", err));

    return () => {
      unsubSchedules();
      unsubPolls();
    };
  }, [user]);

  // Actions
  const addSchedule = async (e) => {
    e.preventDefault();
    if (!user || !newSchedule.title || !newSchedule.date) return;
    
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'schedules'), {
        ...newSchedule,
        createdAt: Date.now(),
        creator: user.uid
      });
      setNewSchedule({ title: '', date: '', time: '', location: '', desc: '' });
      setIsAddingSchedule(false);
    } catch (err) {
      console.error("Add schedule error:", err);
    }
  };

  const deleteSchedule = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'schedules', id));
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const addPoll = async (e) => {
    e.preventDefault();
    if (!user || !newPoll.question || newPoll.options.some(o => !o)) return;

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'polls'), {
        question: newPoll.question,
        options: newPoll.options.map((text, idx) => ({ id: `opt-${idx}`, text, votes: 0 })),
        totalVotes: 0,
        createdAt: Date.now(),
        creator: user.uid,
        votedUsers: [] // Track who voted to prevent multiple votes
      });
      setNewPoll({ question: '', options: ['', ''] });
      setIsAddingPoll(false);
    } catch (err) {
      console.error("Add poll error:", err);
    }
  };

  const handleVote = async (pollId, optionId) => {
    if (!user) return;
    const poll = polls.find(p => p.id === pollId);
    if (!poll || poll.votedUsers?.includes(user.uid)) return;

    try {
      const pollRef = doc(db, 'artifacts', appId, 'public', 'data', 'polls', pollId);
      const updatedOptions = poll.options.map(opt => 
        opt.id === optionId ? { ...opt, votes: opt.votes + 1 } : opt
      );
      await updateDoc(pollRef, {
        options: updatedOptions,
        totalVotes: poll.totalVotes + 1,
        votedUsers: [...(poll.votedUsers || []), user.uid]
      });
    } catch (err) {
      console.error("Vote error:", err);
    }
  };

  const deletePoll = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'polls', id));
    } catch (err) {
      console.error("Delete poll error:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-blue-600" size={40} />
          <p className="text-slate-500 font-medium">모임 데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg text-white shadow-lg shadow-blue-100">
              <Users size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">우리들의 모임</h1>
              <p className="text-[10px] text-slate-400 font-mono">ID: {user?.uid.slice(0, 8)}...</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold text-slate-700">
              {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
            </div>
            <div className="text-[11px] text-slate-400 uppercase tracking-widest">Live Sync On</div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        
        {/* Navigation Tabs */}
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

        {/* View Contents */}
        {view === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
                  <Calendar size={18} className="text-blue-500" /> 다가오는 일정
                </h2>
                <button onClick={() => setView('schedules')} className="text-sm text-blue-600 font-medium">전체보기</button>
              </div>
              <div className="space-y-3">
                {schedules.length > 0 ? schedules.slice(0, 2).map(schedule => (
                  <Card key={schedule.id} className="p-4 border-l-4 border-l-blue-500 hover:translate-x-1 transition-transform cursor-pointer">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-slate-800">{schedule.title}</h3>
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <Clock size={12} /> {schedule.date} {schedule.time}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <MapPin size={12} /> {schedule.location}
                          </div>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-slate-300" />
                    </div>
                  </Card>
                )) : (
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
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800">모임 일정</h2>
              <Button onClick={() => setIsAddingSchedule(!isAddingSchedule)} variant={isAddingSchedule ? "outline" : "primary"}>
                {isAddingSchedule ? "취소" : <><Plus size={18} /> 일정 추가</>}
              </Button>
            </div>

            {isAddingSchedule && (
              <Card className="p-5 border-2 border-blue-100 bg-blue-50/20 shadow-lg animate-in slide-in-from-top-2">
                <form onSubmit={addSchedule} className="space-y-4">
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
                      label="시간" 
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
                  <Button type="submit" className="w-full py-3">일정 저장하기</Button>
                </form>
              </Card>
            )}

            <div className="space-y-3">
              {schedules.map(schedule => (
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
                          <span className="font-medium">{schedule.date}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-white rounded-md border border-slate-200"><Clock size={14} className="text-blue-500" /></div>
                          <span className="font-medium">{schedule.time || '시간 미지정'}</span>
                        </div>
                        <div className="flex items-center gap-2 sm:col-span-2">
                          <div className="p-1.5 bg-white rounded-md border border-slate-200"><MapPin size={14} className="text-blue-500" /></div>
                          <span className="font-medium">{schedule.location || '장소 미지정'}</span>
                        </div>
                      </div>
                      {schedule.desc && (
                        <p className="text-sm text-slate-500 italic px-1">
                          "{schedule.desc}"
                        </p>
                      )}
                    </div>
                    <button 
                      onClick={() => deleteSchedule(schedule.id)} 
                      className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {view === 'polls' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800">투표 게시판</h2>
              <Button onClick={() => setIsAddingPoll(!isAddingPoll)} variant={isAddingPoll ? "outline" : "primary"}>
                {isAddingPoll ? "취소" : <><Plus size={18} /> 투표 생성</>}
              </Button>
            </div>

            {isAddingPoll && (
              <Card className="p-5 border-2 border-purple-100 bg-purple-50/20 shadow-lg animate-in slide-in-from-top-2">
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
                        className="text-xs bg-white border border-slate-200 px-2 py-1 rounded-md text-blue-600 font-bold hover:bg-slate-50"
                      >
                        + 추가
                      </button>
                    </label>
                    {newPoll.options.map((opt, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input 
                          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-400 focus:outline-none"
                          placeholder={`항목 ${idx + 1}`}
                          value={opt}
                          onChange={e => {
                            const newOpts = [...newPoll.options];
                            newOpts[idx] = e.target.value;
                            setNewPoll({...newPoll, options: newOpts});
                          }}
                          required
                        />
                        {newPoll.options.length > 2 && (
                          <button 
                            type="button" 
                            onClick={() => setNewPoll({...newPoll, options: newPoll.options.filter((_, i) => i !== idx)})}
                            className="p-2 text-slate-400 hover:text-red-500"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 py-3">투표 등록하기</Button>
                </form>
              </Card>
            )}

            <div className="space-y-4">
              {polls.map(poll => {
                const hasVoted = poll.votedUsers?.includes(user?.uid);
                return (
                  <Card key={poll.id} className="p-6 group">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-slate-800">{poll.question}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${hasVoted ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                            {hasVoted ? '투표 완료' : '진행 중'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">총 {poll.totalVotes}명 참여</span>
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
                        return (
                          <button
                            key={opt.id}
                            disabled={hasVoted}
                            onClick={() => handleVote(poll.id, opt.id)}
                            className={`w-full text-left relative overflow-hidden rounded-xl border transition-all ${
                              hasVoted ? 'border-slate-100 bg-slate-50/50 cursor-default' : 'border-slate-200 hover:border-blue-500 hover:bg-blue-50/30 active:scale-[0.98]'
                            }`}
                          >
                            <div 
                              className={`absolute inset-0 transition-all duration-1000 ease-out ${hasVoted ? 'bg-blue-500/10' : 'bg-transparent'}`} 
                              style={{ width: hasVoted ? `${percentage}%` : '0%' }}
                            />
                            <div className="relative p-3.5 flex justify-between items-center z-10">
                              <span className={`text-sm font-semibold ${hasVoted ? 'text-slate-700' : 'text-slate-600'}`}>
                                {opt.text}
                              </span>
                              {hasVoted && (
                                <div className="flex items-center gap-2">
                                  <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden hidden sm:block">
                                    <div className="h-full bg-blue-500" style={{ width: `${percentage}%` }} />
                                  </div>
                                  <span className="text-xs font-bold text-blue-600 tabular-nums">{Math.round(percentage)}%</span>
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {!hasVoted && (
                      <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 font-medium">
                        <CheckSquare size={12} /> 클릭하여 투표에 참여하세요.
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Real-time Indicator (Desktop) */}
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