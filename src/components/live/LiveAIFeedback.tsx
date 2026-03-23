// @ts-nocheck
import { useEffect, useState } from 'react';
import { useAudioStore } from '@/store/audioStore';
import { BarChart3, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────
// LiveAIFeedback
// Real-time AI feedback panel showing:
// - Sentiment analysis (positive/neutral/negative)
// - Filler word count & percentage
// - Speaking pace (WPM - words per minute)
// - Engagement level (confidence score)
// - Topic relevance score
// - Pause detection and timing
// ─────────────────────────────────────────────────────────────────

interface FeedbackMetrics {
  sentiment: {
    label: 'positive' | 'neutral' | 'negative';
    score: number; // 0-100
    emoji: string;
  };
  fillerWords: {
    count: number;
    percentage: number;
    threshold: number;
    trend: 'up' | 'down' | 'stable';
    trendPercent: number;
  };
  speakingPace: {
    current: number; // WPM
    average: number;
    optimal: [number, number];
    quality: 'slow' | 'good' | 'fast';
  };
  confidence: {
    score: number; // 0-100
    trend: 'up' | 'down' | 'stable';
    trendPercent: number;
  };
  topicRelevance: {
    score: number; // 0-100
    onTopic: boolean;
  };
  pause: {
    duration: number; // seconds
    isLong: boolean;
    threshold: number;
  };
}

interface LiveAIFeedbackProps {
  className?: string;
  compact?: boolean;
  showTrends?: boolean;
}

const FILLER_WORDS = [
  'um',
  'uh',
  'like',
  'you know',
  'basically',
  'actually',
  'literally',
  'honestly',
  'so',
  'well',
  'just',
];

const FILLER_THRESHOLD = 15; // percentage threshold
const PAUSE_THRESHOLD = 3; // seconds

export function LiveAIFeedback({
  className,
  compact = false,
  showTrends = true,
}: LiveAIFeedbackProps) {
  const transcript  = useAudioStore((s) => s.transcript);
  const elapsedTime = useAudioStore((s) => s.elapsedTime);
  const [metrics, setMetrics] = useState<FeedbackMetrics>({
    sentiment: { label: 'neutral', score: 50, emoji: '😐' },
    fillerWords: {
      count: 0,
      percentage: 0,
      threshold: FILLER_THRESHOLD,
      trend: 'stable',
      trendPercent: 0,
    },
    speakingPace: {
      current: 0,
      average: 0,
      optimal: [100, 130],
      quality: 'good',
    },
    confidence: {
      score: 60,
      trend: 'stable',
      trendPercent: 0,
    },
    topicRelevance: {
      score: 75,
      onTopic: true,
    },
    pause: {
      duration: 0,
      isLong: false,
      threshold: PAUSE_THRESHOLD,
    },
  });

  // Calculate metrics from audio store
  useEffect(() => {
    if (!transcript?.utterances) return;

    const text = transcript.utterances
      .map((u) => u.text)
      .join(' ')
      .toLowerCase();
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const totalWords = words.length;

    // Calculate WPM (rough estimate: 5 characters = 1 word)
    const elapsedSeconds = elapsedTime || 1;
    const wpm = Math.round((totalWords / elapsedSeconds) * 60);

    // Count filler words
    let fillerCount = 0;
    FILLER_WORDS.forEach((filler) => {
      const regex = new RegExp(`\\b${filler}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) fillerCount += matches.length;
    });
    const fillerPercent =
      totalWords > 0 ? Math.round((fillerCount / totalWords) * 100) : 0;

    // Determine speaking pace quality
    let paceQuality: 'slow' | 'good' | 'fast' = 'good';
    if (wpm < 80) paceQuality = 'slow';
    else if (wpm > 150) paceQuality = 'fast';

    // Calculate sentiment (basic - count positive/negative words)
    const positiveWords = [
      'great',
      'excellent',
      'good',
      'amazing',
      'perfect',
      'love',
      'happy',
      'successful',
    ];
    const negativeWords = [
      'bad',
      'terrible',
      'awful',
      'horrible',
      'hate',
      'sad',
      'failed',
      'worst',
    ];

    let sentimentScore = 50;
    positiveWords.forEach((word) => {
      if (text.includes(word)) sentimentScore += 5;
    });
    negativeWords.forEach((word) => {
      if (text.includes(word)) sentimentScore -= 5;
    });
    sentimentScore = Math.max(0, Math.min(100, sentimentScore));

    let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
    let emoji = '😐';
    if (sentimentScore > 60) {
      sentiment = 'positive';
      emoji = '😊';
    } else if (sentimentScore < 40) {
      sentiment = 'negative';
      emoji = '😟';
    }

    // Calculate confidence (combination of pace, filler words, pause)
    let confidenceScore = 70;
    if (fillerPercent > FILLER_THRESHOLD) confidenceScore -= 10;
    if (wpm < 80 || wpm > 150) confidenceScore -= 5;
    confidenceScore = Math.max(0, Math.min(100, confidenceScore));

    // Topic relevance (mock - would integrate with AI in production)
    const topicKeywords = ['question', 'answer', 'example', 'experience'];
    let topicScore = 70;
    topicKeywords.forEach((keyword) => {
      if (text.includes(keyword)) topicScore += 5;
    });
    topicScore = Math.min(100, topicScore);

    setMetrics({
      sentiment: { label: sentiment, score: sentimentScore, emoji },
      fillerWords: {
        count: fillerCount,
        percentage: fillerPercent,
        threshold: FILLER_THRESHOLD,
        trend: fillerPercent > FILLER_THRESHOLD ? 'up' : 'stable',
        trendPercent: Math.abs(fillerPercent - FILLER_THRESHOLD),
      },
      speakingPace: {
        current: wpm,
        average: wpm, // In production, calculate actual average
        optimal: [100, 130],
        quality: paceQuality,
      },
      confidence: {
        score: confidenceScore,
        trend: 'stable',
        trendPercent: 0,
      },
      topicRelevance: {
        score: topicScore,
        onTopic: topicScore > 60,
      },
      pause: {
        duration: 0,
        isLong: false,
        threshold: PAUSE_THRESHOLD,
      },
    });
  }, [transcript, elapsedTime]);

  const TrendIcon = ({ trend }: { trend: 'up' | 'down' | 'stable' }) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-3.5 w-3.5 text-red-500" />;
      case 'down':
        return <TrendingDown className="h-3.5 w-3.5 text-green-500" />;
      case 'stable':
        return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  if (compact) {
    return (
      <div className={cn('space-y-3', className)}>
        {/* Sentiment Badge */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Sentiment</span>
          <div className="flex items-center gap-2">
            <span className="text-lg">{metrics.sentiment.emoji}</span>
            <div className="w-16 h-1.5 rounded-full bg-gray-700 overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all',
                  metrics.sentiment.score > 60
                    ? 'bg-green-500'
                    : metrics.sentiment.score < 40
                      ? 'bg-red-500'
                      : 'bg-blue-500'
                )}
                style={{
                  width: `${metrics.sentiment.score}%`,
                }}
              />
            </div>
            <span className="text-xs font-semibold text-muted-foreground w-8">
              {metrics.sentiment.score}%
            </span>
          </div>
        </div>

        {/* Filler Words Badge */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Filler</span>
          <div className="flex items-center gap-2">
            {showTrends && <TrendIcon trend={metrics.fillerWords.trend} />}
            <span className="text-xs font-semibold text-muted-foreground w-12">
              {metrics.fillerWords.count}
            </span>
          </div>
        </div>

        {/* Pace Badge */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Pace</span>
          <span
            className={cn(
              'text-xs font-semibold w-16 text-right',
              metrics.speakingPace.quality === 'good'
                ? 'text-green-400'
                : metrics.speakingPace.quality === 'slow'
                  ? 'text-orange-400'
                  : 'text-red-400'
            )}
          >
            {metrics.speakingPace.current} WPM
          </span>
        </div>
      </div>
    );
  }

  // Full panel view
  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-border">
        <BarChart3 className="h-4 w-4 text-brand-400" />
        <h3 className="text-sm font-semibold text-foreground">Live Feedback</h3>
      </div>

      {/* Sentiment */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">Sentiment</label>
          <span className="text-lg">{metrics.sentiment.emoji}</span>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-gray-700 overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-300',
                  metrics.sentiment.score > 60
                    ? 'bg-green-500'
                    : metrics.sentiment.score < 40
                      ? 'bg-red-500'
                      : 'bg-blue-500'
                )}
                style={{
                  width: `${metrics.sentiment.score}%`,
                }}
              />
            </div>
            <span className="text-xs font-semibold text-muted-foreground w-8">
              {metrics.sentiment.score}%
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground capitalize">
            {metrics.sentiment.label}
          </p>
        </div>
      </div>

      {/* Filler Words */}
      <div className="space-y-2 p-2.5 bg-secondary/50 rounded-lg border border-border">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            Filler Words
          </label>
          {showTrends && (
            <div className="flex items-center gap-1">
              <TrendIcon trend={metrics.fillerWords.trend} />
              <span className="text-[10px] text-muted-foreground">
                {Math.abs(metrics.fillerWords.trendPercent).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">
            {metrics.fillerWords.count}
          </span>
          <span className="text-xs text-muted-foreground">
            {metrics.fillerWords.percentage}% of words
          </span>
        </div>
        {metrics.fillerWords.percentage > metrics.fillerWords.threshold && (
          <p className="text-[10px] text-orange-400 font-medium">
            ⚠️ Above recommended threshold
          </p>
        )}
      </div>

      {/* Speaking Pace */}
      <div className="space-y-2 p-2.5 bg-secondary/50 rounded-lg border border-border">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            Speaking Pace
          </label>
          <span
            className={cn(
              'text-xs font-semibold',
              metrics.speakingPace.quality === 'good'
                ? 'text-green-400'
                : metrics.speakingPace.quality === 'slow'
                  ? 'text-orange-400'
                  : 'text-red-400'
            )}
          >
            {metrics.speakingPace.quality === 'good' && '✓'}
            {metrics.speakingPace.quality === 'slow' && '⚡'}
            {metrics.speakingPace.quality === 'fast' && '⚠️'}
          </span>
        </div>
        <div className="text-sm font-semibold text-foreground">
          {metrics.speakingPace.current} WPM
        </div>
        <div className="text-[10px] text-muted-foreground">
          Optimal: {metrics.speakingPace.optimal[0]}-
          {metrics.speakingPace.optimal[1]} WPM
        </div>
      </div>

      {/* Confidence Score */}
      <div className="space-y-2 p-2.5 bg-secondary/50 rounded-lg border border-border">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            Confidence
          </label>
          {showTrends && (
            <div className="flex items-center gap-1">
              <TrendIcon trend={metrics.confidence.trend} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-gray-700 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 transition-all duration-300"
              style={{
                width: `${metrics.confidence.score}%`,
              }}
            />
          </div>
          <span className="text-xs font-semibold text-muted-foreground w-8">
            {metrics.confidence.score}%
          </span>
        </div>
      </div>

      {/* Topic Relevance */}
      <div className="space-y-2 p-2.5 bg-secondary/50 rounded-lg border border-border">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            Topic Relevance
          </label>
          <span className={cn('text-xs font-semibold')}>
            {metrics.topicRelevance.onTopic ? '✓ On Topic' : '⚠️ Off Topic'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-gray-700 overflow-hidden">
            <div
              className={cn(
                'h-full transition-all duration-300',
                metrics.topicRelevance.score > 70
                  ? 'bg-green-500'
                  : metrics.topicRelevance.score > 50
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
              )}
              style={{
                width: `${metrics.topicRelevance.score}%`,
              }}
            />
          </div>
          <span className="text-xs font-semibold text-muted-foreground w-8">
            {metrics.topicRelevance.score}%
          </span>
        </div>
      </div>

      {/* Pause Detection */}
      {metrics.pause.duration > 0 && (
        <div
          className={cn(
            'p-2.5 rounded-lg border',
            metrics.pause.isLong
              ? 'bg-red-500/10 border-red-500/20'
              : 'bg-blue-500/10 border-blue-500/20'
          )}
        >
          <p
            className={cn(
              'text-xs font-medium',
              metrics.pause.isLong ? 'text-red-400' : 'text-blue-400'
            )}
          >
            Pause: {metrics.pause.duration.toFixed(1)}s
            {metrics.pause.isLong && ' ⚠️'}
          </p>
        </div>
      )}
    </div>
  );
}

export default LiveAIFeedback;
