# Software Requirements Specification (SRS)
## Trendoscope: Earth System Trend Detective
NASA Space Apps Cairo 2026 · Challenge: *Be An Earth System Trend Detective!* · Version 1.0 · 13 Nov 2026

---

## 1. Introduction

### 1.1 Purpose
This document defines what the web tool must do so that a student with no statistics background can investigate whether an Earth science variable is really changing in a region, and understand the answer, in under 3 minutes.

### 1.2 Problem Statement (from the challenge)
Earth science variables can trend one way in one region and the opposite way in another, even when the same process drives both. The sheer number of variables makes it hard to choose which ones indicate change and then analyze them. The challenge asks for a tool that selects variables, visualizes change over time, and determines **what** is changing, **where**, **how much**, and whether it is **statistically significant**.

### 1.3 Scope
A web application (static front end with Python-precomputed results) that retrieves NASA/partner time series for a user-chosen region, runs trend statistics, explains results in plain language, compares regions, and teaches through guided games. Out of scope: non-linear/machine-learning trend models, forecasting, real-time alerts.

### 1.4 Definitions
| Term | Meaning |
|---|---|
| Time series | Values of one variable at regular times (daily, monthly) |
| Trend | A consistent rise or fall over time |
| Deseasonalized | Seasonal cycle removed so the trend is visible |
| Mann-Kendall (MK) | Non-parametric test: is there a monotonic trend? |
| Theil-Sen slope | Robust estimate of rate of change per year |
| p-value | Probability of seeing such a trend by chance; < 0.05 = significant |
| Anomaly | Value minus the long-term average for that time of year |

### 1.5 Audience
High school and college students, and members of the public with some scientific background (as the challenge states). Secondary: teachers and a younger audience via Story Mode.

---

## 2. Overall Description

### 2.1 Product perspective
Standalone static web app (HTML/CSS/JS, Plotly.js, hosted on GitHub Pages). Python (pandas, `pymannkendall`) runs offline in Jupyter to precompute JSON results per variable-region pair; only the Ask AI chat calls an external LLM API through a small proxy. Data layer pulls from NASA sources (Giovanni, GES DISC/Hydrology Time Series, AppEEARS, MERRA-2, GLDAS, MODIS, GPM, OMI, AIRS) and NOAA CDO. Partner references: KNMI Climate Explorer, CSA data (SWOT, RCM).

### 2.2 User classes
Student explorer · Teacher · Judge/evaluator (needs fast demo) · Curious member of the public.

### 2.3 Assumptions and constraints
- Event is 24 hours; challenge data is released at the start, so the system is built around a **data-adapter layer** that can be pointed at any variable.
- Team of 4 with limited front-end experience; AI tools are permitted and must be disclosed.
- Linear trends are the required baseline; seasonal removal is a recommended improvement.
- Offline fallback: cached sample datasets (Egypt/MENA demo cases) so the demo never depends on a live API.

---

## 3. Challenge Traceability

| Challenge objective | Requirement(s) |
|---|---|
| Identify variables of interest | FR-1.1, FR-1.2 |
| Acquire data for a particular region | FR-1.3, FR-1.4, FR-1.5 |
| Generate and visualize a time series | FR-1.6 |
| Rate of change | FR-1.8 |
| Significance test (t-test, MK, confidence intervals) | FR-1.9 |
| Simple variable definitions | FR-1.2 |
| Demonstration examples | FR-3.1, FR-6.1 |
| Same process, opposite trend in different regions | FR-2.x |
| Remove seasonal cycle | FR-1.7 |

---

## 4. Functional Requirements

### Feature 1: Trend Detection (core, Priority P0)
- **FR-1.1** The user selects a variable from a categorized catalog (atmosphere, land, ocean, water, vegetation).
- **FR-1.2** Each variable shows a plain-language definition, unit, source mission/model, and available resolutions.
- **FR-1.3** The user selects a region by clicking a pin on an interactive map, or by dropdown. The two stay in sync and a caption states exactly which box is being averaged. *(as built: six preset boxes, map picker above the setup panel)*
- **FR-1.4** The user selects a start and end date; the system warns when the range is too short for reliable analysis (suggest at least 10 years monthly).
- **FR-1.5** The user selects temporal resolution (daily or monthly).
- **FR-1.6** The system plots an interactive time series (zoom, hover, download PNG).
- **FR-1.7** The system offers a *Remove seasonal cycle* toggle (monthly climatology subtraction) and plots the anomaly series.
- **FR-1.8** The system computes the trend line and rate of change (Theil-Sen and OLS slope, units per decade) with a 95% confidence interval.
- **FR-1.9** The system runs the Mann-Kendall test and reports Kendall's tau, p-value, and a verdict: *Significant increase / Significant decrease / No significant trend*. A trend that is not significant is still shown and explained as interesting.
- **FR-1.10** The system displays summary statistics: mean, min, max, standard deviation, % change, number of missing points.
- **FR-1.11** The system writes a plain-language insight card ("What / Where / How much / Is it significant?").
- **FR-1.12** The user can export the time series (CSV) and the figure.
- **FR-1.13** The user can ask the AI about the result (links to Feature 4).
- **FR-1.14** *p-value picture:* on request, the Ask panel draws the distribution of slopes produced by shuffling the same numbers, with the real slope marked, so the meaning of a p-value is visible rather than asserted. *(as built: moved out of the Investigate page into Ask, where the question is actually asked)*

