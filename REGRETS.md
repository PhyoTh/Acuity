# Regrets and advice

This is the honest version of what we wish we had gotten to, where our time actually went, and what
we would tell someone who picks this project up.

## What we wish we had finished

The two core things we set out to build, the live shared interview session and the in IDE AI assistant, both got done and both work. Almost everything else we talked about adding either got done in a basic form or got left as a mock. The stuff we wish we had actually finished instead of faking in the UI is the per user token spend and the shared API balance numbers, the schedule calendar, the recent activity feed, the custom guardrail library where an interviewer saves their own named policies, bring your own Anthropic key, and real session scheduling. Right now a few of those show up on the dashboard as placeholder cards pulled from a mocks file, which we are not happy about, because it makes the product look more finished than it is. With more time we would either wire them up or take them out.

## Advice for whoever picks this up

The interesting part of this project, the AI behavior, is the part that
needs the most work. The two areas that need some more engineering work are the scorecard and the hallucination injector. Right now we ask the model for a structured grade across four dimensions at the end of the interview. It works, but we have no real way to know if the scores are any good. It needs a better rubric, probably some anchored examples, and maybe a human in the loop. Grading a person off a single model call is not something we would trust yet. The whole idea of an AI assisted interview. The industry has not figured out what a good AI assisted coding interview even looks like, and neither have we. We do not know if the right thing to measure is how someone prompts, the quality of the final code, how well they caught the AI's mistakes, or something else entirely. Whoever takes this over should treat that as an open question.

The hallucination injector is our signature feature and it is also the one that is not working well right now. Sometimes the injected bug is too obvious, sometimes the model basically refuses or announces the flaw, and the flaw does not always relate to the candidate's actual code. Making it reliably subtle and relevant is a real prompt engineering and evaluation problem on its own.

## Where our time actually went


The first was the UI. We leaned on Claude to generate the design and then spent a lot of cycles iterating on it because we did not like the results, redoing the dashboard and the layout over and over.

The second was deployment. We left it for the end and ended up using Oracle's free VM machine. We did not go with Vercel because it is built for serverless frontends and cannot hold the always on websocket connection that our live code and chat sync needs, and we did not go with Render because the tier that stays awake costs money while the free one sleeps when it is idle, which would break a live interview. Oracle's always free VM runs all the time at no cost, so it fit. All of the ARM machines were out of capacity so we fell back to a tiny one gigabyte instance and had to add a swap file, the firewall had to be opened at two different layers, the database connection had to go through the right Supabase pooler, and the reverse proxy and the certificate took some trial and error. It all works now, but it cost us far more time than we expected.

## Stretch opportunities we missed

- the editor mirror still sends the whole file on a throttle. A proper version would send only the edits, using Monaco's deltas, so it is truly character by character and does not resend the buffer.
- we log cursor and code events several times a second, which will bloat the database over a long interview. That should be sampled or aggregated.
- the VM is one gigabyte and Supabase is in a different region than it, so there is room to speed things up with a bigger host, a closer database, and by offloading the build to CI so the small VM only has to run.
- the guardrail prompt is marked for caching but is too small to actually trigger it, so prompt caching is currently doing nothing.

Security:
- there is no row level security on the database, we trust the backend to enforce access. That is fine for a class project but a real product would want both.
- there is no rate limiting on the API or the websocket, and the code execution goes to a public service, both of which could be abused
- bring your own key and bring your own database would let teams keep their interview data instead of it living in our project, which is both a feature and a privacy win

Design and product:
- too much of the dashboard is mock. Either finish those surfaces or remove them.
- there is no mobile or responsive layout and we did not look at accessibility at all.
- the custom guardrail library and real scheduling are promised by the UI but not built.

## Things we would do differently

- deploy at the start, not the end. The single biggest piece of review feedback was that people could not run it. If we had put up a live URL during the initial submission the whole review would have gone better, and we would have hit the deployment problems early instead of at the deadline.
- not build mock UI that we then have to apologize for. If a card is not wired up, leave it out.
- timebox the design. We let the UI pull us in when the AI behavior was the thing that actually needed the attention.
