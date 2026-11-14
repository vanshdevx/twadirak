import { inject } from '@vercel/analytics';

// Initialize Vercel Web Analytics
inject();

const MORSE_CODE = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.",
  G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..",
  M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.",
  S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-",
  Y: "-.--", Z: "--..",
  0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-",
  5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----."
};

const UNIT_MS = 150;
const messageInput = document.querySelector("#message");
const charCount = document.querySelector("#char-count");
const inputError = document.querySelector("#input-error");
const morseOutput = document.querySelector("#morse-output");
const letterBreakdown = document.querySelector("#letter-breakdown");
const copyButton = document.querySelector("#copy-button");
const soundButton = document.querySelector("#sound-button");
const lightButton = document.querySelector("#light-button");
const stopButton = document.querySelector("#stop-button");
const playbackStatus = document.querySelector("#playback-status");

let runToken = 0;
let audioContext = null;
let activeOscillator = null;
let cameraStream = null;
let isPlaying = false;
let currentMorse = "";

function normalizedMessage(value) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function setPlaying(playing) {
  isPlaying = playing;
  copyButton.disabled = playing || !currentMorse;
  soundButton.disabled = playing || !currentMorse;
  lightButton.disabled = playing || !currentMorse;
  stopButton.hidden = !playing;
}

function renderMessage() {
  const rawMessage = messageInput.value;
  const normalized = normalizedMessage(rawMessage);
  charCount.textContent = `${rawMessage.length} / 160`;
  inputError.hidden = !rawMessage || /^[A-Za-z0-9\s]*$/.test(rawMessage);
  currentMorse = "";
  letterBreakdown.replaceChildren();

  if (inputError.hidden && normalized) {
    const morseWords = normalized.split(" ").map((word) =>
      [...word].map((character) => MORSE_CODE[character]).join(" ")
    );
    currentMorse = morseWords.join(" / ");
    morseOutput.textContent = currentMorse;
    morseOutput.classList.remove("empty");

    [...normalized].forEach((character) => {
      if (character === " ") {
        const separator = document.createElement("span");
        separator.className = "word-space";
        separator.textContent = "/";
        separator.setAttribute("aria-label", "word break");
        letterBreakdown.append(separator);
        return;
      }

      const card = document.createElement("span");
      card.className = "character-card";
      const letter = document.createElement("span");
      letter.className = "character";
      letter.textContent = character;
      const code = document.createElement("span");
      code.className = "character-code";
      code.textContent = MORSE_CODE[character];
      card.append(letter, code);
      letterBreakdown.append(card);
    });
  } else {
    morseOutput.textContent = inputError.hidden
      ? "Your Morse code will appear here"
      : "Please remove unsupported characters to see the translation.";
    morseOutput.classList.toggle("empty", inputError.hidden);
  }

  copyButton.disabled = !currentMorse || isPlaying;
  soundButton.disabled = !currentMorse || isPlaying;
  lightButton.disabled = !currentMorse || isPlaying;
  if (!isPlaying) {
    playbackStatus.textContent = currentMorse
      ? "Ready when you are."
      : "Enter a message to get started.";
  }
}

function wait(milliseconds, token) {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(token === runToken), milliseconds);
  });
}

function releaseCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
}

function stopSignal(message = "Signal stopped.") {
  runToken += 1;
  if (activeOscillator) {
    try {
      activeOscillator.stop();
    } catch {
      // The oscillator may already have stopped naturally.
    }
    activeOscillator = null;
  }
  if (audioContext) {
    const context = audioContext;
    audioContext = null;
    context.close().catch((error) => {
      playbackStatus.textContent = `Audio could not be closed: ${error.message}`;
    });
  }
  releaseCamera();
  setPlaying(false);
  if (message) playbackStatus.textContent = message;
}

function messageSymbols() {
  return normalizedMessage(messageInput.value).split(" ");
}

