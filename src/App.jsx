import React, { useState, useEffect, useRef } from 'react';
import Calendar from 'react-calendar';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { createClient } from '@supabase/supabase-js';
import { 
  Save, ChevronDown, CheckCircle, Clock, Sparkles, 
  X, Moon, Sun, Globe, Github, Edit3, Trash2, AlertTriangle, User, Lock, LogOut, Camera, Plus
} from 'lucide-react';
import 'react-calendar/dist/Calendar.css';
import './App.css';

// --- SUPABASE CONFIGURATION ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const MOODS = {
  blast: { label: "Freaking Blast", color: "#2ecc71", desc: "LESSGOOO" },
  fun: { label: "Had Fun", color: "#f1c40f", desc: "All Good" },
  better: { label: "Could Be Better", color: "#e67e22", desc: "Keep Pushing" },
  tomorrow: { label: "We Go Again", color: "#e74c3c", desc: "It's Not Over Yet" }
};

export default function Ephemeral() {
  // --- AUTH STATES ---
  const [user, setUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [authError, setAuthError] = useState('');

  // --- THEME LOGIC ---
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('ephemeral_theme');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('ephemeral_theme', JSON.stringify(isDark));
    if (isDark) document.body.classList.add('dark-mode');
    else document.body.classList.remove('dark-mode');
  }, [isDark]);

  // --- DATA LOGIC ---
  const [entries, setEntries] = useState({});
  const today = format(new Date(), 'yyyy-MM-dd');
  const [note, setNote] = useState('');
  const [images, setImages] = useState([]); // NEW: Image state
  const [selectedMood, setSelectedMood] = useState(null);
  const [isSaved, setIsSaved] = useState(false);
  const [greeting, setGreeting] = useState('How was your day?');
  const [activeEntry, setActiveEntry] = useState(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const fileInputRef = useRef(null);

  // --- SUPABASE AUTH SESSION CHECK ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        fetchEntries(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        fetchEntries(currentUser.id);
      } else {
        setEntries({});
        setNote('');
        setImages([]);
        setSelectedMood(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("How is your morning starting?");
    else if (hour < 17) setGreeting("How is your afternoon going?");
    else setGreeting("How was your day?");
  }, []);

  useEffect(() => {
    if (user && entries[today]) {
      setSelectedMood(entries[today].mood);
      setNote(entries[today].note);
      setImages(entries[today].images || []); // NEW: Load images
    }
  }, [entries, today, user]);

  // --- IMAGE HELPERS ---
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    if (images.length + files.length > 3) {
      alert("Maximum 3 images allowed.");
      return;
    }

    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImages(prev => [...prev, reader.result].slice(0, 3));
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  // --- SUPABASE DATA ACTIONS ---
  const fetchEntries = async (userId) => {
    const targetId = userId || user?.id;
    if (!targetId) return;

    console.log("DEBUG: Fetching entries only for user:", targetId);
    
    const { data, error } = await supabase
      .from('entries')
      .select('*')
      .eq('user_id', targetId); // CRITICAL: Filter by logged in user ID

    if (data) {
      const formattedEntries = {};
      data.forEach(item => { formattedEntries[item.date] = item; });
      setEntries(formattedEntries);
    }
    if (error) console.error("Fetch error:", error);
  };

  const saveEntry = async () => {
    console.log("DEBUG: Archive button clicked");

    if (!user) {
      console.log("DEBUG: No user session found");
      setShowAuthModal(true);
      return;
    }
    if (!selectedMood) {
      console.log("DEBUG: No mood selected - blocking save");
      alert("Please select a mood before archiving!");
      return;
    }

    const entryData = {
      user_id: user.id,
      mood: selectedMood,
      note: note,
      date: today,
      images: images // NEW: Save images array
    };

    console.log("DEBUG: Attempting Supabase Upsert", entryData);

    const { error } = await supabase
      .from('entries')
      .upsert(entryData, { onConflict: 'user_id, date' });

    if (!error) {
      console.log("DEBUG: Save Successful");
      setIsSaved(true);
      fetchEntries(user.id);
      setTimeout(() => setIsSaved(false), 2000);
      setTimeout(() => {
        document.getElementById('history')?.scrollIntoView({ behavior: 'smooth' });
      }, 800);
    } else {
      console.error("DEBUG: Supabase Error Details:", error);
      setAuthError(`Save Error: ${error.message}`);
    }
  };

  const handleFinalDelete = async () => {
    const dateKey = activeEntry.id;
    const { error } = await supabase
      .from('entries')
      .delete()
      .match({ date: dateKey, user_id: user.id });

    if (!error) {
      const newEntries = { ...entries };
      delete newEntries[dateKey];
      setEntries(newEntries);
      setActiveEntry(null);
      setShowConfirmDelete(false);
    }
  };

  // --- AUTH HANDLERS ---
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (!formData.email || !formData.password) { setAuthError("Fill in all fields."); return; }

    if (authMode === 'signup') {
      const { error } = await supabase.auth.signUp({ email: formData.email, password: formData.password });
      if (error) setAuthError(error.message);
      else setShowAuthModal(false);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: formData.email, password: formData.password });
      if (error) setAuthError(error.message);
      else setShowAuthModal(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setEntries({});
    setNote('');
    setImages([]);
    setSelectedMood(null);
  };

  const editEntry = (entry) => {
    setNote(entry.note);
    setSelectedMood(entry.mood);
    setImages(entry.images || []);
    setActiveEntry(null);
    setTimeout(() => {
      document.getElementById('writer').scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleMoodClick = (key) => {
    console.log(`DEBUG: Mood clicked: ${key}`);
    if (!user) setShowAuthModal(true);
    else {
      setSelectedMood(key);
      document.getElementById('writer').scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className={`app-container ${isDark ? 'dark-theme' : ''}`}>
      
      <nav className="top-nav">
        <div className="nav-links">
          {user ? (
            <div className="user-profile">
              <span className="user-initial">{user.email?.charAt(0)}</span>
              <span className="user-name">{user.email?.split('@')[0]}</span>
            </div>
          ) : (
            <button className="nav-btn" onClick={() => setShowAuthModal(true)}>
                <User size={18} /> <span>LOGIN</span>
            </button>
          )}
          <button className="theme-toggle" onClick={() => setIsDark(!isDark)}>
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          {user && (
            <button className="nav-btn logout-btn" onClick={logout}>
              <LogOut size={18} /> <span>LOGOUT</span>
            </button>
          )}
        </div>
      </nav>

      {/* SECTION 1: HERO */}
      <section className="hero-section">
        <motion.div 
          initial={{ opacity: 0, letterSpacing: "1em", y: 20 }}
          animate={{ opacity: 1, letterSpacing: "0.3em", y: 0 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="brand-layer"
        >
          <h1>EPHEMERAL</h1>
          <p>{format(new Date(), 'EEEE, MMMM do, yyyy')}</p>
        </motion.div>

        <div className="main-grid">
          {Object.entries(MOODS).map(([key, info], index) => (
            <motion.button
              key={key}
              whileHover={{ filter: "brightness(1.1)" }}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: index * 0.1 }}
              className={`mood-card ${selectedMood === key ? 'active-selection' : ''}`}
              style={{ backgroundColor: info.color }}
              onClick={() => handleMoodClick(key)}
            >
              <motion.span 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + index * 0.1 }}
                className="mood-label"
              >
                {info.label}
              </motion.span>
              <span className="mood-desc">{info.desc}</span>
            </motion.button>
          ))}
        </div>

        <motion.div 
          animate={{ y: [0, 15, 0] }} 
          transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
          className="bounce-wrapper"
        >
          <ChevronDown size={40} strokeWidth={1} />
        </motion.div>
      </section>

      {/* SECTION 2: WRITER */}
      <section id="writer" className="writer-section">
        <motion.div 
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ margin: "-100px", once: true }}
          className="writing-card"
        >
          <div className="card-top">
             <span>
               <Clock size={14} style={{ verticalAlign: 'middle', marginRight: '8px' }} /> 
               {format(new Date(), 'HH:mm')} • DAILY REFLECTION
             </span>
          </div>
          
          <h2>{greeting}</h2>
          
          <textarea 
            placeholder={user ? "Start typing your story..." : "Please log in to start archiving your journey."}
            value={note}
            readOnly={!user}
            onClick={() => !user && setShowAuthModal(true)}
            onChange={(e) => setNote(e.target.value)}
          />

          {/* NEW: IMAGE UPLOAD AREA */}
          {user && (
            <div className="image-upload-section">
              <div className="image-preview-container">
                {images.map((src, idx) => (
                  <div key={idx} className="image-upload-slot">
                    <img src={src} alt="Upload preview" />
                    <div className="remove-img-badge" onClick={() => removeImage(idx)}><X size={12} /></div>
                  </div>
                ))}
                {images.length < 3 && (
                  <div className="image-upload-slot" onClick={() => fileInputRef.current.click()}>
                    <Plus size={24} opacity={0.3} />
                    <span>ADD IMAGE</span>
                  </div>
                )}
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                multiple 
                accept="image/*" 
                onChange={handleImageUpload} 
              />
            </div>
          )}

          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`save-button ${isSaved ? 'saved' : ''}`} 
            onClick={saveEntry}
          >
            {isSaved ? (
              <><CheckCircle size={20} /> SAVED TO CLOUD</>
            ) : (
              <><Sparkles size={20} /> ARCHIVE MOMENT</>
            )}
          </motion.button>
        </motion.div>
      </section>

      {/* SECTION 3: TIMELINE */}
      <AnimatePresence>
        {user && (
          <section id="history" className="history-section">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="calendar-wrapper"
            >
              <div className="calendar-header">
                <h3>TIMELINE</h3>
                <p>Your emotional landscape synced</p>
              </div>
              
              <Calendar 
                className="premium-calendar-override"
                tileClassName={({ date }) => {
                  const d = format(date, 'yyyy-MM-dd');
                  const entry = entries[d];
                  return entry ? `tile-${entry.mood}` : null;
                }}
                onClickDay={(date) => {
                  const d = format(date, 'yyyy-MM-dd');
                  const entry = entries[d];
                  if (entry) {
                    setShowConfirmDelete(false);
                    setActiveEntry({ 
                      ...entry, 
                      date: format(date, 'MMMM do, yyyy'),
                      id: d 
                    });
                  }
                }}
              />
            </motion.div>
          </section>
        )}
      </AnimatePresence>

      {/* AUTH MODAL OVERLAY */}
      <AnimatePresence>
        {showAuthModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="entry-overlay" style={{ zIndex: 4000 }} onClick={() => setShowAuthModal(false)}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="auth-glass-card" onClick={(e) => e.stopPropagation()}
            >
              <button className="close-modal" onClick={() => setShowAuthModal(false)}><X size={32} /></button>
              <div className="auth-header">
                <div className="auth-logo">EPHEMERAL</div>
                <h1>{authMode === 'login' ? 'WELCOME BACK' : 'CREATE ACCOUNT'}</h1>
                <p>{authMode === 'login' ? 'Securely access your memories.' : 'Join the cloud-synced journey.'}</p>
              </div>
              <form onSubmit={handleAuth} className="auth-form">
                <div className="input-group">
                  <User size={18} />
                  <input type="email" placeholder="Email Address" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
                </div>
                <div className="input-group">
                  <Lock size={18} />
                  <input type="password" placeholder="Password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} />
                </div>
                <AnimatePresence>
                  {authError && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="auth-error-msg">
                      <AlertTriangle size={14} /> {authError}
                    </motion.div>
                  )}
                </AnimatePresence>
                <button type="submit" className="auth-main-btn">{authMode === 'login' ? 'SIGN IN' : 'JOIN EPHEMERAL'}</button>
              </form>
              <div className="auth-footer">
                <button onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError(''); }}>
                  {authMode === 'login' ? "DON'T HAVE AN ACCOUNT? SIGN UP" : "ALREADY A MEMBER? LOG IN"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ENTRY VIEW MODAL */}
      <AnimatePresence>
        {activeEntry && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="entry-overlay" onClick={() => setActiveEntry(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 30, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, y: 30, opacity: 0 }}
              className="entry-modal" onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-accent" style={{ backgroundColor: MOODS[activeEntry.mood].color }} />
              <button className="close-modal" onClick={() => setActiveEntry(null)}><X size={32} /></button>
              
              <span>{activeEntry.date}</span>
              <h2 style={{ color: MOODS[activeEntry.mood].color }}>{MOODS[activeEntry.mood].label}</h2>
              
              {/* NEW: IMAGE GALLERY IN MODAL */}
              {activeEntry.images && activeEntry.images.length > 0 && (
                <div className="modal-image-gallery">
                  {activeEntry.images.map((src, idx) => (
                    <img key={idx} src={src} alt="Entry" />
                  ))}
                </div>
              )}

              <div className="modal-divider" />
              <p className="modal-note">{activeEntry.note || "No notes for this day."}</p>

              <div className="modal-actions">
                <AnimatePresence mode="wait">
                  {!showConfirmDelete ? (
                    <motion.div 
                      key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      style={{ display: 'flex', gap: '15px', width: '100%' }}
                    >
                      <button className="action-btn edit" onClick={() => editEntry(activeEntry)}><Edit3 size={18} /> EDIT NOTE</button>
                      <button className="action-btn delete" onClick={() => setShowConfirmDelete(true)}><Trash2 size={18} /> DELETE</button>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="confirm" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                      className="confirm-delete-box"
                    >
                      <div className="confirm-header">
                        <AlertTriangle size={20} color="#e74c3c" />
                        <p>DELETE FROM CLOUD FOREVER?</p>
                      </div>
                      <div className="confirm-buttons">
                        <button className="confirm-btn yes" onClick={handleFinalDelete}>YES, DELETE</button>
                        <button className="confirm-btn no" onClick={() => setShowConfirmDelete(false)}>CANCEL</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="app-footer">
        <div className="footer-content">
          <p className="made-with-love">made with love, by Harshal !</p>
          <h2 className="peace-text">PEACE</h2>
        </div>
      </footer>
    </div>
  );
}
