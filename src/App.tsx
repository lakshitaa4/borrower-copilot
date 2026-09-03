import { useStore } from './state/store';
import { Interview } from './screens/Interview';
import { Outputs } from './screens/Outputs';

export default function App() {
  const screen = useStore((s) => s.screen);
  const goto = useStore((s) => s.goto);
  const reset = useStore((s) => s.reset);
  const started = useStore((s) => Object.keys(s.facts).length > 0);

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
