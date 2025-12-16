import React, { useState, useEffect, useRef } from 'react';
import { Howl } from 'howler';
import { Volume2, Mic, Sword, Settings, StopCircle, Shuffle } from 'lucide-react';
import './App.css';

// --- ASSET CONFIGURATION ---
// Arrays of files for the Playlist logic
const ASSETS = {
  bgm: {
    // BATTLE: A list of files to shuffle
    battle: [
      '/assets/battle1.mp3',
      '/assets/battle2.mp3'
    ],
    
    // THRILL: Even if you only have one file, it MUST be inside an array []
    thrill: [
      '/assets/thrill_theme.mp3'
    ],
    
    // SERENE: A list of files
    serene: [
      '/assets/rain.mp3',
      '/assets/wind.mp3'
    ],
  },
  
  sfx: {
    // SFX are just single file paths (Strings)
    sword: '/assets/sword.mp3',
    spell: '/assets/magic.mp3',
    explosion: '/assets/boom.mp3',
    door: '/assets/door_creak.mp3',
  }
};

// --- HELPER: Fisher-Yates Shuffle ---
const shuffleArray = (array) => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

const App = () => {
  // --- STATE ---
  const [apiKey, setApiKey] = useState(localStorage.getItem('GOOGLE_API_KEY') || '');
  const [currentBgmCategory, setCurrentBgmCategory] = useState(null); 
  const [narratorText, setNarratorText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingTTS, setIsLoadingTTS] = useState(false);

  // --- REFS ---
  const bgmRef = useRef(null);       
  const narratorRef = useRef(null);
  const queueRef = useRef([]);       // Stores the FIXED shuffled order
  const queueIndexRef = useRef(0);   

  // --- BGM LOGIC ---

  const startPlaylist = (category) => {
    // 1. Always stop current music first
    stopBgm();

    // 2. Load the tracks
    const tracks = ASSETS.bgm[category];
    if (!tracks || tracks.length === 0) return;

    setCurrentBgmCategory(category);
    
    // 3. SHUFFLE ONCE (The "Deck" is now set)
    queueRef.current = shuffleArray(tracks);
    queueIndexRef.current = 0;

    console.log(`Starting ${category} with order:`, queueRef.current); // Debugging

    // 4. Play the first track
    playTrackInQueue(category);
  };

  const playTrackInQueue = (category) => {
    // Safety: ensure we are still supposed to be playing this category
    if (currentBgmCategory && currentBgmCategory !== category) return;

    const currentTrackUrl = queueRef.current[queueIndexRef.current];

    const sound = new Howl({
      src: [currentTrackUrl],
      html5: true, 
      volume: 0, 
      onend: () => {
        // --- QUEUE LOGIC ---
        // 1. Move to next track index
        queueIndexRef.current++;

        // 2. If we hit the end, LOOP back to start (index 0)
        // DO NOT RESHUFFLE HERE. Keep the same order.
        if (queueIndexRef.current >= queueRef.current.length) {
          queueIndexRef.current = 0;
          console.log("Playlist finished. Looping back to start of sequence.");
        }

        // 3. Play
        playTrackInQueue(category);
      }
    });

    sound.play();
    sound.fade(0, 1.0, 2000); // 2-second fade in
    bgmRef.current = sound;
  };

  const stopBgm = () => {
    if (bgmRef.current) {
      bgmRef.current.off('end'); // Important: Stop the auto-next trigger
      bgmRef.current.fade(bgmRef.current.volume(), 0, 1000);
      const oldSound = bgmRef.current;
      setTimeout(() => {
        oldSound.stop();
        oldSound.unload();
      }, 1000);
      bgmRef.current = null;
    }
    // We don't set currentBgmCategory to null immediately if we are switching, 
    // but startPlaylist handles the state update.
  };

  const handleStopClick = () => {
    stopBgm();
    setCurrentBgmCategory(null);
  }

  // --- SFX LOGIC ---
  const playSfx = (type) => {
    const src = ASSETS.sfx[type];
    if (src) {
      const sfx = new Howl({ src: [src], volume: 0.8 });
      sfx.play();
    }
  };

  // --- NARRATOR / GOOGLE API LOGIC ---
  const handleNarrate = async () => {
    if (!apiKey) {
      alert("Please enter a Google Cloud API Key first.");
      return;
    }
    if (!narratorText) return;

    setIsLoadingTTS(true);

    try {
      const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text: narratorText },
          voice: { languageCode: 'en-US', name: 'en-US-Studio-M' }, 
          audioConfig: { audioEncoding: 'MP3', pitch: -2.0, speakingRate: 0.90 } 
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      playAudioFromBase64(data.audioContent);

    } catch (error) {
      console.error("TTS Error:", error);
      alert("Error: " + error.message);
    } finally {
      setIsLoadingTTS(false);
    }
  };

  const playAudioFromBase64 = (base64String) => {
    const byteCharacters = atob(base64String);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'audio/mp3' });
    const blobUrl = URL.createObjectURL(blob);

    if (narratorRef.current) narratorRef.current.unload();
    
    const narrator = new Howl({
      src: [blobUrl],
      format: ['mp3'],
      volume: 1.0,
      onend: () => setIsSpeaking(false),
      onplay: () => setIsSpeaking(true)
    });

    narrator.play();
    narratorRef.current = narrator;
  };

  // --- DUCKING LOGIC ---
  useEffect(() => {
    if (!bgmRef.current) return;
    const targetVol = isSpeaking ? 0.2 : 1.0;
    bgmRef.current.fade(bgmRef.current.volume(), targetVol, 500);
  }, [isSpeaking, currentBgmCategory]); 

  const saveKey = (e) => {
    const val = e.target.value;
    setApiKey(val);
    localStorage.setItem('GOOGLE_API_KEY', val);
  };

  return (
    <div className="dashboard">
      
      {/* COLUMN 1: ATMOSPHERE */}
      <div className="panel">
        <h2><Volume2 /> Atmosphere</h2>
        <div className="control-group">
          <button 
            className={`rpg-btn ${currentBgmCategory === 'battle' ? 'active' : ''}`}
            onClick={() => startPlaylist('battle')}>
            <Shuffle size={16} style={{display:'inline', marginRight: 8}}/>
            Battle Playlist
          </button>
          <button 
            className={`rpg-btn ${currentBgmCategory === 'thrill' ? 'active' : ''}`}
            onClick={() => startPlaylist('thrill')}>
            <Shuffle size={16} style={{display:'inline', marginRight: 8}}/>
            Thrill Playlist
          </button>
          <button 
            className={`rpg-btn ${currentBgmCategory === 'serene' ? 'active' : ''}`}
            onClick={() => startPlaylist('serene')}>
            <Shuffle size={16} style={{display:'inline', marginRight: 8}}/>
            Serene Playlist
          </button>
          
          <button className="rpg-btn stop" onClick={handleStopClick}>
            <StopCircle size={16} style={{display:'inline', verticalAlign:'middle'}}/> Stop Music
          </button>
        </div>
        
        {currentBgmCategory && (
            <div style={{marginTop: '10px', fontSize: '0.8rem', color: '#888', textAlign: 'center'}}>
                Playing {currentBgmCategory.toUpperCase()} (Fixed Shuffle)
            </div>
        )}
      </div>

      {/* COLUMN 2: NARRATOR */}
      <div className="panel">
        <h2><Mic /> Narrator</h2>
        <div style={{ position: 'relative' }}>
          <Settings size={14} style={{ position: 'absolute', right: 10, top: 10, color: '#666' }} />
          <input 
            type="password" 
            className="api-input" 
            placeholder="Paste Google Cloud API Key" 
            value={apiKey}
            onChange={saveKey}
          />
        </div>
        <textarea 
          placeholder="Enter scene description..."
          value={narratorText}
          onChange={(e) => setNarratorText(e.target.value)}
        />
        <button 
          className={`rpg-btn ${isLoadingTTS ? 'loading' : ''}`} 
          style={{ background: isSpeaking ? '#d4af37' : '', color: isSpeaking ? 'black' : '' }}
          onClick={handleNarrate}
          disabled={isLoadingTTS || isSpeaking}
        >
          {isLoadingTTS ? 'Generating...' : isSpeaking ? 'Narrating...' : 'Narrate Scene'}
        </button>
      </div>

      {/* COLUMN 3: SOUNDBOARD */}
      <div className="panel">
        <h2><Sword /> SFX Board</h2>
        <div className="sfx-grid">
          <button className="rpg-btn" onClick={() => playSfx('sword')}>Sword</button>
          <button className="rpg-btn" onClick={() => playSfx('spell')}>Spell</button>
          <button className="rpg-btn" onClick={() => playSfx('explosion')}>Boom</button>
          <button className="rpg-btn" onClick={() => playSfx('door')}>Door</button>
        </div>
      </div>
    </div>
  );
};

export default App;