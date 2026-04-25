# Browser Automation for Insurance Portal Auth
	Will Cybriwsky
	Granted Health, 2024–25

/assets/VjT8RFHEPzI5kEf7DgYtjV2T7XM.webp

Granted is an app that helps consumers navigate the healthcare system; for example: choosing a plan, finding a doctor, or fighting claim denials. Step one is to get the user's information: things like explanations of benefits, claims details, or member ID cards. To save users that hassle, we let them sign into their insurer's portal through our app.

**What about HIPAA?** users need to sign a release before their insurers will speak to us on their behalf. But those in-the-know might also ask why we didn't use the HIPAA-mandated APIs—the answer is those APIs omit critical info like dollar amounts.

Web browser automation long predates LLMs—when I arrived, AI-free code handled some big insurers, like United, Aetna, Cigna, and Blue Cross. Unlike many AI-replacing-coding stories, the problem with expanding beyond those four wasn't dev costs, but account access: fake-enrolling in health insurance to reverse-engineer login flows would be expensive and legally unwise, and recruiting users of new portals to work with developers would be slow (and bad UX). But when AI can do that reverse-engineering synchronously, as a user signs in, that quantitative difference in delivery time becomes qualitative—we can support the long tail:

In theory, reverse-engineering portal auth endpoints to make direct requests would have been faster and more reliable than remote process automation—but in practice, many auth flows detect and bot-block anything short of a full browser. Insurers don't care about that after login, though—so once we got an access token, some of our code to crawl the logged-in portals did indeed make direct requests.

If you squint, the problem of "sign in to an insurer portal we've never seen before" contains, as a special case, the problem of "sign in to a portal we've seen before, but that just updated its login pages"—and the AI approach indeed handled changes like that which had broken the hard-coded selectors. We collect both kinds of novelty handling as "reliability", below.

Roughly, our goal was to **minimize latency and dev effort, and maximize completion rate, subject to the constraint of supporting the long tail of insurers.**

We used "completion rate" instead of "reliability" because users forgetting credentials or quitting mid-process aren't problems of software reliability *per se*. While we *had* initially focused on bare reliability, completion rates more directly represented business impact—and the difference mattered enough to make explicit. Beyond turning performance into a constraint (since slowness was a main reason for quitting), this drove product features like password-reset guides for major insurers, in-app quit-reason surveys, and a dedicated technical support email. Eventually, our target completion rate was 90% (reliability *per se* was generally well above that).

---

/assets/statemachine.png
size: contain

/assets/frontier.png
size: contain

The system faces a tradeoff between reliability on novel portals and speed on known ones:

On the top left, you have our pre-AI setup of hand-written element selectors for each portal. Moving to the right (more reliable) and down (slower), we have one-shot prompts to recognize pages, and a fully agentic approach where the LLM tracks the whole navigation history in-context. So, which one did we choose? **All of them:**

**How much slower?** Roughly 90 seconds for the agent vs roughly 30 seconds for the hard-coded one (ignoring time blocked on user input). The round-trips to the browsers were the main bottleneck—performance work in the LLM-using implementations focused on reducing those instead of request latency *per se*. For example: higher-order tools like "fillMfaCode" that took selectors for the inputs + submit button all at once, instead of prompting the LLM to parallelize fills and clicks.

---

/assets/architecture.png
size: contain

/assets/tiers.png
size: contain

