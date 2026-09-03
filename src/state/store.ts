/**
 * The single source of truth for the session.
 *
 * Everything the borrower answers lands here, and so does everything the AI
 * copilot does — deliberately the same door. The copilot is another input
 * device sitting next to the keyboard, not a parallel path through the app, so
 * when it fills in a fact the form fields populate and the bands move exactly as
 * if the borrower had typed it.
 *
 * Every change is recorded with its source and is undoable. That log is what
 * makes an agent writing into your state legible rather than spooky.
 *
 * Nothing is persisted. No localStorage, no server, no disk — close the tab and
 * it is gone, which is what "no personal data stored" has to mean.
 */

import { create } from 'zustand';
import type { BorrowerFacts } from '../engine/facts';
import { assess, type Assessment } from '../engine/assess';
import { nextQuestions, type QuestionValue } from '../engine/voi';
import type { Question } from '../engine/questions';

/**
 * Two screens, not four. The borrower lands straight on the first question —
 * a landing page with a "start" button is a click that buys them nothing.
 */
export type Screen = 'interview' | 'outputs';

export type ChangeSource = 'you' | 'copilot' | 'example';

export interface LogEntry {
  id: number;
  source: ChangeSource;
  /** Human-readable description of what changed. */
  label: string;
  /** Facts as they were *before* this change, for undo. */
  previous: BorrowerFacts;
  /** Set when this entry was an answer to a question, so Back can step over it. */
  questionId?: string;
  at: number;
}

interface AppState {
  facts: BorrowerFacts;
  screen: Screen;
  /** Question ids in the order they were put to the borrower. */
  askedOrder: string[];
  log: LogEntry[];
  /** Gemini key, held in memory + sessionStorage only. Never in the repo. */
  apiKey: string | null;
  copilotOpen: boolean;

  setFact: (key: keyof BorrowerFacts, value: unknown, source?: ChangeSource, label?: string) => void;
  setFacts: (patch: Partial<BorrowerFacts>, source?: ChangeSource, label?: string) => void;
  recordAsked: (questionId: string) => void;
  answer: (question: Question, value: unknown, source?: ChangeSource) => void;
  /** Record a declined question. Some record their non-answer on another field. */
  skip: (question: Question, patch: Partial<BorrowerFacts>) => void;

  loadExample: (name: string, facts: BorrowerFacts) => void;
  reset: () => void;
  goto: (screen: Screen) => void;
  undo: () => void;
  /** Step back to the previous question, un-answering the last one. */
  goBack: () => void;
  canGoBack: () => boolean;

  setApiKey: (key: string | null) => void;
  toggleCopilot: (open?: boolean) => void;
}

let logId = 0;

const KEY_STORAGE = 'borrower-copilot-gemini-key';

function readStoredKey(): string | null {
  try {
    return sessionStorage.getItem(KEY_STORAGE);
  } catch {
    // Private browsing, or storage blocked. The app works without it.
    return null;
  }
}

export const useStore = create<AppState>((set, get) => ({
  facts: {},
  screen: 'interview',
  askedOrder: [],
  log: [],
  apiKey: readStoredKey(),
  copilotOpen: false,

  setFact: (key, value, source = 'you', label) => {
    const previous = get().facts;
    set({
      facts: { ...previous, [key]: value },
      log: [
        ...get().log,
        {
          id: ++logId,
          source,
          label: label ?? `set ${String(key)}`,
          previous,
          at: Date.now(),
        },
      ],
    });
  },

  setFacts: (patch, source = 'you', label) => {
    const previous = get().facts;
    const keys = Object.keys(patch);
    set({
      facts: { ...previous, ...patch },
      log: [
        ...get().log,
        {
          id: ++logId,
          source,
          label: label ?? `set ${keys.join(', ')}`,
          previous,
          at: Date.now(),
        },
      ],
    });
  },

  recordAsked: (questionId) => {
    if (get().askedOrder.includes(questionId)) return;
    set({ askedOrder: [...get().askedOrder, questionId] });
  },

  answer: (question, value, source = 'you') => {
    const previous = get().facts;
    get().recordAsked(question.id);
    set({
      facts: { ...previous, [question.factKey]: value },
      log: [
        ...get().log,
        {
          id: ++logId,
          source,
          label: `answered "${question.text}"`,
          previous,
          questionId: question.id,
          at: Date.now(),
        },
      ],
    });
  },

  skip: (question, patch) => {
    const previous = get().facts;
    get().recordAsked(question.id);
    set({
      facts: { ...previous, ...patch },
      log: [
        ...get().log,
        {
          id: ++logId,
          source: 'you',
          label: `skipped "${question.text}"`,
          previous,
          questionId: question.id,
          at: Date.now(),
        },
      ],
    });
  },

  loadExample: (name, facts) => {
    const previous = get().facts;
    set({
      facts,
      askedOrder: [],
      screen: 'outputs',
      log: [
        ...get().log,
        {
          id: ++logId,
          source: 'example',
          label: `loaded the ${name} example`,
          previous,
          at: Date.now(),
        },
      ],
    });
  },

  reset: () => set({ facts: {}, screen: 'interview', askedOrder: [], log: [] }),

  goto: (screen) => set({ screen }),

  undo: () => {
    const log = get().log;
    const last = log[log.length - 1];
    if (!last) return;
    set({ facts: last.previous, log: log.slice(0, -1) });
  },

  /**
   * Step back one question.
   *
   * Restores the facts as they were before that answer, which un-answers it —
   * so the value-of-information engine offers it again, with whatever the
   * borrower typed cleared. Ranking is recomputed from the earlier state, so
   * going back and changing an answer can legitimately lead somewhere new.
   */
  goBack: () => {
    const log = get().log;
    for (let i = log.length - 1; i >= 0; i--) {
      const entry = log[i]!;
      if (entry.questionId === undefined) continue;
      set({
        facts: entry.previous,
        log: log.slice(0, i),
        askedOrder: get().askedOrder.filter((id) => id !== entry.questionId),
      });
      return;
    }
  },

  canGoBack: () => get().log.some((e) => e.questionId !== undefined),

  setApiKey: (key) => {
    try {
      if (key) sessionStorage.setItem(KEY_STORAGE, key);
      else sessionStorage.removeItem(KEY_STORAGE);
    } catch {
      // Not fatal — the key just will not survive a reload.
    }
    set({ apiKey: key });
  },

  toggleCopilot: (open) => set({ copilotOpen: open ?? !get().copilotOpen }),
}));

// ---------------------------------------------------------------------------
// Derived selectors
// ---------------------------------------------------------------------------

/**
 * The live assessment.
 *
 * Recomputed from scratch on every change. It is a pure function over a few
 * dozen facts and takes well under a millisecond, so there is no reason to
 * cache it and every reason not to — a stale number here would be the one bug
 * that matters.
 */
export function useAssessment(): Assessment {
  const facts = useStore((s) => s.facts);
  return assess(facts);
}

export function useNextQuestions(limit = 3): QuestionValue[] {
  const facts = useStore((s) => s.facts);
  return nextQuestions(facts, limit);
}

export function useAiEnabled(): boolean {
  return useStore((s) => s.apiKey !== null && s.apiKey.length > 0);
}
