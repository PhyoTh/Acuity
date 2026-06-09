# Review plan

We got pre-reviews from Adrian, Aaron, Jude, and Kristhian.

## What the reviewers said


The biggest theme by far was that almost nobody could actually run the project. Three of the four reviewers could not get it going locally because it needed a Supabase project, an Anthropic API key, and Docker all set up before you could even open it. Adrian and Kristhian both said the same thing in different words, that we should either deploy it to a live URL or add some kind of demo mode so a reviewer does not have to provision all of that just to look at it. 

Adrian suggested a reviewer mode that swaps in canned responses and a fake login while keeping the real flow intact.

Kristhian also said the docs read like an AI wrote them and were hard to actually follow, and that he was not going to install Docker or buy an Anthropic key just to try a class project.

A couple of reviewers were confused about how the hallucination feature works. Aaron first thought the interviewer controlled it directly, then read the code and figured out that the interviewer only sets the probability and the model itself inserts the bug. He suggested letting the interviewer say what kind of bug gets injected, not just how often. Jude asked us to explain the probability at a high level.

On the positive side, Jude said everything ran fine for him and the repo was clean, Adrian liked the two phase end interview where the UI does not freeze while the scorecard generates, and Aaron and Kristhian both liked the hallucination idea as a way to test whether candidates actually read the AI's output instead of pasting it.

## What staff said

- build a demo mode or live URL so reviewers do not need Supabase, Anthropic, and Docker just to try it
- clean up the AI generated README and the marked up proposal
- let interviewers specify the kind of hallucination, not just the probability
- tighten cost, since the hallucinator calls the model twice per turn

## What we did

Demo mode and live URL. This was the big one and we did both. We added a DEMO_MODE flag on the backend and a matching NEXT_PUBLIC_DEMO_MODE on the frontend. In demo mode the AI services return canned deterministic answers so no Anthropic key is needed, and a new /auth/demo-login endpoint hands out a token so no Supabase project is needed. We also deployed the whole thing to a live URL on a free Oracle Cloud VM, with Caddy handling HTTPS and the
websocket upgrade, so a reviewer can just click the link.

Hallucination type. A reviewer and the staff both asked for this, so we added it. The interviewer now picks what kind of flaw the injector introduces, a logic or off by one error, a wrong API call, a silent edge case failure, a hidden inefficiency, or a security issue, on top of the probability. This lives in services/hallucinator.py and the create session wizard, and the candidate side now also shows when extra custom rules are in effect so the AI behavior is not a surprise.

Multi interviewer fix. While we were in there we also fixed a real bug we had noticed ourselves, where a second person with an interviewer account could open the candidate link and get straight in past the waiting room and even run code. Now the role is tied to the link, so the candidate link only admits candidates and there is a separate optional co interviewer link for someone who should observe.

Cost of the second model call. Adrian and the staff both pointed out that a corrupted turn calls the model twice, once to write the answer and once to corrupt it. Our fix is to decide the roll before we call the model, and when a turn is going to be corrupted, ask for the flawed answer in the same call instead of doing a separate rewrite pass. That makes a corrupted turn cost one call instead of two, and it also cuts the latency on those turns.
