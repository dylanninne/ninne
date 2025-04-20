  const OPENROUTER_API_KEY = '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';
  const ELEVEN_API_KEY = 'sk_d10fd2ed57aa2c8a69c14417e62c15e33153753768e13dbd';
  const VOICE_ID = 'UQ15q3Vf9AQQ2owcMKQ0';

  const speakBtn = document.getElementById('speakBtn');
  const equalizer = document.getElementById('equalizer');
  const responseBox = document.getElementById('response');
  const ctx = equalizer.getContext('2d');
  const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();

  const statusCircle = document.getElementById('statusCircle');
  const modeStatus = document.getElementById('modeStatus');

  const soundIdle = document.getElementById('soundIdle');
  const soundListening = document.getElementById('soundListening');
  const soundSpeaking = document.getElementById('soundSpeaking');

  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  function setMode(mode) {
    statusCircle.className = '';
    statusCircle.classList.add(`status-${mode}`);
    modeStatus.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
    if (mode === 'idle') soundIdle.play();
    if (mode === 'listening') soundListening.play();
    if (mode === 'speaking') soundSpeaking.play();
  }

  function appendSir(text) {
    return text.trim().endsWith('sir') || text.trim().endsWith('sir.') ? text : text + ', sir.';
  }

  async function speak(text) {
    setMode('speaking');
    text = appendSir(text);
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVEN_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.8
          }
        })
      });

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      const audioContext = new AudioContext();
      const source = audioContext.createMediaElementSource(audio);
      const analyser = audioContext.createAnalyser();

      source.connect(analyser);
      analyser.connect(audioContext.destination);
      analyser.fftSize = 64;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      function draw() {
        ctx.clearRect(0, 0, equalizer.width, equalizer.height);
        analyser.getByteFrequencyData(dataArray);

        const centerX = equalizer.width / 2;
        const centerY = equalizer.height / 2;
        const radius = 70;
        const angleStep = (Math.PI * 2) / bufferLength;

        for (let i = 0; i < bufferLength; i++) {
          let angle = i * angleStep;
          let value = dataArray[i] / 255;
          let barLength = 25 + value * 45;
          let innerX = centerX + Math.cos(angle) * radius;
          let innerY = centerY + Math.sin(angle) * radius;
          let outerX = centerX + Math.cos(angle) * (radius + barLength);
          let outerY = centerY + Math.sin(angle) * (radius + barLength);

          ctx.beginPath();
          ctx.moveTo(innerX, innerY);
          ctx.lineTo(outerX, outerY);
          ctx.strokeStyle = `rgba(0, 255, 255, ${0.3 + value})`;
          ctx.lineWidth = 2;
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#00ffff';
          ctx.stroke();
        }
        requestAnimationFrame(draw);
      }

      draw();
      audio.play();
      audio.onended = () => {
        setMode('idle');
        ctx.clearRect(0, 0, equalizer.width, equalizer.height);
      };
    } catch (err) {
      console.error('Error using ElevenLabs:', err);
      setMode('idle');
    }
  }

  async function fixCommandWithAI(text) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "meta-llama/llama-4-scout:free",
          messages: [
            {
              role: "system",
              content: "You are JARVIS, a smart assistant. Fix any typos or misheard parts in voice commands so they make sense. Respond with the corrected command only, without quotes."
            },
            {
              role: "user",
              content: `User said: "${text}". What is the corrected version?`
            }
          ]
        })
      });

      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || text;
    } catch (err) {
      console.error("Correction error:", err);
      return text;
    }
  }

  async function handleCommand(command) {
    responseBox.textContent = `You said: "${command}"`;
    setMode('speaking');

    if (command.toLowerCase().startsWith("create plugin") || command.toLowerCase().startsWith("make plugin")) {
      return generatePlugin(command);
    }

    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "meta-llama/llama-4-scout:free",
          messages: [
            { role: "system", content: "You are JARVIS, an intelligent assistant created by Tony Stark and perfected by Dylan." },
            { role: "user", content: command }
          ]
        })
      });

      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || "I'm not sure how to answer that.";
      speak(reply);
    } catch (err) {
      console.error(err);
      speak("Sorry, I couldn't process that right now.");
    }
  }

  speakBtn.addEventListener('click', () => {
    setMode('listening');
    recognition.start();
  });

  recognition.onresult = async (event) => {
    const rawCommand = event.results[0][0].transcript;
    const fixedCommand = await fixCommandWithAI(rawCommand);
    responseBox.textContent = `Recognized: "${rawCommand}" → "${fixedCommand}"`;
    handleCommand(fixedCommand);
  };

  recognition.onerror = (event) => {
    speak('There was an error: ' + event.error);
    setMode('idle');
  };

  function savePluginToStorage(name, code) {
    let plugins = JSON.parse(localStorage.getItem('jarvis_plugins') || '{}');
    plugins[name] = code;
    localStorage.setItem('jarvis_plugins', JSON.stringify(plugins));
  }

  function loadPluginsFromStorage() {
    const plugins = JSON.parse(localStorage.getItem('jarvis_plugins') || '{}');
    for (const name in plugins) {
      injectPlugin(plugins[name]);
    }
  }

  function injectPlugin(code) {
    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = code;
    document.body.appendChild(script);
  }

  async function generatePlugin(command) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "meta-llama/llama-4-scout:free",
          messages: [
            { role: "system", content: "You generate modular JavaScript plugins to be injected into a web-based AI assistant. Return only the code without explanation." },
            { role: "user", content: command }
          ]
        })
      });

      const data = await res.json();
      const pluginCode = data.choices?.[0]?.message?.content?.trim();

      if (pluginCode) {
        const pluginName = prompt("Give this plugin a name:");
        injectPlugin(pluginCode);
        savePluginToStorage(pluginName || `plugin-${Date.now()}`, pluginCode);
        speak("Plugin added and saved successfully.");
      } else {
        speak("Failed to generate plugin.");
      }
    } catch (err) {
      console.error("Plugin generation error:", err);
      speak("Error occurred while creating the plugin.");
    }
  }

  window.onload = () => {
    loadPluginsFromStorage();
  };
