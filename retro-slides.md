# AI-Powered Browser Automation for Insurance Portal Auth

![](/assets/longtail.png)

Will Cybriwsky -- project retrospective from Granted, 2024.

Granted is a healthcare-navigation app -- choosing plans, finding doctors, fighting claim denials. To do any of it, we need the user's data, and the best source is their insurer's portal. So we log in on their behalf via browser automation.

Before AI, hard-coded selectors covered four big insurers. The bottleneck on expanding wasn't dev cost -- it was account access. Fake-enrolling in health insurance to reverse-engineer login flows was expensive and legally dicey; recruiting real users to pair with devs was slow and bad UX. Neither scaled past the head of this distribution.

What changed with LLMs: an agent can reverse-engineer a novel portal *synchronously, as a user signs in*. That's a qualitative shift -- we can serve the long tail.

The goal: minimize latency and dev effort; maximize completion rate -- subject to the constraint of supporting the long tail. We used "completion rate" instead of "reliability" because users forgetting credentials or quitting mid-flow aren't software bugs, but they *are* business impact. That reframe also drove product work like password-reset guides and in-app quit-reason surveys.

---

# Three approaches. We shipped all three.

![](/assets/frontier.png)

The tension: reliability on novel portals costs speed on known ones.

On the top-left, our pre-AI setup -- hand-written element selectors per portal. Fast, but fragile. Moving right and down: single-shot prompts recognize pages one at a time. Further right: a fully agentic approach tracking full navigation history in-context.

We shipped all three and race them per-page, with mid-session switching. If configured selectors break on the MFA page, the agent takes over for just that step.

Worth saying out loud: we did *not* start with the hybrid. We started *correct* with the agent, and added the faster tiers later once we'd measured UX impact on the top portals. The tripled implementation is real complexity; you earn it with data.

Anecdote on why the single-shot prompts can't fully replace the agent: the first portal we saw with separate one-digit-per-input MFA boxes. The per-page prompt contract was locked to "one selector for the code input + one for submit." The agent, with full history in context, just made individual fill and click calls.

---

# System architecture

![](/assets/architecture.png)

Client (React Native or Next.js) hits a NestJS API, which kicks off a Temporal workflow. Temporal matters because MFA can make the workflow block on user input for minutes -- we need durable execution. The workflow calls the sign-in engine, which is a control loop over the three strategies, all driving Playwright via Browserbase.

Browserbase was a deliberate buy-don't-build call. The anti-bot cat-and-mouse -- residential IPs, fingerprinting, CAPTCHA solving -- is not our core competency, and the vendor market had matured by the time we needed it.

A lot of what I built around the engine is now off-the-shelf: type-safe tool calling (pre-Zod-in-the-OpenAI-SDK), LLM call telemetry, retry-aware prompt management. Starting today I'd reach for libraries first.

Monitoring: OTel traces in Honeycomb, Playwright traces in S3 (lets us replay the DOM when something breaks), and a manual review app whose labels later trained an LLM-as-judge to separate reliability failures from user-side incompletions.

---

# Execution

![](/assets/statemachine.png)

This is the auth state machine -- what the engine is navigating. Every arrow has edge cases: wrong code retries, MFA method pickers, post-login survey screens, security questions.

Team: me as lead engineer on frontend and backend of the sign-in flow, dedicated PM, dedicated designer. Two other engineers owned the post-sign-in work: one on portal crawling, one on FHIR ingestion. Daily deploys; rollout via feature flags in LaunchDarkly plus our own system; a gauntlet of simulated portals in CI.

Coordination story I want to tell: the ingestion teammate started with a YAML DSL for LLMs to write transformations in -- on the theory that a constrained DSL is easier than a real language. For humans it would be -- but the DSL wasn't in any pretraining corpus, so agents struggled with syntax, much less semantics. He switched to jq on my suggestion and it immediately worked. Classic jagged-intelligence lesson: "simpler for humans" and "simpler for LLMs" aren't the same axis.

A fun only-in-the-2020s bug: the sign-in agent was occasionally tripping LLM refusals for "adversarially reverse-engineering auth flows" and "handling PHI." We got past it by explaining the consent and financial-incentive context in-prompt.

---

# Outcomes, and what I'd do differently

![](/assets/tiers.png)

End state: each tier deployed to the slice of the distribution where it earns its keep. ~30s on big insurers (resilient now, not fragile), ~45s mid-tier, ≥90s long tail. We unlocked the tail first, then closed the perf gap on the head.

Three things I'd do differently:

**Lean on vendors for anti-bot sooner.** Most of our design leverage came from the power law -- perf work on the top 20 portals is high-leverage because they serve the bulk of users. But the *same* asymmetry cuts against us for anti-bot: the big portals have the most sophisticated detection. We were better off paying a vendor from day one than reinventing proxy rotation.

**Let agents run end-to-end simulations sooner.** We reserved E2E tests for real portals because setting up simulated ones was expensive in human time. But agents can build those sims cheaply. The tradeoff shifts when the test-writer isn't a human.

**Don't pre-invent the wheel.** The AI tooling landscape was in its infancy when we started. A lot has shipped since that lines up with what we built -- OpenAI's TypeScript SDK gained Zod support, Browserbase shipped Stagehand. Some of our infra is now redundant.