async function playSound() {
  stopSignal("");
  const token = runToken;
  setPlaying(true);
  playbackStatus.textContent = "Playing Morse code through your speaker…";

  try {
    audioContext = new window.AudioContext();
    await audioContext.resume();
    const context = audioContext;
    const words = messageSymbols();

    for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
      const word = words[wordIndex];
      for (let letterIndex = 0; letterIndex < word.length; letterIndex += 1) {
        const symbols = MORSE_CODE[word[letterIndex]];
        for (const symbol of symbols) {
          if (token !== runToken) return;
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          activeOscillator = oscillator;
          oscillator.frequency.value = 650;
          const duration = symbol === "." ? UNIT_MS : UNIT_MS * 3;
          gain.gain.setValueAtTime(0, context.currentTime);
          gain.gain.linearRampToValueAtTime(0.17, context.currentTime + 0.008);
          gain.gain.setValueAtTime(0.17, context.currentTime + duration / 1000 - 0.008);
          gain.gain.linearRampToValueAtTime(0, context.currentTime + duration / 1000);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start();
          oscillator.stop(context.currentTime + duration / 1000);
          const completed = await wait(duration, token);
          activeOscillator = null;
          if (!completed) return;
          const gapCompleted = await wait(UNIT_MS, token);
          if (!gapCompleted) return;
        }

        if (letterIndex < word.length - 1) {
          const completed = await wait(UNIT_MS * 2, token);
          if (!completed) return;
        }
      }

      if (wordIndex < words.length - 1) {
        const completed = await wait(UNIT_MS * 6, token);
        if (!completed) return;
      }
    }

    if (token === runToken) stopSignal("Sound signal complete.");
  } catch (error) {
    if (token === runToken) {
      stopSignal(`Sound playback failed: ${error.message}`);
    }
  }
}

async function setTorch(track, enabled) {
  await track.applyConstraints({ advanced: [{ torch: enabled }] });
}

async function playFlashlight() {
  stopSignal("");
  const token = runToken;
  setPlaying(true);
  playbackStatus.textContent = "Requesting camera access for the flashlight…";

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support camera access. Try a current mobile browser over HTTPS.");
    }

    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } }
    });
    if (token !== runToken) {
      releaseCamera();
      return;
    }

    const track = cameraStream.getVideoTracks()[0];
    const capabilities = track.getCapabilities?.();
    if (!capabilities?.torch || typeof track.applyConstraints !== "function") {
      throw new Error("This device or browser does not expose a controllable flashlight. Try another mobile browser.");
    }

    playbackStatus.textContent = "Flashing your Morse signal…";
    const words = messageSymbols();
    for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
      const word = words[wordIndex];
      for (let letterIndex = 0; letterIndex < word.length; letterIndex += 1) {
        const symbols = MORSE_CODE[word[letterIndex]];
        for (const symbol of symbols) {
          if (token !== runToken) return;
          await setTorch(track, true);
          const lit = await wait(symbol === "." ? UNIT_MS : UNIT_MS * 3, token);
          await setTorch(track, false);
          if (!lit) return;
          const dark = await wait(UNIT_MS, token);
          if (!dark) return;
        }

        if (letterIndex < word.length - 1) {
          const completed = await wait(UNIT_MS * 2, token);
          if (!completed) return;
        }
      }

      if (wordIndex < words.length - 1) {
        const completed = await wait(UNIT_MS * 6, token);
        if (!completed) return;
      }
    }

    if (token === runToken) stopSignal("Flashlight signal complete.");
  } catch (error) {
    if (token === runToken) {
      const detail = error.name === "NotAllowedError"
        ? "Camera permission was denied. Allow camera access and try again."
        : error.name === "NotFoundError"
          ? "No camera was found on this device."
          : error.message;
      stopSignal(`Flashlight unavailable: ${detail}`);
    }
  }
}

messageInput.addEventListener("input", renderMessage);
soundButton.addEventListener("click", playSound);
lightButton.addEventListener("click", playFlashlight);
stopButton.addEventListener("click", () => stopSignal());

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(currentMorse);
    playbackStatus.textContent = "Morse code copied to clipboard.";
  } catch (error) {
    playbackStatus.textContent = `Could not copy Morse code: ${error.message}`;
  }
});

renderMessage();
