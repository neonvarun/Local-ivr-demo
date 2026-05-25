export type SupportedLanguageCode = 'en' | 'hi'

export type BrowserSpeechSupport = {
  speechRecognition: boolean
  speechSynthesis: boolean
}

export type SpeechRecognitionSession = {
  result: Promise<string>
  stop: () => void
}

type BrowserRecognitionConstructor = new () => BrowserRecognition

type BrowserRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type BrowserSpeechRecognitionEvent = {
  resultIndex: number
  results: BrowserSpeechRecognitionResultList
}

type BrowserSpeechRecognitionResultList = {
  length: number
  [index: number]: BrowserSpeechRecognitionResult
}

type BrowserSpeechRecognitionResult = {
  isFinal: boolean
  length: number
  [index: number]: BrowserSpeechRecognitionAlternative
}

type BrowserSpeechRecognitionAlternative = {
  transcript: string
}

type BrowserSpeechRecognitionErrorEvent = {
  error: string
}

declare global {
  interface Window {
    SpeechRecognition?: BrowserRecognitionConstructor
    webkitSpeechRecognition?: BrowserRecognitionConstructor
  }
}

function getRecognitionConstructor(): BrowserRecognitionConstructor | null {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

function getRecognitionLocale(language: SupportedLanguageCode): string {
  return language === 'hi' ? 'hi-IN' : 'en-IN'
}

function mapRecognitionError(errorCode: string): string {
  switch (errorCode) {
    case 'audio-capture':
      return 'Microphone capture failed. Check your input device and try again.'
    case 'not-allowed':
      return 'Microphone permission was denied. Allow access or use the text fallback.'
    case 'no-speech':
      return 'No clear speech was detected. Try speaking again or use the text fallback.'
    case 'network':
      return 'Speech recognition needs browser support that is unavailable right now.'
    default:
      return 'Speech recognition could not complete. Try again or use the text fallback.'
  }
}

export function getBrowserSpeechSupport(): BrowserSpeechSupport {
  return {
    speechRecognition: Boolean(getRecognitionConstructor()),
    speechSynthesis: 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
  }
}

export function createSpeechRecognitionSession(options: {
  language: SupportedLanguageCode
  onInterim?: (partialTranscript: string) => void
}): SpeechRecognitionSession {
  const RecognitionConstructor = getRecognitionConstructor()
  if (!RecognitionConstructor) {
    return {
      result: Promise.reject(
        new Error('Browser speech recognition is unavailable. Use the text fallback instead.'),
      ),
      stop: () => undefined,
    }
  }

  const recognition = new RecognitionConstructor()
  recognition.lang = getRecognitionLocale(options.language)
  recognition.continuous = false
  recognition.interimResults = true
  recognition.maxAlternatives = 1

  let settled = false
  let latestInterim = ''
  let finalTranscript = ''

  const result = new Promise<string>((resolve, reject) => {
    const resolveOnce = (value: string) => {
      if (settled) {
        return
      }
      settled = true
      resolve(value)
    }

    const rejectOnce = (message: string) => {
      if (settled) {
        return
      }
      settled = true
      reject(new Error(message))
    }

    recognition.onresult = (event) => {
      let partialTranscript = ''

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript?.trim() ?? ''
        if (!transcript) {
          continue
        }

        if (event.results[index].isFinal) {
          finalTranscript = `${finalTranscript} ${transcript}`.trim()
        } else {
          partialTranscript = `${partialTranscript} ${transcript}`.trim()
        }
      }

      latestInterim = partialTranscript
      options.onInterim?.(`${finalTranscript} ${latestInterim}`.trim())
    }

    recognition.onerror = (event) => {
      rejectOnce(mapRecognitionError(event.error))
    }

    recognition.onend = () => {
      const transcript = finalTranscript.trim() || latestInterim.trim()
      if (transcript) {
        resolveOnce(transcript)
        return
      }

      rejectOnce('No speech was captured. Try again or use the text fallback.')
    }
  })

  recognition.start()

  return {
    result,
    stop: () => {
      recognition.stop()
    },
  }
}

async function waitForVoices(): Promise<SpeechSynthesisVoice[]> {
  const existingVoices = window.speechSynthesis.getVoices()
  if (existingVoices.length > 0) {
    return existingVoices
  }

  return new Promise((resolve) => {
    const voiceHandler = () => {
      const loadedVoices = window.speechSynthesis.getVoices()
      if (loadedVoices.length > 0) {
        window.speechSynthesis.removeEventListener('voiceschanged', voiceHandler)
        resolve(loadedVoices)
      }
    }

    window.speechSynthesis.addEventListener('voiceschanged', voiceHandler)
    window.setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', voiceHandler)
      resolve(window.speechSynthesis.getVoices())
    }, 1000)
  })
}

function chooseVoice(voices: SpeechSynthesisVoice[], language: SupportedLanguageCode) {
  const expectedPrefix = language === 'hi' ? 'hi' : 'en'
  return (
    voices.find((voice) => voice.lang.toLowerCase().startsWith(expectedPrefix)) ??
    voices.find((voice) => voice.default) ??
    voices[0]
  )
}

export async function speakText(text: string, language: SupportedLanguageCode) {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    throw new Error('Speech synthesis is unavailable in this browser.')
  }

  const trimmedText = text.trim()
  if (!trimmedText) {
    throw new Error('Nothing was available for speech playback.')
  }

  const voices = await waitForVoices()
  const selectedVoice = chooseVoice(voices, language)

  return new Promise<{ voiceName: string }>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(trimmedText)
    utterance.lang = getRecognitionLocale(language)
    utterance.rate = 0.96
    utterance.pitch = 1
    utterance.voice = selectedVoice ?? null

    utterance.onend = () => {
      resolve({
        voiceName:
          language === 'hi' ? 'Local browser Hindi voice engine' : 'Local browser English voice engine',
      })
    }

    utterance.onerror = () => {
      reject(new Error('Speech playback failed in the browser voice engine.'))
    }

    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  })
}
