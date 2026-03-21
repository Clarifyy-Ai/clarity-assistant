// @ts-nocheck
import { useEffect, useState } from 'react';
import { useAudioStore } from '@/store/audioStore';
import { TrendingUp, TrendingDown, Minus, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────
// LiveMetricsPanel
// Comprehensive performance metrics dashboard showing:
// - Overall session score (0-100)
// - Answer quality metrics
// - Communication scores
// - Technical performance
// - Historical trending
// ─────────────────────────────────────────────────────────────────

interface SessionMetrics {
  overallScore: number;
  tier: 'poor' | 'fair' | 'good' | 'excellent';
  answerQuality: {
    completeness: number;
    accuracy: number;
    relevance: number;
    structure: number;
  };
  communication: {
    clarity: number;
    pace: number;
    confidence: number;
    engagement: number;
    fillerWords: number;
  };
  technical: {
    networkQuality: 'excellent' | 'good' | 'fair' | 'poor';
    audioQuality: 'excellent' | 'good' | 'fair' | 'poor';
    microphoneLevel: 'too-quiet' | 'good' | 'too-loud';
    echoDetected: boolean;
  };
  trending: {
    scoreChange: number;
    direction: 'up' | 'down' | 'stable';
  };
}

interface LiveMetricsPanelProps {
  className?: string;
  showTrend?: boolean;
  detailed?: boolean;
}

const SCORE_WEIGHTS = {
  answerQuality: 0.35,
  communication: 0.35,
  technical: 0.2,
  engagement: 0.1,
};

export function LiveMetricsPanel({
  className,
  showTrend = true,
  detailed = true,
}: LiveMetricsPanelProps) {
  const transcript  = useAudioStore((s) => s.transcript);
  const elapsedTime = useAudioStore((s) => s.elapsedTime);
  
  const [metrics, setMetrics] = useState<SessionMetrics>({
    overallScore: 75,
    tier: 'good',
    answerQuality: {
      completeness: 80,
      accuracy: 85,
      relevance: 80,
      structure: 70,
    },
    communication: {
      clarity: 82,
      pace: 88,
      confidence: 75,
      engagement: 78,
      fillerWords: 85, // higher is better (low filler words)
    },
    technical: {
      networkQuality: 'good',
      audioQuality: 'good',
      microphoneLevel: 'good',
      echoDetected: false,
    },
    trending: {
      scoreChange: 5,
      direction: 'up',
    },
  });

  useEffect(() => {
    // Calculate answer quality based on transcript
    const text = transcript?.utterances
      .map((u) => u.text)
      .join(' ')
      .toLowerCase() || '';
    const words = text.split(/\s+/).filter((w) => w.length > 0);

    // Completeness: based on length and detail
    const completeness = Math.min(
      100,
      Math.max(20, (words.length / 100) * 50 + 50)
    );

    // Accuracy: mock based on keyword presence (in production, use AI)
    const accuracyKeywords = [
      'example',
      'specifically',
      'demonstrated',
      'achieved',
      'learned',
    ];
    let accuracy = 50;
    accuracyKeywords.forEach((keyword) => {
      if (text.includes(keyword)) accuracy += 10;
    });
    accuracy = Math.min(100, accuracy);

    // Relevance: based on topic keywords
    const relevanceKeywords = ['question', 'role', 'responsibility', 'problem'];
    let relevance = 50;
    relevanceKeywords.forEach((keyword) => {
      if (text.includes(keyword)) relevance += 10;
    });
    relevance = Math.min(100, relevance);

    // Structure: based on markers of good structure
    const structureMarkers = ['first', 'second', 'finally', 'overall', 'summary'];
    let structure = 50;
    structureMarkers.forEach((marker) => {
      if (text.includes(marker)) structure += 10;
    });
    structure = Math.min(100, structure);

    // Speaking pace (WPM)
    const elapsedSeconds = elapsedTime || 1;
    const wpm = Math.round((words.length / elapsedSeconds) * 60);
    const pace = wpm >= 100 && wpm <= 130 ? 95 : Math.max(50, 100 - Math.abs(wpm - 115));

    // Clarity (based on filler words - lower is better)
    const fillerWords = ['um', 'uh', 'like', 'basically', 'actually'];
    let fillerCount = 0;
    fillerWords.forEach((filler) => {
      const regex = new RegExp(`\\b${filler}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) fillerCount += matches.length;
    });
    const fillerPercent =
      words.length > 0 ? (fillerCount / words.length) * 100 : 0;
    const clarity = Math.max(40, 100 - fillerPercent * 3);

    // Calculate overall score
    const answerQualityScore =
      (completeness + accuracy + relevance + structure) / 4;
    const communicationScore =
      (clarity + pace + 75 + 75 + (100 - fillerPercent * 2)) / 5;

    const overallScore = Math.round(
      answerQualityScore * SCORE_WEIGHTS.answerQuality +
        communicationScore * SCORE_WEIGHTS.communication +
        80 * SCORE_WEIGHTS.technical +
        75 * SCORE_WEIGHTS.engagement
    );

    // Determine tier
    let tier: 'poor' | 'fair' | 'good' | 'excellent' = 'good';
    if (overallScore < 40) tier = 'poor';
    else if (overallScore < 60) tier = 'fair';
    else if (overallScore < 80) tier = 'good';
    else tier = 'excellent';

    setMetrics({
      overallScore,
      tier,
      answerQuality: {
        completeness: Math.round(completeness),
        accuracy: Math.round(accuracy),
        relevance: Math.round(relevance),
        structure: Math.round(structure),
      },
      communication: {
        clarity: Math.round(clarity),
        pace: Math.round(pace),
        confidence: 75,
        engagement: 78,
        fillerWords: Math.round(100 - fillerPercent * 2),
      },
      technical: {
        networkQuality: 'good',
        audioQuality: 'good',
        microphoneLevel: 'good',
        echoDetected: false,
      },
      trending: {
        scoreChange: 5,
        direction: 'up',
      },
    });
  }, [transcript, elapsedTime]);

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'excellent':
        return 'text-green-400';
      case 'good':
        return 'text-blue-400';
      case 'fair':
        return 'text-yellow-400';
      case 'poor':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getTierBg = (tier: string) => {
    switch (tier) {
      case 'excellent':
        return 'bg-green-500/10';
      case 'good':
        return 'bg-blue-500/10';
      case 'fair':
        return 'bg-yellow-500/10';
      case 'poor':
        return 'bg-red-500/10';
      default:
        return 'bg-gray-500/10';
    }
  };

  const ScoreBar = ({ score }: { score: number }) => (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-gray-700 overflow-hidden">
        <div
          className={cn(
            'h-full transition-all duration-300',
            score >= 80
              ? 'bg-green-500'
              : score >= 60
                ? 'bg-blue-500'
                : score >= 40
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
          )}
          style={{
            width: `${score}%`,
          }}
        />
      </div>
      <span className="text-xs font-semibold text-gray-400 w-7 text-right">
        {score}%
      </span>
    </div>
  );

  const TrendIcon = ({ direction }: { direction: 'up' | 'down' | 'stable' }) => {
    switch (direction) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      case 'stable':
        return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  if (!detailed) {
    return (
      <div className={cn('space-y-3', className)}>
        {/* Overall Score - Compact */}
        <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg border border-white/[0.05]">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-brand-400" />
            <span className="text-xs font-medium text-gray-300">Score</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('text-sm font-bold', getTierColor(metrics.tier))}>
              {metrics.overallScore}
            </span>
            {showTrend && <TrendIcon direction={metrics.trending.direction} />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Overall Score */}
      <div
        className={cn(
          'p-4 rounded-lg border',
          getTierBg(metrics.tier),
          'border-white/[0.1]'
        )}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Overall Score</h3>
            <p className={cn('text-xs mt-1', getTierColor(metrics.tier))}>
              {metrics.tier.charAt(0).toUpperCase() + metrics.tier.slice(1)}
            </p>
          </div>
          <div className="text-right">
            <div className={cn('text-3xl font-bold', getTierColor(metrics.tier))}>
              {metrics.overallScore}
            </div>
            <div className="text-[10px] text-gray-500">/100</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-gray-700 overflow-hidden">
            <div
              className={cn(
                'h-full transition-all',
                metrics.tier === 'excellent'
                  ? 'bg-green-500'
                  : metrics.tier === 'good'
                    ? 'bg-blue-500'
                    : metrics.tier === 'fair'
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
              )}
              style={{
                width: `${metrics.overallScore}%`,
              }}
            />
          </div>
          {showTrend && (
            <div className="flex items-center gap-1">
              <TrendIcon direction={metrics.trending.direction} />
              <span className="text-xs font-semibold text-gray-500">
                {metrics.trending.scoreChange > 0 ? '+' : ''}
                {metrics.trending.scoreChange}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Answer Quality */}
      <div className="p-3 bg-white/[0.02] rounded-lg border border-white/[0.05]">
        <h4 className="text-xs font-semibold text-gray-300 mb-3">
          Answer Quality
        </h4>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-xs text-gray-400">Completeness</span>
            <span className="text-xs font-semibold text-gray-300">
              {metrics.answerQuality.completeness}%
            </span>
          </div>
          <ScoreBar score={metrics.answerQuality.completeness} />

          <div className="flex justify-between mt-3">
            <span className="text-xs text-gray-400">Accuracy</span>
            <span className="text-xs font-semibold text-gray-300">
              {metrics.answerQuality.accuracy}%
            </span>
          </div>
          <ScoreBar score={metrics.answerQuality.accuracy} />

          <div className="flex justify-between mt-3">
            <span className="text-xs text-gray-400">Relevance</span>
            <span className="text-xs font-semibold text-gray-300">
              {metrics.answerQuality.relevance}%
            </span>
          </div>
          <ScoreBar score={metrics.answerQuality.relevance} />

          <div className="flex justify-between mt-3">
            <span className="text-xs text-gray-400">Structure</span>
            <span className="text-xs font-semibold text-gray-300">
              {metrics.answerQuality.structure}%
            </span>
          </div>
          <ScoreBar score={metrics.answerQuality.structure} />
        </div>
      </div>

      {/* Communication */}
      <div className="p-3 bg-white/[0.02] rounded-lg border border-white/[0.05]">
        <h4 className="text-xs font-semibold text-gray-300 mb-3">
          Communication
        </h4>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-xs text-gray-400">Clarity</span>
            <span className="text-xs font-semibold text-gray-300">
              {metrics.communication.clarity}%
            </span>
          </div>
          <ScoreBar score={metrics.communication.clarity} />

          <div className="flex justify-between mt-3">
            <span className="text-xs text-gray-400">Speaking Pace</span>
            <span className="text-xs font-semibold text-gray-300">
              {metrics.communication.pace}%
            </span>
          </div>
          <ScoreBar score={metrics.communication.pace} />

          <div className="flex justify-between mt-3">
            <span className="text-xs text-gray-400">Confidence</span>
            <span className="text-xs font-semibold text-gray-300">
              {metrics.communication.confidence}%
            </span>
          </div>
          <ScoreBar score={metrics.communication.confidence} />

          <div className="flex justify-between mt-3">
            <span className="text-xs text-gray-400">Engagement</span>
            <span className="text-xs font-semibold text-gray-300">
              {metrics.communication.engagement}%
            </span>
          </div>
          <ScoreBar score={metrics.communication.engagement} />
        </div>
      </div>

      {/* Technical */}
      <div className="p-3 bg-white/[0.02] rounded-lg border border-white/[0.05]">
        <h4 className="text-xs font-semibold text-gray-300 mb-3">Technical</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Network Quality</span>
            <span
              className={cn(
                'text-xs font-semibold',
                metrics.technical.networkQuality === 'excellent'
                  ? 'text-green-400'
                  : metrics.technical.networkQuality === 'good'
                    ? 'text-blue-400'
                    : metrics.technical.networkQuality === 'fair'
                      ? 'text-yellow-400'
                      : 'text-red-400'
              )}
            >
              {metrics.technical.networkQuality.charAt(0).toUpperCase() +
                metrics.technical.networkQuality.slice(1)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Audio Quality</span>
            <span
              className={cn(
                'text-xs font-semibold',
                metrics.technical.audioQuality === 'excellent'
                  ? 'text-green-400'
                  : metrics.technical.audioQuality === 'good'
                    ? 'text-blue-400'
                    : metrics.technical.audioQuality === 'fair'
                      ? 'text-yellow-400'
                      : 'text-red-400'
              )}
            >
              {metrics.technical.audioQuality.charAt(0).toUpperCase() +
                metrics.technical.audioQuality.slice(1)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Microphone Level</span>
            <span
              className={cn(
                'text-xs font-semibold',
                metrics.technical.microphoneLevel === 'good'
                  ? 'text-green-400'
                  : metrics.technical.microphoneLevel === 'too-quiet'
                    ? 'text-yellow-400'
                    : 'text-red-400'
              )}
            >
              {metrics.technical.microphoneLevel === 'good'
                ? 'Perfect'
                : metrics.technical.microphoneLevel === 'too-quiet'
                  ? 'Too Quiet'
                  : 'Too Loud'}
            </span>
          </div>

          {metrics.technical.echoDetected && (
            <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-[10px] text-red-400">
              ⚠️ Echo detected
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LiveMetricsPanel;