### Feature 2: Region Comparison (P1)
- **FR-2.1** The user selects two regions, one variable, and one date range.
- **FR-2.2** The system overlays both series and trend lines and reports each region's slope, p-value, and verdict.
- **FR-2.3** The system flags **diverging trends** (opposite signs) and **agreeing trends** and states this clearly.
- **FR-2.4** Preset "same event" pairs are offered (for example, regions affected by the same drought or monsoon shift).
- **FR-2.5** An LLM explanation is generated only from the computed numbers plus a curated knowledge note per case, and is labeled as *AI-generated hypothesis, not proven cause*.

### Feature 3: Detective Game, Cases of Cause and Effect (P1)
One game engine, one case library, two stages per case (this merges the former "Event Causes and Results" and "Story Detective" features).
- **FR-3.1** The player opens a **case file**: a short story of a real event (flood, drought, dust storm, heat wave) and one **target variable** that changed.
- **FR-3.2** *Stage 1, Find the cause:* the player picks the variable they suspect from 4 to 6 options.
- **FR-3.3** The system computes the relationship (lagged correlation, trend agreement) and shows it on one simple chart.
- **FR-3.4** A verdict stamp (*Strong clue / Weak clue / Red herring*) and a score are shown with a short explanation.
- **FR-3.5** *Stage 2, Follow the effects:* the case timeline reveals 2 to 3 **downstream variables** (results of the event) and the lag of each.
- **FR-3.6** Wording must say "associated with", never "caused by"; correlation is not presented as proof.
- **FR-3.7** At least 3 preset cases, including one Egypt/MENA case. Graphics stay minimal: case card, option cards, stamp, one chart.
- **FR-3.8** Each case ends with a link to open the same variables in Feature 1.
- **FR-3.9** Case files and story mode share one page (*Detective game*) with two tabs, so the player chooses a way to play instead of navigating between two pages. Legacy `cases.html`, `case.html` and `story.html` URLs redirect to the merged page.

### Feature 4: Ask AI (P1)
- **FR-4.1** A chat answers questions about the app's data, variables, methods, and the **current result**.
- **FR-4.2** The assistant is restricted to the project domain; off-topic questions are politely declined.
- **FR-4.3** Answers use the computed statistics as context (retrieval of the result JSON, variable glossary, method notes). Numbers quoted must come from that context, never invented.
- **FR-4.4** The assistant states uncertainty and limits (for example, short record, non-significant trend).

### Feature 5: Kids Story Mode (P2)
- **FR-5.1** A narrated, illustrated story of one change (two-date slider, "then vs now" map) with a 3-question quiz.
- **FR-5.2** Simple vocabulary; one variable per story.
- **FR-5.3** Story mode is a tab of the Detective game page (see FR-3.9); it is initialised only when the tab is first opened so its charts are drawn at full size.

### Feature 6: Guided Demo (P0)
- **FR-6.1** A "Watch the 5-step demo" button runs a pre-set analysis step by step with captions (as the challenge recommends).

### Feature 7: Home page (P0)
- **FR-7.1** The home page opens with the two demos, not a marketing hero: *Spot the signal* (three sparklines, one of them a real series, one the same numbers shuffled, one pure noise) and *Where in the world* (click a pin to find the region with a significant rise in soil moisture). Both are computed from the cached series at load time.
- **FR-7.2** A short section per feature room (Investigate, Compare, Detective game, Ask) states the question it answers and links to it.
- **FR-7.3** The how-it-works section ends with the application of detection: knowing what causes the change and what the change affects, with links to Compare and the Detective game.
- **FR-7.4** The hero carries the project identity: the supplied Trendoscope logo in the navigation and an inline-SVG Earth + satellite illustration (flat green continents, ocean gradient, orbit arcs, starfield) on the right. The character mascot (Dune) is reserved for story mode, where a narrator helps.
- **FR-7.5** No choose-your-power step: variables are grouped in the Investigate catalog instead of being a separate home-page decision.
- **FR-7.6** The headline reads "Every Change Has a Story. Discover Yours." and the same line is used in the document title and meta description.

