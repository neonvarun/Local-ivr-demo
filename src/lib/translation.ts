import type { SupportedLanguageCode } from './browserSpeech'

type TranslationResult = {
  text: string
  provider: string
}

type LocalTranslationAsset = {
  exact: Record<string, string>
  phrases: Array<{ from: string; to: string }>
  tokens: Record<string, string>
}

type PairKey = 'en-hi' | 'hi-en'

const ASSET_BASE = import.meta.env.BASE_URL

const ASSET_PATHS: Record<PairKey, string> = {
  'en-hi': `${ASSET_BASE}models/translation/en-hi.json`,
  'hi-en': `${ASSET_BASE}models/translation/hi-en.json`,
}

const translationCache = new Map<PairKey, LocalTranslationAsset>()

function normalise(text: string) {
  return text.trim().toLowerCase()
}

function getPairKey(
  sourceLanguage: SupportedLanguageCode,
  targetLanguage: SupportedLanguageCode,
): PairKey {
  return `${sourceLanguage}-${targetLanguage}` as PairKey
}

async function loadTranslationAsset(pairKey: PairKey): Promise<LocalTranslationAsset> {
  const cached = translationCache.get(pairKey)
  if (cached) {
    return cached
  }

  const response = await fetch(ASSET_PATHS[pairKey], { cache: 'force-cache' })

  if (!response.ok) {
    throw new Error(`Local translation asset ${pairKey} could not be loaded.`)
  }

  const payload = (await response.json()) as LocalTranslationAsset
  translationCache.set(pairKey, payload)
  return payload
}

function replacePhrases(text: string, asset: LocalTranslationAsset) {
  let next = normalise(text)

  for (const phrase of asset.phrases) {
    if (!next.includes(phrase.from)) {
      continue
    }

    next = next.replaceAll(phrase.from, phrase.to)
  }

  return next
}

function translateTokenStream(text: string, asset: LocalTranslationAsset) {
  return text
    .split(/(\s+|[,.!?;:])/)
    .map((part) => {
      const lowered = normalise(part)
      if (!lowered) {
        return part
      }

      return asset.tokens[lowered] ?? part
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

function postProcess(text: string) {
  return text
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function warmTranslationAssets() {
  await Promise.all([loadTranslationAsset('en-hi'), loadTranslationAsset('hi-en')])
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

  const pairKey = getPairKey(sourceLanguage, targetLanguage)
  const asset = await loadTranslationAsset(pairKey)
  const loweredInput = normalise(trimmedText)

  const exactMatch = asset.exact[loweredInput]
  if (exactMatch) {
    return {
      text: exactMatch,
      provider: 'Bundled local translation asset',
    }
  }

  const phraseExpanded = replacePhrases(trimmedText, asset)
  const translated = postProcess(translateTokenStream(phraseExpanded, asset))

  if (!translated || translated === loweredInput) {
    throw new Error(
      'The bundled local translation asset could not confidently translate this sentence. Try a shorter sentence.',
    )
  }

  return {
    text: translated,
    provider: 'Bundled local translation asset',
  }
}
