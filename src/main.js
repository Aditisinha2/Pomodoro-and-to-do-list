import './style.css'

class PomodoroTimer {
  constructor() {
    this.timeLeft = 30 * 60;
    this.originalTime = 30 * 60;
    this.isRunning = false;
    this.interval = null;

    // Elements
    this.timeDisplay = document.getElementById('time-display');
    this.timerState = document.getElementById('timer-state');
    this.startBtn = document.getElementById('start-pause');
    this.resetBtn = document.getElementById('reset');
    this.modeChips = document.querySelectorAll('.mode-chip');

    this.init();
  }

  init() {
    this.updateDisplay();

    this.startBtn.addEventListener('click', () => this.toggleTimer());
    this.resetBtn.addEventListener('click', () => this.resetTimer());

    this.modeChips.forEach(chip => {
      chip.addEventListener('click', (e) => {
        // Update active class
        this.modeChips.forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');

        // Update time
        const min = parseInt(e.target.dataset.time);
        this.setTime(min);
      });
    });
  }

  setTime(minutes) {
    this.pauseTimer();
    this.originalTime = minutes * 60;
    this.timeLeft = this.originalTime;
    this.timerState.textContent = minutes > 15 ? 'Focus' : 'Break';
    this.updateDisplay();
  }

  toggleTimer() {
    if (this.isRunning) {
      this.pauseTimer();
    } else {
      this.startTimer();
    }
  }

  startTimer() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startBtn.textContent = 'Pause';

    this.interval = setInterval(() => {
      this.timeLeft--;
      this.updateDisplay();

      if (this.timeLeft <= 0) {
        this.completeTimer();
      }
    }, 1000);
  }

  pauseTimer() {
    this.isRunning = false;
    this.startBtn.textContent = 'Start';
    clearInterval(this.interval);
  }

  resetTimer() {
    this.pauseTimer();
    this.timeLeft = this.originalTime;
    this.updateDisplay();
  }

  completeTimer() {
    this.pauseTimer();
    // Play alarm sound if available
    alert('Time is up!');
    this.timeLeft = this.originalTime;
    this.updateDisplay();
  }

  updateDisplay() {
    const minutes = Math.floor(this.timeLeft / 60);
    const seconds = this.timeLeft % 60;
    this.timeDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    // Update title
    document.title = `${this.timeDisplay.textContent} - ZenFocus`;
  }
}

class AudioMixer {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.rainNode = null;
    this.rainGain = null;
    this.rainVol = document.getElementById('rain-vol');

    // Resume context on user interaction
    document.addEventListener('click', () => {
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }, { once: true });

    this.init();
  }

  init() {
    this.rainVol.addEventListener('input', (e) => {
      const vol = parseFloat(e.target.value);
      if (vol > 0 && !this.rainNode) {
        this.startRain();
      }
      if (this.rainGain) {
        this.rainGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);
      }
      if (vol === 0 && this.rainNode) {
        this.stopRain();
      }
    });
  }

  startRain() {
    // Create white noise
    const bufferSize = 2 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;
    whiteNoise.loop = true;

    // Filter for pink/brown noise (rain-like)
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;

    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = this.rainVol.value;

    whiteNoise.connect(filter);
    filter.connect(this.rainGain);
    this.rainGain.connect(this.ctx.destination);

    whiteNoise.start();
    this.rainNode = whiteNoise;
  }

  stopRain() {
    if (this.rainNode) {
      this.rainNode.stop();
      this.rainNode.disconnect();
      this.rainNode = null;
    }
  }
}

class ImageStorage {
  constructor(dbName = 'PomodoroBGCheck', storeName = 'images') {
    this.dbName = dbName;
    this.storeName = storeName;
    this.db = null;
    this.initPromise = this.openDB();
  }

  openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = (e) => reject('DB Error: ' + e.target.error);

      request.onupgradeneeded = (e) => {
        this.db = e.target.result;
        if (!this.db.objectStoreNames.contains(this.storeName)) {
          // keyPath is timestamp (id)
          this.db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
    });
  }

  async saveImage(file) {
    if (!this.db) await this.initPromise;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const item = {
          id: Date.now(),
          name: file.name,
          data: reader.result // Base64 string
        };
        const req = store.add(item);

        req.onsuccess = () => resolve(item);
        req.onerror = (e) => reject(e);
      };
      reader.readAsDataURL(file);
    });
  }

  async getAllImages() {
    if (!this.db) await this.initPromise;

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e);
    });
  }

  async deleteImage(id) {
    if (!this.db) await this.initPromise;
    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    store.delete(id);
  }
}

class BackgroundManager {
  constructor() {
    this.storage = new ImageStorage();
    this.layer = document.getElementById('bg-layer');
    this.uploadInput = document.getElementById('bg-upload');
    this.savedGrid = document.getElementById('saved-bg-grid');

    // Modal
    this.modal = document.getElementById('settings-modal');
    this.toggleBtn = document.getElementById('settings-toggle');
    this.closeBtn = document.getElementById('close-settings');

    this.init();
    this.loadSavedImages();
  }

