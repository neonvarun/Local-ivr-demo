import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  createSpeechRecognitionSession,
  getBrowserSpeechSupport,
  speakText,
  type BrowserSpeechSupport,
  type SpeechRecognitionSession,
  type SupportedLanguageCode,
} from './lib/browserSpeech'
import { translateText, warmTranslationAssets } from './lib/translation'

type CallLegId = 'english' | 'hindi'
type CallPhase =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'translating'
  | 'speaking'
  | 'complete'
  | 'error'
  | 'unsupported'

type InputMode = 'voice' | 'text'

type DeliveryEvent = {
  id: string
  sourceLeg: CallLegId
  targetLeg: CallLegId
  sourceText: string
  translatedText: string
  translationProvider: string
  voiceName: string
  timestamp: string
  status: 'delivered' | 'failed'
  error?: string
}

type CallLegState = {
  id: CallLegId
  speakerLabel: string
  hearsLabel: string
  languageName: string
  inputLang: SupportedLanguageCode
  outputLang: SupportedLanguageCode
  phase: CallPhase
  transcript: string
  translation: string
  heardText: string
  playbackStatus: string
  error: string | null
  textDraft: string
  inputMode: InputMode
  translationProvider: string
}

const LEG_IDS: CallLegId[] = ['english', 'hindi']

const BASE_LEGS: Record<CallLegId, CallLegState> = {
  english: {
    id: 'english',
    speakerLabel: 'Caller A speaks English',
    hearsLabel: 'English caller hears',
    languageName: 'English',
    inputLang: 'en',
    outputLang: 'en',
    phase: 'idle',
    transcript: '',
    translation: '',
    heardText: '',
    playbackStatus: 'Waiting for the Hindi caller',
    error: null,
    textDraft: '',
    inputMode: 'voice',
    translationProvider: 'No translation requested yet',
  },
  hindi: {
    id: 'hindi',
    speakerLabel: 'Caller B speaks Hindi',
    hearsLabel: 'Hindi caller hears',
    languageName: 'Hindi',
    inputLang: 'hi',
    outputLang: 'hi',
    phase: 'idle',
    transcript: '',
    translation: '',
    heardText: '',
    playbackStatus: 'Waiting for the English caller',
    error: null,
    textDraft: '',
    inputMode: 'voice',
    translationProvider: 'No translation requested yet',
  },
}

const INITIAL_BROWSER_SUPPORT =
  typeof window === 'undefined'
    ? { speechRecognition: false, speechSynthesis: false }
    : getBrowserSpeechSupport()

const INITIAL_LEGS: Record<CallLegId, CallLegState> = {
  english: {
    ...BASE_LEGS.english,
    phase: INITIAL_BROWSER_SUPPORT.speechRecognition ? 'idle' : 'unsupported',
    inputMode: INITIAL_BROWSER_SUPPORT.speechRecognition ? 'voice' : 'text',
  },
  hindi: {
    ...BASE_LEGS.hindi,
    phase: INITIAL_BROWSER_SUPPORT.speechRecognition ? 'idle' : 'unsupported',
    inputMode: INITIAL_BROWSER_SUPPORT.speechRecognition ? 'voice' : 'text',
  },
}

function getTargetLeg(sourceLeg: CallLegId): CallLegId {
  return sourceLeg === 'english' ? 'hindi' : 'english'
}

function getPhaseLabel(phase: CallPhase): string {
  switch (phase) {
    case 'idle':
      return 'Ready'
    case 'listening':
      return 'Listening'
    case 'transcribing':
      return 'Transcribing'
    case 'translating':
      return 'Translating'
    case 'speaking':
      return 'Speaking'
    case 'complete':
      return 'Complete'
    case 'error':
      return 'Needs attention'
    case 'unsupported':
      return 'Text fallback'
    default:
      return 'Ready'
  }
}

function getPhaseTone(phase: CallPhase): 'neutral' | 'active' | 'success' | 'warning' | 'danger' {
  switch (phase) {
    case 'listening':
    case 'transcribing':
    case 'translating':
    case 'speaking':
      return 'active'
    case 'complete':
      return 'success'
    case 'unsupported':
      return 'warning'
    case 'error':
      return 'danger'
    default:
      return 'neutral'
  }
}

