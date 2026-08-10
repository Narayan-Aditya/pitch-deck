// Agency-level pitch content: identical on every deck regardless of which
// brand is being pitched (proof of past work, pricing, contact details).
// Kept in localStorage rather than per-report so it's entered once and every
// future report picks it up — a salesperson should never retype these.
const KEY = 'og_agency_settings';

export const DEFAULT_SETTINGS = {
  pricing: {
    lineItems: [
      { label: 'Podcast production + studio', value: '' },
      { label: '20 Instagram Reels (agency rate)', value: '' },
      { label: '10-20 YouTube Shorts', value: '' },
      { label: 'Multi-platform distribution', value: '' },
    ],
    totalValue: '',
    yourInvestment: '',
    riskReversal: '',
  },
  nextStep: {
    headline: 'A 20-minute call to lock your episode date.',
    bookingLink: '',
    email: '',
    phone: '',
    scarcity: '',
  },
};

export function loadSettings() {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const saved = JSON.parse(raw);
    // Merge rather than replace so settings saved before a new field existed
    // don't come back missing that field.
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      pricing: { ...DEFAULT_SETTINGS.pricing, ...saved.pricing },
      nextStep: { ...DEFAULT_SETTINGS.nextStep, ...saved.nextStep },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

// Which optional slides have enough content to be worth rendering. An empty
// pricing or proof slide looks worse than no slide at all, so the deck
// builder skips them instead of printing blank cards.
export function settingsCompleteness(s) {
  return {
    hasPricing: !!(s.pricing?.yourInvestment?.trim()),
    hasNextStep: !!(s.nextStep?.bookingLink?.trim() || s.nextStep?.email?.trim() || s.nextStep?.phone?.trim()),
  };
}