### Feature 8: Visual identity (P0)
- **FR-8.1** Space navy (`#061A33`), brand green (`#8CC63F`) and ocean blue (`#2E7BC4`) are the only accent colours; cream paper (`#F6EFDD`) is kept for the case-file surfaces.
- **FR-8.2** Accent text placed on cream darkens to `#5F8F26` so it keeps a readable contrast ratio.
- **FR-8.3** The navigation is a floating pill: logo, divider, centred links with an active underline, and a green primary call to action; below 900px the links collapse to one scrollable row.
- **FR-8.4** All artwork is inline SVG generated at build time, so the identity adds no network requests and scales without artefacts.

---

## 5. Data Requirements
- **DR-1** Each variable has a catalog entry: id, name, definition, unit, source, resolution, spatial coverage, access method.
- **DR-2** Region data is aggregated to a regional mean (area-weighted by latitude) per time step.
- **DR-3** Missing values are reported, not silently filled; gaps over 20% trigger a warning.
- **DR-4** Cached sample datasets must exist for all demo cases.
- **DR-6** First release uses a curated cache: about 6 variables x 6 regions, monthly, 10+ years, downloaded in advance; live fetching is an adapter behind the same interface.
- **DR-5** Source and citation are shown beside every chart.

## 6. Statistical Method Requirements
- **SM-1** Deseasonalize by subtracting the monthly mean; this is optional and visible to the user.
- **SM-2** Mann-Kendall with serial-correlation caution; Theil-Sen slope for rate; OLS with t-test as a cross-check.
- **SM-3** Significance level 0.05 by default; users can see the p-value and CI.
- **SM-4** Report that linear trends are a simplification; non-linear change is a stated limitation.

## 7. Non-Functional Requirements
| ID | Requirement |
|---|---|
| NFR-1 | Result for a cached case appears in under 5 seconds; live fetch shows progress and times out gracefully |
| NFR-2 | Works on desktop and mobile browsers |
| NFR-3 | Every statistic has a plain-language tooltip (accessibility for non-experts) |
| NFR-4 | Colors and charts readable for color-blind users |
| NFR-5 | API keys are kept server-side, never in the browser |
| NFR-6 | Public GitHub repository and publicly accessible links for submission |
| NFR-7 | AI-use disclosure page listing tools used for coding, text, and in-app LLM |
| NFR-8 | Consistent detective theme (case files, evidence cards, verdict stamps) across all features |

## 8. Validation and Testing (Judging "Validity")
- Reproduce a published result (for example, a known warming or precipitation trend) and compare our slope and p-value with the paper or the Giovanni output.
- Unit tests on synthetic series with a known slope and on pure noise (should return "no significant trend").
- Cross-check MK results against a standard package (`pymannkendall`).

## 9. Mapping to Judging Criteria
| Criterion | How the system answers it |
|---|---|
| Impact | Climate literacy for students; teachers; Egypt/MENA cases (Nile, heat, dust) |
| Creativity | Detective case-file theme, region divergence, games, kids mode, grounded AI |
| Validity | NASA data, standard tests, reproduction of a known result, honest limits |
| Relevance | Every challenge objective traced in Section 3 |
| Presentation | Guided demo, clear pipeline diagram, 90-second video story |

## 10. Priorities and Phasing (24-hour reality)
1. **Must (hours 0 to 10):** Feature 1 end to end plus Feature 6 (Guided Demo).
2. **Should (hours 10 to 17):** Feature 4 (grounded chat), Feature 2 (basic comparison).
3. **Could (hours 17 to 22):** Feature 3 (game) with 2 to 3 cases, then Feature 5 (Kids Story Mode) with one story.
Hours 22 to 24: demo video, README, AI disclosure, link check.

## 11. As-built page map
| File | Purpose | Key scripts |
| --- | --- | --- |
| `index.html` | Home: hero + mascot, two demos, four feature rooms, how it works, featured cases | `home.js` |
| `investigate.html` | Region map picker, setup panel, chart, verdict, six statistics, insight | `charts.js`, `investigate.js` |
| `compare.html` | Two regions, faded observations, bold trend lines, divergence verdict | `charts.js`, `compare.js` |
| `detective-game.html` | Tabs: case files (list, then case file) and story mode | `charts.js`, `cases.js`, `case.js`, `story.js`, `game.js` |
| `data-method.html` | Sources, method, limitations, AI-use disclosure, self-test | `method.js` |
| `ask.html` | Full-page version of the Ask panel | `ask-page.js` |
| `cases.html`, `case.html`, `story.html` | Redirect stubs to `detective-game.html` | - |

## 12. Risks
| Risk | Mitigation |
|---|---|
| NASA API slow or blocked | Cached datasets for demos |
| LLM invents facts | Ground on computed JSON, label as hypothesis |
| Too many features, none polished | Phase plan above |
| Misreading correlation as cause | Wording rules FR-3.3, FR-4.4 |
| Weak front-end skills | Template-based UI, Plotly, AI-assisted coding |
