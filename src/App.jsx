import React, { useState, useEffect, useRef, useMemo } from 'react';

// --- GAME LOGIC & CONSTANTS ---
const BASE_ITEMS = [
  { shape: 'ghost', color: 'white' },
  { shape: 'bottle', color: 'green' },
  { shape: 'book', color: 'blue' },
  { shape: 'chair', color: 'red' },
  { shape: 'mouse', color: 'grey' }
];

const COLORS = {
  white: '#f8fafc',
  green: '#22c55e',
  blue: '#3b82f6',
  red: '#ef4444',
  grey: '#64748b' // slightly darker grey for better contrast
};

const getTextColor = (colorName) => {
  if (colorName === 'white') return '#475569'; // slate-600 contrast for white text on light card
  return COLORS[colorName];
};

const CORNERS = [
  { id: 'TL', label: 'Player 1', pos: 'top-0 left-0 rounded-br-2xl', flex: 'flex-col items-start justify-start' },
  { id: 'TR', label: 'Player 2', pos: 'top-0 right-0 rounded-bl-2xl', flex: 'flex-col items-end justify-start' },
  { id: 'BL', label: 'Player 3', pos: 'bottom-0 left-0 rounded-tr-2xl', flex: 'flex-col items-start justify-end' },
  { id: 'BR', label: 'Player 4', pos: 'bottom-0 right-0 rounded-tl-2xl', flex: 'flex-col items-end justify-end' }
];

// Keep a persistent global reference to the AudioContext to prevent re-creation blocks
let globalAudioCtx = null;

const getSharedAudioContext = () => {
  if (!globalAudioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      globalAudioCtx = new AudioContextClass();
    }
  }
  return globalAudioCtx;
};

// --- MOBILE-SAFE SOUND EFFECTS ENGINE ---
const playSound = async (type) => {
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    
    if (type === 'correct') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'wrong') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.25);
      
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } else if (type === 'win') {
      const notes = [261.63, 329.63, 392.00, 523.25];
      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + index * 0.1);
        
        gain.gain.setValueAtTime(0.15, ctx.currentTime + index * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + index * 0.1 + 0.3);
        
        osc.start(ctx.currentTime + index * 0.1);
        osc.stop(ctx.currentTime + index * 0.1 + 0.3);
      });
    } else if (type === 'flip') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.15);
      
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    }
  } catch (e) {
    console.warn("Audio Context blocked or not supported: ", e);
  }
};

const unlockMobileAudio = () => {
  const ctx = getSharedAudioContext();
  if (ctx) {
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.001, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.01);
      }).catch(e => console.warn("Failed to resume context on unlock:", e));
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.01);
    }
  }
};

// --- AUTHENTIC DECK GENERATOR ---
const FULL_DECK = (() => {
  let deck = [];
  const colors = ['white', 'green', 'blue', 'red', 'grey'];
  const shapes = ['ghost', 'bottle', 'book', 'chair', 'mouse'];
  
  let allItems = [];
  shapes.forEach(s => colors.forEach(c => allItems.push({ shape: s, color: c })));

  for (let i = 0; i < allItems.length; i++) {
    for (let j = i + 1; j < allItems.length; j++) {
      const item1 = allItems[i];
      const item2 = allItems[j];

      if (item1.shape === item2.shape || item1.color === item2.color) continue;

      let isItem1Base = BASE_ITEMS.some(b => b.shape === item1.shape && b.color === item1.color);
      let isItem2Base = BASE_ITEMS.some(b => b.shape === item2.shape && b.color === item2.color);

      let answer = null;

      if (isItem1Base && !isItem2Base) answer = item1.shape;
      else if (!isItem1Base && isItem2Base) answer = item2.shape;
      else if (!isItem1Base && !isItem2Base) {
        let elimShapes = [item1.shape, item2.shape];
        let elimColors = [item1.color, item2.color];
        let remaining = BASE_ITEMS.filter(b => !elimShapes.includes(b.shape) && !elimColors.includes(b.color));
        
        if (remaining.length === 1) {
          answer = remaining[0].shape;
        }
      }

      if (answer) deck.push({ items: [item1, item2], answer });
    }
  }
  return deck;
})();

