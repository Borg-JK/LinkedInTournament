// components/ScoringTab.jsx
import { SCORING_METRICS } from '../lib/scoring';
import { GAMES } from '../lib/games';
import { JOIN_POLICIES } from '../lib/useTournaments';

export default function ScoringTab({ tournament }) {
  const metric = SCORING_METRICS.find(m => m.id === tournament.scoringMetric);
  const policy = JOIN_POLICIES.find(p => p.id === tournament.joinPolicy);

  return (
    <div className="leaderboard-card">
      <div className="lb-title" style={{ marginBottom: 20 }}>How this tournament works</div>

      <div className="scoring-block">
        <div className="scoring-block-title">Scoring: {metric?.label}</div>
        <div className="scoring-block-body">{metric?.desc}</div>
      </div>

      <div className="scoring-block">
        <div className="scoring-block-title">Eligibility</div>
        <div className="scoring-block-body">
          You need to have submitted a score on at least {tournament.eligibilityThresholdPct}% of the days in
          your own active window — from your first submission through the tournament's most recent counted day —
          to qualify for standings in a given month.
        </div>
      </div>

      {tournament.games.length > 1 && (
        <div className="scoring-block">
          <div className="scoring-block-title">Overall / cumulative</div>
          <div className="scoring-block-body">
            Each game is scored entirely on its own. The Overall standing is the straight sum of your score in every
            game you qualify in — every game still has its own winner, shown on its own tab.
          </div>
        </div>
      )}

      <div className="scoring-block">
        <div className="scoring-block-title">Games</div>
        <div className="scoring-block-body">
          {tournament.games.map(gId => GAMES.find(g => g.id === gId)?.label || gId).join(', ')}
        </div>
      </div>

      <div className="scoring-block">
        <div className="scoring-block-title">Joining</div>
        <div className="scoring-block-body">{policy?.desc}</div>
      </div>
    </div>
  );
}
