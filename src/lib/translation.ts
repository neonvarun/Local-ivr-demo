import type { SupportedLanguageCode } from './browserSpeech'

type TranslationResult = {
  text: string
  provider: string
}

const PHRASEBOOK: Record<string, string> = {
  'hello': 'नमस्ते',
  'how are you?': 'आप कैसे हैं?',
  'how are you': 'आप कैसे हैं?',
  'thank you': 'धन्यवाद',
  'i need help': 'मुझे मदद चाहिए',
  'please wait': 'कृपया प्रतीक्षा करें',
  'where is the office?': 'कार्यालय कहाँ है?',
  'the meeting starts now': 'बैठक अब शुरू होती है',
  'नमस्ते': 'Hello',
  'आप कैसे हैं?': 'How are you?',
  'आप कैसे हैं': 'How are you?',
  'धन्यवाद': 'Thank you',
  'मुझे मदद चाहिए': 'I need help',
  'कृपया प्रतीक्षा करें': 'Please wait',
  'कार्यालय कहाँ है?': 'Where is the office?',
  'बैठक अब शुरू होती है': 'The meeting starts now',
}

function normalise(text: string) {
  return text.trim().toLowerCase()
}

function decodeHtmlEntities(text: string) {
  const parser = new DOMParser()
  return parser.parseFromString(text, 'text/html').documentElement.textContent ?? text
}

export async function translateText(
  sourceText: string,
  sourceLanguage: SupportedLanguageCode,
  targetLanguage: SupportedLanguageCode,
): Promise<TranslationResult> {
  const trimmedText = sourceText.trim()
  if (!trimmedText) {
    throw new Error('The translation request was empty.')
  }

  if (sourceLanguage === targetLanguage) {
    return {
      text: trimmedText,
      provider: 'No-op local route',
    }
  }

  const phrasebookMatch = PHRASEBOOK[normalise(trimmedText)]

  try {
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmedText)}&langpair=${sourceLanguage}|${targetLanguage}`,
    )

    if (!response.ok) {
      throw new Error(`Translation service returned ${response.status}.`)
    }

    const payload = (await response.json()) as {
      responseData?: { translatedText?: string }
    }

    const translatedText = payload.responseData?.translatedText?.trim()
    if (!translatedText) {
      throw new Error('Translation service returned an empty response.')
    }

    return {
      text: decodeHtmlEntities(translatedText),
      provider: 'MyMemory public demo endpoint',
    }
  } catch (error) {
    if (phrasebookMatch) {
      return {
        text: phrasebookMatch,
        provider: 'Local phrasebook fallback',
      }
    }

    const message = error instanceof Error ? error.message : 'Unknown translation error.'
    throw new Error(`Translation could not complete. ${message}`, {
      cause: error,
    })
  }
}