// --- SVGS ---
const ItemIcon = ({ shape, color, size = 80, className = "" }) => {
  const fill = COLORS[color] || 'currentColor';
  const stroke = color === 'white' ? '#475569' : '#0f172a'; 

  switch (shape) {
    case 'ghost':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" className={`filter drop-shadow-lg ${className}`}>
          <path d="M 50 10 C 20 10, 15 30, 15 65 C 15 90, 25 90, 30 80 C 35 70, 40 90, 50 80 C 60 90, 65 70, 70 80 C 75 90, 85 90, 85 65 C 85 30, 80 10, 50 10 Z" fill={fill} stroke={stroke} strokeWidth="5" strokeLinejoin="round" />
          <circle cx="35" cy="40" r="6" fill="#0f172a" />
          <circle cx="65" cy="40" r="6" fill="#0f172a" />
          <path d="M 42 55 Q 50 62 58 55" stroke="#0f172a" fill="none" strokeWidth="4" strokeLinecap="round" />
          <ellipse cx="23" cy="45" rx="5" ry="3" fill="#fca5a5" opacity="0.8" />
          <ellipse cx="77" cy="45" rx="5" ry="3" fill="#fca5a5" opacity="0.8" />
        </svg>
      );
    case 'bottle':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" className={`filter drop-shadow-lg ${className}`}>
          <path d="M 40 5 L 60 5 L 55 20 L 45 20 Z" fill="#d97706" stroke={stroke} strokeWidth="4" strokeLinejoin="round" />
          <path d="M 45 20 L 55 20 L 55 40 Q 80 50 80 80 Q 80 95 50 95 Q 20 95 20 80 Q 20 50 45 40 Z" fill={fill} stroke={stroke} strokeWidth="5" strokeLinejoin="round" />
          <path d="M 30 75 Q 35 55 50 50" stroke="white" fill="none" strokeWidth="5" strokeLinecap="round" opacity="0.5" />
        </svg>
      );
    case 'book':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" className={`filter drop-shadow-lg ${className}`}>
          <path d="M 15 25 L 75 10 L 85 75 L 25 90 Z" fill="#e2e8f0" stroke={stroke} strokeWidth="5" strokeLinejoin="round" />
          <path d="M 10 30 L 70 15 L 80 80 L 20 95 Z" fill={fill} stroke={stroke} strokeWidth="5" strokeLinejoin="round" />
          <path d="M 45 22 L 55 20 L 55 55 L 50 50 L 45 55 Z" fill="#f59e0b" stroke={stroke} strokeWidth="3" strokeLinejoin="round" />
          <circle cx="45" cy="55" r="10" fill="white" opacity="0.4" />
        </svg>
      );
    case 'chair':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" className={`filter drop-shadow-lg ${className}`}>
          <path d="M 25 10 C 25 0, 75 0, 75 10 L 75 55 L 25 55 Z" fill={fill} stroke={stroke} strokeWidth="5" strokeLinejoin="round" />
          <path d="M 15 50 C 15 40, 85 40, 85 50 L 85 65 C 85 75, 15 75, 15 65 Z" fill={fill} stroke={stroke} strokeWidth="5" strokeLinejoin="round" />
          <rect x="12" y="40" width="16" height="20" rx="8" fill={fill} stroke={stroke} strokeWidth="5" />
          <rect x="72" y="40" width="16" height="20" rx="8" fill={fill} stroke={stroke} strokeWidth="5" />
          <path d="M 25 70 L 20 90 M 75 70 L 80 90" stroke={stroke} strokeWidth="6" strokeLinecap="round" />
        </svg>
      );
    case 'mouse':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100" className={`filter drop-shadow-lg ${className}`}>
          <path d="M 75 70 Q 95 60 90 90" fill="none" stroke={stroke} strokeWidth="5" strokeLinecap="round" />
          <ellipse cx="45" cy="70" rx="35" ry="22" fill={fill} stroke={stroke} strokeWidth="5" />
          <circle cx="65" cy="45" r="14" fill={fill} stroke={stroke} strokeWidth="5" />
          <circle cx="65" cy="45" r="6" fill="#fca5a5" />
          <circle cx="28" cy="45" r="16" fill={fill} stroke={stroke} strokeWidth="5" />
          <circle cx="28" cy="45" r="8" fill="#fca5a5" />
          <circle cx="32" cy="65" r="4" fill="#0f172a" />
          <circle cx="52" cy="65" r="4" fill="#0f172a" />
          <circle cx="15" cy="75" r="4" fill="#fca5a5" />
          <line x1="2" y1="72" x2="15" y2="75" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
          <line x1="5" y1="80" x2="15" y2="77" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
};