function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function App() {
  const [legs, setLegs] = useState<Record<CallLegId, CallLegState>>(INITIAL_LEGS)
  const [browserSupport] = useState<BrowserSpeechSupport>(INITIAL_BROWSER_SUPPORT)
  const [translationStatus, setTranslationStatus] = useState<
    'loading' | 'ready' | 'error'
  >('loading')
  const [isDebugOpen, setIsDebugOpen] = useState(false)
  const [activeLegId, setActiveLegId] = useState<CallLegId | null>(null)
  const [events, setEvents] = useState<DeliveryEvent[]>([])
  const activeRecognitionRef = useRef<SpeechRecognitionSession | null>(null)

  useEffect(() => {
    void warmTranslationAssets()
      .then(() => {
        setTranslationStatus('ready')
      })
      .catch(() => {
        setTranslationStatus('error')
      })

    return () => {
      activeRecognitionRef.current?.stop()
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  const statusCards = useMemo(
    () => [
      {
        label: 'Speech recognition',
        value: browserSupport.speechRecognition
          ? 'Local voice capture ready'
          : 'Text fallback enabled',
      },
      {
        label: 'Speech playback',
        value: browserSupport.speechSynthesis
          ? 'Local voice playback ready'
          : 'Visual-only playback fallback',
      },
      {
        label: 'Translation path',
        value:
          translationStatus === 'loading'
            ? 'Loading bundled local translation assets'
            : translationStatus === 'ready'
              ? 'Bundled local translation assets ready'
              : 'Local translation assets unavailable',
      },
    ],
    [browserSupport, translationStatus],
  )

  function updateLeg(legId: CallLegId, updater: (current: CallLegState) => CallLegState) {
    setLegs((current) => ({
      ...current,
      [legId]: updater(current[legId]),
    }))
  }

  function resetError(legId: CallLegId) {
    updateLeg(legId, (current) => ({ ...current, error: null }))
  }

  function stopListening() {
    activeRecognitionRef.current?.stop()
  }

  async function runTranslationFlow(sourceLegId: CallLegId, sourceText: string) {
    const targetLegId = getTargetLeg(sourceLegId)
    const sourceLeg = legs[sourceLegId]
    const targetLeg = legs[targetLegId]

    updateLeg(sourceLegId, (current) => ({
      ...current,
      transcript: sourceText,
      phase: 'translating',
      error: null,
    }))
    updateLeg(targetLegId, (current) => ({
      ...current,
      phase: 'translating',
      playbackStatus: `Preparing ${current.languageName} playback`,
      error: null,
    }))

    try {
      const translation = await translateText(sourceText, sourceLeg.inputLang, targetLeg.outputLang)

      updateLeg(sourceLegId, (current) => ({
        ...current,
        translation: translation.text,
        translationProvider: translation.provider,
      }))

      updateLeg(targetLegId, (current) => ({
        ...current,
        heardText: translation.text,
        phase: browserSupport.speechSynthesis ? 'speaking' : 'complete',
        playbackStatus: browserSupport.speechSynthesis
          ? `Speaking to ${current.languageName} caller`
          : `Showing translated ${current.languageName} output`,
        translationProvider: translation.provider,
      }))

      let voiceName = 'Visual output only'

      if (browserSupport.speechSynthesis) {
        const speech = await speakText(translation.text, targetLeg.outputLang)
        voiceName = speech.voiceName
      }

      const deliveredAt = formatTimestamp(new Date())

      updateLeg(sourceLegId, (current) => ({
        ...current,
        phase: 'complete',
        playbackStatus: `Delivered to ${targetLeg.languageName} caller at ${deliveredAt}`,
      }))
      updateLeg(targetLegId, (current) => ({
        ...current,
        phase: 'complete',
        playbackStatus: `Last heard at ${deliveredAt}`,
      }))

      startTransition(() => {
        setEvents((current) => [
          {
            id: crypto.randomUUID(),
            sourceLeg: sourceLegId,
            targetLeg: targetLegId,
            sourceText,
            translatedText: translation.text,
            translationProvider: translation.provider,
            voiceName,
            timestamp: deliveredAt,
            status: 'delivered',
          },
          ...current,
        ])
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Translation failed unexpectedly.'

      updateLeg(sourceLegId, (current) => ({
        ...current,
        phase: 'error',
        error: message,
        playbackStatus: 'Unable to route translated audio',
      }))
      updateLeg(targetLegId, (current) => ({
        ...current,
        phase: 'error',
        error: message,
        playbackStatus: 'Waiting for a new attempt',
      }))

      startTransition(() => {
        setEvents((current) => [
          {
            id: crypto.randomUUID(),
            sourceLeg: sourceLegId,
            targetLeg: targetLegId,
            sourceText,
            translatedText: '',
            translationProvider: 'Translation failed',
            voiceName: 'Unavailable',
            timestamp: formatTimestamp(new Date()),
            status: 'failed',
            error: message,
          },
          ...current,
        ])
      })
    }
  }

  async function handleVoiceInput(legId: CallLegId) {
    resetError(legId)

    if (!browserSupport.speechRecognition) {
      updateLeg(legId, (current) => ({
        ...current,
        phase: 'unsupported',
        inputMode: 'text',
      }))
      return
    }

    if (activeLegId === legId) {
      stopListening()
      return
    }

    if (activeLegId) {
      stopListening()
    }

    updateLeg(legId, (current) => ({
      ...current,
      transcript: '',
      translation: '',
      phase: 'listening',
      playbackStatus: 'Listening for stable speech...',
      error: null,
    }))

    const session = createSpeechRecognitionSession({
      language: legs[legId].inputLang,
      onInterim: (partialTranscript) => {
        updateLeg(legId, (current) => ({
          ...current,
          transcript: partialTranscript,
          phase: partialTranscript ? 'transcribing' : 'listening',
        }))
      },
    })

    activeRecognitionRef.current = session
    setActiveLegId(legId)

    try {
      const transcript = await session.result
      await runTranslationFlow(legId, transcript)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Speech capture could not complete successfully.'
      updateLeg(legId, (current) => ({
        ...current,
        phase: 'error',
        error: message,
        playbackStatus: 'Use text fallback or try again',
      }))
    } finally {
      activeRecognitionRef.current = null
      setActiveLegId(null)
    }
  }

  async function handleTextSubmit(legId: CallLegId) {
    const draft = legs[legId].textDraft.trim()
    if (!draft) {
      updateLeg(legId, (current) => ({
        ...current,
        phase: 'error',
        error: 'Enter a message before sending the text fallback.',
      }))
      return
    }

    resetError(legId)
    updateLeg(legId, (current) => ({
      ...current,
      transcript: draft,
      translation: '',
      textDraft: '',
      phase: 'transcribing',
      playbackStatus: 'Text fallback captured locally',
    }))

    await runTranslationFlow(legId, draft)
  }

  function handleDraftChange(legId: CallLegId, value: string) {
    updateLeg(legId, (current) => ({ ...current, textDraft: value }))
  }

  function toggleInputMode(legId: CallLegId) {
    updateLeg(legId, (current) => ({
      ...current,
      inputMode: current.inputMode === 'voice' && browserSupport.speechRecognition ? 'text' : 'voice',
      phase:
        current.inputMode === 'voice' && browserSupport.speechRecognition ? 'unsupported' : 'idle',
      error: null,
    }))
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">SuperAI Polaris interview demo</p>
          <h1>English-Hindi IVR translation demo</h1>
          <p className="hero-text">
            A browser-based demonstration of a double-sided Interactive Voice Response workflow for
            English and Hindi speakers. Translation runs through bundled local assets, while speech
            capture and playback remain client-side.
          </p>
        </div>
        <div className="hero-actions">
          <button type="button" className="debug-toggle" onClick={() => setIsDebugOpen((open) => !open)}>
            {isDebugOpen ? 'Hide details' : 'Show details'}
          </button>
          <div className="stack-note">
            <span className="stack-note-label">Runtime</span>
            Translation uses bundled local assets. Speech capture and playback use browser-local
            engines.
          </div>
        </div>
      </header>

      <section className="status-strip" aria-label="Runtime status">
        {statusCards.map((card) => (
          <article key={card.label} className="status-card">
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </section>

      <main className="workspace">
        <section className="call-grid" aria-label="Double-sided IVR simulation">
          {LEG_IDS.map((legId) => {
            const leg = legs[legId]
            const tone = getPhaseTone(leg.phase)
            const isListening = activeLegId === legId
            const partnerLeg = legs[getTargetLeg(legId)]
            const isVoiceAvailable = browserSupport.speechRecognition

            return (
              <article key={leg.id} className={`call-leg ${leg.id}`}>
                <div className="leg-header">
                  <div>
                    <p className="leg-kicker">{leg.languageName} call leg</p>
                    <h2>{leg.speakerLabel}</h2>
                  </div>
                  <span className={`phase-pill ${tone}`}>{getPhaseLabel(leg.phase)}</span>
                </div>

                <div className="signal-row">
                  <div className={`wave ${isListening ? 'active' : ''}`}>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <p>{leg.playbackStatus}</p>
                </div>

                <div className="speech-panels">
                  <section className="speech-card spoken">
                    <span className="speech-label">Spoken into the system</span>
                    <p>{leg.transcript || 'Start speaking or use text fallback to create a live turn.'}</p>
                  </section>
                  <section className="speech-card heard">
                    <span className="speech-label">{leg.hearsLabel}</span>
                    <p>{leg.heardText || 'Translated native-language playback will appear here.'}</p>
                  </section>
                </div>

                <div className="controls">
                  <button
                    type="button"
                    className={`ptt-button ${isListening ? 'active' : ''}`}
                    onClick={() => void handleVoiceInput(legId)}
                    disabled={!isVoiceAvailable && leg.inputMode !== 'voice'}
                  >
                    {isListening ? 'Stop capture' : `Push to talk in ${leg.languageName}`}
                  </button>
                  <button type="button" className="mode-button" onClick={() => toggleInputMode(legId)}>
                    {leg.inputMode === 'voice' ? 'Use text fallback' : 'Return to voice mode'}
                  </button>
                </div>

                {(!isVoiceAvailable || leg.inputMode === 'text') && (
                  <form
                    className="fallback-form"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void handleTextSubmit(legId)
                    }}
                  >
                    <label htmlFor={`${leg.id}-draft`} className="speech-label">
                      Text fallback for {leg.languageName}
                    </label>
                    <textarea
                      id={`${leg.id}-draft`}
                      value={leg.textDraft}
                      onChange={(event) => handleDraftChange(legId, event.target.value)}
                      rows={4}
                      placeholder={`Type what the ${leg.languageName.toLowerCase()} caller wants to say.`}
                    />
                    <button type="submit" className="send-button">
                      Route to {partnerLeg.languageName} caller
                    </button>
                  </form>
                )}

                {leg.translation && (
                  <div className="translation-footer">
                    <span>Latest routed translation</span>
                    <strong>{leg.translation}</strong>
                  </div>
                )}

                {leg.error && <p className="error-banner">{leg.error}</p>}
              </article>
            )
          })}
        </section>

        <aside className={`reviewer-panel ${isDebugOpen ? 'open' : ''}`}>
          <div className="reviewer-header">
            <div>
              <p className="leg-kicker">Reviewer view</p>
              <h3>Delivery details</h3>
            </div>
            <button type="button" className="debug-toggle ghost" onClick={() => setIsDebugOpen(false)}>
              Collapse
            </button>
          </div>

          <section className="reviewer-section">
            <h4>Call leg states</h4>
            <div className="debug-grid">
              {LEG_IDS.map((legId) => {
                const leg = legs[legId]
                return (
                  <article key={leg.id} className="debug-card">
                    <div className="debug-card-header">
                      <strong>{leg.languageName}</strong>
                      <span className={`phase-pill ${getPhaseTone(leg.phase)}`}>{getPhaseLabel(leg.phase)}</span>
                    </div>
                    <dl>
                      <div>
                        <dt>Transcript</dt>
                        <dd>{leg.transcript || 'No transcript yet'}</dd>
                      </div>
                      <div>
                        <dt>Translation</dt>
                        <dd>{leg.translation || 'No translation generated yet'}</dd>
                      </div>
                      <div>
                        <dt>Hears</dt>
                        <dd>{leg.heardText || 'No playback delivered yet'}</dd>
                      </div>
                      <div>
                        <dt>Provider</dt>
                        <dd>{leg.translationProvider}</dd>
                      </div>
                    </dl>
                  </article>
                )
              })}
            </div>
          </section>

          <section className="reviewer-section">
            <h4>Recent deliveries</h4>
            <div className="event-list">
              {events.length === 0 ? (
                <p className="empty-state">No turns routed yet. Start with either caller to populate the delivery log.</p>
              ) : (
                events.map((event) => (
                  <article key={event.id} className={`event-card ${event.status}`}>
                    <div className="event-meta">
                      <strong>
                        {event.sourceLeg === 'english' ? 'English' : 'Hindi'} to{' '}
                        {event.targetLeg === 'english' ? 'English' : 'Hindi'}
                      </strong>
                      <span>{event.timestamp}</span>
                    </div>
                    <p className="event-source">{event.sourceText}</p>
                    <p className="event-translation">{event.translatedText || event.error}</p>
                    <div className="event-footer">
                      <span>{event.translationProvider}</span>
                      <span>{event.voiceName}</span>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </aside>
      </main>
    </div>
  )
}

export default App