  init() {
    this.toggleBtn.addEventListener('click', () => this.modal.classList.remove('hidden'));
    this.closeBtn.addEventListener('click', () => this.modal.classList.add('hidden'));

    // Preset options
    document.querySelectorAll('.bg-option[data-bg]').forEach(opt => {
      opt.addEventListener('click', () => {
        this.setPreset(opt.dataset.bg);
        this.setActive(opt);
      });
    });

    // Upload
    this.uploadInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        try {
          const savedItem = await this.storage.saveImage(file);
          this.addSavedOption(savedItem);
          this.setBackgroundImage(savedItem.data);
          this.modal.classList.add('hidden');
        } catch (err) {
          console.error('Failed to save image', err);
          alert('Could not save image to storage.');
        }
      }
    });
  }

  async loadSavedImages() {
    try {
      const images = await this.storage.getAllImages();
      images.forEach(img => this.addSavedOption(img));
    } catch (err) {
      console.error("Error loading images", err);
    }
  }

  addSavedOption(item) {
    // Create DOM element for saved image
    const btn = document.createElement('button');
    btn.className = 'bg-option';
    btn.style.backgroundImage = `url(${item.data})`;
    btn.title = item.name;

    // Optional: Add delete functionality on right click? Keeping simple for now

    btn.addEventListener('click', () => {
      this.setBackgroundImage(item.data);
      this.setActive(btn);
    });

    // Insert before the upload button
    const uploadLabel = this.savedGrid.querySelector('.upload-btn');
    this.savedGrid.insertBefore(btn, uploadLabel);
  }

  setActive(target) {
    document.querySelectorAll('.bg-option').forEach(o => o.classList.remove('active'));
    target.classList.add('active');
  }

  setPreset(type) {
    if (type === 'pastel') {
      // Updated Blue/Pastel mix requested by user
      this.layer.style.backgroundImage = 'linear-gradient(135deg, #052f57 0%, #4f6daa 50%, #B3E5FC 100%)';
    } else if (type === 'gradient') {
      // Darker Pink/Red Gradient (3 tones)
      this.layer.style.backgroundImage = 'linear-gradient(135deg, #a80077 0%, #db7093 50%, #ffc0cb 100%)';
    }
  }

  setBackgroundImage(dataUrl) {
    this.layer.style.backgroundImage = `url(${dataUrl})`;
  }
}

class MotivationManager {
  constructor() {
    this.display = document.getElementById('motivation-display');
    this.messages = [
      "Focus on the step in front of you, not the whole staircase.",
      "believe in yourself!",
      "Small steps every day.",
      "You are doing great!",
      "Keep pushing forward.",
      "Dream big, work hard.",
      "Stay positive, work hard, make it happen.",
      "Your potential is endless.",
      "Be proud of how far you've come.",
    ];
    this.currentIndex = 0;
    this.init();
  }

  init() {
    // Change message every 10 seconds
    setInterval(() => this.nextMessage(), 10000);
  }

  nextMessage() {
    // Fade out
    this.display.classList.add('fade-out');

    setTimeout(() => {
      this.currentIndex = (this.currentIndex + 1) % this.messages.length;
      this.display.textContent = `"${this.messages[this.currentIndex]}"`;
      // Fade in
      this.display.classList.remove('fade-out');
    }, 500); // Wait for fade out
  }
}

class TodoManager {
  constructor() {
    this.tasks = JSON.parse(localStorage.getItem('pomodoro-tasks')) || [];
    this.listEl = document.getElementById('todo-list');
    this.inputEl = document.getElementById('todo-input');
    this.addBtn = document.getElementById('add-todo-btn');

    this.init();
  }

  init() {
    this.render();

    this.addBtn.addEventListener('click', () => this.addTask());
    this.inputEl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.addTask();
    });
  }

  addTask() {
    const text = this.inputEl.value.trim();
    if (!text) return;

    const task = {
      id: Date.now(),
      text,
      completed: false
    };

    this.tasks.unshift(task); // Add to top
    this.save();
    this.render();
    this.inputEl.value = '';
    this.inputEl.focus();
  }

  toggleTask(id) {
    const task = this.tasks.find(t => t.id === id);
    if (task) {
      task.completed = !task.completed;
      this.save();
      this.render();
    }
  }

  deleteTask(id) {
    this.tasks = this.tasks.filter(t => t.id !== id);
    this.save();
    this.render();
  }

  save() {
    localStorage.setItem('pomodoro-tasks', JSON.stringify(this.tasks));
  }

  render() {
    this.listEl.innerHTML = '';

    this.tasks.forEach(task => {
      const li = document.createElement('li');
      li.className = `todo-item ${task.completed ? 'completed' : ''}`;

      // Checkbox
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'todo-checkbox';
      checkbox.checked = task.completed;
      checkbox.addEventListener('change', () => this.toggleTask(task.id));

      // Text
      const span = document.createElement('span');
      span.className = 'todo-text';
      span.textContent = task.text;
      span.addEventListener('click', () => this.toggleTask(task.id));

      // Delete Button
      const delBtn = document.createElement('button');
      delBtn.className = 'delete-task-btn';
      delBtn.innerHTML = '<i class="ph ph-trash"></i>';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteTask(task.id);
      });

      li.append(checkbox, span, delBtn);
      this.listEl.appendChild(li);
    });
  }
}

// Initialize
const timer = new PomodoroTimer();
const mixer = new AudioMixer();
const bgManager = new BackgroundManager();
const motivation = new MotivationManager();
const todoManager = new TodoManager();
