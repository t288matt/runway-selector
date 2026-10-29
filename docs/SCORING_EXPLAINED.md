# How the plan is scored, in plain English

Status: current. A plain-English companion to the penalty and traffic logic in [DESIGN.md](DESIGN.md) and `src/engine/optimiser.ts`. Where they differ, the code governs.
Language: British English. Plain words; no emoji.

## What a penalty is

Penalty is the tool's internal scorecard for picking the best option among several that are all otherwise safe and allowed. It is never shown on screen — the word itself, and others like it ("cost", "points", "score", "least bad"), are banned from the user interface by a lint rule (`tests/v2/*.test.tsx`'s `BANNED_WORDS`). It only drives the recommendation behind the scenes. Lower score wins.

A few things push the score up, making an option less attractive:

- Using a mode that is not the airport's preferred one for that time of day (`preferenceDefaultPenalty`, or a mode's own row penalty in the operating plan).
- Using a mode that only just scrapes by (borderline conditions) rather than one that is comfortably fine (`marginalPenalty`).
- Switching modes at all, and switching costs more the busier traffic is at the moment of the switch (`changePenaltyLight`, `changePenaltyMedium`, `changePenaltyBusy`, `unknownDemandChangePenalty`) — see "How traffic affects the score" below.
- Switching too soon after the last switch, so the plan does not flip-flop back and forth (`shortStayPenalty`, below `minimumStayMinutes`).
- The desperate case where nothing at all is suitable (`noModePenalty`): treated as the worst possible score, a genuine last resort, never a routine choice.

Importantly, penalty only ever decides between options that are already safe and allowed. If something breaks a real limit — wind, runway surface, an airport's weather minima, over-capacity traffic — it is thrown out completely before scoring even starts (its cells are `UNSUITABLE`). Penalty never trades away safety for a better score; it only breaks ties between the safe options.

## How traffic affects the score

Traffic affects the engine in two separate ways. Only one of them is actually a penalty.

**1. The change penalty.** Every time the optimiser considers switching mode at a given half-hour slot, it looks up the traffic level for that slot and charges a penalty scaled to it: `changePenaltyLight`, `changePenaltyMedium` or `changePenaltyBusy`, or `unknownDemandChangePenalty` when traffic cannot be estimated for that slot. These are set per airport in its pack, and normally rise with traffic, so changing mode during HIGH traffic costs more than changing during LOW traffic.

This is the mechanism behind the amber "EARLY MODE CHANGE RECOMMENDED" banner: if the optimiser can reach the same end state by changing a little earlier while traffic is still light, it will, because that path scores better overall than waiting and being forced into the same change later during busier traffic.

**2. Capacity — not a penalty, a hard cutoff.** Separately, if a mode has a maximum capacity set in its pack data and known traffic in a slot is above it, that mode is not penalised for that slot — it is marked `UNSUITABLE`, the same as breaking a wind limit, and no penalty can buy it back. If traffic is unknown rather than known to exceed the limit, the capacity check is skipped for that slot and the cell is marked uncertain instead; it is not penalised either way.

## Summary

Penalty only ever decides between options that are already safe and allowed. Traffic shapes that decision mainly by making changes more expensive the busier it gets, nudging the plan toward changing early rather than late — and, separately, it can rule a mode out completely if traffic is known to be over its capacity.
