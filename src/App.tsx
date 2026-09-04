import { useEffect } from 'react';
import { useStore } from './state/store';
import { Interview } from './screens/Interview';
import { Outputs } from './screens/Outputs';

export default function App() {
  const screen = useStore((s) => s.screen);
  const goto = useStore((s) => s.goto);
  const reset = useStore((s) => s.reset);
  const started = useStore((s) => Object.keys(s.facts).length > 0);

  /*
   * Start each screen at the top.
   *
   * Nothing here is a real navigation, so the browser has no reason to reset
   * the scroll position — and the commonest path through the app is precisely
   * the one that breaks because of it. You scroll to the bottom of the landing
   * page to reach the example borrowers, tap one, and the results open still
   * scrolled down: halfway through the reasoning, with the card you were meant
   * to see somewhere above you.
   */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [screen]);

  return (
    <div className="app">
      <div className="masthead no-print">
        <button className="wordmark" onClick={reset} title="Start over">
          Borrower <em>Copilot</em>
        </button>

        {started && (
          <nav className="switch">
            <button data-on={screen === 'interview'} onClick={() => goto('interview')}>
              Questions
            </button>
            <button data-on={screen === 'outputs'} onClick={() => goto('outputs')}>
              My card
            </button>
          </nav>
        )}
      </div>

      {screen === 'interview' ? <Interview /> : <Outputs />}
    </div>
  );
}