Maintaining three approaches is more complex than one, especially given that we supported switching between them mid-session (if, say, the element selectors for the MFA page were misconfigured, we'd still get the speed boost for the initial page, and then the single-page prompts would kick in for the MFA page). So this tripled implementation is *not* what we went with out of the gate: we started correct with the agent, then only introduced complexity later on when we'd measured performance and UX impacts and prioritized more work here.

An example edge-case where the agent had to bail out the single-page prompts is the first time we encountered an MFA entry screen with separate inputs per-digit: the prompt had been locked into providing one selector for the code input + one for the submit button, never needing to see the user's digits, whereas the agent was free to make individual fill and click calls, with the digits in context. It also helped deal with novel page states, like if an insurer presented users with a full survey screen upon signing in.

---

# Execution

### Staff
	Crawling the Portals
	Normalizing Data
	Product
	Design
	Me

### Scoping
	*"First, make it right…"*
	Reliability vs Completion
	*"…then, make it fast."*
	Automating Review
	Human Elements

### Deployment
	Internal Admin App
	Monitoring
	Smoke Testing
	The Joy[?] of Feature Flags

### Leadership
	Small Team
	Libraries and Tooling
	[Re-]Architecture
	Metatooling

I was the main engineer for both the frontend and backend of the sign-in flow, paired with a dedicated PM and a dedicated Designer who explored how it should behave. As the first team member doing agentic LLM work in our codebase, back in 2024, I was also responsible for designing in-house libraries that are available nowadays off the shelf (like type-safe tool calling, telemetry, or retry-aware prompt management).

Two engineering teammates worked on what happened after sign-in: one owned crawling the portals, the other owned ingesting and normalization of the data into FHIR.

**Jagged intelligence:** my colleague working on ingestion started with a YAML-based transformation DSL for LLMs to write, because it was simpler than a full programming language and thus argued to be easier. For humans, it *would* be—but problem was, our little DSL was nowhere in the pretraining corpus. Agents struggled to write syntactically-valid mappings, much less semantically valid ones. He eventually tried my suggestion of jq; it immediately worked much better.

We deployed on a daily basis, with rollouts managed by feature flags (some in LaunchDarkly, some in our own system). We built a gauntlet of simulated insurance portals to exercise the code. Monitoring included distributed OpenTelemetry traces in Honeycomb, playwright traces stored in s3, and manual reviews recorded via an internal app; these reviews were later used to build an LLM-as-judge workflow to automatically distinguish reliability failures (i.e., bugs) from mere incompletions (e.g. user quitting).

These allowed us to reconstruct the DOM for debugging, and portals that bugged our agents tended to bug real users, too. Investigating one issue with United, I came upon a whole forum thread from a retirement community complaining about the same error message (presumably having been caught in some bad IP block, or using accessibility devices that produced bot-like interaction patterns).

Judginess also triggered an only-in-the-2020s bug: our intercepting MFA for users and accessing PHI had been occasionally triggering LLM API refusals—but when we explained (in-prompt) that this was done with user consent, and that the adversarial reverse-engineering task was merely an epiphenomenon of broken financial incentives in the health system, the refusals went away.

---

## Outcomes
|                                       | Before: Hardcoded | Initial: Fully-agentic | Final: Hybrid    |
| :------------------------------------ | :---------------- | :--------------------- | :--------------- |
| **Big insurers**                      | ~30s, fragile     | ≥90s, resilient        | ~30s, resilient  |
| **Mid-tier** (matches state machine)  | unsupported       | ≥90s, resilient        | ~45s, resilient  |
| **Long tail** (novel flows)           | unsupported       | ≥90s, resilient        | ≥90s, resilient  |


## Reflection
	Newer Services, Libraries, and Models
	Rapid Feedback: Important as Ever
	Ethics of Adversarial Engineering

The system unlocked portals beyond our insurers, before we added complexity to bring performance back to par with hand-coded approaches.

We also threw the sign-in agent at EHRs during a hackathon, and it worked without changes.

If I were starting over, I would:

**Lean on vendors for anti-anti-bot measures more, and sooner.** Much of the design's leverage came from the insurer-size power-law: focusing performance upgrades on the top portals is more worthwhile when they serve an outsize share of users—but for anti-bot detection, that asymmetry meant our efforts were *less* worthwhile.

**Let agents run end-to-end simulations sooner.** These were originally at the unit level, with end-to-end testing reserved for real insurer websites. While this tradeoff made sense comparing human effort for the two kinds of tests, the real difference-maker was letting agents exercise more of their logic and control flow independently.

**Avoid *pre*-inventing the wheel:** When I first set out to build this, the AI tooling and browsing landscape was in its infancy. In the time since, libraries have come out that either directly line up with work we did (e.g. OpenAI's TypeScript packages gained built-in zod support) or have built higher-level interfaces (e.g. browserbase's stagehand library)—while they were not an option when we started, and we have adopted them in places, they're still something that would look different if starting that project today.
