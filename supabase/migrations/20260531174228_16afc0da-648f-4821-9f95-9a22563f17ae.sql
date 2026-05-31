-- Seed help_articles
INSERT INTO public.help_articles (slug, category_slug, category_title, question, answer, body_md, sort_order, published) VALUES
('gs-1','getting-started','Getting Started','What is Clarify AI?','Clarify AI is an AI-powered interview preparation platform that provides real-time coaching during practice sessions, full mock simulations with analytics, and a suite of prep tools to help you land your dream job.','Clarify AI is an AI-powered interview **preparation** platform. It provides a live practice coach, full mock simulations with analytics, and a suite of prep tools to help you land your dream job.

The platform combines three core capabilities:

1. **Live Practice Coach** — Real-time AI suggestions during rehearsal sessions, shown in an on-screen prep overlay
2. **Mock Engine** — Full simulation interviews with AI scoring, filler-word tracking, and detailed performance analytics
3. **Prep Lab** — Tools including STAR builder, answer rephraser, gap analysis, company research, and coding hints

At launch, Clarify AI is powered by Google Gemini 2.0 Flash for low-latency hints, answers, and debriefs.

Clarify AI is for practice only. Using AI assistance covertly during a real interview violates most employer and assessment policies.',10,true),
('gs-2','getting-started','Getting Started','How do I create an account?','Click ''Get started free'' on the homepage. You can sign up with your email or use Google/GitHub OAuth. No credit card required for the free plan.','Creating an account takes less than a minute:

1. Visit the Clarify AI homepage and click **Get started free**
2. Enter your email and create a password, or sign in with Google
3. Verify your email address
4. Complete the quick onboarding flow (role, experience, target companies)

No credit card is required. You''ll start on the Free plan with 200 credits per month.',20,true),
('gs-3','getting-started','Getting Started','What happens after I sign up?','You''ll go through a quick onboarding flow where you set your role, experience level, and target companies. This helps personalize your AI coaching experience.','After signing up, you''ll go through a short onboarding flow:

1. **Set your role** — Choose your current job function (software engineer, product manager, etc.)
2. **Experience level** — Select your seniority (intern, junior, mid, senior, lead, principal)
3. **Target companies** — Add companies you''re interviewing with for personalized prep
4. **Upload resume** — Optionally upload your resume for AI gap analysis
5. **First session** — Start your first practice session or explore the prep lab

The platform personalizes everything based on your profile.',30,true),
('gs-4','getting-started','Getting Started','Is there a free plan?','Yes. The Free plan includes 200 credits per month, full access to practice sessions, the STAR builder, and the answer bank. No credit card required.','Yes. The Free plan includes:

- **200 credits** per month
- Practice sessions with the live AI coach
- STAR builder and answer bank
- Resume + JD gap analysis

No credit card required. Upgrade to **Pro** ($29/mo, 2,000 credits) or **Enterprise** ($79/mo, unlimited) anytime.',40,true),
('li-1','live-interview','Live Interview','How does the live practice coach work?','During a practice session, Clarify AI listens to your spoken answers and provides real-time suggested talking points, structure hints, and follow-up prompts in an on-screen prep overlay. It is designed for rehearsal — not for use during real interviews.','The live practice coach works in three steps:

1. **Audio capture** — Your microphone (and optionally system audio in Chromium browsers) picks up the question
2. **AI processing** — The question is sent to Google Gemini 2.0 Flash for analysis
3. **Overlay display** — Suggested talking points, structure hints, and follow-ups appear in your on-screen prep overlay

The whole loop takes under a second. The overlay is a normal on-screen window and is visible to screen-sharing tools — it is not designed to be hidden during real interviews.',10,true),
('li-2','live-interview','Live Interview','Can I use this during a real interview?','No. Live Co-Pilot is built strictly for interview practice. Using AI assistance covertly during a real interview violates most employer and assessment policies and may breach platform terms.','**No.** Live Co-Pilot is built strictly for interview rehearsal with an AI coach.

Using AI assistance covertly during a live interview:

- Violates most employer and assessment policies
- May breach the terms of platforms like Zoom, Teams, Google Meet, HackerRank, and CoderPad
- Can result in offer rescissions or disciplinary action

The Clarify AI overlay is a normal on-screen window and is visible to screen-sharing tools by design.',20,true),
('li-3','live-interview','Live Interview','What AI model is used?','At launch, Clarify AI is powered by Google Gemini 2.0 Flash for low-latency hints, answer drafting, and debriefs. Additional model providers are on the roadmap.','At launch, Clarify AI is powered by **Google Gemini 2.0 Flash** for hints, STAR answer drafting, and debriefs.

Gemini 2.0 Flash gives us the latency we need for sub-second hint streaming while keeping costs predictable. Additional providers (multi-model routing, BYOK) are on the roadmap but not available in v1.',30,true),
('li-4','live-interview','Live Interview','How many credits does a practice session cost?','Each requested hint costs 1 credit and each generated STAR answer costs 2 credits. Listening, transcription, and the debrief at the end of the session are included.','Each requested hint costs **1 credit**. Each generated STAR-format answer costs **2 credits**. The end-of-session debrief is **5 credits**.

A typical 30-minute practice session uses 5-15 credits depending on how often you request assistance.',40,true),
('mp-1','mock-practice','Mock Practice','What types of mock interviews are available?','We offer behavioral, technical, system design, and role-specific mock sessions. Each session includes AI-generated questions, real-time feedback, and a detailed scorecard.','We offer four types of mock interview sessions:

1. **Behavioral** — STAR-method questions about leadership, teamwork, conflict resolution
2. **Technical** — Coding and algorithm questions with hints and solution breakdowns
3. **System Design** — Architecture and scalability discussion questions
4. **Role-Specific** — Questions tailored to your specific target role and industry

Each session can be configured with Easy, Medium, or Hard difficulty and 15-60 minute durations.',10,true),
('mp-2','mock-practice','Mock Practice','Can I practice with others?','Yes! Practice Rooms allow you to create collaborative sessions where you and peers can practice together with shared scorecards and real-time coaching.','Yes! **Practice Rooms** allow collaborative mock interviews:

- Create a room with a name and max participant count
- Share the room link with peers
- Practice together with shared scorecards
- Get real-time AI coaching for every participant

Practice Rooms are available on all plans.',20,true),
('mp-3','mock-practice','Mock Practice','How does the scoring work?','After each mock session, you receive a scorecard covering clarity, structure (STAR method usage), specificity, relevance, and confidence. Each area is scored and compared against your historical performance.','After each mock session, you receive a detailed scorecard covering:

- **Clarity** — How clear and concise your answers were
- **Structure** — STAR method usage and logical flow
- **Specificity** — Use of concrete examples and data
- **Relevance** — How well answers addressed the question
- **Confidence** — Speaking pace, filler words, and delivery

Scores are tracked over time in your Analytics dashboard for trend analysis.',30,true),
('bi-1','billing','Billing & Credits','How do credits work?','Credits are the currency for AI-powered features. Free includes 200 credits/month, Pro includes 2,000/month, and Enterprise is unlimited.','Credits are the currency for AI features. Each action has a set cost:

- Live hint: 1 credit
- Mock question: 1 credit
- STAR polish: 1 credit
- Scorecard generation: 2 credits
- Company brief: 3 credits
- Gap analysis: 3 credits

Credits refresh monthly based on your plan tier.',10,true),
('bi-2','billing','Billing & Credits','How much do paid plans cost?','Pro is $29 / month for 2,000 credits and unlocks the full feature set. Enterprise is $79 / month per seat with unlimited credits and team controls.','Pro is **$29 / month** for 2,000 credits and unlocks the full feature set. Enterprise is **$79 / month** per seat with unlimited credits and team controls. Yearly billing saves roughly two months. Upgrade anytime from **Settings → Billing**.',20,true),
('bi-3','billing','Billing & Credits','How do I cancel my subscription?','Go to Settings → Billing and click ''Cancel subscription''. Your plan stays active until the end of the current billing period; you won''t be charged again.','To cancel:

1. Go to **Settings > Billing**
2. Click **Cancel subscription**
3. Confirm cancellation

Your plan remains active until the end of your current billing period. You won''t be charged again, and you can resume anytime before the period ends.',30,true),
('bi-4','billing','Billing & Credits','Do unused credits roll over?','No, monthly plan credits reset at the start of each billing cycle.','Monthly plan credits reset at the start of each billing cycle and do not roll over.',40,true),
('bi-5','billing','Billing & Credits','Can I buy extra credits?','À la carte credit packs are not available at launch. Upgrade your plan to increase your monthly allowance.','À la carte credit packs are not available at launch. To increase your monthly allowance, upgrade to **Pro** (2,000 credits/month) or **Enterprise** (unlimited credits) from **Settings → Billing**.',50,true),
('ac-1','account','Account & Security','How do I change my password?','Go to Settings > Security and use the change password form. You''ll need to enter your current password and then your new password (minimum 8 characters).','To change your password:

1. Go to **Settings > Security**
2. Enter your current password
3. Enter your new password (minimum 8 characters)
4. Confirm and click **Update Password**

If you forgot your password, use the ''Forgot password'' link on the login page.',10,true),
('ac-2','account','Account & Security','Can I use my own AI API keys?','Bring-your-own-key (BYOK) is on our roadmap and not available at launch. All AI calls today use Clarify''s managed Gemini connection and count against your monthly credit balance.','**Bring Your Own Key (BYOK)** is on our roadmap and not available at launch.

All AI calls today go through Clarify AI''s managed Google Gemini connection and count against your monthly credit balance. We''ll announce BYOK availability — with proper server-side key encryption — when it ships.',20,true),
('ac-3','account','Account & Security','How do I delete my account?','Go to Settings > Danger Zone and click ''Delete Account''. This will permanently remove all your data, sessions, and answers.','To delete your account:

1. Go to **Settings > Danger Zone**
2. Click **Delete Account**
3. Type your email to confirm
4. Click **Permanently Delete**

This permanently removes all your data, sessions, answers, and documents. This action cannot be undone.

If you have an active subscription, it will be canceled immediately.',30,true)
ON CONFLICT (slug) DO NOTHING;

-- Seed coding_hints (coding problems catalog)
INSERT INTO public.coding_hints (slug, title, pattern, description, difficulty, example_problems, tags, language, sort_order, published) VALUES
('two-sum','Two Sum','arrays','Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.','easy','[{"example":"Input: nums = [2,7,11,15], target = 9\nOutput: [0,1]"}]'::jsonb,ARRAY['hash map','brute force'],'pseudo',10,true),
('best-time-stock','Best Time to Buy and Sell Stock','arrays','Given an array prices where prices[i] is the price of a given stock on day i, find the maximum profit you can achieve.','easy','[{"example":"Input: prices = [7,1,5,3,6,4]\nOutput: 5"}]'::jsonb,ARRAY['sliding window','greedy'],'pseudo',20,true),
('max-subarray','Maximum Subarray','arrays','Given an integer array nums, find the subarray with the largest sum and return its sum.','medium','[{"example":"Input: nums = [-2,1,-3,4,-1,2,1,-5,4]\nOutput: 6"}]'::jsonb,ARRAY['kadane','divide and conquer'],'pseudo',30,true),
('product-except-self','Product of Array Except Self','arrays','Return an array where answer[i] equals the product of all elements of nums except nums[i], without using division.','medium','[{"example":"Input: nums = [1,2,3,4]\nOutput: [24,12,8,6]"}]'::jsonb,ARRAY['prefix/suffix'],'pseudo',40,true),
('valid-anagram','Valid Anagram','strings','Given two strings s and t, return true if t is an anagram of s, and false otherwise.','easy','[{"example":"Input: s = ''anagram'', t = ''nagaram''\nOutput: true"}]'::jsonb,ARRAY['hash map','sorting'],'pseudo',50,true),
('longest-substr','Longest Substring Without Repeating','strings','Given a string s, find the length of the longest substring without repeating characters.','medium','[{"example":"Input: s = ''abcabcbb''\nOutput: 3"}]'::jsonb,ARRAY['sliding window','hash set'],'pseudo',60,true),
('group-anagrams','Group Anagrams','strings','Given an array of strings strs, group the anagrams together. Return the answer in any order.','medium','[{"example":"Input: [''eat'',''tea'',''tan'',''ate'',''nat'',''bat'']\nOutput: [[''bat''],[''nat'',''tan''],[''ate'',''eat'',''tea'']]"}]'::jsonb,ARRAY['hash map','sorting'],'pseudo',70,true),
('longest-palindrome','Longest Palindromic Substring','strings','Given a string s, return the longest palindromic substring in s.','medium','[{"example":"Input: s = ''babad''\nOutput: ''bab'' or ''aba''"}]'::jsonb,ARRAY['expand around center','dp'],'pseudo',80,true),
('invert-tree','Invert Binary Tree','trees','Given the root of a binary tree, invert the tree and return its root.','easy','[{"example":"Input: root = [4,2,7,1,3,6,9]\nOutput: [4,7,2,9,6,3,1]"}]'::jsonb,ARRAY['recursion','bfs'],'pseudo',90,true),
('max-depth-tree','Maximum Depth of Binary Tree','trees','Given the root of a binary tree, return its maximum depth.','easy','[{"example":"Input: root = [3,9,20,null,null,15,7]\nOutput: 3"}]'::jsonb,ARRAY['recursion','dfs'],'pseudo',100,true),
('validate-bst','Validate Binary Search Tree','trees','Given the root of a binary tree, determine if it is a valid binary search tree.','medium','[{"example":"Input: root = [2,1,3]\nOutput: true"}]'::jsonb,ARRAY['dfs','inorder'],'pseudo',110,true),
('lca-tree','Lowest Common Ancestor','trees','Given a binary tree, find the lowest common ancestor of two given nodes in the tree.','medium','[{"example":"Input: root = [3,5,1,6,2,0,8,null,null,7,4], p = 5, q = 1\nOutput: 3"}]'::jsonb,ARRAY['recursion','dfs'],'pseudo',120,true),
('num-islands','Number of Islands','graphs','Given an m x n binary grid representing land and water, return the number of islands.','medium','[{"example":"Input: grid = [[''1'',''1'',''0''],[''1'',''1'',''0''],[''0'',''0'',''1'']]\nOutput: 2"}]'::jsonb,ARRAY['bfs','dfs','union find'],'pseudo',130,true),
('clone-graph','Clone Graph','graphs','Given a reference of a node in a connected undirected graph, return a deep copy of the graph.','medium','[{"example":"Input: adjList = [[2,4],[1,3],[2,4],[1,3]]\nOutput: [[2,4],[1,3],[2,4],[1,3]]"}]'::jsonb,ARRAY['bfs','dfs','hash map'],'pseudo',140,true),
('course-schedule','Course Schedule','graphs','Determine if you can finish all courses given the prerequisites.','medium','[{"example":"Input: numCourses = 2, prerequisites = [[1,0]]\nOutput: true"}]'::jsonb,ARRAY['topological sort','dfs'],'pseudo',150,true),
('climb-stairs','Climbing Stairs','dp','You can climb 1 or 2 steps at a time. In how many distinct ways can you climb n stairs?','easy','[{"example":"Input: n = 3\nOutput: 3"}]'::jsonb,ARRAY['fibonacci','memoization'],'pseudo',160,true),
('coin-change','Coin Change','dp','Given coins of different denominations and a total amount, return the fewest coins needed.','medium','[{"example":"Input: coins = [1,2,5], amount = 11\nOutput: 3"}]'::jsonb,ARRAY['bottom-up dp'],'pseudo',170,true),
('lis','Longest Increasing Subsequence','dp','Given an integer array nums, return the length of the longest strictly increasing subsequence.','medium','[{"example":"Input: nums = [10,9,2,5,3,7,101,18]\nOutput: 4"}]'::jsonb,ARRAY['binary search','dp'],'pseudo',180,true),
('reverse-list','Reverse Linked List','linked','Given the head of a singly linked list, reverse the list and return the reversed list.','easy','[{"example":"Input: head = [1,2,3,4,5]\nOutput: [5,4,3,2,1]"}]'::jsonb,ARRAY['iterative','recursive'],'pseudo',190,true),
('merge-lists','Merge Two Sorted Lists','linked','Merge two sorted linked lists and return as a single sorted list.','easy','[{"example":"Input: l1 = [1,2,4], l2 = [1,3,4]\nOutput: [1,1,2,3,4,4]"}]'::jsonb,ARRAY['recursion','iterative'],'pseudo',200,true),
('merge-sort','Merge Sort','sorting','Implement merge sort. Given an array of integers, sort them in ascending order via divide and conquer.','medium','[{"example":"Input: [38,27,43,3,9,82,10]\nOutput: [3,9,10,27,38,43,82]"}]'::jsonb,ARRAY['divide and conquer','stable sort'],'pseudo',210,true),
('quick-select','Quick Select (Kth Largest)','sorting','Find the kth largest element in an unsorted array.','medium','[{"example":"Input: nums = [3,2,1,5,6,4], k = 2\nOutput: 5"}]'::jsonb,ARRAY['partition','quickselect'],'pseudo',220,true)
ON CONFLICT (slug) DO NOTHING;

-- Seed system_design_topics
INSERT INTO public.system_design_topics (slug, title, category, description, difficulty, key_concepts, sort_order, published) VALUES
('url-shortener','URL Shortener','Web','Design a URL shortening service like bit.ly that can handle millions of URLs.','medium',ARRAY['Hashing','Database','Caching','Analytics'],10,true),
('chat-system','Chat System','Real-time','Design a real-time chat system like Slack or WhatsApp supporting 1-on-1 and group messages.','hard',ARRAY['WebSocket','Message Queue','Presence','Storage'],20,true),
('news-feed','News Feed','Social','Design a social media news feed like Facebook or Twitter''s home timeline.','hard',ARRAY['Fan-out','Ranking','Caching','Real-time updates'],30,true),
('rate-limiter','Rate Limiter','Infra','Design a distributed rate limiter that can handle millions of requests per second.','medium',ARRAY['Token bucket','Sliding window','Redis','Distributed sync'],40,true),
('file-storage','File Storage Service','Storage','Design a file storage and sharing service like Google Drive or Dropbox.','hard',ARRAY['Chunking','Deduplication','Sync','Metadata DB'],50,true),
('search-autocomplete','Search Autocomplete','Search','Design a typeahead/autocomplete system for a search engine.','medium',ARRAY['Trie','Ranking','Caching','Data collection'],60,true),
('video-streaming','Video Streaming Platform','Media','Design a video streaming platform like YouTube or Netflix.','hard',ARRAY['CDN','Transcoding','Adaptive bitrate','Storage'],70,true),
('notification-system','Notification System','Infra','Design a notification system that supports push, email, SMS, and in-app notifications.','medium',ARRAY['Message queue','Priority','Rate limiting','Templates'],80,true),
('ecommerce-platform','E-commerce Platform','Web','Design an e-commerce platform with product catalog, cart, checkout, and order tracking.','hard',ARRAY['Inventory','Payment','Search','Recommendations'],90,true),
('distributed-cache','Distributed Cache','Infra','Design a distributed caching system like Memcached or Redis cluster.','hard',ARRAY['Consistent hashing','Eviction','Replication','Partitioning'],100,true),
('ride-sharing','Ride-Sharing Service','Real-time','Design a ride-sharing service that matches drivers with riders in real-time.','hard',ARRAY['Geo-indexing','Matching','ETA','Pricing'],110,true),
('web-crawler','Web Crawler','Infra','Design a web crawler that can crawl billions of web pages efficiently.','medium',ARRAY['BFS/DFS','Politeness','Deduplication','Distributed workers'],120,true)
ON CONFLICT (slug) DO NOTHING;