// --- CONFETTI PARTICLE SYSTEM ---
const ConfettiGenerator = ({ x, y }) => {
  const particles = useMemo(() => {
    return Array.from({ length: 30 }).map((_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const velocity = 50 + Math.random() * 100;
      const color = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#ec4899', '#8b5cf6'][Math.floor(Math.random() * 6)];
      return {
        id: i,
        dx: Math.cos(angle) * velocity,
        dy: Math.sin(angle) * velocity,
        color,
        size: 6 + Math.random() * 8
      };
    });
  }, [x, y]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-50">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-full animate-ping opacity-75"
          style={{
            left: `calc(${x}px + ${p.dx}px)`,
            top: `calc(${y}px + ${p.dy}px)`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
            transition: 'all 0.6s cubic-bezier(0.1, 0.8, 0.3, 1)',
            transform: 'translate(-50%, -50%)'
          }}
        />
      ))}
    </div>
  );
};

// --- MAIN APP COMPONENT ---
export default function App() {
  const [gameState, setGameState] = useState('setup');
  const [numPlayers, setNumPlayers] = useState(2);
  const [playerNames, setPlayerNames] = useState({ TL: '', TR: '', BL: '', BR: '' });
  
  // variant supports: visual, audio, and text modes
  const [gameConfig, setGameConfig] = useState({ mode: 'points', limit: 5, variant: 'audio' }); 
  const [timeLeft, setTimeLeft] = useState(0);
  const [tiedPlayers, setTiedPlayers] = useState([]);
  const [eliminated, setEliminated] = useState([]);
  const [winner, setWinner] = useState(null);

  const [scores, setScores] = useState({ TL: 0, TR: 0, BL: 0, BR: 0 });
  const [card, setCard] = useState(null);
  const [roundState, setRoundState] = useState('idle');
  const [shaking, setShaking] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false); // Controls flip animation between guesses
  
  // MULTI-TOUCH DRAG REGISTRY: { [itemShape]: { pointerId, x, y } }
  const [activeDrags, setActiveDrags] = useState({});
  
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [confettiOrigin, setConfettiOrigin] = useState(null);
  const [windowSize, setWindowSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    const handleDocumentInteraction = () => {
      unlockMobileAudio();
      setAudioUnlocked(true);
      window.removeEventListener('click', handleDocumentInteraction, true);
      window.removeEventListener('touchstart', handleDocumentInteraction, true);
      window.removeEventListener('pointerdown', handleDocumentInteraction, true);
    };

    window.addEventListener('click', handleDocumentInteraction, true);
    window.addEventListener('touchstart', handleDocumentInteraction, true);
    window.addEventListener('pointerdown', handleDocumentInteraction, true);

    return () => {
      window.removeEventListener('click', handleDocumentInteraction, true);
      window.removeEventListener('touchstart', handleDocumentInteraction, true);
      window.removeEventListener('pointerdown', handleDocumentInteraction, true);
    };
  }, []);

  useEffect(() => {
    const handleResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (gameState === 'playing' && gameConfig.mode === 'time') {
      if (timeLeft > 0) {
        const timerId = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
        return () => clearTimeout(timerId);
      } else if (timeLeft === 0) {
        const activeCorners = CORNERS.slice(0, numPlayers).map(c => c.id);
        const activeScores = Object.entries(scores).filter(([id]) => activeCorners.includes(id));
        const maxScore = Math.max(...activeScores.map(s => s[1]));
        const leaders = activeScores.filter(s => s[1] === maxScore).map(s => s[0]);

        if (leaders.length === 1) {
          setWinner(leaders[0]);
          playSound('win');
          setGameState('gameover');
        } else {
          setTiedPlayers(leaders);
          setGameState('suddendeath');
          setRoundState('idle');
          setCard(null);
          if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        }
      }
    }
  }, [gameState, gameConfig.mode, timeLeft, scores, numPlayers]);

  const itemPositions = useMemo(() => {
    const radiusX = Math.max(140, Math.min(windowSize.w * 0.38, 350));
    const radiusY = Math.max(180, Math.min(windowSize.h * 0.38, 350));

    return BASE_ITEMS.map((item, i) => {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2; 
      return {
        ...item,
        x: Math.cos(angle) * radiusX,
        y: Math.sin(angle) * radiusY,
        rotation: (Math.random() - 0.5) * 30 
      };
    });
  }, [windowSize]);

  const generateCard = () => {
    const selectedCard = FULL_DECK[Math.floor(Math.random() * FULL_DECK.length)];
    const items = [...selectedCard.items].sort(() => Math.random() - 0.5);
    return { ...selectedCard, items };
  };

  const speakCard = (cardData) => {
    // Only speak in the Audio variant
    if (gameConfig.variant !== 'audio') return;
    
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const text = `${cardData.items[0].color} ${cardData.items[0].shape}, and ${cardData.items[1].color} ${cardData.items[1].shape}`;
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Force language to American English
      utterance.lang = 'en-US';
      utterance.rate = 1.1; 

      // Select english accent voice explicitly if available
      const voices = window.speechSynthesis.getVoices();
      const englishVoice = voices.find(voice => voice.lang.startsWith('en-'));
      if (englishVoice) {
          utterance.voice = englishVoice;
      }

      window.speechSynthesis.speak(utterance);
    }
  };

  const handleDeckTap = () => {
    // Ensure card deck isn't tapped during active drag sequences
    if (Object.keys(activeDrags).length > 0 || gameState === 'gameover' || isFlipping) return;
    
    unlockMobileAudio();

    if (roundState === 'guessing') {
      if (gameConfig.variant === 'audio' && card) {
        speakCard(card);
      }
      return;
    }
    
    playSound('flip');

    if (gameConfig.variant !== 'audio' && roundState === 'scored') {
      // Simulate drawing a new card with a quick down-and-up flip sequence
      setIsFlipping(true);
      setRoundState('idle'); // Triggers flip backward
      
      setTimeout(() => {
        const newCard = generateCard();
        setCard(newCard);
        setRoundState('guessing'); // Triggers flip forward
        if (gameConfig.variant === 'audio') speakCard(newCard);
        setIsFlipping(false);
      }, 250);
    } else {
      const newCard = generateCard();
      setCard(newCard);
      setRoundState('guessing');
      if (gameConfig.variant === 'audio') speakCard(newCard);
    }
  };

  // --- MULTI-TOUCH DRAGGING ROUTINES ---
  const handlePointerDown = (e, item) => {
    if (roundState !== 'guessing' || shaking || gameState === 'gameover' || isFlipping) return; 
    unlockMobileAudio();

    // LOCK: If the item is already registered in active drags, reject incoming pointer downs!
    if (activeDrags[item.shape]) return;

    // Secure focus capture so mouse/touch move events route exclusively to this element
    e.currentTarget.setPointerCapture(e.pointerId);

    setActiveDrags(prev => ({
      ...prev,
      [item.shape]: {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY
      }
    }));
  };

  const handlePointerMove = (e, item) => {
    const dragData = activeDrags[item.shape];
    // Security check: Only update coordinates if this exact pointer ID initiated the drag
    if (!dragData || dragData.pointerId !== e.pointerId) return;

    setActiveDrags(prev => ({
      ...prev,
      [item.shape]: {
        ...prev[item.shape],
        x: e.clientX,
        y: e.clientY
      }
    }));
  };

  const handlePointerUp = (e, item) => {
    const dragData = activeDrags[item.shape];
    if (!dragData || dragData.pointerId !== e.pointerId) return;

    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;
    const thresholdX = innerWidth * 0.35; 
    const thresholdY = innerHeight * 0.35; 

    let scoredPlayer = null;

    if (clientX < thresholdX && clientY < thresholdY && numPlayers >= 1) scoredPlayer = 'TL';
    else if (clientX > innerWidth - thresholdX && clientY < thresholdY && numPlayers >= 2) scoredPlayer = 'TR';
    else if (clientX < thresholdX && clientY > innerHeight - thresholdY && numPlayers >= 3) scoredPlayer = 'BL';
    else if (clientX > innerWidth - thresholdX && clientY > innerHeight - thresholdY && numPlayers >= 4) scoredPlayer = 'BR';

    if (scoredPlayer) {
      const isCorrect = item.shape === card.answer;
      
      if (gameState === 'suddendeath') {
        if (!tiedPlayers.includes(scoredPlayer) || eliminated.includes(scoredPlayer)) {
          // Clean up drag registry and release target
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
          setActiveDrags(prev => {
            const next = { ...prev };
            delete next[item.shape];
            return next;
          });
          return;
        }

        if (isCorrect) {
          playSound('correct');
          setConfettiOrigin({ x: clientX, y: clientY });
          setTimeout(() => setConfettiOrigin(null), 1000);

          setScores(prev => ({ ...prev, [scoredPlayer]: prev[scoredPlayer] + 1 }));
          setWinner(scoredPlayer);
          playSound('win');
          setGameState('gameover');
        } else {
          playSound('wrong');
          setScores(prev => ({ ...prev, [scoredPlayer]: prev[scoredPlayer] - 1 }));
          const newElim = [...eliminated, scoredPlayer];
          setEliminated(newElim);
          setShaking(true);
          setTimeout(() => setShaking(false), 500);

          const remaining = tiedPlayers.filter(p => !newElim.includes(p));
          if (remaining.length === 1) {
            setWinner(remaining[0]);
            playSound('win');
            setGameState('gameover');
          } else if (remaining.length === 0) {
            setWinner('Draw');
            setGameState('gameover');
          }
        }
      } else {
        if (isCorrect) {
          playSound('correct');
          setConfettiOrigin({ x: clientX, y: clientY });
          setTimeout(() => setConfettiOrigin(null), 1000);

          const newScore = scores[scoredPlayer] + 1;
          setScores(prev => ({ ...prev, [scoredPlayer]: newScore }));
          setRoundState('scored'); 
          
          if (gameConfig.mode === 'points' && newScore >= gameConfig.limit) {
            setWinner(scoredPlayer);
            playSound('win');
            setGameState('gameover');
          }
        } else {
          playSound('wrong');
          setScores(prev => ({ ...prev, [scoredPlayer]: prev[scoredPlayer] - 1 }));
          setShaking(true);
          setTimeout(() => setShaking(false), 500);
        }
      }
      
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }

    // Clean up drag registry and release target
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    setActiveDrags(prev => {
      const next = { ...prev };
      delete next[item.shape];
      return next;
    });
  };

  const startGame = () => {
    unlockMobileAudio();
    playSound('flip');
    setScores({ TL: 0, TR: 0, BL: 0, BR: 0 });
    setRoundState('idle');
    setCard(null);
    setTiedPlayers([]);
    setEliminated([]);
    setWinner(null);
    setIsFlipping(false);
    setActiveDrags({});
    if (gameConfig.mode === 'time') setTimeLeft(gameConfig.limit);
    setGameState('playing');
  };

  if (gameState === 'setup') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-4 font-sans relative">
        {!audioUnlocked && (
          <div 
            onTouchStart={() => {
              unlockMobileAudio();
              setAudioUnlocked(true);
            }}
            onClick={() => {
              unlockMobileAudio();
              setAudioUnlocked(true);
            }}
            className="absolute inset-0 bg-transparent z-50 cursor-pointer"
          />
        )}

        <div className="bg-slate-800 p-8 rounded-3xl shadow-2xl max-w-lg w-full text-center border border-slate-700 relative z-10">
          <h1 className="text-4xl font-bold mb-2 text-yellow-400 tracking-wider">GHOST BLITZ</h1>
          <p className="text-slate-400 mb-6">Digital Edition</p>
          
          <div className="mb-6">
            <h2 className="text-xl mb-3 font-bold text-slate-300">Players</h2>
            <div className="flex justify-center gap-2 mb-4">
              {[1, 2, 3, 4].map(num => (
                <button
                  key={num}
                  onClick={() => {
                    unlockMobileAudio();
                    setNumPlayers(num);
                  }}
                  className={`w-12 h-12 rounded-full font-bold transition-all ${
                    numPlayers === num ? 'bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)] scale-110' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              {CORNERS.slice(0, numPlayers).map((c, i) => (
                <input
                  key={c.id}
                  type="text"
                  placeholder={`Player ${i + 1} Name`}
                  maxLength={12}
                  value={playerNames[c.id]}
                  onChange={(e) => setPlayerNames({ ...playerNames, [c.id]: e.target.value })}
                  className="bg-slate-700 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-center border border-slate-600"
                />
              ))}
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-xl mb-3 font-bold text-slate-300">Game Version</h2>
            <div className="flex bg-slate-700 rounded-xl p-1 gap-1">
              <button 
                className={`flex-1 py-2 rounded-lg font-bold transition-all ${gameConfig.variant === 'visual' ? 'bg-slate-800 text-yellow-400 shadow' : 'text-slate-400 hover:bg-slate-600'}`}
                onClick={() => {
                  unlockMobileAudio();
                  setGameConfig({ ...gameConfig, variant: 'visual' });
                }}
              >
                Cards
              </button>
              <button 
                className={`flex-1 py-2 rounded-lg font-bold transition-all ${gameConfig.variant === 'audio' ? 'bg-slate-800 text-yellow-400 shadow' : 'text-slate-400 hover:bg-slate-600'}`}
                onClick={() => {
                  unlockMobileAudio();
                  setGameConfig({ ...gameConfig, variant: 'audio' });
                }}
              >
                Listening
              </button>
              <button 
                className={`flex-1 py-2 rounded-lg font-bold transition-all ${gameConfig.variant === 'text' ? 'bg-slate-800 text-yellow-400 shadow' : 'text-slate-400 hover:bg-slate-600'}`}
                onClick={() => {
                  unlockMobileAudio();
                  setGameConfig({ ...gameConfig, variant: 'text' });
                }}
              >
                Reading
              </button>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-xl mb-3 font-bold text-slate-300">Win Condition</h2>
            <div className="flex bg-slate-700 rounded-xl p-1 mb-4">
              <button 
                className={`flex-1 py-2 rounded-lg font-bold transition-all ${gameConfig.mode === 'points' ? 'bg-slate-800 text-yellow-400 shadow' : 'text-slate-400'}`}
                onClick={() => {
                  unlockMobileAudio();
                  setGameConfig({ ...gameConfig, mode: 'points', limit: 5 });
                }}
              >
                Points Race
              </button>
              <button 
                className={`flex-1 py-2 rounded-lg font-bold transition-all ${gameConfig.mode === 'time' ? 'bg-slate-800 text-yellow-400 shadow' : 'text-slate-400'}`}
                onClick={() => {
                  unlockMobileAudio();
                  setGameConfig({ ...gameConfig, mode: 'time', limit: 180 });
                }}
              >
                Time Limit
              </button>
            </div>

            <div className="flex justify-center gap-2">
              {gameConfig.mode === 'points' ? (
                [5, 7, 10].map(pts => (
                  <button 
                    key={pts} 
                    onClick={() => {
                      unlockMobileAudio();
                      setGameConfig({ ...gameConfig, limit: pts });
                    }} 
                    className={`px-4 py-2 rounded-lg font-bold ${gameConfig.limit === pts ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400'}`}
                  >
                    {pts} Pts
                  </button>
                ))
              ) : (
                [120, 180, 300, 600].map(secs => (
                  <button 
                    key={secs} 
                    onClick={() => {
                      unlockMobileAudio();
                      setGameConfig({ ...gameConfig, limit: secs });
                    }} 
                    className={`px-4 py-2 rounded-lg font-bold ${gameConfig.limit === secs ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400'}`}
                  >
                    {secs / 60} Min
                  </button>
                ))
              )}
            </div>
          </div>
          
          <button 
            onClick={startGame}
            className="w-full bg-green-500 hover:bg-green-400 text-white py-4 rounded-xl text-2xl font-black uppercase tracking-widest shadow-lg transition-colors"
          >
            Start Game
          </button>
        </div>
      </div>
    );
  }

  const activeCorners = CORNERS.slice(0, numPlayers);
  const getPlayerLabel = (c) => playerNames[c.id] || c.label;

  // The card is considered "flipped" to reveal its face in these conditions:
  const isCardFlipped = 
    roundState === 'scored' || 
    gameState === 'gameover' || 
    (roundState === 'guessing' && gameConfig.variant !== 'audio');

  return (
    <div 
      className="fixed inset-0 bg-amber-950 overflow-hidden touch-none select-none font-sans"
    >
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translate(0, 0) rotate(0); }
          25% { transform: translate(8px, 8px) rotate(8deg); }
          50% { transform: translate(-8px, -8px) rotate(-8deg); }
          75% { transform: translate(-8px, 8px) rotate(8deg); }
        }
        .shake-animation {
          animation: shake 0.15s ease-in-out infinite;
        }
        .card-flip-inner {
          transition: transform 0.4s cubic-bezier(0.4, 0.0, 0.2, 1);
          transform-style: preserve-3d;
        }
        .card-flip-flipped .card-flip-inner {
          transform: rotateY(180deg);
        }
        .card-face {
          backface-visibility: hidden;
        }
        .card-back {
          transform: rotateY(180deg);
        }
        .pulse {
          animation: pulse-anim 1s infinite alternate;
        }
        @keyframes pulse-anim {
          from { transform: scale(1); opacity: 0.9; }
          to { transform: scale(1.1); opacity: 1; }
        }
      `}</style>

      <div className="absolute inset-0 opacity-40 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-600 via-amber-950 to-black mix-blend-multiply" />

      {confettiOrigin && <ConfettiGenerator x={confettiOrigin.x} y={confettiOrigin.y} />}

      {gameConfig.mode === 'time' && gameState === 'playing' && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-slate-900/80 px-6 py-2 rounded-full z-40 text-yellow-400 font-bold text-2xl tracking-widest border border-slate-700 shadow-lg">
          {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
        </div>
      )}

      {gameState === 'suddendeath' && (
        <div className="absolute top-8 left-1/2 transform -translate-x-1/2 z-40 text-red-500 font-black text-4xl md:text-6xl tracking-widest drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)] pulse whitespace-nowrap pointer-events-none">
          SUDDEN DEATH!
        </div>
      )}

      {/* PLAYER CORNERS */}
      {activeCorners.map(corner => {
        const isEliminated = gameState === 'suddendeath' && eliminated.includes(corner.id);
        const isTied = gameState === 'suddendeath' && tiedPlayers.includes(corner.id);
        const outOfAction = gameState === 'suddendeath' && !isTied;

        return (
          <div 
            key={corner.id} 
            className={`absolute w-32 h-32 md:w-48 md:h-48 backdrop-blur-sm p-4 text-white z-10 border-2 ${corner.pos} ${corner.flex} transition-all duration-500 ${
              isEliminated || outOfAction ? 'bg-red-900/80 border-red-500/30 grayscale' : 'bg-slate-900/60 border-amber-500/30'
            }`}
          >
            <div className="text-xs md:text-sm text-slate-300 uppercase font-bold tracking-wider max-w-full truncate">
              {getPlayerLabel(corner)}
            </div>
            <div className={`text-4xl md:text-6xl font-black ${isEliminated || outOfAction ? 'text-red-400' : 'text-yellow-400'}`}>
              {scores[corner.id]}
            </div>
            {isEliminated && <div className="absolute inset-0 flex items-center justify-center font-black text-red-500 transform -rotate-12 text-xl tracking-widest bg-black/50">OUT</div>}
          </div>
        );
      })}

      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-4xl max-h-4xl flex items-center justify-center">
        
        {/* CENTER DECK / CARD */}
        <div 
          className={`relative z-20 w-48 h-64 md:w-56 md:h-80 cursor-pointer perspective-1000 ${isCardFlipped ? 'card-flip-flipped' : ''}`}
          onClick={handleDeckTap}
        >
          <div className="card-flip-inner w-full h-full relative shadow-2xl rounded-2xl">
            {/* FACE DOWN */}
            <div className="card-face absolute inset-0 w-full h-full bg-indigo-700 rounded-2xl border-4 border-slate-300 flex flex-col items-center justify-center shadow-[inset_0_0_30px_rgba(0,0,0,0.6)]">
              <ItemIcon shape="ghost" color="white" size={70} className="mx-auto mb-4 opacity-50" />
              <p className="text-2xl text-white font-black tracking-widest opacity-90 uppercase text-center px-4">
                {roundState === 'guessing' ? 'Listen!' : (gameState === 'suddendeath' ? 'Tiebreaker' : 'Tap')}
              </p>
            </div>

            {/* FACE UP */}
            <div className="card-face card-back absolute inset-0 w-full h-full bg-slate-50 rounded-2xl border-4 border-slate-300 shadow-xl flex flex-col items-center justify-center p-6">
              {card && (
                gameConfig.variant === 'text' && roundState === 'guessing' ? (
                  // TEXT / READING VARIANT DURING GUESSING
                  <div className="relative w-full h-full flex flex-col items-center justify-center text-center px-2">
                    <div className="text-3xl md:text-4xl font-black uppercase tracking-wider leading-tight" style={{ color: getTextColor(card.items[0].color) }}>
                      {card.items[0].color}<br/>{card.items[0].shape}
                    </div>
                    <div className="text-2xl text-slate-400 font-bold my-4">&amp;</div>
                    <div className="text-3xl md:text-4xl font-black uppercase tracking-wider leading-tight" style={{ color: getTextColor(card.items[1].color) }}>
                      {card.items[1].color}<br/>{card.items[1].shape}
                    </div>
                  </div>
                ) : (
                  // VISUAL VARIANT OR POST-GUESS (SCORED) STATE
                  <div className="relative w-full h-full flex flex-col items-center justify-around gap-4">
                    <ItemIcon shape={card.items[0].shape} color={card.items[0].color} size={90} />
                    <ItemIcon shape={card.items[1].shape} color={card.items[1].color} size={90} />
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {/* ITEMS AROUND CARD */}
        {itemPositions.map((item) => {
          const dragData = activeDrags[item.shape];
          const isBeingDragged = !!dragData;
          
          let style = {};
          if (isBeingDragged) {
            style = {
              position: 'fixed',
              left: dragData.x,
              top: dragData.y,
              transform: `translate(-50%, -50%) scale(1.3) rotate(${item.rotation}deg)`,
              zIndex: 100,
              pointerEvents: 'none' 
            };
          } else {
            style = {
              position: 'absolute',
              transform: `translate(${item.x}px, ${item.y}px) rotate(${item.rotation}deg)`,
              zIndex: 30
            };
          }

          return (
            <div
              key={item.shape}
              style={style}
              className={`cursor-grab active:cursor-grabbing p-2 transition-transform touch-none ${shaking ? 'shake-animation' : ''} ${roundState !== 'guessing' || isFlipping ? 'opacity-40 grayscale pointer-events-none' : 'hover:scale-110'}`}
              onPointerDown={(e) => handlePointerDown(e, item)}
              onPointerMove={(e) => handlePointerMove(e, item)}
              onPointerUp={(e) => handlePointerUp(e, item)}
              onPointerCancel={(e) => handlePointerUp(e, item)}
            >
              <ItemIcon shape={item.shape} color={item.color} size={100} className="relative z-10" />
            </div>
          );
        })}
      </div>

      {/* GAME OVER */}
      {gameState === 'gameover' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-800 p-8 rounded-3xl shadow-2xl text-center max-w-md w-full mx-4 border-2 border-slate-600">
            <h2 className="text-4xl font-black text-white mb-2 uppercase">Game Over</h2>
            {winner === 'Draw' ? (
              <p className="text-2xl text-slate-300 mb-8">It's a complete draw!</p>
            ) : (
              <p className="text-2xl text-yellow-400 mb-8 font-bold">
                {playerNames[winner] || CORNERS.find(c => c.id === winner)?.label} Wins!
              </p>
            )}
            
            <div className="flex gap-4">
              <button 
                onClick={() => {
                  unlockMobileAudio();
                  setGameState('setup');
                }} 
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-bold transition-colors"
              >
                Setup
              </button>
              <button 
                onClick={startGame} 
                className="flex-1 bg-green-500 hover:bg-green-400 text-white py-3 rounded-xl font-bold transition-colors"
              >
                Play Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUIT BUTTON */}
      {gameState !== 'gameover' && (
        <button 
          onClick={() => {
            unlockMobileAudio();
            setGameState('setup');
          }}
          className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white/10 hover:bg-white/20 backdrop-blur-md px-6 py-2 rounded-full text-white/70 text-sm font-bold z-50 transition-colors"
        >
          End Game
        </button>
      )}
    </div>
  );
}