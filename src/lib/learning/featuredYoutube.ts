export type FeaturedYoutubeVideo = {
  id: string;
  title: string;
  description: string;
  url: string;
  durationLabel: string;
  channel: string;
};

/** Curated third-party interview prep videos shown on Learning Hub. */
export const FEATURED_YOUTUBE_VIDEOS: FeaturedYoutubeVideo[] = [
  {
    id: "tell-me-about-yourself",
    title: "Tell Me About Yourself — A Good Answer",
    description: "Structure a concise opening answer that sets up the rest of the interview.",
    url: "https://www.youtube.com/watch?v=05pa1A9j2WI",
    durationLabel: "6 min",
    channel: "CareerRide",
  },
  {
    id: "star-method",
    title: "The STAR Method for Behavioral Questions",
    description: "Use Situation, Task, Action, and Result to answer behavioral prompts clearly.",
    url: "https://www.youtube.com/watch?v=DHJaHNZBlPw",
    durationLabel: "4 min",
    channel: "Indeed",
  },
  {
    id: "behavioral-top-10",
    title: "Top 10 Behavioral Interview Questions",
    description: "Practice the most common behavioral prompts and what interviewers listen for.",
    url: "https://www.youtube.com/watch?v=PJKYqLCsaGY",
    durationLabel: "12 min",
    channel: "Dan Croitor",
  },
  {
    id: "weakness-question",
    title: "How to Answer “What Is Your Greatest Weakness?”",
    description: "Turn a tricky question into evidence of self-awareness and growth.",
    url: "https://www.youtube.com/watch?v=1mHjMYKp6X8",
    durationLabel: "5 min",
    channel: "The Interview Guys",
  },
];
